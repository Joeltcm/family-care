import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { medications } from '@/lib/demo-data';

export function Medications({ onNotice }: { onNotice: Notify }) {
  return <><PageHeading eyebrow="MEDICAMENTOS" title="Tratamientos y recordatorios" copy="Dosis, horarios, recetas y adherencia, siempre conforme a la indicación médica." action={<button className="primary-action" type="button" onClick={() => onNotice('Registro de medicamento preparado en modo demostración.')}>＋ Agregar medicamento</button>} /><section className="card-list">{medications.map((medication) => <article className="panel medication-card" key={medication.name}><span className={`medicine-icon ${medication.tone}`}>Rx</span><div><p>{medication.person}</p><h2>{medication.name}</h2><span>{medication.schedule}</span></div><div className="med-status"><small>{medication.status}</small><button type="button" onClick={() => onNotice('Dosis marcada únicamente en la demostración.')}>Marcar tomada</button></div></article>)}</section><div className="clinical-warning standalone"><strong>Seguridad farmacológica</strong><p>Family Care registrará la prescripción; no recomendará iniciar, suspender ni modificar dosis. Las alertas clínicas requerirán reglas validadas.</p></div></>;
}
