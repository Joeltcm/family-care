ALTER TABLE patients
  ADD COLUMN allergies_summary text,
  ADD COLUMN private_config_applied_at timestamptz,
  ADD COLUMN relationship_to_owner text
    CHECK (relationship_to_owner IN ('self', 'spouse', 'child', 'dependent', 'other'));

UPDATE patients
   SET relationship_to_owner = 'self'
 WHERE linked_user_id IS NOT NULL
   AND relationship_to_owner IS NULL;

ALTER TABLE patient_permissions
  ADD COLUMN share_consent_confirmed_at timestamptz,
  ADD COLUMN share_consent_confirmed_by uuid REFERENCES app_users(id);

UPDATE patient_permissions pp
   SET can_share = false
  FROM patients p
 WHERE p.id = pp.patient_id
   AND p.linked_user_id IS NULL;

COMMENT ON COLUMN patients.allergies_summary IS
  'Patient-entered summary. It must be reviewed against the clinical source.';

COMMENT ON COLUMN patient_permissions.share_consent_confirmed_at IS
  'When sharing a non-self record was explicitly confirmed by the authorized family user.';
