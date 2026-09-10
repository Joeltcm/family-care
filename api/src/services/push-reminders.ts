import { createHash } from 'node:crypto';
import webpush, { type PushSubscription } from 'web-push';
import type { CallerIdentity } from '../auth.js';
import { capabilities, config } from '../config.js';
import { database } from '../database.js';

type DueReminder = {
  subscription_id: string;
  user_id: string;
  subscription: PushSubscription;
  reminder_type: 'appointment' | 'medication';
  resource_id: string;
  schedule_key: string;
  scheduled_for: string;
};

async function currentUser(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<{ id: string; family_id: string }>(
    `SELECT u.id, fm.family_id
       FROM app_users u
       JOIN family_memberships fm ON fm.user_id = u.id
      WHERE u.auth_subject = $1 OR lower(u.email) = lower($2)
      ORDER BY fm.created_at
      LIMIT 1`,
    [identity.subject, identity.email],
  );
  return result.rows[0];
}

export function getPushConfiguration() {
  return { enabled: capabilities.pushNotifications, publicKey: config.VAPID_PUBLIC_KEY || null };
}

export async function registerPushSubscription(identity: CallerIdentity, subscription: PushSubscription, userAgent: string | null) {
  if (!database) throw new Error('database_not_configured');
  const user = await currentUser(identity);
  if (!user) throw new Error('user_not_found');
  const endpointHash = createHash('sha256').update(subscription.endpoint).digest('hex');
  const result = await database.query<{ id: string }>(
    `INSERT INTO push_subscriptions
       (user_id, endpoint_hash, subscription, user_agent)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (endpoint_hash)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   subscription = EXCLUDED.subscription,
                   user_agent = EXCLUDED.user_agent,
                   updated_at = now(), disabled_at = NULL, failure_count = 0
     RETURNING id`,
    [user.id, endpointHash, JSON.stringify(subscription), userAgent],
  );
  await database.query(
    `INSERT INTO audit_events
       (actor_user_id, family_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'push.subscription_saved', 'push_subscription', $3, '{"payload":"privacy_safe"}'::jsonb)`,
    [user.id, user.family_id, result.rows[0].id],
  );
  return { id: result.rows[0].id, enabled: true };
}

export async function removePushSubscription(identity: CallerIdentity, endpoint: string) {
  if (!database) throw new Error('database_not_configured');
  const user = await currentUser(identity);
  if (!user) throw new Error('user_not_found');
  const endpointHash = createHash('sha256').update(endpoint).digest('hex');
  await database.query(
    `UPDATE push_subscriptions SET disabled_at = now(), updated_at = now()
      WHERE user_id = $1 AND endpoint_hash = $2`,
    [user.id, endpointHash],
  );
  return { enabled: false };
}

async function send(subscription: PushSubscription, payload: Record<string, string>) {
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
}

export async function sendEmergencyPushes(familyId: string, excludeUserId: string) {
  if (!database || !capabilities.pushNotifications) return { sent: 0, failed: 0 };
  const subscriptions = await database.query<{ id: string; subscription: PushSubscription }>(
    `SELECT ps.id, ps.subscription
       FROM push_subscriptions ps
       JOIN family_memberships fm ON fm.user_id = ps.user_id
      WHERE fm.family_id = $1 AND ps.user_id <> $2 AND ps.disabled_at IS NULL`,
    [familyId, excludeUserId],
  );
  let sent = 0;
  let failed = 0;
  for (const row of subscriptions.rows) {
    try {
      await send(row.subscription, {
        title: 'Alerta familiar SOS',
        body: 'Un integrante de tu familia activó una alerta. Abre Family Care y comunícate de inmediato.',
        url: '/',
        tag: `family-care-sos-${Date.now()}`,
      });
      sent += 1;
      await database.query('UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = $1', [row.id]);
    } catch {
      failed += 1;
      await database.query('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = $1', [row.id]);
    }
  }
  return { sent, failed };
}

export async function sendPushTest(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  if (!capabilities.pushNotifications) throw new Error('push_not_configured');
  const user = await currentUser(identity);
  if (!user) throw new Error('user_not_found');
  const subscriptions = await database.query<{ id: string; subscription: PushSubscription }>(
    `SELECT id, subscription FROM push_subscriptions
      WHERE user_id = $1 AND disabled_at IS NULL`,
    [user.id],
  );
  let sent = 0;
  for (const row of subscriptions.rows) {
    try {
      await send(row.subscription, {
        title: 'Alertas activadas',
        body: 'Family Care puede enviarte recordatorios privados en este dispositivo.',
        url: '/?section=calendario',
        tag: 'family-care-push-ready',
      });
      sent += 1;
      await database.query('UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = $1', [row.id]);
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
      await database.query(
        `UPDATE push_subscriptions
            SET failure_count = failure_count + 1,
                disabled_at = CASE WHEN $2 = ANY(ARRAY[404, 410]) THEN now() ELSE disabled_at END
          WHERE id = $1`,
        [row.id, statusCode],
      );
    }
  }
  return { sent };
}

