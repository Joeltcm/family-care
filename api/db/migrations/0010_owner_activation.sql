CREATE TABLE account_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  consumed_at timestamptz
);

CREATE INDEX account_activation_tokens_user_idx
  ON account_activation_tokens (user_id, expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE account_activation_tokens IS 'Single-use password bootstrap tokens for preconfigured owner accounts. Only SHA-256 token digests are persisted.';
