'use client';

import { useState, type FormEvent } from 'react';
import type { LabReport, LabResult } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

function numberText(value: number | null) { return value === null ? '' : String(value); }

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= -1_000_000 && parsed <= 1_000_000 ? parsed : NaN;
}

export function LabResultEditor({ patient, report, result, onClose, onSaved, onConflict }: {
  patient: FamilyCarePatient;
  report: LabReport;
  result: LabResult;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const [numeric, setNumeric] = useState(numberText(result.valueNumeric));
  const [textValue, setTextValue] = useState(result.valueText || '');
  const [unit, setUnit] = useState(result.unit || '');
  const [low, setLow] = useState(numberText(result.referenceLow));
  const [high, setHigh] = useState(numberText(result.referenceHigh));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    const valueNumeric = parseNumber(numeric);
    const referenceLow = parseNumber(low);
    const referenceHigh = parseNumber(high);
    if ([valueNumeric, referenceLow, referenceHigh].some((value) => Number.isNaN(value))) {
      setError('Comprueba los números; usa punto o coma para los decimales.');
      return;
    }
    if (valueNumeric === null && !textValue.trim()) {
      setError('Ingresa un número o un resultado en texto.');
      return;
    }
    if (referenceLow !== null && referenceHigh !== null && referenceLow > referenceHigh) {
      setError('El límite inferior no puede superar al superior.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/lab-reports/${encodeURIComponent(report.id)}/results/${encodeURIComponent(result.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expected: {
            valueNumeric: result.valueNumeric, valueText: result.valueText, unit: result.unit,
            referenceLow: result.referenceLow, referenceHigh: result.referenceHigh,
          },
          values: {
            valueNumeric, valueText: textValue.trim() || null, unit: unit.trim() || null,
            referenceLow, referenceHigh,
          },
        }),
      });
      if (response.status === 409) {
        onConflict();
        return;
      }
      if (!response.ok) throw new Error('save_failed');
      onSaved();
    } catch {
      setError('No se pudo guardar la corrección. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="profile-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="lab-edit-title" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}>
      <button className="close-modal" type="button" aria-label="Cerrar" disabled={busy} onClick={onClose}>×</button>
      <p className="eyebrow">CORREGIR TRANSCRIPCIÓN</p>
      <h2 id="lab-edit-title">{result.analyteName}</h2>
      <p className="profile-intro">Editas el valor registrado de {patient.preferredName || patient.legalName}. El informe original no cambiará; la revisión familiar quedará pendiente hasta cotejarlo de nuevo.</p>
      {report.documentId && <a className="lab-original-link" target="_blank" rel="noreferrer" href={`/api/family-care/documents/${encodeURIComponent(report.documentId)}`}>Abrir informe original ↗</a>}
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field"><span>Valor numérico</span><input autoFocus inputMode="decimal" value={numeric} onChange={(event) => setNumeric(event.target.value)} placeholder="Por ejemplo, 10.8" /></label>
          <label className="form-field"><span>Unidad</span><input maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="g/dL" /></label>
          <label className="form-field full"><span>Resultado en texto, si corresponde</span><input maxLength={160} value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Por ejemplo, no detectable" /></label>
          <label className="form-field"><span>Límite inferior del informe</span><input inputMode="decimal" value={low} onChange={(event) => setLow(event.target.value)} /></label>
          <label className="form-field"><span>Límite superior del informe</span><input inputMode="decimal" value={high} onChange={(event) => setHigh(event.target.value)} /></label>
        </div>
        <div className="data-caution"><strong>Verificación</strong><span>Compara valor, unidad y rango con el PDF antes de guardar. Esta corrección no interpreta el resultado ni modifica el tratamiento.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-action" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar corrección'}</button></div>
      </form>
    </section>
  </div>;
}
