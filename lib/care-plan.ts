import type { FamilyCarePatient } from '@/lib/family-care-session';

export type MedicationSchedule = {
  id: string;
  localTime: string;
  recurrenceRule: string | null;
  remindersEnabled: boolean;
};

export type MedicationEvent = {
  id: string;
  scheduleId: string | null;
  scheduledAt: string;
  takenAt: string | null;
  status: 'scheduled' | 'taken' | 'skipped' | 'missed';
};

export type Medication = {
  id: string;
  name: string;
  doseText: string | null;
  route: string | null;
  instructions: string | null;
  prescribedBy: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  createdAt: string;
  schedules: MedicationSchedule[];
  events: MedicationEvent[];
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  specialty: string | null;
  practitionerName: string | null;
  facilityName: string | null;
  reason: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'missed';
  reminderMinutes: number[];
  encounterId: string | null;
  createdAt: string;
};

export type CarePlan = { timezone: string; medications: Medication[]; appointments: Appointment[] };
export type PatientCarePlan = { patient: FamilyCarePatient; plan: CarePlan };

export async function loadCarePlans(patients: FamilyCarePatient[]) {
  const plans = await Promise.all(patients.map(async (patient) => {
    const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/care-plan`, { cache: 'no-store' });
    if (!response.ok) throw new Error('care_plan_load_failed');
    return { patient, plan: await response.json() as CarePlan };
  }));
  return plans;
}

export function patientLabel(patient: FamilyCarePatient) {
  return patient.preferredName || patient.legalName;
}

export function localIsoDate(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}
