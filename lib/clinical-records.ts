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
};

export type ClinicalRecords = {
  encounters: ClinicalEncounter[];
  labReports: LabReport[];
  documents: ClinicalDocument[];
};

export const emptyClinicalRecords: ClinicalRecords = { encounters: [], labReports: [], documents: [] };

export async function fetchClinicalRecords(patientId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patientId)}/clinical-records`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('clinical_records_unavailable');
  return response.json() as Promise<ClinicalRecords>;
}
