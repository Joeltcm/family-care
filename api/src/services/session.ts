import type { PoolClient } from 'pg';
import type { CallerIdentity } from '../auth.js';
import { config } from '../config.js';
import { database } from '../database.js';

type UserRow = {
  id: string;
  email: string;
  display_name: string;
};

type FamilyRow = {
  id: string;
  name: string;
  role: 'owner' | 'caregiver' | 'adult' | 'dependent' | 'viewer';
};

type PatientRow = {
  id: string;
  legal_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  blood_type: string | null;
  emergency_summary: string | null;
  allergies_summary: string | null;
  relationship_to_owner: 'self' | 'spouse' | 'child' | 'dependent' | 'other' | null;
  linked_user_id: string | null;
  can_write: boolean;
  can_share: boolean;
};

export class IdentityConflictError extends Error {}

async function ensureConfiguredPatient(
  client: PoolClient,
  familyId: string,
  userId: string,
  legalName: string,
  relationship: 'spouse' | 'child',
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id
       FROM patients
      WHERE family_id = $1
        AND (lower(legal_name) = lower($2) OR relationship_to_owner = $3)
      ORDER BY (lower(legal_name) = lower($2)) DESC
      LIMIT 1`,
    [familyId, legalName, relationship],
  );
  let patientId = existing.rows[0]?.id;
  if (!patientId) {
    const created = await client.query<{ id: string }>(
      `INSERT INTO patients (family_id, legal_name, preferred_name, relationship_to_owner)
       VALUES ($1, $2, $2, $3)
       RETURNING id`,
      [familyId, legalName, relationship],
    );
    patientId = created.rows[0].id;
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'family.patient_configured', 'patient', $3, '{"source":"private-runtime-config"}'::jsonb)`,
      [userId, familyId, patientId],
    );
  }
  await client.query(
    `UPDATE patients
        SET relationship_to_owner = COALESCE(relationship_to_owner, $2),
            private_config_applied_at = COALESCE(private_config_applied_at, now()),
            updated_at = now()
      WHERE id = $1`,
    [patientId, relationship],
  );
  await client.query(
    `INSERT INTO patient_permissions
       (patient_id, user_id, can_read, can_write, can_share, granted_by)
     VALUES ($1, $2, true, true, false, $2)
     ON CONFLICT (patient_id, user_id)
     DO UPDATE SET can_read = true, can_write = true`,
    [patientId, userId],
  );
}

async function upsertUser(client: PoolClient, identity: CallerIdentity) {
  const bySubject = await client.query<UserRow>(
    `SELECT id, email, display_name
       FROM app_users
      WHERE auth_subject = $1
      FOR UPDATE`,
    [identity.subject],
  );

  if (bySubject.rowCount) {
    const updated = await client.query<UserRow>(
      `UPDATE app_users
          SET email = $2, display_name = $3, updated_at = now()
        WHERE id = $1
        RETURNING id, email, display_name`,
      [bySubject.rows[0].id, identity.email.toLowerCase(), identity.displayName],
    );
    return updated.rows[0];
  }

  const byEmail = await client.query<UserRow & { auth_subject: string | null }>(
    `SELECT id, email, display_name, auth_subject
       FROM app_users
      WHERE lower(email) = lower($1)
      FOR UPDATE`,
    [identity.email],
  );

  if (byEmail.rowCount) {
    if (byEmail.rows[0].auth_subject) {
      const linked = await client.query<UserRow>(
        `UPDATE app_users
            SET display_name = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, email, display_name`,
        [byEmail.rows[0].id, identity.displayName],
      );
      return linked.rows[0];
    }
    const claimed = await client.query<UserRow>(
      `UPDATE app_users
          SET auth_subject = $2, display_name = $3, updated_at = now()
        WHERE id = $1
        RETURNING id, email, display_name`,
      [byEmail.rows[0].id, identity.subject, identity.displayName],
    );
    return claimed.rows[0];
  }

  const created = await client.query<UserRow>(
    `INSERT INTO app_users (email, display_name, auth_subject)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name`,
    [identity.email.toLowerCase(), identity.displayName, identity.subject],
  );
  return created.rows[0];
}

