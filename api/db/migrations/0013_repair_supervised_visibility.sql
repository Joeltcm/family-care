-- Repair only supervised accounts: they may read their own linked patient,
-- cannot edit/share records, and cannot inherit family-wide visibility.
UPDATE family_memberships fm
   SET can_view_all = false, can_manage_emergency = false
  FROM auth_credentials ac
 WHERE ac.user_id = fm.user_id AND ac.is_supervised
   AND (fm.can_view_all OR fm.can_manage_emergency);

UPDATE patient_permissions pp
   SET can_read = p.linked_user_id = pp.user_id, can_write = false, can_share = false
  FROM patients p
  JOIN family_memberships fm ON fm.family_id = p.family_id
  JOIN auth_credentials ac ON ac.user_id = fm.user_id AND ac.is_supervised
 WHERE pp.patient_id = p.id AND pp.user_id = fm.user_id
   AND (pp.can_read IS DISTINCT FROM (p.linked_user_id = pp.user_id) OR pp.can_write OR pp.can_share);

UPDATE medical_record_shares s
   SET revoked_at = now()
  FROM auth_credentials ac
 WHERE s.created_by = ac.user_id AND ac.is_supervised AND s.revoked_at IS NULL;
