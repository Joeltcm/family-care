import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CallerIdentity } from '../auth.js';
import { config } from '../config.js';
import { database } from '../database.js';

const allowedDurations = new Set([15, 60, 240, 1440]);
const maximumAttempts = 10;

function digestToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function digestPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 32);
}

async function currentUser(client: PoolClient, identity: CallerIdentity) {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM app_users WHERE auth_subject = $1 OR lower(email) = lower($2) LIMIT 1',
    [identity.subject, identity.email],
  );
  return result.rows[0]?.id;
}

export class SharePermissionError extends Error {}
export class ShareUnavailableError extends Error {}

export async function createMedicalRecordShare(
  identity: CallerIdentity,
  patientId: string,
  expiresInMinutes: number,
) {
  if (!database || !config.PUBLIC_API_URL) throw new ShareUnavailableError('share_not_configured');
  if (!allowedDurations.has(expiresInMinutes)) throw new ShareUnavailableError('invalid_duration');
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    const userId = await currentUser(client, identity);
    if (!userId) throw new SharePermissionError('session_required');

    const patient = await client.query<{ id: string; family_id: string; legal_name: string; preferred_name: string | null }>(
      `SELECT p.id, p.family_id, p.legal_name, p.preferred_name
         FROM patients p
         JOIN family_memberships fm ON fm.family_id = p.family_id AND fm.user_id = $2
         LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = $2
        WHERE p.id = $1
          AND COALESCE(pp.can_share, false)
        FOR UPDATE OF p`,
      [patientId, userId],
    );
    if (!patient.rowCount) throw new SharePermissionError('share_not_allowed');

    const token = randomBytes(32).toString('base64url');
    const pin = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const pinSalt = randomBytes(16).toString('hex');
    const pinHash = digestPin(pin, pinSalt).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO medical_record_shares
         (patient_id, created_by, token_hash, pin_salt, pin_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [patientId, userId, digestToken(token), pinSalt, pinHash, expiresAt],
    );

    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'medical_share.created', 'medical_record_share', $4, $5)`,
      [userId, patient.rows[0].family_id, patientId, inserted.rows[0].id, JSON.stringify({ expiresAt, scope: 'clinical-summary' })],
    );
    await client.query('COMMIT');

    const url = new URL('/share/' + encodeURIComponent(token), config.PUBLIC_API_URL).toString();
    return {
      id: inserted.rows[0].id,
      url,
      pin,
      expiresAt: expiresAt.toISOString(),
      patientName: patient.rows[0].preferred_name || patient.rows[0].legal_name,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeMedicalRecordShare(identity: CallerIdentity, shareId: string) {
  if (!database) throw new ShareUnavailableError('share_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const userId = await currentUser(client, identity);
    if (!userId) throw new SharePermissionError('session_required');
    const revoked = await client.query<{ family_id: string; patient_id: string }>(
      `UPDATE medical_record_shares s
          SET revoked_at = now()
         FROM patients p
         JOIN family_memberships fm ON fm.family_id = p.family_id
        WHERE s.id = $1
          AND s.patient_id = p.id
          AND fm.user_id = $2
          AND s.created_by = $2
          AND s.revoked_at IS NULL
        RETURNING p.family_id, s.patient_id`,
      [shareId, userId],
    );
    if (!revoked.rowCount) throw new SharePermissionError('share_not_found');
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, 'medical_share.revoked', 'medical_record_share', $4)`,
      [userId, revoked.rows[0].family_id, revoked.rows[0].patient_id, shareId],
    );
    await client.query('COMMIT');
    return { revoked: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type ShareRow = {
  id: string;
  patient_id: string;
  family_id: string;
  legal_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  blood_type: string | null;
  emergency_summary: string | null;
  allergies_summary: string | null;
  pin_salt: string;
  pin_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  locked_at: Date | null;
  failed_attempts: number;
};

export async function getMedicalShareGate(token: string) {
  if (!database) return { available: false as const };
  const result = await database.query<Pick<ShareRow, 'expires_at' | 'revoked_at' | 'locked_at'>>(
    'SELECT expires_at, revoked_at, locked_at FROM medical_record_shares WHERE token_hash = $1 LIMIT 1',
    [digestToken(token)],
  );
  const share = result.rows[0];
  return {
    available: Boolean(share && !share.revoked_at && !share.locked_at && share.expires_at.getTime() > Date.now()),
    expiresAt: share?.expires_at.toISOString(),
  };
}

export async function openMedicalRecordShare(token: string, pin: string) {
  if (!database) throw new ShareUnavailableError('share_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<ShareRow>(
      `SELECT s.id, s.patient_id, p.family_id, p.legal_name, p.preferred_name,
              p.birth_date, p.blood_type, p.emergency_summary, p.allergies_summary, s.pin_salt, s.pin_hash,
              s.expires_at, s.revoked_at, s.locked_at, s.failed_attempts
         FROM medical_record_shares s
         JOIN patients p ON p.id = s.patient_id
        WHERE s.token_hash = $1
        FOR UPDATE OF s`,
      [digestToken(token)],
    );
    const share = found.rows[0];
    if (!share || share.revoked_at || share.locked_at || share.expires_at.getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return { status: 'unavailable' as const };
    }

    const expected = Buffer.from(share.pin_hash, 'hex');
    const supplied = digestPin(pin, share.pin_salt);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      const attempts = Math.min(maximumAttempts, share.failed_attempts + 1);
      await client.query(
        'UPDATE medical_record_shares SET failed_attempts = $2, locked_at = CASE WHEN $2 >= $3 THEN now() ELSE locked_at END WHERE id = $1',
        [share.id, attempts, maximumAttempts],
      );
      await client.query('COMMIT');
      return { status: attempts >= maximumAttempts ? 'unavailable' as const : 'invalid_pin' as const };
    }

    const [conditions, medications, encounters, appointments, labs] = await Promise.all([
      client.query('SELECT name, clinical_status, onset_date, notes FROM conditions WHERE patient_id = $1 AND clinical_status = $2 ORDER BY onset_date DESC NULLS LAST LIMIT 30', [share.patient_id, 'active']),
      client.query('SELECT name, dose_text, route, instructions, prescribed_by, start_date FROM medications WHERE patient_id = $1 AND active = true ORDER BY start_date DESC NULLS LAST LIMIT 30', [share.patient_id]),
      client.query('SELECT occurred_at, encounter_type, specialty, practitioner_name, facility_name, reason, summary FROM encounters WHERE patient_id = $1 ORDER BY occurred_at DESC LIMIT 20', [share.patient_id]),
      client.query('SELECT starts_at, specialty, practitioner_name, facility_name, reason, status FROM appointments WHERE patient_id = $1 ORDER BY starts_at DESC LIMIT 20', [share.patient_id]),
      client.query(`SELECT lr.collected_at, lr.panel_name, lr.laboratory_name, r.analyte_name,
                           r.value_numeric, r.value_text, r.unit, r.reference_low, r.reference_high, r.abnormal_flag
                      FROM lab_reports lr
                      JOIN lab_results r ON r.report_id = lr.id
                     WHERE lr.patient_id = $1
                     ORDER BY lr.collected_at DESC NULLS LAST, r.analyte_name
                     LIMIT 100`, [share.patient_id]),
    ]);

    await client.query('UPDATE medical_record_shares SET access_count = access_count + 1, last_accessed_at = now(), failed_attempts = 0 WHERE id = $1', [share.id]);
    await client.query(
      `INSERT INTO audit_events
         (family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'medical_share.accessed', 'medical_record_share', $3, '{"scope":"clinical-summary"}'::jsonb)`,
      [share.family_id, share.patient_id, share.id],
    );
    await client.query('COMMIT');
    return {
      status: 'ok' as const,
      expiresAt: share.expires_at.toISOString(),
      patient: {
        name: share.preferred_name || share.legal_name,
        birthDate: share.birth_date,
        bloodType: share.blood_type,
        emergencySummary: share.emergency_summary,
        allergiesSummary: share.allergies_summary,
      },
      conditions: conditions.rows,
      medications: medications.rows,
      encounters: encounters.rows,
      appointments: appointments.rows,
      labs: labs.rows,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
