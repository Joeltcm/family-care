CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE family_role AS ENUM ('owner', 'caregiver', 'adult', 'dependent', 'viewer');
CREATE TYPE record_source AS ENUM ('family_care', 'healwave', 'import');
CREATE TYPE document_category AS ENUM ('lab', 'prescription', 'referral', 'insurance', 'clinical_note', 'discharge', 'other');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'cancelled', 'missed');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'es-PA',
  timezone text NOT NULL DEFAULT 'America/Panama',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_memberships (
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role family_role NOT NULL,
  can_view_all boolean NOT NULL DEFAULT false,
  can_manage_emergency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES app_users(id),
  legal_name text NOT NULL,
  preferred_name text,
  birth_date date,
  blood_type text,
  emergency_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patient_permissions (
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_share boolean NOT NULL DEFAULT false,
  granted_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, user_id)
);

CREATE TABLE conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  code_system text,
  code text,
  clinical_status text NOT NULL DEFAULT 'active',
  onset_date date,
  resolved_date date,
  source record_source NOT NULL DEFAULT 'family_care',
  external_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  encounter_type text NOT NULL,
  specialty text,
  practitioner_name text,
  facility_name text,
  reason text,
  summary text,
  source record_source NOT NULL DEFAULT 'family_care',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE TABLE hospitalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL UNIQUE REFERENCES encounters(id) ON DELETE CASCADE,
  admitted_at timestamptz NOT NULL,
  discharged_at timestamptz,
  discharge_summary text
);

CREATE TABLE medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  dose_text text,
  route text,
  instructions text,
  prescribed_by text,
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  source record_source NOT NULL DEFAULT 'family_care',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE medication_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  local_time time,
  recurrence_rule text,
  reminders_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE medication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  taken_at timestamptz,
  status text NOT NULL CHECK (status IN ('scheduled', 'taken', 'skipped', 'missed')),
  recorded_by uuid REFERENCES app_users(id)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  specialty text,
  practitioner_name text,
  facility_name text,
  reason text,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  reminder_minutes integer[] NOT NULL DEFAULT ARRAY[1440, 120],
  source record_source NOT NULL DEFAULT 'family_care',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(id),
  collected_at timestamptz,
  reported_at timestamptz,
  laboratory_name text,
  panel_name text NOT NULL,
  source record_source NOT NULL DEFAULT 'family_care',
  external_id text,
  extraction_status text NOT NULL DEFAULT 'pending',
  reviewed_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
  analyte_name text NOT NULL,
  analyte_code text,
  value_numeric numeric,
  value_text text,
  unit text,
  reference_low numeric,
  reference_high numeric,
  abnormal_flag text,
  source_page integer,
  extraction_confidence numeric CHECK (extraction_confidence BETWEEN 0 AND 1)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category document_category NOT NULL,
  title text NOT NULL,
  captured_at timestamptz,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  r2_object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  variant text NOT NULL CHECK (variant IN ('original', 'optimized', 'thumbnail')),
  encryption_key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  insurer_name text NOT NULL,
  policy_number_encrypted text NOT NULL,
  plan_name text,
  effective_date date,
  renewal_date date,
  assistance_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurance_beneficiaries (
  policy_id uuid NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  member_number_encrypted text,
  PRIMARY KEY (policy_id, patient_id)
);

CREATE TABLE insurance_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id),
  case_type text NOT NULL CHECK (case_type IN ('authorization', 'claim')),
  status text NOT NULL,
  reference_number text,
  amount numeric(12,2),
  submitted_at timestamptz,
  resolved_at timestamptz
);

CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  phone_e164 text NOT NULL,
  push_subscription jsonb,
  priority integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE emergency_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  triggered_by uuid NOT NULL REFERENCES app_users(id),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  location jsonb,
  note text,
  simulation boolean NOT NULL DEFAULT true,
  resolved_at timestamptz
);

CREATE TABLE emergency_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES emergency_events(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES emergency_contacts(id),
  channel text NOT NULL CHECK (channel IN ('push', 'call')),
  provider_message_id text,
  status text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE TABLE external_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source record_source NOT NULL,
  external_patient_id_encrypted text NOT NULL,
  read_only boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  sync_cursor_encrypted text,
  UNIQUE (patient_id, source)
);

CREATE TABLE ai_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  purpose text NOT NULL,
  deidentified_payload_hash text NOT NULL,
  consented_by uuid NOT NULL REFERENCES app_users(id),
  output_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES app_users(id),
  family_id uuid REFERENCES families(id),
  patient_id uuid REFERENCES patients(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX encounters_patient_date_idx ON encounters (patient_id, occurred_at DESC);
CREATE INDEX appointments_patient_date_idx ON appointments (patient_id, starts_at);
CREATE INDEX lab_reports_patient_date_idx ON lab_reports (patient_id, collected_at DESC);
CREATE INDEX lab_results_report_analyte_idx ON lab_results (report_id, analyte_name);
CREATE INDEX audit_events_patient_date_idx ON audit_events (patient_id, occurred_at DESC);

COMMENT ON TABLE external_sources IS 'References to external systems. Family Care treats Healwave as strictly read-only.';
COMMENT ON TABLE ai_analysis_runs IS 'Only de-identified, explicitly consented payloads may be sent to an AI provider.';
