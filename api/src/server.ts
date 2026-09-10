import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { z } from 'zod';
import { requireCallerIdentity } from './auth.js';
import { capabilities, config } from './config.js';
import { checkDatabase, database } from './database.js';
import { renderClinicalRecord, renderShareGate } from './share-page.js';
import {
  ClinicalRecordNotFoundError,
  ClinicalRecordPermissionError,
  createDocument,
  createEncounter,
  createLabReport,
  getClinicalRecords,
  getDocumentVersion,
} from './services/clinical-records.js';
import { buildHealwaveReadOnlyStatus } from './services/healwave.js';
import {
  CarePlanNotFoundError,
  CarePlanPermissionError,
  createAppointment,
  createMedication,
  getCarePlan,
  recordMedicationEvent,
  updateAppointmentStatus,
} from './services/care-plan.js';
import {
  PatientProfilePermissionError,
  PatientShareConsentError,
  updatePatientProfile,
} from './services/patients.js';
import { bootstrapSession, IdentityConflictError } from './services/session.js';
import {
  createMedicalRecordShare,
  getMedicalShareGate,
  openMedicalRecordShare,
  revokeMedicalRecordShare,
  SharePermissionError,
  ShareUnavailableError,
} from './services/shares.js';
import {
  getPushConfiguration,
  registerPushSubscription,
  removePushSubscription,
  sendPushTest,
  startReminderScheduler,
} from './services/push-reminders.js';
import {
  createInsuranceCase,
  createPolicy,
  getInsurance,
  InsuranceNotFoundError,
  InsurancePermissionError,
} from './services/insurance.js';
import {
  createEmergencyContact,
  EmergencyPermissionError,
  getEmergencySetup,
  triggerEmergency,
} from './services/emergency.js';
import {
  createFamilyInvitation,
  bootstrapConfiguredFamilyInvitations,
  FamilyAccessPermissionError,
  getFamilyAccess,
} from './services/family-access.js';

const app = Fastify({
  logger: {
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-family-care-service-key',
      'req.headers.x-family-care-user-email',
      'req.headers.x-family-care-user-name',
      'body',
      'response.body',
    ],
  },
  bodyLimit: 1_048_576,
  trustProxy: true,
});

await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/health', async (_request, reply) => {
  const storage = await checkDatabase();
  if (storage.configured && !storage.connected) return reply.code(503).send({ status: 'degraded', service: 'family-care-api', storage });
  return { status: 'ok', service: 'family-care-api', storage, time: new Date().toISOString() };
});

app.get('/v1/capabilities', async () => ({
  capabilities,
  healwave: buildHealwaveReadOnlyStatus(),
  safety: {
    clinicalDecisionSupport: false,
    medicationChanges: false,
    sosSimulation: config.SOS_SIMULATION_MODE,
  },
}));

app.get('/v1/demo/dashboard', async () => ({
  period: 2026,
  metrics: { appointments: 18, hospitalizations: 1, treatments: 4, specialists: 6 },
  disclaimer: 'Datos ficticios. No usar para decisiones médicas.',
}));

app.post('/v1/session/bootstrap', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;

  try {
    return await bootstrapSession(identity);
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return reply.code(409).send({ error: 'identity_conflict' });
    }
    throw error;
  }
});

function validPastDate(value: string | null) {
  if (value === null) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && parsed.getTime() <= Date.now();
}

const patientProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  preferredName: z.string().trim().max(120).nullable(),
  birthDate: z.string().nullable().refine(validPastDate, 'invalid_birth_date'),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable(),
  allergiesSummary: z.string().trim().max(2_000).nullable(),
  emergencySummary: z.string().trim().max(2_000).nullable(),
  canShare: z.boolean(),
  shareConsentConfirmed: z.boolean().default(false),
}).strict();

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable();
const isoDateTime = z.string().datetime({ offset: true });

