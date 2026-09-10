import type { CallerIdentity } from '../auth.js';
import { database } from '../database.js';

type AccessContext = { user_id: string; family_id: string; role: string };

export class FamilyAccessPermissionError extends Error {}

async function context(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<AccessContext>(
    `SELECT u.id AS user_id, fm.family_id, fm.role::text
       FROM app_users u JOIN family_memberships fm ON fm.user_id = u.id
      WHERE u.auth_subject = $1 AND lower(u.email) = lower($2)
      ORDER BY fm.created_at LIMIT 1`, [identity.subject, identity.email],
  );
  if (!result.rowCount) throw new FamilyAccessPermissionError('family_access_denied');
  return result.rows[0];
}

export async function getFamilyAccess(identity: CallerIdentity) {
  const access = await context(identity);
  if (access.role !== 'owner') throw new FamilyAccessPermissionError('family_access_manage_denied');
  const members = await database!.query<{ id: string; email: string; display_name: string; role: string; can_view_all: boolean; can_manage_emergency: boolean }>(
    `SELECT u.id, u.email, u.display_name, fm.role::text, fm.can_view_all, fm.can_manage_emergency
       FROM family_memberships fm JOIN app_users u ON u.id = fm.user_id
      WHERE fm.family_id = $1 ORDER BY fm.created_at`, [access.family_id],
  );
  const invitations = await database!.query<{ id: string; email: string; display_name: string; role: string; can_view_all: boolean; can_manage_emergency: boolean; status: string; expires_at: string; patient_ids: string[] }>(
    `SELECT fi.id, fi.email, fi.display_name, fi.role::text, fi.can_view_all, fi.can_manage_emergency,
            CASE WHEN fi.status = 'pending' AND fi.expires_at <= now() THEN 'expired' ELSE fi.status END AS status,
            fi.expires_at, COALESCE(array_agg(fipp.patient_id) FILTER (WHERE fipp.patient_id IS NOT NULL), '{}') AS patient_ids
       FROM family_invitations fi
       LEFT JOIN family_invitation_patient_permissions fipp ON fipp.invitation_id = fi.id
      WHERE fi.family_id = $1 GROUP BY fi.id ORDER BY fi.created_at DESC`, [access.family_id],
  );
  return {
    canManage: true,
    members: members.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, canViewAll: row.can_view_all, canManageEmergency: row.can_manage_emergency })),
    invitations: invitations.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, canViewAll: row.can_view_all, canManageEmergency: row.can_manage_emergency, status: row.status, expiresAt: row.expires_at, patientIds: row.patient_ids })),
  };
}

export async function createFamilyInvitation(identity: CallerIdentity, input: {
  email: string; displayName: string; role: 'caregiver' | 'adult' | 'viewer';
  canViewAll: boolean; canManageEmergency: boolean;
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
    const valid = input.patients.length ? await client.query<{ id: string }>(
      'SELECT id FROM patients WHERE family_id = $1 AND id = ANY($2::uuid[])', [access.family_id, input.patients.map((item) => item.patientId)],
    ) : { rowCount: 0 };
    if (!input.canViewAll && valid.rowCount !== input.patients.length) throw new FamilyAccessPermissionError('invalid_patient_permissions');
    const invitation = await client.query<{ id: string; expires_at: string }>(
      `INSERT INTO family_invitations (family_id, email, display_name, role, can_view_all, can_manage_emergency, invited_by)
       VALUES ($1,lower($2),$3,$4,$5,$6,$7)
       ON CONFLICT (family_id, lower(email)) WHERE status = 'pending'
       DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
                     can_view_all = EXCLUDED.can_view_all, can_manage_emergency = EXCLUDED.can_manage_emergency,
                     invited_by = EXCLUDED.invited_by, expires_at = now() + interval '14 days'
       RETURNING id, expires_at`,
      [access.family_id, input.email, input.displayName, input.role, input.canViewAll, input.canManageEmergency, access.user_id],
    );
    await client.query('DELETE FROM family_invitation_patient_permissions WHERE invitation_id = $1', [invitation.rows[0].id]);
    for (const permission of input.patients) {
      await client.query(
        `INSERT INTO family_invitation_patient_permissions (invitation_id, patient_id, can_read, can_write, can_share)
         VALUES ($1,$2,true,$3,$4)`, [invitation.rows[0].id, permission.patientId, permission.canWrite, permission.canShare],
      );
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,'family.invitation_created','family_invitation',$3,$4::jsonb)`,
      [access.user_id, access.family_id, invitation.rows[0].id, JSON.stringify({ role: input.role, canViewAll: input.canViewAll, patientCount: input.patients.length })],
    );
    await client.query('COMMIT');
    return { id: invitation.rows[0].id, expiresAt: invitation.rows[0].expires_at, requiresSiteAccess: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
