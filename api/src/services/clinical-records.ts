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
  is_supervised: boolean;
};

export type EncounterInput = {
  occurredAt: string;
  encounterType: 'consultation' | 'emergency' | 'hospitalization' | 'procedure' | 'therapy' | 'other';
  specialty: string | null;
  practitionerName: string | null;
  facilityName: string | null;
  reason: string;
  summary: string | null;
  admittedAt: string | null;
  dischargedAt: string | null;
  dischargeSummary: string | null;
};

export type LabResultInput = {
  analyteName: string;
  analyteCode: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
};

export type LabReportInput = {
  collectedAt: string;
  reportedAt: string | null;
  laboratoryName: string | null;
  panelName: string;
  documentId: string | null;
  results: LabResultInput[];
};

export type DocumentVersionInput = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  variant: 'original' | 'optimized' | 'thumbnail';
};

export type DocumentInput = {
  category: 'lab' | 'prescription' | 'referral' | 'insurance' | 'clinical_note' | 'discharge' | 'other';
  title: string;
  capturedAt: string | null;
  versions: DocumentVersionInput[];
};

export class ClinicalRecordPermissionError extends Error {}
export class ClinicalRecordNotFoundError extends Error {}

async function accessForPatient(client: PoolClient, identity: CallerIdentity, patientId: string, lock = false) {
  const result = await client.query<AccessRow>(
    `SELECT u.id AS user_id, p.family_id, p.linked_user_id,
            pp.can_read, pp.can_write, fm.can_view_all, COALESCE(ac.is_supervised, false) AS is_supervised
       FROM app_users u
       JOIN family_memberships fm ON fm.user_id = u.id
       JOIN patients p ON p.family_id = fm.family_id AND p.id = $2
       LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
       LEFT JOIN auth_credentials ac ON ac.user_id = u.id
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
  return Boolean(access && !access.is_supervised && (access.linked_user_id === access.user_id || access.can_write));
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getClinicalRecords(identity: CallerIdentity, patientId: string) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    const access = await accessForPatient(client, identity, patientId);
    if (!mayRead(access)) throw new ClinicalRecordPermissionError('clinical_records_read_not_allowed');

    const [encounters, reports, results, documents] = await Promise.all([
      client.query(
        `SELECT e.id, e.occurred_at, e.encounter_type, e.specialty, e.practitioner_name,
                e.facility_name, e.reason, e.summary, h.admitted_at, h.discharged_at, h.discharge_summary
           FROM encounters e
           LEFT JOIN hospitalizations h ON h.encounter_id = e.id
          WHERE e.patient_id = $1
          ORDER BY e.occurred_at DESC
          LIMIT 150`,
        [patientId],
      ),
      client.query(
        `SELECT id, collected_at, reported_at, laboratory_name, panel_name, document_id,
                extraction_status, reviewed_by_user, created_at
           FROM lab_reports
          WHERE patient_id = $1
          ORDER BY collected_at DESC NULLS LAST, created_at DESC
          LIMIT 150`,
        [patientId],
      ),
      client.query(
        `SELECT r.id, r.report_id, r.analyte_name, r.analyte_code, r.value_numeric,
                r.value_text, r.unit, r.reference_low, r.reference_high, r.abnormal_flag
           FROM lab_results r
           JOIN lab_reports lr ON lr.id = r.report_id
          WHERE lr.patient_id = $1
          ORDER BY lr.collected_at DESC NULLS LAST, r.analyte_name`,
        [patientId],
      ),
      client.query(
        `SELECT d.id, d.category, d.title, d.captured_at, d.created_at,
                COALESCE(SUM(dv.size_bytes), 0)::bigint AS stored_bytes,
                COUNT(dv.id)::int AS version_count,
                BOOL_OR(dv.variant = 'optimized') AS has_optimized
           FROM documents d
           LEFT JOIN document_versions dv ON dv.document_id = d.id
          WHERE d.patient_id = $1
          GROUP BY d.id
          ORDER BY COALESCE(d.captured_at, d.created_at) DESC
          LIMIT 200`,
        [patientId],
      ),
    ]);

    const resultsByReport = new Map<string, Array<Record<string, unknown>>>();
    for (const row of results.rows) {
      const values = resultsByReport.get(row.report_id) || [];
      values.push({
        id: row.id,
        analyteName: row.analyte_name,
        analyteCode: row.analyte_code,
        valueNumeric: numberOrNull(row.value_numeric),
        valueText: row.value_text,
        unit: row.unit,
        referenceLow: numberOrNull(row.reference_low),
        referenceHigh: numberOrNull(row.reference_high),
        abnormalFlag: row.abnormal_flag,
      });
      resultsByReport.set(row.report_id, values);
    }

    return {
      encounters: encounters.rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        encounterType: row.encounter_type,
        specialty: row.specialty,
        practitionerName: row.practitioner_name,
        facilityName: row.facility_name,
        reason: row.reason,
        summary: row.summary,
        admittedAt: row.admitted_at,
        dischargedAt: row.discharged_at,
        dischargeSummary: row.discharge_summary,
      })),
      labReports: reports.rows.map((row) => ({
        id: row.id,
        collectedAt: row.collected_at,
        reportedAt: row.reported_at,
        laboratoryName: row.laboratory_name,
        panelName: row.panel_name,
        documentId: row.document_id,
        reviewedByUser: row.reviewed_by_user,
        results: resultsByReport.get(row.id) || [],
      })),
      documents: documents.rows.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        capturedAt: row.captured_at,
        createdAt: row.created_at,
        storedBytes: Number(row.stored_bytes),
        versionCount: row.version_count,
        hasOptimized: row.has_optimized,
      })),
    };
  } finally {
    client.release();
  }
}

export async function createEncounter(identity: CallerIdentity, patientId: string, input: EncounterInput) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new ClinicalRecordPermissionError('clinical_records_write_not_allowed');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO encounters
         (patient_id, occurred_at, encounter_type, specialty, practitioner_name,
          facility_name, reason, summary, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [patientId, input.occurredAt, input.encounterType, input.specialty, input.practitionerName,
        input.facilityName, input.reason, input.summary, access!.user_id],
    );
    if (input.encounterType === 'hospitalization') {
      await client.query(
        `INSERT INTO hospitalizations (encounter_id, admitted_at, discharged_at, discharge_summary)
         VALUES ($1, $2, $3, $4)`,
        [inserted.rows[0].id, input.admittedAt || input.occurredAt, input.dischargedAt, input.dischargeSummary],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'encounter.created', 'encounter', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, inserted.rows[0].id,
        JSON.stringify({ encounterType: input.encounterType, hasSummary: Boolean(input.summary) })],
    );
    await client.query('COMMIT');
    return { id: inserted.rows[0].id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createLabReport(identity: CallerIdentity, patientId: string, input: LabReportInput) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new ClinicalRecordPermissionError('clinical_records_write_not_allowed');
    if (input.documentId) {
      const document = await client.query('SELECT id FROM documents WHERE id = $1 AND patient_id = $2 AND family_id = $3', [input.documentId, patientId, access!.family_id]);
      if (!document.rowCount) throw new ClinicalRecordNotFoundError('document_not_found');
    }
    const report = await client.query<{ id: string }>(
      `INSERT INTO lab_reports
         (patient_id, collected_at, reported_at, laboratory_name, panel_name, document_id,
          extraction_status, reviewed_by_user, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', true, $7)
       RETURNING id`,
      [patientId, input.collectedAt, input.reportedAt, input.laboratoryName, input.panelName,
        input.documentId, access!.user_id],
    );
    for (const result of input.results) {
      const abnormalFlag = result.valueNumeric !== null
        && ((result.referenceLow !== null && result.valueNumeric < result.referenceLow)
          || (result.referenceHigh !== null && result.valueNumeric > result.referenceHigh))
        ? 'outside_lab_range'
        : null;
      await client.query(
        `INSERT INTO lab_results
           (report_id, analyte_name, analyte_code, value_numeric, value_text, unit,
            reference_low, reference_high, abnormal_flag, extraction_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
        [report.rows[0].id, result.analyteName, result.analyteCode, result.valueNumeric,
          result.valueText, result.unit, result.referenceLow, result.referenceHigh, abnormalFlag],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'lab_report.created', 'lab_report', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, report.rows[0].id,
        JSON.stringify({ panelName: input.panelName, resultCount: input.results.length, reviewedByUser: true, hasDocument: Boolean(input.documentId) })],
    );
    await client.query('COMMIT');
    return { id: report.rows[0].id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createDocument(identity: CallerIdentity, patientId: string, input: DocumentInput) {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const access = await accessForPatient(client, identity, patientId, true);
    if (!mayWrite(access)) throw new ClinicalRecordPermissionError('clinical_records_write_not_allowed');
    for (const version of input.versions) {
      if (!version.objectKey.startsWith(`medical/${patientId}/`)) {
        throw new ClinicalRecordPermissionError('invalid_document_key');
      }
    }
    const original = input.versions.find((version) => version.variant === 'original')!;
    const existing = await client.query<{ id: string }>(
      `SELECT d.id
         FROM documents d
         JOIN document_versions dv ON dv.document_id = d.id AND dv.variant = 'original'
        WHERE d.patient_id = $1
          AND d.family_id = $2
          AND dv.sha256 = $3
        LIMIT 1`,
      [patientId, access!.family_id, original.sha256],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { id: existing.rows[0].id, created: false, deduplicated: true };
    }
    const document = await client.query<{ id: string }>(
      `INSERT INTO documents (patient_id, family_id, category, title, captured_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [patientId, access!.family_id, input.category, input.title, input.capturedAt, access!.user_id],
    );
    for (const version of input.versions) {
      await client.query(
        `INSERT INTO document_versions
           (document_id, r2_object_key, content_type, size_bytes, sha256, variant)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [document.rows[0].id, version.objectKey, version.contentType, version.sizeBytes,
          version.sha256, version.variant],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, 'document.created', 'document', $4, $5)`,
      [access!.user_id, access!.family_id, patientId, document.rows[0].id,
        JSON.stringify({ category: input.category, variants: input.versions.map((item) => item.variant), storedBytes: input.versions.reduce((sum, item) => sum + item.sizeBytes, 0) })],
    );
    await client.query('COMMIT');
    return { id: document.rows[0].id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getDocumentVersion(identity: CallerIdentity, documentId: string, variant: 'original' | 'optimized') {
  if (!database) throw new Error('database_not_configured');
  const client = await database.connect();
  try {
    const result = await client.query(
      `SELECT d.patient_id, d.title, dv.r2_object_key, dv.content_type, dv.size_bytes
         FROM documents d
         JOIN patients p ON p.id = d.patient_id
         JOIN family_memberships fm ON fm.family_id = p.family_id
         JOIN app_users u ON u.id = fm.user_id
         LEFT JOIN patient_permissions pp ON pp.patient_id = p.id AND pp.user_id = u.id
         JOIN LATERAL (
           SELECT r2_object_key, content_type, size_bytes
             FROM document_versions
            WHERE document_id = d.id
            ORDER BY (variant = $4) DESC, (variant = 'original') DESC, created_at DESC
            LIMIT 1
         ) dv ON true
        WHERE d.id = $1
          AND (u.auth_subject = $2 OR lower(u.email) = lower($3))
          AND (fm.can_view_all OR p.linked_user_id = u.id OR pp.can_read)
        LIMIT 1`,
      [documentId, identity.subject, identity.email, variant],
    );
    if (!result.rowCount) throw new ClinicalRecordNotFoundError('document_not_found');
    const row = result.rows[0];
    return { patientId: row.patient_id, title: row.title, objectKey: row.r2_object_key, contentType: row.content_type, sizeBytes: Number(row.size_bytes) };
  } finally {
    client.release();
  }
}
