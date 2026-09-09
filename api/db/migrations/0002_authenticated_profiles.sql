ALTER TABLE app_users
  ADD COLUMN auth_subject text;

CREATE UNIQUE INDEX app_users_auth_subject_uidx
  ON app_users (auth_subject)
  WHERE auth_subject IS NOT NULL;

CREATE INDEX family_memberships_user_idx
  ON family_memberships (user_id, created_at);

CREATE INDEX patients_linked_user_idx
  ON patients (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

COMMENT ON COLUMN app_users.auth_subject IS
  'Stable per-Site authenticated user identifier. Never supplied by the browser client.';
