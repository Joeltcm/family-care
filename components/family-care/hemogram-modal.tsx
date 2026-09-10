'use client';

import { type FormEvent, useState } from 'react';
import { uploadClinicalDocument } from '@/lib/client/document-upload';
import type { FamilyCarePatient } from '@/lib/family-care-session';

const fields = [
  { code: 'HGB', name: 'Hemoglobina', unit: 'g/dL' },
  { code: 'HCT', name: 'Hematocrito', unit: '%' },
  { code: 'RBC', name: 'Eritrocitos', unit: 'mill/µL' },
  { code: 'WBC', name: 'Leucocitos', unit: 'mil/µL' },
  { code: 'PLT', name: 'Plaquetas', unit: 'mil/µL' },
  { code: 'RETIC', name: 'Reticulocitos', unit: '%' },
  { code: 'LDH', name: 'LDH', unit: 'U/L' },
  { code: 'BILI', name: 'Bilirrubina', unit: 'mg/dL' },
  { code: 'HAPTO', name: 'Haptoglobina', unit: 'mg/dL' },
] as const;

type Entry = { value: string; low: string; high: string; unit: string };

function numberFromInput(value: string) {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function HemogramModal({ patient, onClose, onSaved }: { patient: FamilyCarePatient; onClose: () => void; onSaved: (message: string) => void }) {
  const [collectedAt, setCollectedAt] = useState(new Date().toISOString().slice(0, 10));
  const [laboratoryName, setLaboratoryName] = useState('');
  const [entries, setEntries] = useState<Record<string, Entry>>(() => Object.fromEntries(fields.map((field) => [field.code, { value: '', low: '', high: '', unit: field.unit }])));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(code: string, key: keyof Entry, value: string) {
    setEntries((current) => ({ ...current, [code]: { ...current[code], [key]: value } }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const results = fields.flatMap((field) => {
      const entry = entries[field.code];
      if (!entry.value.trim()) return [];
      const value = numberFromInput(entry.value);
      if (value === null) return [];
      return [{
        analyteName: field.name,
        analyteCode: field.code,
        valueNumeric: value,
        valueText: null,
        unit: entry.unit.trim() || null,
        referenceLow: entry.low === '' ? null : numberFromInput(entry.low),
        referenceHigh: entry.high === '' ? null : numberFromInput(entry.high),
      }];
    });
    if (!results.length) return setError('Ingresa al menos un resultado numérico.');
    setSaving(true);
    setError('');
    try {
      let documentId: string | null = null;
      let compressionMessage = '';
      if (file) {
        const uploaded = await uploadClinicalDocument({ patientId: patient.id, category: 'lab', title: `Hemograma · ${collectedAt}`, capturedAt: new Date(`${collectedAt}T12:00:00-05:00`).toISOString(), file });
        documentId = uploaded.id;
        if (uploaded.optimizedBytes !== null) compressionMessage = ` Vista móvil reducida ${Math.max(0, Math.round((1 - uploaded.optimizedBytes / uploaded.originalBytes) * 100))}%.`;
      }
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/lab-reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collectedAt: new Date(`${collectedAt}T12:00:00-05:00`).toISOString(),
          reportedAt: null,
          laboratoryName: laboratoryName.trim() || null,
          panelName: 'Hemograma y seguimiento de hemólisis',
          documentId,
          results,
        }),
      });
      if (!response.ok) throw new Error('lab_save_failed');
      onSaved(`Hemograma guardado con ${results.length} valores.${compressionMessage}`);
    } catch {
      setError('No fue posible guardar el hemograma. Revisa los valores y la conexión.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="hemogram-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">⌁</span><div><p className="eyebrow">LABORATORIO REVISADO</p><h2 id="hemogram-title">Registrar hemograma</h2></div></div>
      <p className="profile-intro">Transcribe los valores exactamente como aparecen en el informe de {patient.preferredName || patient.legalName}. Puedes adjuntar el original.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid lab-basics"><label className="form-field"><span>Fecha de muestra</span><input required type="date" max={new Date().toISOString().slice(0, 10)} value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} /></label><label className="form-field"><span>Laboratorio</span><input maxLength={180} value={laboratoryName} onChange={(event) => setLaboratoryName(event.target.value)} /></label></div>
        <div className="lab-entry-table"><div className="lab-entry-head"><span>Prueba</span><span>Resultado</span><span>Unidad</span><span>Mín.</span><span>Máx.</span></div>{fields.map((field) => <div className="lab-entry-row" key={field.code}><strong>{field.name}<small>{field.code}</small></strong><input aria-label={`${field.name}, resultado`} inputMode="decimal" value={entries[field.code].value} onChange={(event) => update(field.code, 'value', event.target.value)} /><input aria-label={`${field.name}, unidad`} value={entries[field.code].unit} onChange={(event) => update(field.code, 'unit', event.target.value)} /><input aria-label={`${field.name}, rango mínimo`} inputMode="decimal" value={entries[field.code].low} onChange={(event) => update(field.code, 'low', event.target.value)} /><input aria-label={`${field.name}, rango máximo`} inputMode="decimal" value={entries[field.code].high} onChange={(event) => update(field.code, 'high', event.target.value)} /></div>)}</div>
        <label className="form-field file-field lab-file"><span>Informe original (opcional)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /><small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'PDF o imagen, máximo 25 MB'}</small></label>
        <div className="data-caution"><strong>Sin diagnóstico automático</strong><span>La app solo marca valores fuera del rango escrito por el laboratorio. El hematólogo determina su significado y cualquier cambio de tratamiento.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar hemograma'}</button></div>
      </form>
    </section>
  </div>;
}
