'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { emptyClinicalRecords, fetchClinicalRecords, type ClinicalRecords } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

function displayDate(value: string | null, withTime = false) {
  if (!value) return 'No registrada';
  return new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' as const } : {}), timeZone: 'America/Panama' }).format(new Date(value));
}

const encounterLabels: Record<string, string> = { consultation: 'Consulta', emergency: 'Urgencia', hospitalization: 'Hospitalización', procedure: 'Procedimiento', therapy: 'Terapia', other: 'Otra atención' };

export function Records({ profile, patient, onNotice, onShare, onEdit, onRegister, canShare, canEdit, revision }: { profile: string; patient?: FamilyCarePatient; onNotice: Notify; onShare: () => void; onEdit: () => void; onRegister: () => void; canShare: boolean; canEdit: boolean; revision: number }) {
  const [loaded, setLoaded] = useState<{ patientId: string; records: ClinicalRecords } | null>(null);
  const [filter, setFilter] = useState<'all' | 'consultation' | 'hospitalization' | 'lab'>('all');
  const records = loaded && loaded.patientId === patient?.id ? loaded.records : emptyClinicalRecords;
  const loading = Boolean(patient && loaded?.patientId !== patient.id);

  useEffect(() => {
    if (!patient) return;
    const controller = new AbortController();
    fetchClinicalRecords(patient.id, controller.signal).then((records) => setLoaded({ patientId: patient.id, records })).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onNotice('No fue posible cargar el expediente.', 'warning');
    });
    return () => controller.abort();
  }, [patient, revision, onNotice]);

  const timeline = useMemo(() => [
    ...records.encounters.map((entry) => ({ id: `encounter-${entry.id}`, at: entry.occurredAt, kind: entry.encounterType === 'hospitalization' ? 'hospitalization' : 'consultation', title: entry.reason, meta: [entry.specialty, entry.practitionerName, entry.facilityName].filter(Boolean).join(' · ') || encounterLabels[entry.encounterType], copy: entry.summary || 'Sin resumen adicional.', tag: encounterLabels[entry.encounterType] || 'Atención' })),
    ...records.labReports.map((report) => ({ id: `lab-${report.id}`, at: report.collectedAt, kind: 'lab', title: report.panelName, meta: [report.laboratoryName, `${report.results.length} resultados`].filter(Boolean).join(' · '), copy: report.results.slice(0, 4).map((result) => `${result.analyteName}: ${result.valueNumeric ?? result.valueText} ${result.unit || ''}`.trim()).join(' · '), tag: 'Laboratorio' })),
  ].filter((entry) => filter === 'all' || entry.kind === filter).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [records, filter]);

  const share = () => canShare ? onShare() : onNotice('Este perfil no tiene habilitados los enlaces médicos.', 'warning');
  const edit = () => canEdit ? onEdit() : onNotice('Selecciona un perfil protegido con permiso de edición.', 'warning');
  const register = () => canEdit ? onRegister() : onNotice('Selecciona una persona con permiso de edición.', 'warning');

  return <><PageHeading eyebrow="EXPEDIENTE LONGITUDINAL" title={`Historia clínica de ${profile}`} copy="Consultas, hospitalizaciones, especialistas y laboratorios guardados en una sola línea de tiempo." action={<div className="heading-actions"><button className="secondary-action" onClick={edit} type="button">✎ Editar perfil</button><button className="secondary-action" onClick={share} type="button">↗ Compartir</button><button className="primary-action" onClick={register} type="button">＋ Registrar atención</button></div>} /><div className="content-grid wide-main"><section className="panel module-panel"><div className="filter-row"><button className={filter === 'all' ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter('all')} type="button">Todo</button><button className={filter === 'consultation' ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter('consultation')} type="button">Consultas</button><button className={filter === 'hospitalization' ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter('hospitalization')} type="button">Hospitalizaciones</button><button className={filter === 'lab' ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter('lab')} type="button">Laboratorios</button></div>{!patient ? <div className="empty-clinical"><strong>Selecciona una persona</strong><p>El expediente familiar se consulta de forma individual para proteger y ordenar la información.</p></div> : loading ? <div className="empty-clinical"><strong>Cargando expediente…</strong></div> : timeline.length ? <div className="timeline">{timeline.map((entry) => <article className="timeline-item" key={entry.id}><div className="timeline-dot" /><div><span>{displayDate(entry.at, true).toUpperCase()}</span><h2>{entry.title}</h2><p>{entry.meta}</p><small>{entry.copy}</small></div><em>{entry.tag}</em></article>)}</div> : <div className="empty-clinical"><strong>Aún no hay registros</strong><p>Usa “Registrar atención” para crear la primera entrada real del expediente.</p><button className="secondary-action" type="button" onClick={register}>Crear primera atención</button></div>}</section><aside className="panel side-summary">{patient ? <><p className="eyebrow">FICHA ESENCIAL</p><h2>{patient.legalName}</h2><div className="profile-summary-row"><span>Nacimiento</span><strong>{patient.birthDate ? displayDate(`${patient.birthDate}T12:00:00-05:00`) : 'No registrada'}</strong></div><div className="profile-summary-row"><span>Grupo sanguíneo</span><strong>{patient.bloodType || 'No registrado'}</strong></div><div className="profile-summary-row"><span>Atenciones</span><strong>{records.encounters.length}</strong></div><div className="profile-summary-row"><span>Laboratorios</span><strong>{records.labReports.length}</strong></div><div className="profile-summary-block"><span>Alergias</span><p>{patient.allergiesSummary || 'No registradas'}</p></div><div className="profile-summary-block emergency"><span>Resumen para emergencias</span><p>{patient.emergencySummary || 'Pendiente de completar'}</p></div><span className={patient.canShare ? 'permission-status enabled' : 'permission-status'}>{patient.canShare ? '✓ Enlaces médicos habilitados' : 'Enlaces médicos deshabilitados'}</span></> : <><p className="eyebrow">COBERTURA DEL EXPEDIENTE</p><h2>Información clínica completa</h2>{['Antecedentes y alergias', 'Consultas de cualquier especialidad', 'Hospitalizaciones y procedimientos', 'Laboratorios revisados', 'Recetas, referencias y adjuntos'].map((item) => <p className="check-row" key={item}><span>✓</span>{item}</p>)}</>}<div className="readonly-note"><strong>Healwave</strong><p>La integración futura será estrictamente de solo lectura. Family Care nunca escribirá en producción.</p></div></aside></div></>;
}
