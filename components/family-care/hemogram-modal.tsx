'use client';

import { type FormEvent, useState } from 'react';
import { uploadClinicalDocument } from '@/lib/client/document-upload';
import { prepareHemogramExtractionImage } from '@/lib/client/hemogram-extraction';
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
type Extraction = { collectedAt: string | null; laboratoryName: string | null; results: Array<{ code: string; value: number; unit: string | null; referenceLow: number | null; referenceHigh: number | null; confidence: number }>; requiresReview: true };

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
  const [extracting, setExtracting] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [extractionNote, setExtractionNote] = useState('');
  const [error, setError] = useState('');

  function update(code: string, key: keyof Entry, value: string) {
    setEntries((current) => ({ ...current, [code]: { ...current[code], [key]: value } }));
  }

  async function extractFromDocument() {
    if (!file) return setError('Selecciona primero el informe de laboratorio.');
    if (!aiConsent) return setError('Confirma la autorización antes de enviar el informe a DeepSeek para lectura.');
    setExtracting(true);
    setError('');
    setExtractionNote('Preparando el documento para lectura…');
    try {
      const source = await prepareHemogramExtractionImage(file);
      let response: Response | undefined;
      // Railway can briefly return 503 while a newly deployed container becomes
      // ready. Retry once automatically so the user does not need to repeat a
      // consented document-reading action in that short window.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/hemogram-extraction`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(source),
        });
        if (response.status !== 503 || attempt === 1) break;
        setExtractionNote('El servicio se está preparando; reintentando la lectura…');
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
      if (!response) throw new Error('ai_extraction_failed');
      const payload = await response.json().catch(() => ({})) as Extraction | { error?: string };
      if (!response.ok || !('results' in payload)) throw new Error('error' in payload ? payload.error : 'ai_extraction_failed');
      if (!payload.results.length) throw new Error('ai_no_values_found');
      setEntries((current) => {
        const next = { ...current };
        for (const result of payload.results) {
          if (!next[result.code]) continue;
          next[result.code] = {
            value: String(result.value),
            unit: result.unit || next[result.code].unit,
            low: result.referenceLow === null ? '' : String(result.referenceLow),
            high: result.referenceHigh === null ? '' : String(result.referenceHigh),
          };
        }
        return next;
      });
      if (payload.collectedAt) setCollectedAt(payload.collectedAt);
      if (payload.laboratoryName) setLaboratoryName(payload.laboratoryName);
      const lowerConfidence = payload.results.filter((result) => result.confidence < 0.8).length;
      setExtractionNote(`Se completaron ${payload.results.length} valores. Revísalos contra el informe antes de guardar${lowerConfidence ? `; ${lowerConfidence} requieren especial atención.` : '.'}`);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setExtractionNote('');
      setError(code === 'ai_extraction_not_configured'
        ? 'La lectura automática aún no está activada. Falta configurar DeepSeek de forma segura.'
        : code === 'ai_no_values_found'
          ? 'No se identificaron valores legibles. Prueba una imagen más nítida o completa los campos necesarios.'
          : code === 'ai_request_failed'
            ? 'DeepSeek no pudo procesar el informe en este momento. Espera unos segundos e inténtalo nuevamente.'
            : code === 'ai_image_invalid'
              ? 'No se pudo preparar una copia legible del archivo. Prueba con un PDF o imagen diferente.'
          : 'No fue posible leer el informe automáticamente. Verifica el archivo e inténtalo de nuevo.');
    } finally {
      setExtracting(false);
    }
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
        if (uploaded.compressed) compressionMessage = ` Archivo comprimido ${Math.max(0, Math.round((1 - uploaded.storedBytes / uploaded.sourceBytes) * 100))}%.`;
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
      <p className="profile-intro">Sube el informe y usa la lectura asistida para completar los valores. Siempre podrás revisarlos antes de guardar el hemograma de {patient.preferredName || patient.legalName}.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid lab-basics"><label className="form-field"><span>Fecha de muestra</span><input required type="date" max={new Date().toISOString().slice(0, 10)} value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} /></label><label className="form-field"><span>Laboratorio</span><input maxLength={180} value={laboratoryName} onChange={(event) => setLaboratoryName(event.target.value)} /></label></div>
        <div className="lab-entry-table"><div className="lab-entry-head"><span>Prueba</span><span>Resultado</span><span>Unidad</span><span>Mín.</span><span>Máx.</span></div>{fields.map((field) => <div className="lab-entry-row" key={field.code}><strong>{field.name}<small>{field.code}</small></strong><input aria-label={`${field.name}, resultado`} inputMode="decimal" value={entries[field.code].value} onChange={(event) => update(field.code, 'value', event.target.value)} /><input aria-label={`${field.name}, unidad`} value={entries[field.code].unit} onChange={(event) => update(field.code, 'unit', event.target.value)} /><input aria-label={`${field.name}, rango mínimo`} inputMode="decimal" value={entries[field.code].low} onChange={(event) => update(field.code, 'low', event.target.value)} /><input aria-label={`${field.name}, rango máximo`} inputMode="decimal" value={entries[field.code].high} onChange={(event) => update(field.code, 'high', event.target.value)} /></div>)}</div>
        <label className="form-field file-field lab-file"><span>Informe original</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] || null); setExtractionNote(''); }} /><small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'PDF o imagen, máximo 25 MB'}</small></label>
        <label className="consent-check"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /><span>Autorizo enviar una copia preparada del informe a DeepSeek únicamente para transcribir valores. No se genera diagnóstico ni se guarda este análisis como expediente.</span></label>
        <button className="secondary-action" type="button" disabled={!file || extracting} onClick={extractFromDocument}>{extracting ? 'Leyendo informe…' : '⌁ Leer y completar datos'}</button>
        {extractionNote && <p className="permission-status enabled">✓ {extractionNote}</p>}
        <div className="data-caution"><strong>Revisión obligatoria</strong><span>La lectura puede confundir números, unidades o rangos. Confirma cada valor con el informe original; el hematólogo determina su significado y cualquier cambio de tratamiento.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar hemograma'}</button></div>
      </form>
    </section>
  </div>;
}
