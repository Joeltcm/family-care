'use client';

import { type FormEvent, useState } from 'react';
import { uploadClinicalDocument } from '@/lib/client/document-upload';
import type { FamilyCarePatient } from '@/lib/family-care-session';

export function DocumentUploadModal({ patient, initialCategory = 'other', onClose, onSaved }: { patient: FamilyCarePatient; initialCategory?: 'lab' | 'other'; onClose: () => void; onSaved: (message: string) => void }) {
  const [category, setCategory] = useState(initialCategory);
  const [title, setTitle] = useState('');
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError('Selecciona un archivo PDF o una imagen.');
    setSaving(true);
    setError('');
    try {
      const result = await uploadClinicalDocument({
        patientId: patient.id,
        category,
        title,
        capturedAt: capturedAt ? new Date(`${capturedAt}T12:00:00-05:00`).toISOString() : null,
        file,
      });
      const saving = result.optimizedBytes === null ? 0 : Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100));
      onSaved(saving ? `Documento guardado. La vista móvil ocupa ${saving}% menos.` : 'Documento original guardado correctamente.');
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(code === 'file_too_large' ? 'El archivo supera el límite de 25 MB.' : code === 'unsupported_file_type' ? 'Formato no permitido. Usa PDF, JPG, PNG o WebP.' : 'No fue posible guardar el documento.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="document-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <div className="profile-modal-heading"><span aria-hidden="true">↥</span><div><p className="eyebrow">ARCHIVO CLÍNICO</p><h2 id="document-title">Subir documento</h2></div></div>
      <p className="profile-intro">El original se conserva y las imágenes grandes generan una versión WebP optimizada para el móvil.</p>
      <form onSubmit={save}>
        <div className="profile-form-grid">
          <label className="form-field"><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="lab">Laboratorio</option><option value="prescription">Receta</option><option value="referral">Referencia</option><option value="clinical_note">Nota clínica</option><option value="discharge">Epicrisis / alta</option><option value="insurance">Seguro</option><option value="other">Otro</option></select></label>
          <label className="form-field"><span>Fecha del documento</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} /></label>
          <label className="form-field full"><span>Título</span><input required minLength={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Hemograma de control" /></label>
          <label className="form-field full file-field"><span>Archivo</span><input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /><small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'PDF, JPG, PNG o WebP · máximo 25 MB'}</small></label>
        </div>
        <div className="data-caution"><strong>Conservación clínica</strong><span>La compresión solo crea una vista adicional. El original permanece disponible para revisión.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Comprimiendo y guardando…' : 'Guardar documento'}</button></div>
      </form>
    </section>
  </div>;
}
