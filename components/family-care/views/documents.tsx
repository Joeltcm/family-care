import { PageHeading } from '@/components/family-care/page-heading';
import { documents } from '@/lib/demo-data';

export function Documents({ onUpload }: { onUpload: () => void }) {
  return <><PageHeading eyebrow="ARCHIVO CLÍNICO" title="Documentos y recetas" copy="Recetas, referencias, resultados, epicrisis y pólizas, con versiones y trazabilidad." action={<button className="primary-action" type="button" onClick={onUpload}>↥ Subir documento</button>} /><section className="panel module-panel"><div className="document-list">{documents.map((document) => <article className="document-row" key={document.name}><span className="document-icon">PDF</span><div><h2>{document.name}</h2><p>{document.type} · {document.person}</p></div><span>{document.size}</span><button type="button" aria-label={`Opciones de ${document.name}`}>•••</button></article>)}</div></section></>;
}
