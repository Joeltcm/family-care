'use client';

import { useEffect, useMemo, useState } from 'react';
import { NotificationPrompt } from '@/components/family-care/notification-prompt';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { loadCarePlans, localIsoDate, patientLabel, type PatientCarePlan } from '@/lib/care-plan';
import type { FamilyCarePatient } from '@/lib/family-care-session';

export function Medications({ patients, patient, onNotice, onRegister, onChanged, revision }: { patients: FamilyCarePatient[]; patient?: FamilyCarePatient; onNotice: Notify; onRegister: () => void; onChanged: () => void; revision: number }) {
  const targets = useMemo(() => patient ? [patient] : patients, [patient, patients]);
  const targetKey = targets.map((item) => item.id).join(':');
  const [loaded, setLoaded] = useState<{ key: string; plans: PatientCarePlan[] } | null>(null);
  const plans = !targets.length ? [] : loaded?.key === targetKey ? loaded.plans : null;
  const [working, setWorking] = useState('');

  useEffect(() => {
    let active = true;
    if (!targets.length) return () => { active = false; };
    loadCarePlans(targets).then((value) => { if (active) setLoaded({ key: targetKey, plans: value }); }).catch(() => {
      if (active) { setLoaded({ key: targetKey, plans: [] }); onNotice('No fue posible cargar los medicamentos.', 'warning'); }
    });
    return () => { active = false; };
  }, [targetKey, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const medications = (plans || []).flatMap((entry) => entry.plan.medications.map((medication) => ({ ...medication, patient: entry.patient })));

  async function record(patientId: string, medicationId: string, scheduleId: string, status: 'taken' | 'skipped') {
    const key = `${medicationId}:${scheduleId}`;
    setWorking(key);
    try {
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patientId)}/medications/${encodeURIComponent(medicationId)}/events`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scheduleId, occurrenceDate: localIsoDate(), status }),
      });
      if (!response.ok) throw new Error('event_save_failed');
      onNotice(status === 'taken' ? 'Toma registrada correctamente.' : 'Dosis marcada como omitida.', status === 'taken' ? 'success' : 'warning');
      onChanged();
    } catch {
      onNotice('No fue posible registrar la dosis.', 'warning');
    } finally {
      setWorking('');
    }
  }

  return <>
    <PageHeading eyebrow="MEDICAMENTOS" title="Tratamientos y recordatorios" copy={patient ? `Plan actual de ${patientLabel(patient)}.` : 'Vista familiar de tratamientos activos y adherencia.'} action={<button className="primary-action" type="button" onClick={onRegister}>＋ Agregar medicamento</button>} />
    <NotificationPrompt onNotice={onNotice} />
    {!plans && <section className="panel empty-clinical"><strong>Cargando tratamientos…</strong></section>}
    {plans && !medications.length && <section className="panel empty-clinical"><strong>No hay medicamentos registrados</strong><p>Selecciona un perfil y transcribe una prescripción para crear horarios y recordatorios.</p><button className="primary-action" type="button" onClick={onRegister}>Agregar medicamento</button></section>}
    {plans && medications.length > 0 && <section className="card-list medication-list">{medications.map((medication, index) => {
      const taken = medication.events.filter((event) => event.status === 'taken').length;
      const tracked = medication.events.filter((event) => event.status === 'taken' || event.status === 'skipped' || event.status === 'missed').length;
      return <article className={`panel medication-card ${!medication.active ? 'inactive' : ''}`} key={medication.id}>
        <span className={`medicine-icon ${index % 3 === 1 ? 'coral' : index % 3 === 2 ? 'violet' : ''}`}>Rx</span>
        <div className="medication-main"><p>{patientLabel(medication.patient)} · {medication.active ? 'Tratamiento activo' : 'Finalizado'}</p><h2>{medication.name}</h2><span>{[medication.doseText, medication.route, medication.instructions].filter(Boolean).join(' · ') || 'Sin instrucciones adicionales'}</span>{medication.prescribedBy && <small>Indicado por {medication.prescribedBy}</small>}
          <div className="dose-schedule">{medication.schedules.map((schedule) => {
            const todayEvent = medication.events.find((event) => event.scheduleId === schedule.id && localIsoDate(new Date(event.scheduledAt)) === localIsoDate());
            const key = `${medication.id}:${schedule.id}`;
            return <div className={todayEvent ? `dose-pill ${todayEvent.status}` : 'dose-pill'} key={schedule.id}><strong>{schedule.localTime}</strong>{todayEvent ? <span>{todayEvent.status === 'taken' ? 'Tomada' : 'Omitida'}</span> : <><button disabled={working === key || !medication.patient.canWrite} type="button" onClick={() => record(medication.patient.id, medication.id, schedule.id, 'taken')}>{working === key ? '…' : 'Tomada'}</button><button className="skip-dose" disabled={working === key || !medication.patient.canWrite} type="button" onClick={() => record(medication.patient.id, medication.id, schedule.id, 'skipped')}>Omitir</button></>}</div>;
          })}</div>
        </div>
        <div className="med-status"><small>{tracked ? `${Math.round(taken / tracked * 100)}% de registros tomados` : 'Sin registros aún'}</small><span>{medication.startDate ? `Desde ${new Date(`${medication.startDate}T12:00:00`).toLocaleDateString('es-PA')}` : ''}</span></div>
      </article>;
    })}</section>}
    <div className="clinical-warning standalone"><strong>Seguridad farmacológica</strong><p>Family Care registra lo indicado por el profesional. No recomienda iniciar, suspender ni modificar dosis.</p></div>
  </>;
}
