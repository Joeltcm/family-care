ALTER TABLE insurance_policies
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE insurance_cases
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE emergency_contacts
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE emergency_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'triggered'
    CHECK (status IN ('triggered', 'resolved'));

ALTER TABLE emergency_deliveries
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE INDEX IF NOT EXISTS insurance_policies_family_idx
  ON insurance_policies (family_id, renewal_date);
CREATE INDEX IF NOT EXISTS insurance_cases_policy_idx
  ON insurance_cases (policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_contacts_family_idx
  ON emergency_contacts (family_id, enabled, priority);
CREATE INDEX IF NOT EXISTS emergency_events_patient_idx
  ON emergency_events (patient_id, triggered_at DESC);

COMMENT ON COLUMN insurance_policies.policy_number_encrypted IS 'AES-256-GCM ciphertext; never store or log plaintext.';
COMMENT ON COLUMN insurance_beneficiaries.member_number_encrypted IS 'AES-256-GCM ciphertext; never store or log plaintext.';
