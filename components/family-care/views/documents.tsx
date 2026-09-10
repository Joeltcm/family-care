'use client';

import { useEffect, useState } from 'react';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { emptyClinicalRecords, fetchClinicalRecords, type ClinicalRecords } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

const categoryLabels: Record<string, string> = { lab: 'Laboratorio', prescription: 'Receta', referral: 'Referencia', insurance: 'Seguro', clinical_note: 'Nota clínica', discharge: 'Epicrisis', other: 'Otro' };

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Documents({ patient, canEdit, onUpload, onNotice, revision }: { patient?: FamilyCarePatient; canEdit: boolean; onUpload: () => void; onNotice: Notify; revision: number }) {
  const [loaded, setLoaded] = useState<{ patientId: string; records: ClinicalRecords } | null>(null);
  const records = loaded?.patientId === patient?.id ? loaded.records : emptyClinicalRecords;
  const loading = Boolean(patient && loaded?.patientId !== patient.id);
  useEffect(() => {
    if (!patient) return;
    const controller = new AbortController();
    fetchClinicalRecords(patient.id, controller.signal).then((records) => setLoaded({ patientId: patient.id, records })).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onNotice('No fue posible cargar los documentos.', 'warning');
    });
    return () => controller.abort();
  }, [patient, revision, onNotice]);
  const upload = () => canEdit ? onUpload() : onNotice('Selecciona una persona con permiso de edición.', 'warning');
  return <><PageHeading eyebrow="ARCHIVO CLÍNICO" title="Documentos y recetas" copy="Originales protegidos y versiones móviles optimizadas con trazabilidad." action={<button className="primary-action" type="button" onClick={upload}>↥ Subir documento</button>} /><section className="panel module-panel">{!patient ? <div className="empty-clinical"><strong>Selecciona una persona</strong><p>Los documentos se organizan dentro de cada expediente.</p></div> : loading ? <div className="empty-clinical"><strong>Cargando documentos…</strong></div> : records.documents.length ? <div className="document-list">{records.documents.map((document) => <article className="document-row" key={document.id}><span className="document-icon">{document.category === 'lab' ? 'LAB' : 'DOC'}</span><div><h2>{document.title}</h2><p>{categoryLabels[document.category]} · {document.hasOptimized ? 'Original + vista optimizada' : 'Original protegido'}</p></div><span>{size(document.storedBytes)}</span><a className="document-open" href={`/api/family-care/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer" aria-label={`Abrir ${document.title}`}>↗</a></article>)}</div> : <div className="empty-clinical"><strong>Aún no hay documentos</strong><p>Sube recetas, referencias, resultados o epicrisis en PDF o imagen.</p><button className="secondary-action" type="button" onClick={upload}>Subir primer documento</button></div>}</section></>;
}
