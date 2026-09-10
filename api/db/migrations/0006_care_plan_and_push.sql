ALTER TABLE medications
  ADD COLUMN recorded_by uuid REFERENCES app_users(id);

ALTER TABLE appointments
  ADD COLUMN recorded_by uuid REFERENCES app_users(id),
  ADD COLUMN encounter_id uuid REFERENCES encounters(id) ON DELETE SET NULL;

ALTER TABLE medication_events
  ADD COLUMN schedule_id uuid REFERENCES medication_schedules(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX medication_events_occurrence_uidx
  ON medication_events (schedule_id, scheduled_at)
  WHERE schedule_id IS NOT NULL;

CREATE UNIQUE INDEX appointments_encounter_uidx
  ON appointments (encounter_id)
  WHERE encounter_id IS NOT NULL;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint_hash text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  disabled_at timestamptz
);

CREATE INDEX push_subscriptions_user_idx
  ON push_subscriptions (user_id)
  WHERE disabled_at IS NULL;

CREATE TABLE reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('appointment', 'medication')),
  resource_id uuid NOT NULL,
  schedule_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, reminder_type, resource_id, schedule_key)
);

CREATE INDEX reminder_deliveries_due_idx
  ON reminder_deliveries (scheduled_for DESC, status);

COMMENT ON TABLE push_subscriptions IS
  'Per-device Web Push subscriptions. Notification payloads intentionally exclude diagnoses and medication names.';

COMMENT ON TABLE reminder_deliveries IS
  'Idempotency and audit trail for appointment and medication reminders.';
