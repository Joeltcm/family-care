CREATE TABLE IF NOT EXISTS family_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  role family_role NOT NULL CHECK (role <> 'owner'),
  can_view_all boolean NOT NULL DEFAULT false,
  can_manage_emergency boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES app_users(id),
  accepted_by uuid REFERENCES app_users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS family_invitation_patient_permissions (
  invitation_id uuid NOT NULL REFERENCES family_invitations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_share boolean NOT NULL DEFAULT false,
  PRIMARY KEY (invitation_id, patient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS family_invitations_pending_email_idx
  ON family_invitations (family_id, lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS family_invitations_email_idx
  ON family_invitations (lower(email), status, expires_at);

COMMENT ON TABLE family_invitations IS 'Email-bound preauthorization. Site access remains enforced separately by the hosting allowlist.';
