'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppointmentsCard } from '@/components/family-care/appointments-card';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Navigate } from '@/components/family-care/types';
import { loadCarePlans, patientLabel, type PatientCarePlan } from '@/lib/care-plan';
import { fetchClinicalRecords, type ClinicalRecords } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

type PatientRecords = { patient: FamilyCarePatient; records: ClinicalRecords };
type DashboardData = { care: PatientCarePlan[]; clinical: PatientRecords[] };

function yearOf(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Panama' }).format(date);
}

export function Dashboard({ profile, family, accountName, patients, selectedPatient, clinicalRevision, careRevision, onNavigate }: {
  profile: string;
  family: boolean;
  accountName: string;
  patients: FamilyCarePatient[];
  selectedPatient?: FamilyCarePatient;
  clinicalRevision: number;
  careRevision: number;
  onNavigate: Navigate;
}) {
  const [year, setYear] = useState(() => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Panama' }).format(new Date())));
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const patientIds = patients.map((patient) => patient.id).join(',');

  useEffect(() => {
    if (!patients.length) return;
    let current = true;
    const controller = new AbortController();
    setState('loading');
    Promise.all([
      loadCarePlans(patients),
      Promise.all(patients.map(async (patient) => ({ patient, records: await fetchClinicalRecords(patient.id, controller.signal) }))),
    ]).then(([care, clinical]) => {
      if (current) { setData({ care, clinical }); setState('ready'); }
    }).catch(() => { if (current) { setData(null); setState('error'); } });
    return () => { current = false; controller.abort(); };
    // Profile IDs represent the session's accessible patients; revisions refresh after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientIds, clinicalRevision, careRevision]);

  const visible = useMemo(() => {
    const include = (patient: FamilyCarePatient) => family || patient.id === selectedPatient?.id;
    return { care: data?.care.filter(({ patient }) => include(patient)) || [], clinical: data?.clinical.filter(({ patient }) => include(patient)) || [] };
  }, [data, family, selectedPatient?.id]);
  const appointments = visible.care.flatMap(({ patient, plan }) => plan.appointments.map((appointment) => ({ patient, appointment })));
  const encounters = visible.clinical.flatMap(({ records }) => records.encounters);
  const medications = visible.care.flatMap(({ plan }) => plan.medications);
  const yearAppointments = appointments.filter(({ appointment }) => yearOf(appointment.startsAt) === year && appointment.status !== 'cancelled');
  const yearEncounters = encounters.filter((encounter) => yearOf(encounter.occurredAt) === year);
  const yearMedications = medications.filter((medication) => yearOf(medication.startDate || medication.createdAt) === year);
  const specialists = new Set(yearEncounters.map((encounter) => encounter.specialty?.trim().toLocaleLowerCase('es')).filter(Boolean));
  const metrics = [
    { label: 'Citas registradas', value: yearAppointments.length, detail: 'Programadas o realizadas', tone: 'teal' },
    { label: 'Hospitalizaciones', value: yearEncounters.filter((encounter) => encounter.encounterType === 'hospitalization').length, detail: 'Registradas en el expediente', tone: 'coral' },
    { label: 'Medicamentos', value: yearMedications.length, detail: 'Iniciados o registrados este año', tone: 'blue' },
    { label: 'Especialidades', value: specialists.size, detail: 'Con atenciones registradas', tone: 'violet' },
  ];
  const monthlyVisits = Array.from({ length: 12 }, (_, month) => yearEncounters.filter((encounter) => Number(encounter.occurredAt.slice(5, 7)) === month + 1).length);
  const message = state === 'loading' ? 'Cargando datos del expediente…' : state === 'error' ? 'No pudimos cargar el resumen. Vuelve a Inicio para intentarlo de nuevo.' : 'Sin registros todavía.';

  return <>
    <PageHeading eyebrow="RESUMEN FAMILIAR" title={family ? `Hola, ${accountName.split(' ')[0]}` : `Resumen de ${profile}`} copy="Datos registrados en Family Care; no incluye información de Healwave." action={<div className="period-control"><button type="button" aria-label="Año anterior" onClick={() => setYear((value) => value - 1)}>‹</button><span>Resumen {year}</span><button type="button" aria-label="Año siguiente" onClick={() => setYear((value) => value + 1)}>›</button></div>} />
    {state === 'error' && <p className="dashboard-data-message" role="alert">{message}</p>}
    <section className="metric-grid" aria-label="Resumen anual">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-topline"><span className="metric-dot" /><span>{year}</span></div><strong>{state === 'ready' ? metric.value : '—'}</strong><h2>{metric.label}</h2><p>{state === 'ready' ? metric.detail : message}</p></article>)}</section>
    <section className="dashboard-grid"><div className="primary-column">
      <article className="panel care-panel"><div className="panel-heading"><div><p className="eyebrow">EXPEDIENTES</p><h2>{family ? 'Perfiles familiares' : 'Actividad del perfil'}</h2></div><button type="button" className="text-button" onClick={() => onNavigate('expedientes')}>Ver expediente</button></div><div className="care-list">
        {state === 'ready' ? visible.clinical.map(({ patient, records }) => {
          const latestLab = [...records.labReports].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0];
          const latestEncounter = [...records.encounters].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
          return <button className="care-item" key={patient.id} type="button" onClick={() => onNavigate(latestLab ? 'laboratorios' : 'expedientes')}><span className="care-person"><span className="avatar">{patientLabel(patient).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{patientLabel(patient)}</strong><small>{records.labReports.length} informes · {records.encounters.length} atenciones</small></span></span><span className="care-reading"><small>Último informe</small><strong>{latestLab ? shortDate(latestLab.collectedAt) : 'Sin registros'}</strong></span><span className="care-next"><small>Última atención</small><strong>{latestEncounter ? shortDate(latestEncounter.occurredAt) : 'Sin registros'}</strong></span><span className="round-link">›</span></button>;
        }) : <p className="dashboard-data-message">{message}</p>}
      </div></article>
      <article className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD {year}</p><h2>Atenciones registradas por mes</h2></div><div className="legend"><span /> Atenciones</div></div>{state !== 'ready' ? <p className="dashboard-data-message">{message}</p> : yearEncounters.length === 0 ? <p className="dashboard-data-message">Sin atenciones registradas para {year}.</p> : <div className="bar-chart" aria-label={`Atenciones mensuales registradas en ${year}`}>{monthlyVisits.map((value, index) => <div className="bar-column" key={index}><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(0, Math.min(value * 18, 86))}px` }} /></div><span>{'EFMAMJJASOND'[index]}</span></div>)}</div>}</article>
    </div><aside className="secondary-column"><AppointmentsCard appointments={state === 'ready' ? appointments : []} loading={state === 'loading'} error={state === 'error'} onOpen={() => onNavigate('calendario')} /><article className="panel quick-panel"><p className="eyebrow">ACCESO RÁPIDO</p><h2>¿Qué deseas registrar?</h2><div className="quick-grid"><button type="button" onClick={() => onNavigate('expedientes')}><span>＋</span>Consulta</button><button type="button" onClick={() => onNavigate('laboratorios')}><span>↥</span>Laboratorio</button><button type="button" onClick={() => onNavigate('medicamentos')}><span>◷</span>Medicamento</button><button type="button" onClick={() => onNavigate('documentos')}><span>▣</span>Documento</button></div></article></aside></section>
  </>;
}