export async function bootstrapSession(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.subject]);
    const user = await upsertUser(client, identity);

    const membership = await client.query<FamilyRow>(
      `SELECT f.id, f.name, fm.role
         FROM family_memberships fm
         JOIN families f ON f.id = fm.family_id
        WHERE fm.user_id = $1
        ORDER BY fm.created_at
        LIMIT 1`,
      [user.id],
    );
    let family = membership.rows[0];
    let created = false;

    if (!family) {
      const invitation = await client.query<{
        id: string; family_id: string; name: string; role: FamilyRow['role'];
        can_view_all: boolean; can_manage_emergency: boolean;
      }>(
        `SELECT fi.id, fi.family_id, f.name, fi.role, fi.can_view_all, fi.can_manage_emergency
           FROM family_invitations fi JOIN families f ON f.id = fi.family_id
          WHERE lower(fi.email) = lower($1) AND fi.status = 'pending' AND fi.expires_at > now()
          ORDER BY fi.created_at LIMIT 1 FOR UPDATE OF fi`, [identity.email],
      );
      if (invitation.rowCount) {
        const invite = invitation.rows[0];
        await client.query(
          `INSERT INTO family_memberships (family_id, user_id, role, can_view_all, can_manage_emergency)
           VALUES ($1,$2,$3,$4,$5)`,
          [invite.family_id, user.id, invite.role, invite.can_view_all, invite.can_manage_emergency],
        );
        await client.query(
          `INSERT INTO patient_permissions (patient_id, user_id, can_read, can_write, can_share, granted_by)
           SELECT fipp.patient_id, $2, fipp.can_read, fipp.can_write, fipp.can_share, fi.invited_by
             FROM family_invitation_patient_permissions fipp
             JOIN family_invitations fi ON fi.id = fipp.invitation_id
            WHERE fipp.invitation_id = $1`, [invite.id, user.id],
        );
        await client.query(
          `UPDATE family_invitations SET status = 'accepted', accepted_by = $2, accepted_at = now() WHERE id = $1`,
          [invite.id, user.id],
        );
        await client.query(
          `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
           VALUES ($1,$2,'family.invitation_accepted','family_invitation',$3,'{"identity":"verified_email"}'::jsonb)`,
          [user.id, invite.family_id, invite.id],
        );
        family = { id: invite.family_id, name: invite.name, role: invite.role };
      }
    }

    if (!family) {
      const createdFamily = await client.query<{ id: string; name: string }>(
        `INSERT INTO families (name, created_by)
         VALUES ($1, $2)
         RETURNING id, name`,
        [`${identity.displayName} · Familia`, user.id],
      );
      await client.query(
        `INSERT INTO family_memberships
           (family_id, user_id, role, can_view_all, can_manage_emergency)
         VALUES ($1, $2, 'owner', true, true)`,
        [createdFamily.rows[0].id, user.id],
      );
      family = { ...createdFamily.rows[0], role: 'owner' };
      created = true;
    }

    const ownPatient = await client.query<{ id: string }>(
      'SELECT id FROM patients WHERE family_id = $1 AND linked_user_id = $2 LIMIT 1',
      [family.id, user.id],
    );

    if (!ownPatient.rowCount) {
      const patient = await client.query<{ id: string }>(
        `INSERT INTO patients (family_id, linked_user_id, legal_name, preferred_name)
         VALUES ($1, $2, $3, $3)
         RETURNING id`,
        [family.id, user.id, config.FAMILY_CARE_OWNER_LEGAL_NAME || identity.displayName],
      );
      await client.query(
        `INSERT INTO patient_permissions
           (patient_id, user_id, can_read, can_write, can_share, granted_by)
         VALUES ($1, $2, true, true, true, $2)
         ON CONFLICT (patient_id, user_id) DO NOTHING`,
        [patient.rows[0].id, user.id],
      );
      created = true;
    }

    await client.query(
      `UPDATE patients
          SET legal_name = CASE WHEN private_config_applied_at IS NULL AND $3::text IS NOT NULL THEN $3 ELSE legal_name END,
              preferred_name = CASE WHEN private_config_applied_at IS NULL AND $3::text IS NOT NULL THEN $3 ELSE preferred_name END,
              relationship_to_owner = 'self',
              private_config_applied_at = COALESCE(private_config_applied_at, now()),
              updated_at = now()
        WHERE family_id = $1 AND linked_user_id = $2`,
      [family.id, user.id, config.FAMILY_CARE_OWNER_LEGAL_NAME || null],
    );
    if (config.FAMILY_CARE_SPOUSE_LEGAL_NAME) {
      await ensureConfiguredPatient(client, family.id, user.id, config.FAMILY_CARE_SPOUSE_LEGAL_NAME, 'spouse');
    }
    if (config.FAMILY_CARE_CHILD_LEGAL_NAME) {
      await ensureConfiguredPatient(client, family.id, user.id, config.FAMILY_CARE_CHILD_LEGAL_NAME, 'child');
    }

    const credential = await client.query<{ is_supervised: boolean }>(
      'SELECT is_supervised FROM auth_credentials WHERE user_id = $1',
      [user.id],
    );
    const supervised = credential.rows[0]?.is_supervised ?? false;
    const patients = await client.query<PatientRow>(
      `SELECT p.id, p.legal_name, p.preferred_name, p.birth_date, p.blood_type,
              p.emergency_summary, p.allergies_summary, p.relationship_to_owner, p.linked_user_id,
              (NOT $3::boolean AND (p.linked_user_id = $2 OR COALESCE(pp.can_write, false))) AS can_write,
              (NOT $3::boolean AND COALESCE(pp.can_share, false)) AS can_share
         FROM patients p
         JOIN family_memberships fm ON fm.family_id = p.family_id AND fm.user_id = $2
         LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = $2
        WHERE p.family_id = $1
          AND (fm.can_view_all OR pp.can_read)
        ORDER BY CASE p.relationship_to_owner WHEN 'self' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 ELSE 3 END,
                 p.created_at`,
      [family.id, user.id, supervised],
    );

    if (created) {
      await client.query(
        `INSERT INTO audit_events
           (actor_user_id, family_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'account.bootstrap', 'family', $2, '{"source":"chatgpt-sites"}'::jsonb)`,
        [user.id, family.id],
      );
    }

    await client.query('COMMIT');
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        passwordAccessConfigured: Boolean(credential.rowCount),
        supervised,
      },
      family: { id: family.id, name: family.name, role: family.role },
      patients: patients.rows.map((patient) => ({
        id: patient.id,
        legalName: patient.legal_name,
        preferredName: patient.preferred_name,
        birthDate: patient.birth_date,
        bloodType: patient.blood_type,
        emergencySummary: patient.emergency_summary,
        allergiesSummary: patient.allergies_summary,
        relationship: patient.relationship_to_owner,
        linkedToCurrentUser: patient.linked_user_id === user.id,
        canWrite: patient.can_write,
        canShare: patient.can_share,
      })),
      created,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