const encounterSchema = z.object({
  occurredAt: isoDateTime,
  encounterType: z.enum(['consultation', 'emergency', 'hospitalization', 'procedure', 'therapy', 'other']),
  specialty: optionalText(120),
  practitionerName: optionalText(160),
  facilityName: optionalText(180),
  reason: z.string().trim().min(2).max(500),
  summary: optionalText(4_000),
  admittedAt: isoDateTime.nullable(),
  dischargedAt: isoDateTime.nullable(),
  dischargeSummary: optionalText(4_000),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.occurredAt) > Date.now() + 5 * 60_000) {
    context.addIssue({ code: 'custom', message: 'future_encounter', path: ['occurredAt'] });
  }
  const admission = value.admittedAt || value.occurredAt;
  if (value.encounterType === 'hospitalization' && value.dischargedAt && Date.parse(admission) > Date.parse(value.dischargedAt)) {
    context.addIssue({ code: 'custom', message: 'invalid_discharge_date', path: ['dischargedAt'] });
  }
});

const labResultSchema = z.object({
  analyteName: z.string().trim().min(1).max(120),
  analyteCode: optionalText(40),
  valueNumeric: z.number().finite().min(-1_000_000).max(1_000_000).nullable(),
  valueText: optionalText(160),
  unit: optionalText(40),
  referenceLow: z.number().finite().min(-1_000_000).max(1_000_000).nullable(),
  referenceHigh: z.number().finite().min(-1_000_000).max(1_000_000).nullable(),
}).strict().superRefine((value, context) => {
  if (value.valueNumeric === null && !value.valueText) {
    context.addIssue({ code: 'custom', message: 'result_value_required', path: ['valueNumeric'] });
  }
  if (value.referenceLow !== null && value.referenceHigh !== null && value.referenceLow > value.referenceHigh) {
    context.addIssue({ code: 'custom', message: 'invalid_reference_range', path: ['referenceHigh'] });
  }
});

const labReportSchema = z.object({
  collectedAt: isoDateTime,
  reportedAt: isoDateTime.nullable(),
  laboratoryName: optionalText(180),
  panelName: z.string().trim().min(2).max(160),
  documentId: z.string().uuid().nullable(),
  results: z.array(labResultSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.collectedAt) > Date.now() + 5 * 60_000) {
    context.addIssue({ code: 'custom', message: 'future_collection', path: ['collectedAt'] });
  }
});

const documentVersionSchema = z.object({
  objectKey: z.string().regex(/^medical\/[0-9a-f-]{36}\/[0-9a-f]{64}\/(original|optimized|thumbnail)$/),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  variant: z.enum(['original', 'optimized', 'thumbnail']),
}).strict();

const documentSchema = z.object({
  category: z.enum(['lab', 'prescription', 'referral', 'insurance', 'clinical_note', 'discharge', 'other']),
  title: z.string().trim().min(2).max(180),
  capturedAt: isoDateTime.nullable(),
  versions: z.array(documentVersionSchema).min(1).max(3),
}).strict().superRefine((value, context) => {
  if (!value.versions.some((version) => version.variant === 'original')) {
    context.addIssue({ code: 'custom', message: 'original_required', path: ['versions'] });
  }
  const variants = value.versions.map((version) => version.variant);
  if (new Set(variants).size !== variants.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_variant', path: ['versions'] });
  }
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'invalid_date');

const medicationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  doseText: optionalText(120),
  route: optionalText(80),
  instructions: optionalText(2_000),
  prescribedBy: optionalText(160),
  startDate: dateOnly,
  endDate: dateOnly.nullable(),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8),
  remindersEnabled: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) {
    context.addIssue({ code: 'custom', message: 'invalid_end_date', path: ['endDate'] });
  }
  if (new Set(value.times).size !== value.times.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_schedule', path: ['times'] });
  }
});

const medicationEventSchema = z.object({
  scheduleId: z.string().uuid(),
  occurrenceDate: dateOnly,
  status: z.enum(['taken', 'skipped']),
}).strict();

