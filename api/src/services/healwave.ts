import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { capabilities, config } from '../config.js';

const documentSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
}).passthrough();

const baseItem = {
  id: z.string().min(1),
  source_system: z.literal('healwave'),
  change_basis: z.enum(['updated', 'created']),
  updated_at: z.string().nullable().optional(),
};

const appointmentSchema = z.object({
  ...baseItem,
  type: z.string(),
  doctor_name: z.string().nullable().optional(),
  specialty: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  documents: z.array(documentSchema).default([]),
}).passthrough();

const medicationSchema = z.object({
  ...baseItem,
  name: z.string(),
  dose: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  prescribing_doctor: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  status: z.string(),
  medication_type: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documents: z.array(documentSchema).default([]),
}).passthrough();

const medicationLogSchema = z.object({
  ...baseItem,
  medication_id: z.string().nullable().optional(),
  taken_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  side_effects: z.array(z.string()).default([]),
  severity: z.string().nullable().optional(),
}).passthrough();

const labResultSchema = z.object({
  ...baseItem,
  date: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  test_name: z.string(),
  result_value: z.string().nullable().optional(),
  result_unit: z.string().nullable().optional(),
  reference_range: z.string().nullable().optional(),
  result_status: z.string().nullable().optional(),
  lab_name: z.string().nullable().optional(),
  ordered_by: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documents: z.array(documentSchema).default([]),
}).passthrough();

const conditionSchema = z.object({
  ...baseItem,
  name: z.string(),
  related_to_ar: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  resolved_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documents: z.array(documentSchema).default([]),
}).passthrough();

const inBodySchema = z.object({
  ...baseItem,
  date: z.string().nullable().optional(),
  metrics: z.record(z.string(), z.unknown()).default({}),
  documents: z.array(documentSchema).default([]),
}).passthrough();

const profileSchema = z.object({
  source_system: z.literal('healwave'),
  diagnosis_date: z.string().nullable().optional(),
  doctor_name: z.string().nullable().optional(),
  doctor_specialty: z.string().nullable().optional(),
  disease_activity: z.string().nullable().optional(),
  affected_joints: z.array(z.unknown()).nullable().optional(),
  labs: z.record(z.string(), z.unknown()).default({}),
  previous_medications: z.array(z.unknown()).nullable().optional(),
  comorbidities: z.string().nullable().optional(),
  family_history: z.string().nullable().optional(),
  change_basis: z.enum(['updated', 'created']),
  updated_at: z.string().nullable().optional(),
}).passthrough();

const documentAccessSchema = z.object({
  url: z.string().url(),
  expires_in: z.number().int().positive(),
  name: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
}).passthrough();

type Appointment = z.infer<typeof appointmentSchema>;
type MedicationLog = z.infer<typeof medicationLogSchema>;
type LabResult = z.infer<typeof labResultSchema>;
type Condition = z.infer<typeof conditionSchema>;
type InBody = z.infer<typeof inBodySchema>;
type Profile = z.infer<typeof profileSchema>;
type DocumentRef = z.infer<typeof documentSchema>;
type Page<T> = { items: T[]; next_cursor: string | null };

export type HealwavePatientIdentity = { legalName: string; relationshipToOwner: string | null };

export type HealwaveClinicalRecords = {
  encounters: Array<Record<string, unknown>>;
  labReports: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  healwave: {
    status: 'connected';
    profile: Profile;
    conditions: Condition[];
    inBody: InBody[];
    syncedAt: string;
  };
};

export type HealwaveCarePlan = {
  medications: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
};

export class HealwaveUnavailableError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isHealwavePatient(patient: HealwavePatientIdentity) {
  if (!capabilities.healwaveReadOnly || patient.relationshipToOwner !== 'spouse') return false;
  const configuredName = config.FAMILY_CARE_SPOUSE_LEGAL_NAME;
  return Boolean(configuredName && normalizeName(configuredName) === normalizeName(patient.legalName));
}

function signedHeaders(method: string, target: string, body = '') {
  const client = config.HEALWAVE_API_CLIENT_ID;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [client, timestamp, nonce, method.toUpperCase(), target, bodyHash].join('\n');
  const secret = config.HEALWAVE_API_HMAC_SECRET?.split(',')[0]?.trim();
  if (!secret) throw new HealwaveUnavailableError('healwave_not_configured');
  return {
    'X-FC-Client': client,
    'X-FC-Timestamp': timestamp,
    'X-FC-Nonce': nonce,
    'X-FC-Signature': createHmac('sha256', secret).update(canonical).digest('hex'),
  };
}

