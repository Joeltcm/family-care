import type { CallerIdentity } from '../auth.js';
import { database } from '../database.js';

export type PatientProfileInput = {
  legalName: string;
  preferredName: string | null;
  birthDate: string | null;
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
  allergiesSummary: string | null;
  emergencySummary: string | null;
  canShare: boolean;
  shareConsentConfirmed: boolean;
};

type AccessRow = {
  user_id: string;
  family_id: string;
  linked_user_id: string | null;
  role: 'owner' | 'caregiver' | 'adult' | 'dependent' | 'viewer';
  can_write: boolean | null;
  can_share: boolean | null;
};

type UpdatedRow = {
  id: string;
  legal_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  blood_type: string | null;
  emergency_summary: string | null;
  allergies_summary: string | null;
  relationship_to_owner: 'self' | 'spouse' | 'child' | 'dependent' | 'other' | null;
  linked_user_id: string | null;
};

export class PatientProfilePermissionError extends Error {}
export class PatientShareConsentError extends Error {}

export async function updatePatientProfile(
  identity: CallerIdentity,
  patientId: string,
  input: PatientProfileInput,
) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await client.query<AccessRow>(
      `SELECT u.id AS user_id, p.family_id, p.linked_user_id, fm.role,
              pp.can_write, pp.can_share
         FROM app_users u
         JOIN family_memberships fm ON fm.user_id = u.id
         JOIN patients p ON p.family_id = fm.family_id AND p.id = $2
         LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
        WHERE (u.auth_subject = $1 OR lower(u.email) = lower($3))
        FOR UPDATE OF p`,
      [identity.subject, patientId, identity.email],
    );
    const permission = access.rows[0];
    if (!permission || (permission.linked_user_id !== permission.user_id && !permission.can_write)) {
      throw new PatientProfilePermissionError('profile_update_not_allowed');
    }

    const self = permission.linked_user_id === permission.user_id;
    if (!self && input.canShare && !permission.can_share && !input.shareConsentConfirmed) {
      throw new PatientShareConsentError('share_consent_required');
    }

    const updated = await client.query<UpdatedRow>(
      `UPDATE patients
          SET legal_name = $2,
              preferred_name = $3,
              birth_date = $4,
              blood_type = $5,
              allergies_summary = $6,
              emergency_summary = $7,
              updated_at = now()
        WHERE id = $1
        RETURNING id, legal_name, preferred_name, birth_date, blood_type,
                  emergency_summary, allergies_summary, relationship_to_owner, linked_user_id`,
      [
        patientId,
        input.legalName.trim(),
        input.preferredName?.trim() || null,
        input.birthDate,
        input.bloodType,
        input.allergiesSummary?.trim() || null,
        input.emergencySummary?.trim() || null,
      ],
    );

    await client.query(
      `UPDATE patient_permissions
          SET can_share = $3,
              share_consent_confirmed_at = CASE
                WHEN $3 AND ($4 OR $5) THEN COALESCE(share_consent_confirmed_at, now())
                WHEN NOT $3 THEN NULL
                ELSE share_consent_confirmed_at
              END,
              share_consent_confirmed_by = CASE
                WHEN $3 AND ($4 OR $5) THEN COALESCE(share_consent_confirmed_by, $2)
                WHEN NOT $3 THEN NULL
                ELSE share_consent_confirmed_by
              END
        WHERE patient_id = $1 AND user_id = $2`,
      [patientId, permission.user_id, input.canShare, self, input.shareConsentConfirmed],
    );

    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'patient.profile_updated', 'patient', $3, $4)`,
      [
        permission.user_id,
        permission.family_id,
        patientId,
        JSON.stringify({
          fields: ['legalName', 'preferredName', 'birthDate', 'bloodType', 'allergiesSummary', 'emergencySummary', 'canShare'],
          shareConsentConfirmed: !self && input.canShare,
        }),
      ],
    );
    await client.query('COMMIT');
    const patient = updated.rows[0];
    return {
      id: patient.id,
      legalName: patient.legal_name,
      preferredName: patient.preferred_name,
      birthDate: patient.birth_date,
      bloodType: patient.blood_type,
      emergencySummary: patient.emergency_summary,
      allergiesSummary: patient.allergies_summary,
      relationship: patient.relationship_to_owner,
      linkedToCurrentUser: self,
      canWrite: true,
      canShare: input.canShare,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
