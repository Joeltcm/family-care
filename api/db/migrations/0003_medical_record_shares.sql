CREATE TABLE medical_record_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES app_users(id),
  token_hash text NOT NULL UNIQUE,
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  locked_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 10),
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX medical_record_shares_patient_idx
  ON medical_record_shares (patient_id, created_at DESC);

CREATE INDEX medical_record_shares_expiry_idx
  ON medical_record_shares (expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE medical_record_shares IS
  'Time-limited, PIN-protected read-only snapshots. Raw tokens and PINs are never stored.';