const appointmentSchema = z.object({
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable(),
  specialty: optionalText(120),
  practitionerName: optionalText(160),
  facilityName: optionalText(180),
  reason: z.string().trim().min(2).max(500),
  reminderMinutes: z.array(z.number().int().min(0).max(43_200)).min(1).max(5),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.startsAt) < Date.now() - 5 * 60_000) {
    context.addIssue({ code: 'custom', message: 'past_appointment', path: ['startsAt'] });
  }
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'invalid_appointment_end', path: ['endsAt'] });
  }
  if (new Set(value.reminderMinutes).size !== value.reminderMinutes.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_reminder', path: ['reminderMinutes'] });
  }
});

const appointmentStatusSchema = z.object({ status: z.enum(['completed', 'cancelled', 'missed']) }).strict();

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2_048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(500),
    auth: z.string().min(8).max(200),
  }).strict(),
}).strict();

const removePushSchema = z.object({ endpoint: z.string().url().max(2_048) }).strict();

const insurancePolicySchema = z.object({
  insurerName: z.string().trim().min(2).max(160),
  policyNumber: z.string().trim().min(3).max(120),
  planName: optionalText(160),
  effectiveDate: dateOnly.nullable(),
  renewalDate: dateOnly.nullable(),
  assistancePhone: z.string().trim().max(30).nullable(),
  notes: optionalText(2_000),
  beneficiaries: z.array(z.object({
    patientId: z.string().uuid(), memberNumber: z.string().trim().max(120).nullable(),
  }).strict()).min(1).max(20),
}).strict();

const insuranceCaseSchema = z.object({
  patientId: z.string().uuid(), type: z.enum(['authorization', 'claim']),
  status: z.string().trim().min(2).max(80), referenceNumber: z.string().trim().max(120).nullable(),
  amount: z.number().nonnegative().max(100_000_000).nullable(), submittedAt: isoDateTime.nullable(),
}).strict();

const emergencyContactSchema = z.object({
  name: z.string().trim().min(2).max(160), relationship: z.string().trim().max(100).nullable(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/), priority: z.number().int().min(1).max(20),
}).strict();

const familyInvitationSchema = z.object({
  email: z.string().trim().email().max(254), displayName: z.string().trim().min(2).max(160),
  role: z.enum(['caregiver', 'adult', 'viewer']), canViewAll: z.boolean(), canManageEmergency: z.boolean(),
  patients: z.array(z.object({ patientId: z.string().uuid(), canWrite: z.boolean(), canShare: z.boolean() }).strict()).max(20),
}).strict().superRefine((value, context) => {
  if (!value.canViewAll && !value.patients.length) context.addIssue({ code: 'custom', message: 'patient_access_required', path: ['patients'] });
  if (value.patients.some((item) => item.canShare && !item.canWrite)) context.addIssue({ code: 'custom', message: 'share_requires_write', path: ['patients'] });
});

