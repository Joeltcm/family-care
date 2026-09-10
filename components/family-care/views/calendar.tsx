'use client';

import { useEffect, useMemo, useState } from 'react';
import { NotificationPrompt } from '@/components/family-care/notification-prompt';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { loadCarePlans, patientLabel, type Appointment, type PatientCarePlan } from '@/lib/care-plan';
import type { FamilyCarePatient } from '@/lib/family-care-session';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const statusLabels = { scheduled: 'Programada', completed: 'Realizada', cancelled: 'Cancelada', missed: 'No asistió' };

export function Calendar({ patients, patient, onNotice, onRegister, onChanged, revision }: { patients: FamilyCarePatient[]; patient?: FamilyCarePatient; onNotice: Notify; onRegister: () => void; onChanged: () => void; revision: number }) {
  const targets = useMemo(() => patient ? [patient] : patients, [patient, patients]);
  const targetKey = targets.map((item) => item.id).join(':');
  const [loaded, setLoaded] = useState<{ key: string; plans: PatientCarePlan[] } | null>(null);
  const plans = !targets.length ? [] : loaded?.key === targetKey ? loaded.plans : null;
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [working, setWorking] = useState('');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    if (!targets.length) return () => { active = false; };
    loadCarePlans(targets).then((value) => { if (active) setLoaded({ key: targetKey, plans: value }); }).catch(() => {
      if (active) { setLoaded({ key: targetKey, plans: [] }); onNotice('No fue posible cargar el calendario.', 'warning'); }
    });
    return () => { active = false; };
  }, [targetKey, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const appointments = (plans || []).flatMap((entry) => entry.plan.appointments.map((appointment) => ({ ...appointment, patient: entry.patient }))).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const firstOffset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstOffset + days) / 7) * 7 }, (_, index) => index - firstOffset + 1);
  const dayAppointments = (day: number) => appointments.filter((appointment) => {
    const date = new Date(appointment.startsAt);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth() && date.getDate() === day;
  });
  const agenda = selectedDay ? dayAppointments(selectedDay) : appointments.filter((appointment) => appointment.status === 'scheduled' && Date.parse(appointment.startsAt) >= now).slice(0, 8);

  async function changeStatus(item: Appointment & { patient: FamilyCarePatient }, status: 'completed' | 'cancelled' | 'missed') {
    setWorking(item.id);
    try {
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(item.patient.id)}/appointments/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('appointment_update_failed');
      onNotice(status === 'completed' ? 'Cita completada y añadida al expediente.' : 'Estado de la cita actualizado.', status === 'completed' ? 'success' : 'warning');
      onChanged();
    } catch {
      onNotice('No fue posible actualizar la cita.', 'warning');
    } finally {
      setWorking('');
    }
  }

  return <>
    <PageHeading eyebrow="AGENDA FAMILIAR" title="Citas y controles" copy={patient ? `Agenda médica de ${patientLabel(patient)}.` : 'Consultas, estudios y controles de toda la familia.'} action={<button className="primary-action" type="button" onClick={onRegister}>＋ Nueva cita</button>} />
    <NotificationPrompt onNotice={onNotice} />
    <div className="calendar-layout"><section className="panel month-panel"><div className="month-title"><button type="button" aria-label="Mes anterior" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelectedDay(null); }}>‹</button><h2>{monthNames[month.getMonth()]} {month.getFullYear()}</h2><button type="button" aria-label="Mes siguiente" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelectedDay(null); }}>›</button></div><div className="calendar-grid">{['L','M','M','J','V','S','D'].map((day, index) => <strong key={`${day}-${index}`}>{day}</strong>)}{cells.map((day, index) => {
      const entries = day > 0 && day <= days ? dayAppointments(day) : [];
      return <button type="button" disabled={day <= 0 || day > days} aria-label={day > 0 && day <= days ? `${day} de ${monthNames[month.getMonth()]}, ${entries.length} citas` : undefined} className={`${entries.length ? 'has-event' : ''} ${selectedDay === day ? 'selected' : ''}`} key={index} onClick={() => setSelectedDay(day)}>{day > 0 && day <= days ? day : ''}{entries.length > 1 && <small>{entries.length}</small>}</button>;
    })}</div></section><aside className="panel agenda-panel"><div className="panel-heading"><div><p className="eyebrow">{selectedDay ? 'DÍA SELECCIONADO' : 'PRÓXIMAMENTE'}</p><h2>{selectedDay ? `${selectedDay} de ${monthNames[month.getMonth()]}` : 'Próximas citas'}</h2></div>{selectedDay && <button className="text-button" type="button" onClick={() => setSelectedDay(null)}>Ver próximas</button>}</div>{!plans && <p className="agenda-empty">Cargando agenda…</p>}{plans && !agenda.length && <p className="agenda-empty">No hay citas para mostrar.</p>}<div className="agenda-list">{agenda.map((item) => {
      const date = new Date(item.startsAt);
      return <article className={`agenda-item ${item.status}`} key={item.id}><div className="date-block teal"><strong>{date.getDate()}</strong><span>{monthNames[date.getMonth()].slice(0, 3).toUpperCase()}</span></div><div><span>{date.toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' })} · {patientLabel(item.patient)}</span><h3>{item.reason}</h3><small>{[item.specialty, item.practitionerName, item.facilityName].filter(Boolean).join(' · ') || 'Sin ubicación especificada'}</small><em>{statusLabels[item.status]}</em>{item.status === 'scheduled' && item.patient.canWrite && <div className="appointment-actions"><button disabled={working === item.id} type="button" onClick={() => changeStatus(item, 'completed')}>Realizada</button><button disabled={working === item.id} type="button" onClick={() => changeStatus(item, 'cancelled')}>Cancelar</button></div>}</div></article>;
    })}</div></aside></div>
  </>;
}
