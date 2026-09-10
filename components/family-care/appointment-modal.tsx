'use client';

import { type FormEvent, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';

function defaultStart() {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AppointmentModal({ patient, onClose, onSaved }: { patient: FamilyCarePatient; onClose: () => void; onSaved: () => void }) {
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [duration, setDuration] = useState('60');
  const [specialty, setSpecialty] = useState('');
  const [practitionerName, setPractitionerName] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [reason, setReason] = useState('');
  const [reminders, setReminders] = useState([1440, 120]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleReminder(minutes: number) {
    setReminders((current) => current.includes(minutes) ? current.filter((value) => value !== minutes) : [...current, minutes]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reminders.length) return setError('Selecciona al menos un recordatorio.');
    setSaving(true);
    setError('');
    try {
      const start = new Date(startsAt);
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/appointments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + Number(duration) * 60_000).toISOString(),
          specialty: specialty.trim() || null,
          practitionerName: practitionerName.trim() || null,
          facilityName: facilityName.trim() || null,
          reason,
          reminderMinutes: reminders.sort((a, b) => b - a),
        }),
      });
      if (!response.ok) throw new Error('appointment_save_failed');
      onSaved();
    } catch {
      setError('No fue posible guardar la cita. Verifica la fecha y los datos.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">▦</span><div><p className="eyebrow">NUEVA CITA</p><h2 id="appointment-title">Agendar control médico</h2></div></div>
      <p className="profile-intro">Programa una cita de {patient.preferredName || patient.legalName} con cualquier especialidad.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field"><span>Fecha y hora</span><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label className="form-field"><span>Duración estimada</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">1 hora 30 min</option><option value="120">2 horas</option></select></label>
          <label className="form-field"><span>Especialidad</span><input maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Hematología pediátrica" /></label>
          <label className="form-field"><span>Profesional</span><input maxLength={160} value={practitionerName} onChange={(event) => setPractitionerName(event.target.value)} /></label>
          <label className="form-field full"><span>Centro médico</span><input maxLength={180} value={facilityName} onChange={(event) => setFacilityName(event.target.value)} /></label>
          <label className="form-field full"><span>Motivo de la cita</span><input required minLength={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </div>
        <fieldset className="reminder-options"><legend>Recordarme</legend>{[[1440, '1 día antes'], [120, '2 horas antes'], [30, '30 minutos antes']].map(([minutes, label]) => <label key={minutes}><input type="checkbox" checked={reminders.includes(minutes as number)} onChange={() => toggleReminder(minutes as number)} />{label}</label>)}</fieldset>
        <div className="data-caution"><strong>Al completar la cita</strong><span>Podrás marcarla como realizada y se añadirá automáticamente al expediente médico.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar cita'}</button></div>
      </form>
    </section>
  </div>;
}