async function dueReminders() {
  if (!database) return [];
  const appointments = await database.query<DueReminder>(
    `SELECT ps.id AS subscription_id, ps.user_id, ps.subscription,
            'appointment'::text AS reminder_type, a.id AS resource_id,
            a.id::text || ':' || reminder.value::text AS schedule_key,
            a.starts_at - (reminder.value * interval '1 minute') AS scheduled_for
       FROM push_subscriptions ps
       JOIN app_users u ON u.id = ps.user_id
       JOIN family_memberships fm ON fm.user_id = u.id
       JOIN appointments a ON a.patient_id IN (SELECT id FROM patients WHERE family_id = fm.family_id)
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
       CROSS JOIN LATERAL unnest(a.reminder_minutes) AS reminder(value)
      WHERE ps.disabled_at IS NULL
        AND a.status = 'scheduled'
        AND (fm.can_view_all OR p.linked_user_id = u.id OR COALESCE(pp.can_read, false))
        AND a.starts_at - (reminder.value * interval '1 minute') BETWEEN now() - interval '10 minutes' AND now() + interval '1 minute'`,
  );
  const medications = await database.query<DueReminder>(
    `SELECT ps.id AS subscription_id, ps.user_id, ps.subscription,
            'medication'::text AS reminder_type, m.id AS resource_id,
            ms.id::text || ':' || ((now() AT TIME ZONE u.timezone)::date)::text AS schedule_key,
            (((now() AT TIME ZONE u.timezone)::date + ms.local_time) AT TIME ZONE u.timezone) AS scheduled_for
       FROM push_subscriptions ps
       JOIN app_users u ON u.id = ps.user_id
       JOIN family_memberships fm ON fm.user_id = u.id
       JOIN patients p ON p.family_id = fm.family_id
       LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
       JOIN medications m ON m.patient_id = p.id
       JOIN medication_schedules ms ON ms.medication_id = m.id
      WHERE ps.disabled_at IS NULL
        AND m.active AND ms.reminders_enabled
        AND m.start_date <= (now() AT TIME ZONE u.timezone)::date
        AND (m.end_date IS NULL OR m.end_date >= (now() AT TIME ZONE u.timezone)::date)
        AND (fm.can_view_all OR p.linked_user_id = u.id OR COALESCE(pp.can_read, false))
        AND (((now() AT TIME ZONE u.timezone)::date + ms.local_time) AT TIME ZONE u.timezone)
            BETWEEN now() - interval '10 minutes' AND now() + interval '1 minute'`,
  );
  return [...appointments.rows, ...medications.rows];
}

async function deliverDueReminders() {
  if (!database || !capabilities.pushNotifications) return;
  const reminders = await dueReminders();
  for (const reminder of reminders) {
    const delivery = await database.query<{ id: string }>(
      `INSERT INTO reminder_deliveries
         (user_id, subscription_id, reminder_type, resource_id, schedule_key, scheduled_for, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (subscription_id, reminder_type, resource_id, schedule_key) DO NOTHING
       RETURNING id`,
      [reminder.user_id, reminder.subscription_id, reminder.reminder_type,
        reminder.resource_id, reminder.schedule_key, reminder.scheduled_for],
    );
    if (!delivery.rowCount) continue;
    try {
      const isAppointment = reminder.reminder_type === 'appointment';
      const response = await send(reminder.subscription, {
        title: isAppointment ? 'Recordatorio de cita' : 'Recordatorio de medicamento',
        body: isAppointment
          ? 'Tienes una cita familiar próxima. Abre Family Care para ver los detalles.'
          : 'Es hora de revisar un medicamento. Abre Family Care para ver los detalles.',
        url: isAppointment ? '/?section=calendario' : '/?section=medicamentos',
        tag: `family-care-${reminder.reminder_type}-${reminder.resource_id}`,
      });
      await database.query(
        `UPDATE reminder_deliveries SET status = 'sent', provider_message_id = $2 WHERE id = $1`,
        [delivery.rows[0].id, response.headers.location || null],
      );
      await database.query('UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = $1', [reminder.subscription_id]);
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
      await database.query(
        `UPDATE reminder_deliveries SET status = 'failed', error_code = $2 WHERE id = $1`,
        [delivery.rows[0].id, statusCode ? String(statusCode) : 'send_failed'],
      );
      await database.query(
        `UPDATE push_subscriptions
            SET failure_count = failure_count + 1,
                disabled_at = CASE WHEN $2 = ANY(ARRAY[404, 410]) THEN now() ELSE disabled_at END
          WHERE id = $1`,
        [reminder.subscription_id, statusCode],
      );
    }
  }
}

let running = false;

export function startReminderScheduler() {
  if (!capabilities.pushNotifications) return null;
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await deliverDueReminders();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  setTimeout(() => void tick(), 5_000).unref();
  return timer;
}
