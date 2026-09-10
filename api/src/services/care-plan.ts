import type { PoolClient } from 'pg';
import type { CallerIdentity } from '../auth.js';
import { database } from '../database.js';

type AccessRow = {
  user_id: string;
  family_id: string;
  linked_user_id: string | null;
  can_read: boolean | null;
  can_write: boolean | null;
  can_view_all: boolean;
  timezone: string;
};

export type MedicationInput = {
  name: string;
  doseText: string | null;
  route: string | null;
  instructions: string | null;
  prescribedBy: string | null;
  startDate: string;
  endDate: string | null;
  times: string[];
  remindersEnabled: boolean;
};

export type AppointmentInput = {
  startsAt: string;
  endsAt: string | null;
  specialty: string | null;
  practitionerName: string | null;
  facilityName: string | null;
  reason: string;
  reminderMinutes: number[];
};

export class CarePlanPermissionError extends Error {}
export class CarePlanNotFoundError extends Error {}

async function accessForPatient(client: PoolClient, identity: CallerIdentity, patientId: string, lock = false) {
  const result = await client.query<AccessRow>(
    `SELECT u.id AS user_id, u.timezone, p.family_id, p.linked_user_id,
            pp.can_read, pp.can_write, fm.can_view_all
       FROM app_users u
       JOIN family_memberships fm ON fm.user_id = u.id
       JOIN patients p ON p.family_id = fm.family_id AND p.id = $2
       LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
      WHERE (u.auth_subject = $1 OR lower(u.email) = lower($3))
      ${lock ? 'FOR UPDATE OF p' : ''}`,
    [identity.subject, patientId, identity.email],
  );
  return result.rows[0];
}

function mayRead(access: AccessRow | undefined) {
  return Boolean(access && (access.can_view_all || access.linked_user_id === access.user_id || access.can_read));
}

function mayWrite(access: AccessRow | undefined) {
  return Boolean(access && (access.linked_user_id === access.user_id || access.can_write));
}

export async function getCarePlan(identity: CallerIdentity, patientId: string) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    const access = await accessForPatient(client, identity, patientId);
    if (!mayRead(access)) throw new CarePlanPermissionError('care_plan_read_not_allowed');
    const [medications, schedules, events, appointments] = await Promise.all([
      client.query(
        `SELECT id, name, dose_text, route, instructions, prescribed_by,
                start_date, end_date, active, created_at
           FROM medications
          WHERE patient_id = $1
          ORDER BY active DESC, start_date DESC NULLS LAST, created_at DESC
          LIMIT 200`,
        [patientId],
      ),
      client.query(
        `SELECT ms.id, ms.medication_id, to_char(ms.local_time, 'HH24:MI') AS local_time,
                ms.recurrence_rule, ms.reminders_enabled
           FROM medication_schedules ms
           JOIN medications m ON m.id = ms.medication_id
          WHERE m.patient_id = $1
          ORDER BY ms.local_time`,
        [patientId],
      ),
      client.query(
        `SELECT me.id, me.medication_id, me.schedule_id, me.scheduled_at, me.taken_at, me.status
           FROM medication_events me
           JOIN medications m ON m.id = me.medication_id
          WHERE m.patient_id = $1
            AND me.scheduled_at >= now() - interval '45 days'
          ORDER BY me.scheduled_at DESC
          LIMIT 500`,
        [patientId],
      ),
      client.query(
        `SELECT id, starts_at, ends_at, specialty, practitioner_name, facility_name,
                reason, status, reminder_minutes, encounter_id, created_at
           FROM appointments
          WHERE patient_id = $1
            AND starts_at >= now() - interval '1 year'
            AND starts_at <= now() + interval '2 years'
          ORDER BY starts_at
          LIMIT 300`,
        [patientId],
      ),
    ]);

    const schedulesByMedication = new Map<string, Array<Record<string, unknown>>>();
    for (const row of schedules.rows) {
      const values = schedulesByMedication.get(row.medication_id) || [];
      values.push({
        id: row.id,
        localTime: row.local_time,
        recurrenceRule: row.recurrence_rule,
        remindersEnabled: row.reminders_enabled,
      });
      schedulesByMedication.set(row.medication_id, values);
    }
    const eventsByMedication = new Map<string, Array<Record<string, unknown>>>();
    for (const row of events.rows) {
      const values = eventsByMedication.get(row.medication_id) || [];
      values.push({ id: row.id, scheduleId: row.schedule_id, scheduledAt: row.scheduled_at, takenAt: row.taken_at, status: row.status });
      eventsByMedication.set(row.medication_id, values);
    }

    return {
      timezone: access!.timezone,
      medications: medications.rows.map((row) => ({
        id: row.id,
        name: row.name,
        doseText: row.dose_text,
        route: row.route,
        instructions: row.instructions,
        prescribedBy: row.prescribed_by,
        startDate: row.start_date,
        endDate: row.end_date,
        active: row.active,
        createdAt: row.created_at,
        schedules: schedulesByMedication.get(row.id) || [],
        events: eventsByMedication.get(row.id) || [],
      })),
      appointments: appointments.rows.map((row) => ({
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        specialty: row.specialty,
        practitionerName: row.practitioner_name,
        facilityName: row.facility_name,
        reason: row.reason,
        status: row.status,
        reminderMinutes: row.reminder_minutes,
        encounterId: row.encounter_id,
        createdAt: row.created_at,
      })),
    };
  } finally {
    client.release();
  }
}

