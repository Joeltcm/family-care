'use client';

import { createPortal } from 'react-dom';
import type { LabReport, LabResult } from '@/lib/clinical-records';

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Panama' }).format(new Date(value));
}

function resultValue(result: LabResult) {
  return `${result.valueNumeric ?? result.valueText ?? '—'}${result.unit ? ` ${result.unit}` : ''}`;
}

function referenceRange(result: LabResult) {
  if (result.referenceLow === null && result.referenceHigh === null) return 'No informado';
  if (result.referenceLow === null) return `Hasta ${result.referenceHigh}${result.unit ? ` ${result.unit}` : ''}`;
  if (result.referenceHigh === null) return `Desde ${result.referenceLow}${result.unit ? ` ${result.unit}` : ''}`;
  return `${result.referenceLow}–${result.referenceHigh}${result.unit ? ` ${result.unit}` : ''}`;
}

export function LabSummaryModal({ patientName, reports, onClose }: { patientName: string; reports: LabReport[]; onClose: () => void }) {
  const ordered = [...reports].sort((a, b) => Date.parse(a.collectedAt) - Date.parse(b.collectedAt));
  const reviewedCount = ordered.filter((report) => report.reviewedByUser).length;

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="modal-backdrop lab-summary-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="lab-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="lab-summary-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="lab-summary-actions"><button type="button" onClick={onClose}>Cerrar</button><button className="primary-action" type="button" onClick={() => window.print()}>Imprimir o guardar en PDF</button></div>
      <div className="lab-summary-print">
        <header className="lab-summary-header"><p>FAMILY CARE · RESUMEN DE LABORATORIOS</p><h2 id="lab-summary-title">Evolución de hemogramas</h2><strong>{patientName}</strong><span>Preparado el {dateLabel(new Date().toISOString())}</span></header>
        <div className="lab-summary-stats"><span>{ordered.length} informes registrados</span><span>{reviewedCount} revisados por la familia</span><span>{ordered.length - reviewedCount} pendientes de revisión</span></div>
        <p className="lab-summary-disclaimer">Este resumen transcribe resultados registrados en Family Care. No constituye diagnóstico ni indica cambios de tratamiento. Contrasta cada dato con el informe original y consulta al médico tratante.</p>
        {ordered.map((report) => <section className="lab-summary-report" key={report.id}>
          <div className="lab-summary-report-heading"><div><h3>{dateLabel(report.collectedAt)}</h3><p>{report.laboratoryName || 'Laboratorio no registrado'} · {report.panelName}</p></div><span className={report.reviewedByUser ? 'review-badge reviewed' : 'review-badge'}>{report.reviewedByUser ? 'Revisado por la familia' : 'Pendiente de revisión'}</span></div>
          <table><thead><tr><th>Prueba</th><th>Resultado</th><th>Rango del informe</th></tr></thead><tbody>{report.results.map((result) => <tr key={result.id}><td>{result.analyteName}</td><td>{resultValue(result)}</td><td>{referenceRange(result)}</td></tr>)}</tbody></table>
          <p className="lab-summary-source">{report.documentId ? 'Informe original adjunto al expediente.' : 'No hay informe original adjunto a este registro.'}</p>
        </section>)}
      </div>
    </section>
  </div>, document.body);
}
