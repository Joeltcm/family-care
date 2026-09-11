import type { CallerIdentity } from '../auth.js';
import { database } from '../database.js';
import { encryptField, maskedField } from './field-encryption.js';

type InsuranceContext = { user_id: string; family_id: string; can_manage: boolean };

export class InsurancePermissionError extends Error {}
export class InsuranceNotFoundError extends Error {}

async function context(identity: CallerIdentity) {
  if (!database) throw new Error('database_not_configured');
  const result = await database.query<InsuranceContext>(
    `SELECT u.id AS user_id, fm.family_id,
            (fm.role IN ('owner', 'caregiver') OR fm.can_view_all) AS can_manage
       FROM app_users u JOIN family_memberships fm ON fm.user_id = u.id
       LEFT JOIN auth_credentials ac ON ac.user_id = u.id
      WHERE (u.auth_subject = $1 OR lower(u.email) = lower($2))
        AND COALESCE(ac.is_supervised, false) = false
      ORDER BY fm.created_at LIMIT 1`,
    [identity.subject, identity.email],
  );
  if (!result.rowCount) throw new InsurancePermissionError('insurance_access_denied');
  return result.rows[0];
}

export async function getInsurance(identity: CallerIdentity) {
  const access = await context(identity);
  const policies = await database!.query<{
    id: string; insurer_name: string; policy_number_encrypted: string; plan_name: string | null;
    effective_date: string | null; renewal_date: string | null; assistance_phone: string | null; notes: string | null;
  }>(`SELECT id, insurer_name, policy_number_encrypted, plan_name, effective_date, renewal_date, assistance_phone, notes
        FROM insurance_policies WHERE family_id = $1 ORDER BY renewal_date NULLS LAST, created_at`, [access.family_id]);
  const ids = policies.rows.map((row) => row.id);
  const beneficiaries = ids.length ? await database!.query<{ policy_id: string; patient_id: string; legal_name: string; member_number_encrypted: string | null }>(
    `SELECT b.policy_id, b.patient_id, p.legal_name, b.member_number_encrypted
       FROM insurance_beneficiaries b JOIN patients p ON p.id = b.patient_id
      WHERE b.policy_id = ANY($1::uuid[]) ORDER BY p.legal_name`, [ids],
  ) : { rows: [] };
  const cases = ids.length ? await database!.query<{
    id: string; policy_id: string; patient_id: string; legal_name: string; case_type: 'authorization' | 'claim';
    status: string; reference_number: string | null; amount: string | null; submitted_at: string | null; resolved_at: string | null;
  }>(`SELECT c.id, c.policy_id, c.patient_id, p.legal_name, c.case_type, c.status,
             c.reference_number, c.amount::text, c.submitted_at, c.resolved_at
        FROM insurance_cases c JOIN patients p ON p.id = c.patient_id
       WHERE c.policy_id = ANY($1::uuid[]) ORDER BY c.created_at DESC`, [ids]) : { rows: [] };
  return {
    canManage: access.can_manage,
    policies: policies.rows.map((policy) => ({
      id: policy.id, insurerName: policy.insurer_name, planName: policy.plan_name,
      policyNumberMasked: maskedField(policy.policy_number_encrypted), effectiveDate: policy.effective_date,
      renewalDate: policy.renewal_date, assistancePhone: policy.assistance_phone, notes: policy.notes,
      beneficiaries: beneficiaries.rows.filter((row) => row.policy_id === policy.id).map((row) => ({
        patientId: row.patient_id, patientName: row.legal_name, memberNumberMasked: maskedField(row.member_number_encrypted),
      })),
      cases: cases.rows.filter((row) => row.policy_id === policy.id).map((row) => ({
        id: row.id, patientId: row.patient_id, patientName: row.legal_name, type: row.case_type,
        status: row.status, referenceNumber: row.reference_number, amount: row.amount ? Number(row.amount) : null,
        submittedAt: row.submitted_at, resolvedAt: row.resolved_at,
      })),
    })),
  };
}

export async function createPolicy(identity: CallerIdentity, input: {
  insurerName: string; policyNumber: string; planName: string | null; effectiveDate: string | null;
  renewalDate: string | null; assistancePhone: string | null; notes: string | null;
  beneficiaries: Array<{ patientId: string; memberNumber: string | null }>;
}) {
  const access = await context(identity);
  if (!access.can_manage) throw new InsurancePermissionError('insurance_manage_denied');
  const client = await database!.connect();
  try {
    await client.query('BEGIN');
    const valid = await client.query<{ id: string }>('SELECT id FROM patients WHERE family_id = $1 AND id = ANY($2::uuid[])', [access.family_id, input.beneficiaries.map((item) => item.patientId)]);
    if (valid.rowCount !== input.beneficiaries.length) throw new InsurancePermissionError('insurance_patient_denied');
    const policy = await client.query<{ id: string }>(
      `INSERT INTO insurance_policies
         (family_id, insurer_name, policy_number_encrypted, plan_name, effective_date, renewal_date, assistance_phone, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [access.family_id, input.insurerName, encryptField(input.policyNumber), input.planName, input.effectiveDate,
        input.renewalDate, input.assistancePhone, input.notes, access.user_id],
    );
    for (const beneficiary of input.beneficiaries) {
      await client.query(
        `INSERT INTO insurance_beneficiaries (policy_id, patient_id, member_number_encrypted)
         VALUES ($1,$2,$3)`,
        [policy.rows[0].id, beneficiary.patientId, beneficiary.memberNumber ? encryptField(beneficiary.memberNumber) : null],
      );
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, family_id, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,'insurance.policy_created','insurance_policy',$3,$4::jsonb)`,
      [access.user_id, access.family_id, policy.rows[0].id, JSON.stringify({ beneficiaryCount: input.beneficiaries.length })],
    );
    await client.query('COMMIT');
    return { id: policy.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function createInsuranceCase(identity: CallerIdentity, policyId: string, input: {
  patientId: string; type: 'authorization' | 'claim'; status: string; referenceNumber: string | null;
  amount: number | null; submittedAt: string | null;
}) {
  const access = await context(identity);
  if (!access.can_manage) throw new InsurancePermissionError('insurance_manage_denied');
  const allowed = await database!.query('SELECT 1 FROM insurance_policies ip JOIN patients p ON p.family_id = ip.family_id WHERE ip.id = $1 AND ip.family_id = $2 AND p.id = $3', [policyId, access.family_id, input.patientId]);
  if (!allowed.rowCount) throw new InsuranceNotFoundError('insurance_policy_not_found');
  const result = await database!.query<{ id: string }>(
    `INSERT INTO insurance_cases (policy_id, patient_id, case_type, status, reference_number, amount, submitted_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [policyId, input.patientId, input.type, input.status, input.referenceNumber, input.amount, input.submittedAt, access.user_id],
  );
  await database!.query(
    `INSERT INTO audit_events (actor_user_id, family_id, patient_id, action, resource_type, resource_id, metadata)
     VALUES ($1,$2,$3,'insurance.case_created','insurance_case',$4,$5::jsonb)`,
    [access.user_id, access.family_id, input.patientId, result.rows[0].id, JSON.stringify({ type: input.type, status: input.status })],
  );
  return { id: result.rows[0].id };
}