async function healwaveGet<T>(target: string, schema: z.ZodType<T>): Promise<T> {
  if (!capabilities.healwaveReadOnly || !config.HEALWAVE_API_BASE_URL) throw new HealwaveUnavailableError('healwave_not_configured');
  if (!target.startsWith('/v1/')) throw new HealwaveUnavailableError('healwave_invalid_target');
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${config.HEALWAVE_API_BASE_URL.replace(/\/$/, '')}${target}`, {
      headers: signedHeaders('GET', target), signal: controller.signal,
    });
    if (!response.ok) throw new HealwaveUnavailableError('healwave_request_failed', response.status);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new HealwaveUnavailableError('healwave_contract_mismatch');
    return parsed.data;
  } catch (error) {
    if (error instanceof HealwaveUnavailableError) throw error;
    throw new HealwaveUnavailableError('healwave_request_failed');
  } finally { clearTimeout(deadline); }
}

async function allPages<T>(path: string, itemSchema: z.ZodType<T>) {
  const values: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const target = `${path}?${params.toString()}`;
    const schema = z.object({ items: z.array(itemSchema), next_cursor: z.string().nullable() });
    const response: Page<T> = await healwaveGet(target, schema);
    values.push(...response.items);
    cursor = response.next_cursor;
    if (!cursor) break;
  }
  return values;
}

function isoDateTime(date: string | null | undefined, time: string | null | undefined) {
  if (!date) return null;
  const clock = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5).padStart(5, '0') : '12:00';
  return `${date}T${clock}:00-05:00`;
}

function appointmentStatus(value: string | null | undefined) {
  const status = (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (['completada', 'completado', 'realizada', 'realizado', 'completed'].includes(status)) return 'completed';
  if (['cancelada', 'cancelado', 'cancelled'].includes(status)) return 'cancelled';
  if (['no asistio', 'missed'].includes(status)) return 'missed';
  return 'scheduled';
}

function numeric(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function referenceBounds(value: string | null | undefined) {
  if (!value) return { low: null, high: null };
  const normalized = value.replace(/,/g, '.');
  const range = normalized.match(/(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/);
  if (range) return { low: Number(range[1]), high: Number(range[2]) };
  const upper = normalized.match(/^\s*[<≤]\s*(-?\d+(?:\.\d+)?)/);
  if (upper) return { low: null, high: Number(upper[1]) };
  const lower = normalized.match(/^\s*[>≥]\s*(-?\d+(?:\.\d+)?)/);
  if (lower) return { low: Number(lower[1]), high: null };
  return { low: null, high: null };
}

function analyteCode(name: string) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const aliases: Record<string, string> = {
    HEMOGLOBINA: 'HGB', HEMATOCRITO: 'HCT', ERITROCITOS: 'RBC', LEUCOCITOS: 'WBC',
    PLAQUETAS: 'PLT', RETICULOCITOS: 'RETIC', 'LACTATO DESHIDROGENASA': 'LDH',
    BILIRRUBINA: 'BILI', HAPTOGLOBINA: 'HAPTO',
  };
  return aliases[key] || (/^[A-Z0-9_-]{2,12}$/.test(key) ? key : null);
}

function externalId(id: string) { return `healwave:${id}`; }

function documentRecords(patientId: string, refs: Array<{ ref: DocumentRef; category: string; capturedAt: string | null | undefined }>) {
  const unique = new Map<string, Record<string, unknown>>();
  for (const { ref, category, capturedAt } of refs) {
    if (unique.has(ref.id)) continue;
    unique.set(ref.id, {
      id: externalId(ref.id), category, title: ref.name || 'Documento de Healwave', capturedAt: capturedAt || null,
      createdAt: capturedAt ? `${capturedAt}T12:00:00-05:00` : new Date(0).toISOString(), storedBytes: 0,
      versionCount: 1, hasOptimized: false, source: 'healwave',
      downloadUrl: `/api/family-care/patients/${encodeURIComponent(patientId)}/healwave/documents/${encodeURIComponent(ref.id)}`,
    });
  }
  return [...unique.values()];
}

export async function getPatientSnapshot(patientId: string): Promise<HealwaveClinicalRecords> {
  const [profile, appointments, medications, labs, conditions, inBody] = await Promise.all([
    healwaveGet('/v1/profile', profileSchema), allPages('/v1/appointments', appointmentSchema),
    allPages('/v1/medications', medicationSchema), allPages('/v1/lab-results', labResultSchema),
    allPages('/v1/conditions', conditionSchema), allPages('/v1/inbody', inBodySchema),
  ]);
  const encounters = appointments.flatMap((appointment) => {
    const occurredAt = isoDateTime(appointment.date, appointment.time);
    const type = appointment.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!occurredAt || !['consulta', 'consultation', 'emergencia', 'urgencia', 'hospitalizacion'].includes(type)) return [];
    const encounterType = type === 'hospitalizacion' ? 'hospitalization' : type === 'emergencia' || type === 'urgencia' ? 'emergency' : 'consultation';
    return [{ id: externalId(appointment.id), occurredAt, encounterType, specialty: appointment.specialty || null,
      practitionerName: appointment.doctor_name || null, facilityName: appointment.location || null,
      reason: appointment.notes || appointment.specialty || appointment.type, summary: appointment.notes || null,
      admittedAt: encounterType === 'hospitalization' ? occurredAt : null, dischargedAt: null, dischargeSummary: null, source: 'healwave' }];
  });
  const groupedLabs = new Map<string, LabResult[]>();
  for (const result of labs) {
    const key = `${result.date || 'sin-fecha'}|${result.lab_name || ''}|${result.category || ''}`;
    const group = groupedLabs.get(key) || [];
    group.push(result);
    groupedLabs.set(key, group);
  }
  const labReports = [...groupedLabs.entries()].map(([key, items]) => {
    const first = items[0];
    return { id: externalId(`lab-group:${key}`), collectedAt: first.date ? `${first.date}T12:00:00-05:00` : first.updated_at || new Date(0).toISOString(),
      reportedAt: first.updated_at || null, laboratoryName: first.lab_name || null, panelName: first.category || 'Resultados de laboratorio',
      documentId: null, reviewedByUser: true, source: 'healwave', results: items.map((item) => {
        const bounds = referenceBounds(item.reference_range);
        return { id: externalId(item.id), analyteName: item.test_name, analyteCode: analyteCode(item.test_name),
          valueNumeric: numeric(item.result_value), valueText: item.result_value || null, unit: item.result_unit || null,
          referenceLow: bounds.low, referenceHigh: bounds.high,
          abnormalFlag: item.result_status && item.result_status !== 'normal' ? item.result_status : null,
          correctedByFamily: false, source: 'healwave' };
      }) };
  });
  const refs = [
    ...appointments.flatMap((item) => item.documents.map((ref) => ({ ref, category: 'clinical_note', capturedAt: item.date }))),
    ...medications.flatMap((item) => item.documents.map((ref) => ({ ref, category: 'prescription', capturedAt: item.start_date }))),
    ...labs.flatMap((item) => item.documents.map((ref) => ({ ref, category: 'lab', capturedAt: item.date }))),
    ...conditions.flatMap((item) => item.documents.map((ref) => ({ ref, category: 'clinical_note', capturedAt: item.start_date }))),
    ...inBody.flatMap((item) => item.documents.map((ref) => ({ ref, category: 'other', capturedAt: item.date }))),
  ];
  return { encounters, labReports, documents: documentRecords(patientId, refs),
    healwave: { status: 'connected', profile, conditions, inBody, syncedAt: new Date().toISOString() } };
}

export async function getRecentEncounters(): Promise<Appointment[]> {
  return allPages('/v1/appointments', appointmentSchema);
}

export async function getHealwaveCarePlan(): Promise<HealwaveCarePlan> {
  const [appointments, medications, logs] = await Promise.all([
    getRecentEncounters(), allPages('/v1/medications', medicationSchema), allPages('/v1/medications/logs', medicationLogSchema),
  ]);
  const logsByMedication = new Map<string, MedicationLog[]>();
  for (const log of logs) {
    if (!log.medication_id) continue;
    const values = logsByMedication.get(log.medication_id) || [];
    values.push(log);
    logsByMedication.set(log.medication_id, values);
  }
  return {
    medications: medications.map((medication) => ({
      id: externalId(medication.id), name: medication.name, doseText: medication.dose || null,
      route: medication.medication_type || null, instructions: medication.frequency || medication.notes || null,
      prescribedBy: medication.prescribing_doctor || null, startDate: medication.start_date || null,
      endDate: medication.end_date || null, active: medication.is_active ?? medication.status.toLowerCase() === 'activo',
      createdAt: medication.updated_at || (medication.start_date ? `${medication.start_date}T12:00:00-05:00` : new Date(0).toISOString()),
      schedules: [], events: (logsByMedication.get(medication.id) || []).flatMap((log) => log.taken_at ? [{
        id: externalId(log.id), scheduleId: null, scheduledAt: log.taken_at, takenAt: log.taken_at, status: 'taken',
      }] : []), source: 'healwave',
    })),
    appointments: appointments.flatMap((appointment) => {
      const startsAt = isoDateTime(appointment.date, appointment.time);
      if (!startsAt) return [];
      return [{ id: externalId(appointment.id), startsAt, endsAt: null, specialty: appointment.specialty || null,
        practitionerName: appointment.doctor_name || null, facilityName: appointment.location || null,
        reason: appointment.notes || appointment.specialty || appointment.type, status: appointmentStatus(appointment.status),
        reminderMinutes: [], encounterId: null, createdAt: appointment.updated_at || startsAt, source: 'healwave' }];
    }),
  };
}

export async function getHealwaveDocument(documentId: string) {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(documentId)) throw new HealwaveUnavailableError('healwave_document_invalid', 400);
  return healwaveGet(`/v1/documents/${encodeURIComponent(documentId)}`, documentAccessSchema);
}

export function buildHealwaveReadOnlyStatus() {
  return { enabled: capabilities.healwaveReadOnly, mode: 'read-only' as const, writesSupported: false, strategy: 'server-to-server-hmac-api' };
}
