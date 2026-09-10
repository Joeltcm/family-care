'use client';

import { type FormEvent, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';

function localDateTime() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export function EncounterModal({ patient, onClose, onSaved }: { patient: FamilyCarePatient; onClose: () => void; onSaved: () => void }) {
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [encounterType, setEncounterType] = useState('consultation');
  const [specialty, setSpecialty] = useState('');
  const [practitionerName, setPractitionerName] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState('');
  const [dischargedAt, setDischargedAt] = useState('');
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/encounters`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          occurredAt: new Date(occurredAt).toISOString(),
          encounterType,
          specialty: specialty.trim() || null,
          practitionerName: practitionerName.trim() || null,
          facilityName: facilityName.trim() || null,
          reason,
          summary: summary.trim() || null,
          admittedAt: encounterType === 'hospitalization' ? new Date(occurredAt).toISOString() : null,
          dischargedAt: encounterType === 'hospitalization' && dischargedAt ? new Date(dischargedAt).toISOString() : null,
          dischargeSummary: encounterType === 'hospitalization' ? dischargeSummary.trim() || null : null,
        }),
      });
      if (!response.ok) throw new Error('encounter_save_failed');
      onSaved();
    } catch {
      setError('No fue posible guardar la atención. Verifica los datos e inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="encounter-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">✚</span><div><p className="eyebrow">NUEVA ATENCIÓN</p><h2 id="encounter-title">Registrar en el expediente</h2></div></div>
      <p className="profile-intro">Guarda una consulta de cualquier especialidad, urgencia, procedimiento, terapia u hospitalización de {patient.preferredName || patient.legalName}.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field"><span>Fecha y hora</span><input required type="datetime-local" max={localDateTime()} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
          <label className="form-field"><span>Tipo de atención</span><select value={encounterType} onChange={(event) => setEncounterType(event.target.value)}><option value="consultation">Consulta</option><option value="emergency">Urgencia</option><option value="hospitalization">Hospitalización</option><option value="procedure">Procedimiento</option><option value="therapy">Terapia</option><option value="other">Otra</option></select></label>
          <label className="form-field"><span>Especialidad</span><input maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Hematología pediátrica" /></label>
          <label className="form-field"><span>Profesional</span><input maxLength={160} value={practitionerName} onChange={(event) => setPractitionerName(event.target.value)} /></label>
          <label className="form-field full"><span>Centro médico</span><input maxLength={180} value={facilityName} onChange={(event) => setFacilityName(event.target.value)} /></label>
          <label className="form-field full"><span>Motivo</span><input required minLength={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="form-field full"><span>Resumen e indicaciones</span><textarea maxLength={4000} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
          {encounterType === 'hospitalization' && <><label className="form-field"><span>Fecha de alta</span><input type="datetime-local" min={occurredAt} max={localDateTime()} value={dischargedAt} onChange={(event) => setDischargedAt(event.target.value)} /></label><label className="form-field full"><span>Resumen de alta</span><textarea maxLength={4000} rows={3} value={dischargeSummary} onChange={(event) => setDischargeSummary(event.target.value)} /></label></>}
        </div>
        <div className="data-caution"><strong>Registro familiar</strong><span>Transcribe la información del documento o de las indicaciones médicas. No modifica tratamientos ni genera recomendaciones.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar atención'}</button></div>
      </form>
    </section>
  </div>;
}