app.patch('/v1/patients/:patientId/profile', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = patientProfileSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    return reply.code(400).send({ error: 'invalid_patient_profile', issues: body.success ? [] : body.error.issues });
  }
  try {
    return await updatePatientProfile(identity, params.data.patientId, body.data);
  } catch (error) {
    if (error instanceof PatientProfilePermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof PatientShareConsentError) return reply.code(409).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/patients/:patientId/clinical-records', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_patient_id' });
  try {
    return await getClinicalRecords(identity, params.data.patientId);
  } catch (error) {
    if (error instanceof ClinicalRecordPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/patients/:patientId/care-plan', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_patient_id' });
  try {
    return await getCarePlan(identity, params.data.patientId);
  } catch (error) {
    if (error instanceof CarePlanPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/medications', { config: { rateLimit: { max: 40, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = medicationSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_medication', issues: body.success ? [] : body.error.issues });
  try {
    return reply.code(201).send(await createMedication(identity, params.data.patientId, body.data));
  } catch (error) {
    if (error instanceof CarePlanPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/medications/:medicationId/events', { config: { rateLimit: { max: 180, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid(), medicationId: z.string().uuid() }).safeParse(request.params);
  const body = medicationEventSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_medication_event', issues: body.success ? [] : body.error.issues });
  try {
    return await recordMedicationEvent(identity, params.data.patientId, params.data.medicationId, body.data);
  } catch (error) {
    if (error instanceof CarePlanPermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof CarePlanNotFoundError) return reply.code(404).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/appointments', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = appointmentSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_appointment', issues: body.success ? [] : body.error.issues });
  try {
    return reply.code(201).send(await createAppointment(identity, params.data.patientId, body.data));
  } catch (error) {
    if (error instanceof CarePlanPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.patch('/v1/patients/:patientId/appointments/:appointmentId', { config: { rateLimit: { max: 80, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid(), appointmentId: z.string().uuid() }).safeParse(request.params);
  const body = appointmentStatusSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_appointment_status' });
  try {
    return await updateAppointmentStatus(identity, params.data.patientId, params.data.appointmentId, body.data.status);
  } catch (error) {
    if (error instanceof CarePlanPermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof CarePlanNotFoundError) return reply.code(404).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/push/config', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  return getPushConfiguration();
});

app.post('/v1/push/subscriptions', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  if (!capabilities.pushNotifications) return reply.code(503).send({ error: 'push_not_configured' });
  const body = pushSubscriptionSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_push_subscription' });
  return reply.code(201).send(await registerPushSubscription(identity, body.data, request.headers['user-agent'] || null));
});

app.delete('/v1/push/subscriptions', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const body = removePushSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_push_subscription' });
  return removePushSubscription(identity, body.data.endpoint);
});

app.post('/v1/push/test', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  if (!capabilities.pushNotifications) return reply.code(503).send({ error: 'push_not_configured' });
  return sendPushTest(identity);
});

app.get('/v1/insurance', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  if (!capabilities.insuranceVault) return reply.code(503).send({ error: 'insurance_vault_not_configured' });
  try { return await getInsurance(identity); }
  catch (error) {
    if (error instanceof InsurancePermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/insurance/policies', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  if (!capabilities.insuranceVault) return reply.code(503).send({ error: 'insurance_vault_not_configured' });
  const body = insurancePolicySchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_insurance_policy', issues: body.error.issues });
  try { return reply.code(201).send(await createPolicy(identity, body.data)); }
  catch (error) {
    if (error instanceof InsurancePermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/insurance/policies/:policyId/cases', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ policyId: z.string().uuid() }).safeParse(request.params);
  const body = insuranceCaseSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_insurance_case' });
  try { return reply.code(201).send(await createInsuranceCase(identity, params.data.policyId, body.data)); }
  catch (error) {
    if (error instanceof InsurancePermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof InsuranceNotFoundError) return reply.code(404).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/emergency/setup', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  try { return await getEmergencySetup(identity); }
  catch (error) {
    if (error instanceof EmergencyPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/emergency/contacts', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const body = emergencyContactSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_emergency_contact', issues: body.error.issues });
  try { return reply.code(201).send(await createEmergencyContact(identity, body.data)); }
  catch (error) {
    if (error instanceof EmergencyPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/family/access', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  try { return await getFamilyAccess(identity); }
  catch (error) {
    if (error instanceof FamilyAccessPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/family/invitations', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const body = familyInvitationSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_family_invitation', issues: body.error.issues });
  try { return reply.code(201).send(await createFamilyInvitation(identity, body.data)); }
  catch (error) {
    if (error instanceof FamilyAccessPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/encounters', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = encounterSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_encounter', issues: body.success ? [] : body.error.issues });
  try {
    return reply.code(201).send(await createEncounter(identity, params.data.patientId, body.data));
  } catch (error) {
    if (error instanceof ClinicalRecordPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/lab-reports', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = labReportSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_lab_report', issues: body.success ? [] : body.error.issues });
  try {
    return reply.code(201).send(await createLabReport(identity, params.data.patientId, body.data));
  } catch (error) {
    if (error instanceof ClinicalRecordPermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof ClinicalRecordNotFoundError) return reply.code(404).send({ error: error.message });
    throw error;
  }
});

app.post('/v1/patients/:patientId/documents', { config: { rateLimit: { max: 40, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ patientId: z.string().uuid() }).safeParse(request.params);
  const body = documentSchema.safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_document', issues: body.success ? [] : body.error.issues });
  try {
    return reply.code(201).send(await createDocument(identity, params.data.patientId, body.data));
  } catch (error) {
    if (error instanceof ClinicalRecordPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.get('/v1/documents/:documentId/download', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const params = z.object({ documentId: z.string().uuid() }).safeParse(request.params);
  const query = z.object({ variant: z.enum(['original', 'optimized']).default('optimized') }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_document_request' });
  try {
    return await getDocumentVersion(identity, params.data.documentId, query.data.variant);
  } catch (error) {
    if (error instanceof ClinicalRecordNotFoundError) return reply.code(404).send({ error: error.message });
    throw error;
  }
});

const createShareSchema = z.object({
  patientId: z.string().uuid(),
  expiresInMinutes: z.union([z.literal(15), z.literal(60), z.literal(240), z.literal(1440)]),
});

app.post('/v1/shares', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const parsed = createShareSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_share_request' });
  try {
    return await createMedicalRecordShare(identity, parsed.data.patientId, parsed.data.expiresInMinutes);
  } catch (error) {
    if (error instanceof SharePermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof ShareUnavailableError) return reply.code(503).send({ error: error.message });
    throw error;
  }
});

app.delete('/v1/shares/:shareId', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const parsed = z.object({ shareId: z.string().uuid() }).safeParse(request.params);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_share_id' });
  try {
    return await revokeMedicalRecordShare(identity, parsed.data.shareId);
  } catch (error) {
    if (error instanceof SharePermissionError) return reply.code(404).send({ error: error.message });
    if (error instanceof ShareUnavailableError) return reply.code(503).send({ error: error.message });
    throw error;
  }
});

const shareTokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const sharePinSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
const shareHeaders = {
  'cache-control': 'private, no-store, max-age=0',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

app.get('/share/:token', { logLevel: 'silent', config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
  const parsed = shareTokenSchema.safeParse(request.params);
  if (!parsed.success) return reply.code(404).headers(shareHeaders).type('text/html').send(renderShareGate(false));
  const gate = await getMedicalShareGate(parsed.data.token);
  return reply.headers(shareHeaders).type('text/html').send(renderShareGate(gate.available, gate.expiresAt));
});

app.post('/share/:token', { logLevel: 'silent', config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const token = shareTokenSchema.safeParse(request.params);
  const body = sharePinSchema.safeParse(request.body);
  if (!token.success || !body.success) return reply.code(400).headers(shareHeaders).type('text/html').send(renderShareGate(Boolean(token.success), undefined, 'PIN inválido.'));
  const result = await openMedicalRecordShare(token.data.token, body.data.pin);
  if (result.status === 'ok') return reply.headers(shareHeaders).type('text/html').send(renderClinicalRecord(result));
  if (result.status === 'invalid_pin') {
    const gate = await getMedicalShareGate(token.data.token);
    return reply.code(401).headers(shareHeaders).type('text/html').send(renderShareGate(gate.available, gate.expiresAt, 'PIN incorrecto.'));
  }
  return reply.code(410).headers(shareHeaders).type('text/html').send(renderShareGate(false));
});

const sosSchema = z.object({
  patientId: z.string().uuid(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().nonnegative().max(100_000) }).strict().nullable(),
  note: z.string().trim().max(280).nullable(),
}).strict();

app.post('/v1/emergency/events', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const parsed = sosSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_sos', issues: parsed.error.issues });
  try { return reply.code(config.SOS_SIMULATION_MODE ? 202 : 201).send(await triggerEmergency(identity, parsed.data)); }
  catch (error) {
    if (error instanceof EmergencyPermissionError) return reply.code(403).send({ error: error.message });
    throw error;
  }
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error({ err: error }, 'request_failed');
  reply.code(500).send({ error: 'internal_error' });
});

await bootstrapConfiguredFamilyInvitations();
await app.listen({ host: '0.0.0.0', port: config.PORT });
const reminderTimer = startReminderScheduler();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (reminderTimer) clearInterval(reminderTimer);
    await app.close();
    await database?.end();
    process.exit(0);
  });
}
