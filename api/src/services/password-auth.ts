import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { PoolClient } from 'pg';
import type { CallerIdentity } from '../auth.js';
import { database } from '../database.js';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;
const LOCK_DURATION_MS = 15 * 60 * 1_000;
const MAX_FAILED_ATTEMPTS = 5;
const argonOptions = { algorithm: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

type AuthUser = { id: string; email: string; display_name: string; password_hash: string; failed_attempts: number; locked_until: string | null; is_supervised: boolean };

export class AuthenticationError extends Error {}
export class ActivationError extends Error {}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function userAgentDigest(value: string | null | undefined) {
  return value ? digest(value.slice(0, 500)) : null;
}

async function createSession(client: PoolClient, userId: string, userAgent?: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await client.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent_hash)
     VALUES ($1,$2,$3,$4)`,
    [userId, digest(token), expiresAt, userAgentDigest(userAgent)],
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function loginWithPassword(email: string, password: string, userAgent?: string | null) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<AuthUser>(
      `SELECT u.id, u.email, u.display_name, ac.password_hash, ac.failed_attempts,
              ac.locked_until, ac.is_supervised
         FROM app_users u JOIN auth_credentials ac ON ac.user_id = u.id
        WHERE lower(u.email) = lower($1)
        FOR UPDATE OF ac`,
      [email],
    );
    const user = result.rows[0];
    if (!user) {
      await hash(password, argonOptions);
      throw new AuthenticationError('invalid_credentials');
    }
    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      throw new AuthenticationError('account_temporarily_locked');
    }
    const valid = await verify(user.password_hash, password);
    if (!valid) {
      const attempts = user.failed_attempts + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
      await client.query(
        'UPDATE auth_credentials SET failed_attempts = $2, locked_until = $3 WHERE user_id = $1',
        [user.id, lockedUntil ? 0 : attempts, lockedUntil],
      );
      await client.query('COMMIT');
      throw new AuthenticationError(lockedUntil ? 'account_temporarily_locked' : 'invalid_credentials');
    }
    await client.query('UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.id]);
    const session = await createSession(client, user.id, userAgent);
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       SELECT $1, fm.family_id, 'account.password_login', 'app_user', $1, $2::jsonb
         FROM family_memberships fm WHERE fm.user_id = $1 ORDER BY fm.created_at LIMIT 1`,
      [user.id, JSON.stringify({ supervised: user.is_supervised })],
    );
    await client.query('COMMIT');
    return session;
  } catch (error) {
    if (!(error instanceof AuthenticationError)) await client.query('ROLLBACK');
    else {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be committed */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function resolvePasswordSession(token: string) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<{ id: string; email: string; display_name: string; is_supervised: boolean }>(
    `UPDATE auth_sessions s
        SET last_seen_at = CASE WHEN s.last_seen_at < now() - interval '1 hour' THEN now() ELSE s.last_seen_at END
       FROM app_users u JOIN auth_credentials ac ON ac.user_id = u.id
      WHERE s.user_id = u.id AND s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      RETURNING u.id, u.email, u.display_name, ac.is_supervised`,
    [digest(token)],
  );
  const user = result.rows[0];
  if (!user) throw new AuthenticationError('invalid_session');
  return {
    subject: `password:${user.id}`,
    email: user.email,
    displayName: user.display_name,
    supervised: user.is_supervised,
  };
}

export async function revokePasswordSession(token: string) {
  if (!database) throw new Error('database_not_configured');
  await database.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1', [digest(token)]);
  return { revoked: true };
}

export async function setupPasswordForIdentity(identity: CallerIdentity, password: string, userAgent?: string | null) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<{ id: string }>(
      `SELECT u.id FROM app_users u JOIN family_memberships fm ON fm.user_id = u.id
        WHERE u.auth_subject = $1 OR lower(u.email) = lower($2)
        ORDER BY fm.created_at LIMIT 1 FOR UPDATE OF u`,
      [identity.subject, identity.email],
    );
    const user = userResult.rows[0];
    if (!user) throw new AuthenticationError('account_not_ready');
    const existingCredential = await client.query('SELECT 1 FROM auth_credentials WHERE user_id = $1', [user.id]);
    if (existingCredential.rowCount) throw new AuthenticationError('password_already_configured');
    const passwordHash = await hash(password, argonOptions);
    await client.query(
      `INSERT INTO auth_credentials (user_id, password_hash)
       VALUES ($1,$2)`,
      [user.id, passwordHash],
    );
    const session = await createSession(client, user.id, userAgent);
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       SELECT $1, family_id, 'account.password_configured', 'app_user', $1, '{"method":"verified_identity"}'::jsonb
         FROM family_memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
      [user.id],
    );
    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getActivationDetails(token: string) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<{ email: string; display_name: string; is_minor: boolean; expires_at: string }>(
    `SELECT fi.email, fi.display_name, fi.is_minor, fat.expires_at
       FROM family_activation_tokens fat JOIN family_invitations fi ON fi.id = fat.invitation_id
      WHERE fat.token_hash = $1 AND fat.consumed_at IS NULL AND fat.expires_at > now()
        AND fi.status = 'pending' AND fi.expires_at > now()`,
    [digest(token)],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new ActivationError('activation_invalid_or_expired');
  const [local, domain] = invitation.email.split('@');
  const maskedEmail = `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
  return { displayName: invitation.display_name, maskedEmail, isMinor: invitation.is_minor, expiresAt: invitation.expires_at };
}

export async function activateInvitation(token: string, password: string, userAgent?: string | null) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      token_id: string; invitation_id: string; family_id: string; email: string; display_name: string;
      role: string; can_view_all: boolean; can_manage_emergency: boolean; invited_by: string;
      is_minor: boolean; guardian_user_id: string | null; linked_patient_id: string | null;
    }>(
      `SELECT fat.id AS token_id, fi.id AS invitation_id, fi.family_id, fi.email, fi.display_name,
              fi.role::text, fi.can_view_all, fi.can_manage_emergency, fi.invited_by,
              fi.is_minor, fi.guardian_user_id, fi.linked_patient_id
         FROM family_activation_tokens fat JOIN family_invitations fi ON fi.id = fat.invitation_id
        WHERE fat.token_hash = $1 AND fat.consumed_at IS NULL AND fat.expires_at > now()
          AND fi.status = 'pending' AND fi.expires_at > now()
        FOR UPDATE OF fat, fi`,
      [digest(token)],
    );
    const invite = result.rows[0];
    if (!invite) throw new ActivationError('activation_invalid_or_expired');
    const existing = await client.query<{ id: string }>('SELECT id FROM app_users WHERE lower(email) = lower($1) FOR UPDATE', [invite.email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const created = await client.query<{ id: string }>(
        'INSERT INTO app_users (email, display_name) VALUES (lower($1),$2) RETURNING id',
        [invite.email, invite.display_name],
      );
      userId = created.rows[0].id;
    }
    const credential = await client.query('SELECT 1 FROM auth_credentials WHERE user_id = $1', [userId]);
    if (credential.rowCount) throw new ActivationError('account_already_activated');
    const passwordHash = await hash(password, argonOptions);
    await client.query(
      `INSERT INTO auth_credentials (user_id, password_hash, is_supervised, guardian_user_id)
       VALUES ($1,$2,$3,$4)`,
      [userId, passwordHash, invite.is_minor, invite.guardian_user_id],
    );
    await client.query(
      `INSERT INTO family_memberships (family_id, user_id, role, can_view_all, can_manage_emergency)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (family_id, user_id) DO NOTHING`,
      [invite.family_id, userId, invite.role, invite.can_view_all, invite.can_manage_emergency],
    );
    await client.query(
      `INSERT INTO patient_permissions (patient_id, user_id, can_read, can_write, can_share, granted_by)
       SELECT patient_id, $2, can_read, can_write, can_share, $3
         FROM family_invitation_patient_permissions WHERE invitation_id = $1
       ON CONFLICT (patient_id, user_id) DO UPDATE
         SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write, can_share = EXCLUDED.can_share`,
      [invite.invitation_id, userId, invite.invited_by],
    );
    if (invite.linked_patient_id) {
      await client.query(
        `UPDATE patients SET linked_user_id = $2, updated_at = now()
          WHERE id = $1 AND family_id = $3 AND (linked_user_id IS NULL OR linked_user_id = $2)`,
        [invite.linked_patient_id, userId, invite.family_id],
      );
    }
    await client.query(
      `UPDATE family_invitations SET status = 'accepted', accepted_by = $2, accepted_at = now() WHERE id = $1`,
      [invite.invitation_id, userId],
    );
    await client.query('UPDATE family_activation_tokens SET consumed_at = now() WHERE id = $1', [invite.token_id]);
    const session = await createSession(client, userId, userAgent);
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,'family.invitation_activated','family_invitation',$3,$4::jsonb)`,
      [userId, invite.family_id, invite.invitation_id, JSON.stringify({ supervised: invite.is_minor, identity: 'email_password' })],
    );
    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function passwordAccessConfigured(identity: CallerIdentity) {
  if (!database) return false;
  const result = await database.query(
    `SELECT 1 FROM app_users u JOIN auth_credentials ac ON ac.user_id = u.id
      WHERE u.auth_subject = $1 OR lower(u.email) = lower($2) LIMIT 1`,
    [identity.subject, identity.email],
  );
  return Boolean(result.rowCount);
}
