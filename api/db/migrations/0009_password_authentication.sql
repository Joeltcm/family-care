ALTER TABLE family_invitations
  ADD COLUMN is_minor boolean NOT NULL DEFAULT false,
  ADD COLUMN guardian_user_id uuid REFERENCES app_users(id),
  ADD COLUMN linked_patient_id uuid REFERENCES patients(id);

CREATE TABLE auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  is_supervised boolean NOT NULL DEFAULT false,
  guardian_user_id uuid REFERENCES app_users(id),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  activated_at timestamptz NOT NULL DEFAULT now(),
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent_hash text
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE family_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES family_invitations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  consumed_at timestamptz
);

CREATE INDEX family_activation_tokens_invitation_idx
  ON family_activation_tokens (invitation_id, expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE auth_credentials IS 'Argon2id password credentials owned by Family Care; plaintext passwords are never stored.';
COMMENT ON TABLE auth_sessions IS 'Opaque, revocable browser sessions. Only SHA-256 token digests are persisted.';
COMMENT ON COLUMN family_invitations.is_minor IS 'Supervised minor account: read-only, no sharing and no family administration.';
COMMENT ON TABLE family_activation_tokens IS 'Single-use invitation activation tokens. Only SHA-256 token digests are persisted.';
COMMENT ON TABLE family_invitations IS 'Email-bound preauthorization activated with a single-use Family Care link.';
