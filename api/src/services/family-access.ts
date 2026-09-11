import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CallerIdentity } from '../auth.js';
import { config } from '../config.js';
import { database } from '../database.js';

type AccessContext = { user_id: string; family_id: string; role: string };

export class FamilyAccessPermissionError extends Error {}

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function issueActivationToken(client: PoolClient, invitationId: string) {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    'UPDATE family_activation_tokens SET consumed_at = now() WHERE invitation_id = $1 AND consumed_at IS NULL',
    [invitationId],
  );
  const result = await client.query<{ expires_at: string }>(
    `INSERT INTO family_activation_tokens (invitation_id, token_hash)
     VALUES ($1,$2) RETURNING expires_at`,
    [invitationId, tokenDigest(token)],
  );
  return { token, expiresAt: result.rows[0].expires_at };
}

async function context(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<AccessContext>(
    `SELECT u.id AS user_id, fm.family_id, fm.role::text
       FROM app_users u JOIN family_memberships fm ON fm.user_id = u.id
      WHERE u.auth_subject = $1 OR lower(u.email) = lower($2)
      ORDER BY fm.created_at LIMIT 1`, [identity.subject, identity.email],
  );
  if (!result.rowCount) throw new FamilyAccessPermissionError('family_access_denied');
  return result.rows[0];
}

export async function getFamilyAccess(identity: CallerIdentity) {
  const access = await context(identity);
  if (access.role !== 'owner') throw new FamilyAccessPermissionError('family_access_manage_denied');
  const members = await database!.query<{ id: string; email: string; display_name: string; role: string; can_view_all: boolean; can_manage_emergency: boolean; is_supervised: boolean }>(
    `SELECT u.id, u.email, u.display_name, fm.role::text, fm.can_view_all, fm.can_manage_emergency,
            COALESCE(ac.is_supervised, false) AS is_supervised
       FROM family_memberships fm JOIN app_users u ON u.id = fm.user_id
       LEFT JOIN auth_credentials ac ON ac.user_id = u.id
      WHERE fm.family_id = $1 ORDER BY fm.created_at`, [access.family_id],
  );
  const invitations = await database!.query<{ id: string; email: string; display_name: string; role: string; can_view_all: boolean; can_manage_emergency: boolean; status: string; expires_at: string; patient_ids: string[]; is_minor: boolean; linked_patient_id: string | null }>(
    `SELECT fi.id, fi.email, fi.display_name, fi.role::text, fi.can_view_all, fi.can_manage_emergency,
            CASE WHEN fi.status = 'pending' AND fi.expires_at <= now() THEN 'expired' ELSE fi.status END AS status,
            fi.expires_at, fi.is_minor, fi.linked_patient_id,
            COALESCE(array_agg(fipp.patient_id) FILTER (WHERE fipp.patient_id IS NOT NULL), '{}') AS patient_ids
       FROM family_invitations fi
       LEFT JOIN family_invitation_patient_permissions fipp ON fipp.invitation_id = fi.id
      WHERE fi.family_id = $1 GROUP BY fi.id ORDER BY fi.created_at DESC`, [access.family_id],
  );
  return {
    canManage: true,
    members: members.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, canViewAll: row.can_view_all, canManageEmergency: row.can_manage_emergency, isSupervised: row.is_supervised })),
    invitations: invitations.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, canViewAll: row.can_view_all, canManageEmergency: row.can_manage_emergency, status: row.status, expiresAt: row.expires_at, patientIds: row.patient_ids, isMinor: row.is_minor, linkedPatientId: row.linked_patient_id })),
  };
}

