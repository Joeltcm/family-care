'use client';

import { type FormEvent, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';

const bloodTypes = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export function ProfileEditorModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: FamilyCarePatient;
  onClose: () => void;
  onSaved: (patient: FamilyCarePatient) => void;
}) {
  const [legalName, setLegalName] = useState(patient.legalName);
  const [preferredName, setPreferredName] = useState(patient.preferredName || '');
  const [birthDate, setBirthDate] = useState(patient.birthDate || '');
  const [bloodType, setBloodType] = useState(patient.bloodType || '');
  const [allergiesSummary, setAllergiesSummary] = useState(patient.allergiesSummary || '');
  const [emergencySummary, setEmergencySummary] = useState(patient.emergencySummary || '');
  const [canShare, setCanShare] = useState(patient.canShare);
  const [shareConsentConfirmed, setShareConsentConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requiresConsent = !patient.linkedToCurrentUser && canShare && !patient.canShare;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresConsent && !shareConsentConfirmed) {
      setError('Debes confirmar que cuentas con autorización antes de habilitar enlaces médicos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/family-care/patients/' + encodeURIComponent(patient.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          legalName,
          preferredName: preferredName || null,
          birthDate: birthDate || null,
          bloodType: bloodType || null,
          allergiesSummary: allergiesSummary || null,
          emergencySummary: emergencySummary || null,
          canShare,
          shareConsentConfirmed,
        }),
      });
      const payload = await response.json() as FamilyCarePatient | { error: string };
      if (!response.ok || !('legalName' in payload)) {
        throw new Error('error' in payload ? payload.error : 'profile_save_failed');
      }
      onSaved(payload);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(code === 'share_consent_required'
        ? 'Se requiere una confirmación explícita para compartir este expediente.'
        : 'No fue posible guardar el perfil. Revisa los datos e inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">✚</span><div><p className="eyebrow">PERFIL CLÍNICO PROTEGIDO</p><h2 id="profile-title">Datos esenciales</h2></div></div>
      <p className="profile-intro">Esta información se guarda en el expediente familiar y puede incluirse en la vista médica temporal.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field full"><span>Nombre legal</span><input required minLength={2} maxLength={160} value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label>
          <label className="form-field"><span>Nombre preferido</span><input maxLength={120} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} /></label>
          <label className="form-field"><span>Fecha de nacimiento</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
          <label className="form-field"><span>Grupo sanguíneo</span><select value={bloodType} onChange={(event) => setBloodType(event.target.value)}>{bloodTypes.map((type) => <option value={type} key={type || 'unknown'}>{type || 'No registrado'}</option>)}</select></label>
          <label className="form-field full"><span>Alergias conocidas</span><textarea maxLength={2000} rows={3} value={allergiesSummary} onChange={(event) => setAllergiesSummary(event.target.value)} placeholder="Registra alergias y reacciones conocidas, o déjalo vacío." /></label>
          <label className="form-field full"><span>Resumen para emergencias</span><textarea maxLength={2000} rows={4} value={emergencySummary} onChange={(event) => setEmergencySummary(event.target.value)} placeholder="Condiciones relevantes, indicaciones críticas y contacto médico." /></label>
        </div>
        <label className="permission-toggle"><input type="checkbox" checked={canShare} onChange={(event) => setCanShare(event.target.checked)} /><span><strong>Permitir enlaces médicos temporales</strong><small>Siempre requieren caducidad y PIN independiente.</small></span></label>
        {requiresConsent && <label className="consent-check"><input type="checkbox" checked={shareConsentConfirmed} onChange={(event) => setShareConsentConfirmed(event.target.checked)} /><span>Confirmo que cuento con autorización para compartir este expediente.</span></label>}
        <div className="data-caution"><strong>Importante</strong><span>Verifica estos datos con sus documentos clínicos. Family Care no los interpreta ni reemplaza la evaluación médica.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
      </form>
    </section>
  </div>;
}
