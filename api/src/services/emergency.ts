import type { CallerIdentity } from '../auth.js';
import { capabilities, config } from '../config.js';
import { database } from '../database.js';
import { sendEmergencyPushes } from './push-reminders.js';

type EmergencyContext = { user_id: string; family_id: string; can_manage: boolean };
type Contact = { id: string; name: string; relationship: string | null; phone_e164: string; priority: number; enabled: boolean };

export class EmergencyPermissionError extends Error {}

async function context(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<EmergencyContext>(
    `SELECT u.id AS user_id, fm.family_id, fm.can_manage_emergency AS can_manage
       FROM app_users u JOIN family_memberships fm ON fm.user_id = u.id
      WHERE u.auth_subject = $1 AND lower(u.email) = lower($2)
      ORDER BY fm.created_at LIMIT 1`, [identity.subject, identity.email],
  );
  if (!result.rowCount) throw new EmergencyPermissionError('emergency_access_denied');
  return result.rows[0];
}

export async function getEmergencySetup(identity: CallerIdentity) {
  const access = await context(identity);
  const contacts = await database!.query<Contact>(
    `SELECT id, name, relationship, phone_e164, priority, enabled
       FROM emergency_contacts WHERE family_id = $1 ORDER BY enabled DESC, priority, name`, [access.family_id],
  );
  return {
    mode: config.SOS_SIMULATION_MODE ? 'simulation' : 'live',
    canManage: access.can_manage,
    contacts: contacts.rows.map((row) => ({ id: row.id, name: row.name, relationship: row.relationship,
      phone: row.phone_e164, priority: row.priority, enabled: row.enabled })),
    pushEnabled: capabilities.pushNotifications,
    callsEnabled: capabilities.realSos,
  };
}

export async function createEmergencyContact(identity: CallerIdentity, input: {
  name: string; relationship: string | null; phone: string; priority: number;
}) {
  const access = await context(identity);
  if (!access.can_manage) throw new EmergencyPermissionError('emergency_manage_denied');
  const result = await database!.query<{ id: string }>(
    `INSERT INTO emergency_contacts (family_id, name, relationship, phone_e164, priority, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [access.family_id, input.name, input.relationship, input.phone, input.priority, access.user_id],
  );
  await database!.query(
    `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
     VALUES ($1,$2,'emergency.contact_created','emergency_contact',$3,$4::jsonb)`,
    [access.user_id, access.family_id, result.rows[0].id, JSON.stringify({ priority: input.priority })],
  );
  return { id: result.rows[0].id };
}

async function placeTwilioCall(phone: string) {
  const sid = config.TWILIO_ACCOUNT_SID!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`;
  const body = new URLSearchParams({
    To: phone,
    From: config.TWILIO_FROM_NUMBER!,
    Twiml: '<Response><Say language="es-MX">Alerta de emergencia de Family Care. Comuníquese de inmediato con su familiar.</Say></Response>',
  });
  const response = await fetch(url, {
    method: 'POST', body,
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${config.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`twilio_${response.status}`);
  const data = await response.json() as { sid?: string };
  return data.sid || null;
}

export async function triggerEmergency(identity: CallerIdentity, input: {
  patientId: string; location: { latitude: number; longitude: number; accuracy: number } | null; note: string | null;
}) {
  const access = await context(identity);
  const allowed = await database!.query(
    `SELECT 1 FROM patients p
       LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = $2
       JOIN family_memberships fm ON fm.family_id = p.family_id AND fm.user_id = $2
      WHERE p.id = $1 AND p.family_id = $3 AND (fm.can_view_all OR p.linked_user_id = $2 OR COALESCE(pp.can_read,false))`,
    [input.patientId, access.user_id, access.family_id],
  );
  if (!allowed.rowCount) throw new EmergencyPermissionError('emergency_patient_denied');
  const event = await database!.query<{ id: string }>(
    `INSERT INTO emergency_events (patient_id, triggered_by, location, note, simulation)
     VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id`,
    [input.patientId, access.user_id, input.location ? JSON.stringify(input.location) : null, input.note, config.SOS_SIMULATION_MODE],
  );
  const contacts = await database!.query<Contact>(
    `SELECT id, name, relationship, phone_e164, priority, enabled FROM emergency_contacts
      WHERE family_id = $1 AND enabled ORDER BY priority, name`, [access.family_id],
  );
  let callsPlaced = 0;
  let callsFailed = 0;
  for (const contact of contacts.rows) {
    let status = 'simulated';
    let providerId: string | null = null;
    let errorCode: string | null = null;
    if (!config.SOS_SIMULATION_MODE && capabilities.realSos) {
      try { providerId = await placeTwilioCall(contact.phone_e164); status = 'sent'; callsPlaced += 1; }
      catch (error) { status = 'failed'; callsFailed += 1; errorCode = error instanceof Error ? error.message.slice(0, 80) : 'call_failed'; }
    }
    await database!.query(
      `INSERT INTO emergency_deliveries (event_id, contact_id, channel, provider_message_id, status, error_code)
       VALUES ($1,$2,'call',$3,$4,$5)`, [event.rows[0].id, contact.id, providerId, status, errorCode],
    );
  }
  const push = config.SOS_SIMULATION_MODE ? { sent: 0, failed: 0 } : await sendEmergencyPushes(access.family_id, access.user_id);
  await database!.query(
    `INSERT INTO audit_events (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
     VALUES ($1,$2,$3,'emergency.triggered','emergency_event',$4,$5::jsonb)`,
    [access.user_id, access.family_id, input.patientId, event.rows[0].id,
      JSON.stringify({ simulation: config.SOS_SIMULATION_MODE, contacts: contacts.rowCount, locationShared: Boolean(input.location) })],
  );
  return { eventId: event.rows[0].id, mode: config.SOS_SIMULATION_MODE ? 'simulation' : 'live',
    contacts: contacts.rowCount, pushesSent: push.sent, callsPlaced, callsFailed };
}
