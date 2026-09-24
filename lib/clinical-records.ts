export type ClinicalEncounter = {
  id: string;
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
  source: 'family_care' | 'healwave';
};

export type LabResult = {
  id: string;
  analyteName: string;
  analyteCode: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  abnormalFlag: string | null;
  correctedByFamily: boolean;
  source?: 'family_care' | 'healwave';
};

export type LabReport = {
  id: string;
  collectedAt: string;
  reportedAt: string | null;
  laboratoryName: string | null;
  panelName: string;
  documentId: string | null;
  reviewedByUser: boolean;
  results: LabResult[];
  source: 'family_care' | 'healwave';
};

export type ClinicalDocument = {
  id: string;
  category: 'lab' | 'prescription' | 'referral' | 'insurance' | 'clinical_note' | 'discharge' | 'other';
  title: string;
  capturedAt: string | null;
  createdAt: string;
  storedBytes: number;
  versionCount: number;
  hasOptimized: boolean;
  source: 'family_care' | 'healwave';
  downloadUrl: string;
};

export type HealwaveSummary = {
  status: 'not_applicable' | 'unavailable' | 'connected';
  profile?: {
    diagnosis_date?: string | null;
    doctor_name?: string | null;
    doctor_specialty?: string | null;
    disease_activity?: string | null;
    affected_joints?: unknown[] | null;
    comorbidities?: string | null;
    family_history?: string | null;
    updated_at?: string | null;
  };
  conditions?: Array<{ id: string; name: string; status?: string | null; start_date?: string | null }>;
  inBody?: Array<{ id: string; date?: string | null; metrics?: Record<string, unknown> }>;
  syncedAt?: string;
};

export type ClinicalRecords = {
  encounters: ClinicalEncounter[];
  labReports: LabReport[];
  documents: ClinicalDocument[];
  healwave: HealwaveSummary;
};

export const emptyClinicalRecords: ClinicalRecords = { encounters: [], labReports: [], documents: [], healwave: { status: 'not_applicable' } };

export async function fetchClinicalRecords(patientId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patientId)}/clinical-records`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('clinical_records_unavailable');
  return response.json() as Promise<ClinicalRecords>;
}