export async function createFamilyInvitation(identity: CallerIdentity, input: {
  email: string; displayName: string; role: 'caregiver' | 'adult' | 'viewer';
  canViewAll: boolean; canManageEmergency: boolean;
  isMinor: boolean; linkedPatientId: string | null;
  patients: Array<{ patientId: string; canWrite: boolean; canShare: boolean }>;
}) {
  const access = await context(identity);
  if (access.role !== 'owner') throw new FamilyAccessPermissionError('family_access_manage_denied');
  if (input.email.toLowerCase() === identity.email.toLowerCase()) throw new FamilyAccessPermissionError('cannot_invite_self');
  const client = await database!.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT 1 FROM family_memberships fm JOIN app_users u ON u.id = fm.user_id
        WHERE fm.family_id = $1 AND lower(u.email) = lower($2)`, [access.family_id, input.email],
    );
    if (existing.rowCount) throw new FamilyAccessPermissionError('already_family_member');
    const safeRole = input.isMinor ? 'viewer' : input.role;
    const safeCanViewAll = input.isMinor ? false : input.canViewAll;
    const safeCanManageEmergency = input.isMinor ? false : input.canManageEmergency;
    const safePatients = input.isMinor
      ? input.patients.map((item) => ({ ...item, canWrite: false, canShare: false }))
      : input.patients;
    const valid = safePatients.length ? await client.query<{ id: string }>(
      'SELECT id FROM patients WHERE family_id = $1 AND id = ANY($2::uuid[])', [access.family_id, input.patients.map((item) => item.patientId)],
    ) : { rowCount: 0 };
    if ((!safeCanViewAll || input.linkedPatientId) && valid.rowCount !== safePatients.length) throw new FamilyAccessPermissionError('invalid_patient_permissions');
    if (input.linkedPatientId && !safePatients.some((item) => item.patientId === input.linkedPatientId)) {
      throw new FamilyAccessPermissionError('linked_patient_must_be_permitted');
    }
    const invitation = await client.query<{ id: string; expires_at: string }>(
      `INSERT INTO family_invitations
         (family_id, email, display_name, role, can_view_all, can_manage_emergency, invited_by, is_minor, guardian_user_id, linked_patient_id)
       VALUES ($1,lower($2),$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (family_id, lower(email)) WHERE status = 'pending'
       DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
                     can_view_all = EXCLUDED.can_view_all, can_manage_emergency = EXCLUDED.can_manage_emergency,
                     invited_by = EXCLUDED.invited_by, is_minor = EXCLUDED.is_minor,
                     guardian_user_id = EXCLUDED.guardian_user_id, linked_patient_id = EXCLUDED.linked_patient_id,
                     expires_at = now() + interval '14 days'
       RETURNING id, expires_at`,
      [access.family_id, input.email, input.displayName, safeRole, safeCanViewAll, safeCanManageEmergency,
        access.user_id, input.isMinor, input.isMinor ? access.user_id : null, input.linkedPatientId],
    );
    await client.query('DELETE FROM family_invitation_patient_permissions WHERE invitation_id = $1', [invitation.rows[0].id]);
    for (const permission of safePatients) {
      await client.query(
        `INSERT INTO family_invitation_patient_permissions (invitation_id, patient_id, can_read, can_write, can_share)
         VALUES ($1,$2,true,$3,$4)`, [invitation.rows[0].id, permission.patientId, permission.canWrite, permission.canShare],
      );
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,'family.invitation_created','family_invitation',$3,$4::jsonb)`,
      [access.user_id, access.family_id, invitation.rows[0].id, JSON.stringify({ role: safeRole, canViewAll: safeCanViewAll, patientCount: safePatients.length, supervisedMinor: input.isMinor })],
    );
    const activation = await issueActivationToken(client, invitation.rows[0].id);
    await client.query('COMMIT');
    return { id: invitation.rows[0].id, expiresAt: invitation.rows[0].expires_at, activationToken: activation.token, activationExpiresAt: activation.expiresAt };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function createFamilyInvitationActivation(identity: CallerIdentity, invitationId: string) {
  const access = await context(identity);
  if (access.role !== 'owner') throw new FamilyAccessPermissionError('family_access_manage_denied');
  const client = await database!.connect();
  try {
    await client.query('BEGIN');
    const invitation = await client.query(
      `SELECT 1 FROM family_invitations
        WHERE id = $1 AND family_id = $2 AND status = 'pending' AND expires_at > now()
        FOR UPDATE`,
      [invitationId, access.family_id],
    );
    if (!invitation.rowCount) throw new FamilyAccessPermissionError('invitation_not_available');
    const activation = await issueActivationToken(client, invitationId);
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,'family.activation_link_created','family_invitation',$3,'{}'::jsonb)`,
      [access.user_id, access.family_id, invitationId],
    );
    await client.query('COMMIT');
    return { activationToken: activation.token, activationExpiresAt: activation.expiresAt };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function bootstrapConfiguredFamilyInvitations() {
  if (!database) return;
  const configured = [
    config.FAMILY_CARE_SPOUSE_EMAIL ? { email: config.FAMILY_CARE_SPOUSE_EMAIL, name: 'Eileen', relationship: 'spouse', role: 'adult', canWrite: true, isMinor: false } : null,
    config.FAMILY_CARE_CHILD_EMAIL ? { email: config.FAMILY_CARE_CHILD_EMAIL, name: 'Lia', relationship: 'child', role: 'viewer', canWrite: false, isMinor: true } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!configured.length) return;
  const families = await database.query<{ family_id: string; owner_id: string }>(
    `SELECT f.id AS family_id, f.created_by AS owner_id FROM families f ORDER BY f.created_at LIMIT 1`,
  );
  if (!families.rowCount) return;
  const { family_id: familyId, owner_id: ownerId } = families.rows[0];
  for (const invite of configured) {
    const existingMember = await database.query(
      `SELECT 1 FROM family_memberships fm JOIN app_users u ON u.id = fm.user_id
        WHERE fm.family_id = $1 AND lower(u.email) = lower($2)`, [familyId, invite.email],
    );
    if (existingMember.rowCount) continue;
    const patient = await database.query<{ id: string }>(
      'SELECT id FROM patients WHERE family_id = $1 AND relationship_to_owner = $2 ORDER BY created_at LIMIT 1',
      [familyId, invite.relationship],
    );
    const invitation = await database.query<{ id: string }>(
      `INSERT INTO family_invitations
         (family_id, email, display_name, role, can_view_all, can_manage_emergency, invited_by,
          is_minor, guardian_user_id, linked_patient_id)
       VALUES ($1,lower($2),$3,$4,false,$5,$6,$7,$8,$9)
       ON CONFLICT (family_id, lower(email)) WHERE status = 'pending'
       DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
                     can_view_all = false, can_manage_emergency = EXCLUDED.can_manage_emergency,
                     is_minor = EXCLUDED.is_minor, guardian_user_id = EXCLUDED.guardian_user_id,
                     linked_patient_id = EXCLUDED.linked_patient_id,
                     invited_by = EXCLUDED.invited_by, expires_at = now() + interval '14 days'
       RETURNING id`, [familyId, invite.email, invite.name, invite.role, !invite.isMinor, ownerId,
        invite.isMinor, invite.isMinor ? ownerId : null, patient.rows[0]?.id || null],
    );
    await database.query('DELETE FROM family_invitation_patient_permissions WHERE invitation_id = $1', [invitation.rows[0].id]);
    await database.query(
      `INSERT INTO family_invitation_patient_permissions
         (invitation_id, patient_id, can_read, can_write, can_share)
       SELECT $1, p.id, true, $2, false FROM patients p
        WHERE p.family_id = $3 AND p.relationship_to_owner = $4`,
      [invitation.rows[0].id, invite.canWrite, familyId, invite.relationship],
    );
  }
}
