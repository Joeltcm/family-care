ALTER TABLE encounters
  ADD COLUMN recorded_by uuid REFERENCES app_users(id);

ALTER TABLE lab_reports
  ADD COLUMN document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN recorded_by uuid REFERENCES app_users(id);

CREATE INDEX lab_reports_document_idx ON lab_reports (document_id) WHERE document_id IS NOT NULL;

COMMENT ON COLUMN lab_reports.document_id IS 'Optional original report stored in object storage; structured values remain independently reviewable.';
COMMENT ON COLUMN encounters.recorded_by IS 'Family Care user who recorded this encounter.';
COMMENT ON COLUMN lab_reports.recorded_by IS 'Family Care user who manually reviewed and saved this report.';
