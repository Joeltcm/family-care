'use client';

import { type FormEvent, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';
import { localIsoDate } from '@/lib/care-plan';

export function MedicationModal({ patient, onClose, onSaved }: { patient: FamilyCarePatient; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [doseText, setDoseText] = useState('');
  const [route, setRoute] = useState('Oral');
  const [instructions, setInstructions] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [startDate, setStartDate] = useState(localIsoDate());
  const [endDate, setEndDate] = useState('');
  const [times, setTimes] = useState(['08:00']);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (new Set(times).size !== times.length) return setError('Los horarios no pueden repetirse.');
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/medications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, doseText: doseText.trim() || null, route: route.trim() || null,
          instructions: instructions.trim() || null, prescribedBy: prescribedBy.trim() || null,
          startDate, endDate: endDate || null, times: [...times].sort(), remindersEnabled,
        }),
      });
      if (!response.ok) throw new Error('medication_save_failed');
      onSaved();
    } catch {
      setError('No fue posible guardar el medicamento. Verifica los datos.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="medication-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">Rx</span><div><p className="eyebrow">NUEVO TRATAMIENTO</p><h2 id="medication-title">Registrar medicamento</h2></div></div>
      <p className="profile-intro">Transcribe exactamente la indicación médica de {patient.preferredName || patient.legalName}.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field full"><span>Medicamento</span><input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field"><span>Dosis indicada</span><input maxLength={120} value={doseText} onChange={(event) => setDoseText(event.target.value)} placeholder="Según receta" /></label>
          <label className="form-field"><span>Vía</span><select value={route} onChange={(event) => setRoute(event.target.value)}><option>Oral</option><option>Subcutánea</option><option>Intravenosa</option><option>Intramuscular</option><option>Tópica</option><option>Inhalada</option><option value="Otra">Otra</option></select></label>
          <label className="form-field"><span>Fecha de inicio</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="form-field"><span>Fecha de finalización</span><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="form-field full"><span>Médico que prescribe</span><input maxLength={160} value={prescribedBy} onChange={(event) => setPrescribedBy(event.target.value)} /></label>
          <label className="form-field full"><span>Indicaciones</span><textarea rows={3} maxLength={2000} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Con alimentos, observaciones de la receta…" /></label>
        </div>
        <fieldset className="schedule-editor"><legend>Horarios diarios</legend>{times.map((time, index) => <div key={index}><input required type="time" value={time} onChange={(event) => setTimes((current) => current.map((value, item) => item === index ? event.target.value : value))} />{times.length > 1 && <button type="button" onClick={() => setTimes((current) => current.filter((_, item) => item !== index))}>Quitar</button>}</div>)}{times.length < 8 && <button type="button" onClick={() => setTimes((current) => [...current, '20:00'])}>＋ Agregar horario</button>}</fieldset>
        <label className="permission-toggle"><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} /><span><strong>Activar recordatorios</strong><small>El aviso será discreto y no mostrará el nombre del medicamento en la pantalla bloqueada.</small></span></label>
        <div className="clinical-warning standalone"><strong>Seguridad farmacológica</strong><p>Family Care solo registra la prescripción. No recomienda iniciar, suspender ni modificar dosis.</p></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar medicamento'}</button></div>
      </form>
    </section>
  </div>;
}