export async function createMedication(identity: CallerIdentity, patientId: string, input: MedicationInput) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new CarePlanPermissionError('care_plan_write_not_allowed');
    const medication = await client.query<{ id: string }>(
      `INSERT INTO medications
         (patient_id, name, dose_text, route, instructions, prescribed_by,
          start_date, end_date, active, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
       RETURNING id`,
      [patientId, input.name, input.doseText, input.route, input.instructions,
        input.prescribedBy, input.startDate, input.endDate, access!.user_id],
    );
    for (const time of input.times) {
      await client.query(
        `INSERT INTO medication_schedules
           (medication_id, local_time, recurrence_rule, reminders_enabled)
         VALUES ($1, $2::time, 'DAILY', $3)`,
        [medication.rows[0].id, time, input.remindersEnabled],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'medication.created', 'medication', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, medication.rows[0].id,
        JSON.stringify({ scheduleCount: input.times.length, remindersEnabled: input.remindersEnabled })],
    );
    await client.query('COMMIT');
    return { id: medication.rows[0].id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordMedicationEvent(
  identity: CallerIdentity,
  patientId: string,
  medicationId: string,
  input: { scheduleId: string; occurrenceDate: string; status: 'taken' | 'skipped' },
) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new CarePlanPermissionError('care_plan_write_not_allowed');
    const schedule = await client.query<{ scheduled_at: string }>(
      `SELECT (($3::date + ms.local_time) AT TIME ZONE $4)::timestamptz AS scheduled_at
         FROM medication_schedules ms
         JOIN medications m ON m.id = ms.medication_id
        WHERE ms.id = $1 AND m.id = $2 AND m.patient_id = $5`,
      [input.scheduleId, medicationId, input.occurrenceDate, access!.timezone, patientId],
    );
    if (!schedule.rowCount) throw new CarePlanNotFoundError('medication_schedule_not_found');
    const event = await client.query<{ id: string }>(
      `INSERT INTO medication_events
         (medication_id, schedule_id, scheduled_at, taken_at, status, recorded_by)
       VALUES ($1, $5, $2, CASE WHEN $3 = 'taken' THEN now() ELSE NULL END, $3, $4)
       ON CONFLICT (schedule_id, scheduled_at) WHERE schedule_id IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status,
                     taken_at = CASE WHEN EXCLUDED.status = 'taken' THEN now() ELSE NULL END,
                     recorded_by = EXCLUDED.recorded_by
       RETURNING id`,
      [medicationId, schedule.rows[0].scheduled_at, input.status, access!.user_id, input.scheduleId],
    );
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'medication.event_recorded', 'medication_event', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, event.rows[0].id,
        JSON.stringify({ medicationId, status: input.status, occurrenceDate: input.occurrenceDate })],
    );
    await client.query('COMMIT');
    return { id: event.rows[0].id, status: input.status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createAppointment(identity: CallerIdentity, patientId: string, input: AppointmentInput) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new CarePlanPermissionError('care_plan_write_not_allowed');
    const appointment = await client.query<{ id: string }>(
      `INSERT INTO appointments
         (patient_id, starts_at, ends_at, specialty, practitioner_name, facility_name,
          reason, reminder_minutes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::integer[], $9)
       RETURNING id`,
      [patientId, input.startsAt, input.endsAt, input.specialty, input.practitionerName,
        input.facilityName, input.reason, input.reminderMinutes, access!.user_id],
    );
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'appointment.created', 'appointment', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, appointment.rows[0].id,
        JSON.stringify({ reminderMinutes: input.reminderMinutes })],
    );
    await client.query('COMMIT');
    return { id: appointment.rows[0].id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAppointmentStatus(
  identity: CallerIdentity,
  patientId: string,
  appointmentId: string,
  status: 'completed' | 'cancelled' | 'missed',
) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new CarePlanPermissionError('care_plan_write_not_allowed');
    const appointment = await client.query<{
      id: string; starts_at: string; specialty: string | null; practitioner_name: string | null;
      facility_name: string | null; reason: string; encounter_id: string | null;
    }>(
      `SELECT id, starts_at, specialty, practitioner_name, facility_name, reason, encounter_id
         FROM appointments
        WHERE id = $1 AND patient_id = $2
        FOR UPDATE`,
      [appointmentId, patientId],
    );
    if (!appointment.rowCount) throw new CarePlanNotFoundError('appointment_not_found');
    let encounterId = appointment.rows[0].encounter_id;
    if (status === 'completed' && !encounterId) {
      const encounter = await client.query<{ id: string }>(
        `INSERT INTO encounters
           (patient_id, occurred_at, encounter_type, specialty, practitioner_name,
            facility_name, reason, summary, recorded_by)
         VALUES ($1, $2, 'consultation', $3, $4, $5, $6,
                 'Cita marcada como realizada desde el calendario.', $7)
         RETURNING id`,
        [patientId, appointment.rows[0].starts_at, appointment.rows[0].specialty,
          appointment.rows[0].practitioner_name, appointment.rows[0].facility_name,
          appointment.rows[0].reason, access!.user_id],
      );
      encounterId = encounter.rows[0].id;
    }
    await client.query(
      `UPDATE appointments SET status = $3, encounter_id = $4 WHERE id = $1 AND patient_id = $2`,
      [appointmentId, patientId, status, encounterId],
    );
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'appointment.status_changed', 'appointment', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, appointmentId, JSON.stringify({ status, encounterCreated: Boolean(encounterId) })],
    );
    await client.query('COMMIT');
    return { id: appointmentId, status, encounterId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
