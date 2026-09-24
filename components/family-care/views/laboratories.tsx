'use client';
import { useEffect, useMemo, useState } from 'react';
import { LabSummaryModal } from '@/components/family-care/lab-summary-modal';
import { LabResultEditor } from '@/components/family-care/lab-result-editor';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { emptyClinicalRecords, fetchClinicalRecords, type ClinicalRecords, type LabReport, type LabResult } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';
const markers = [{ code: 'HGB', label: 'Hemoglobina' }, { code: 'HCT', label: 'Hematocrito' }, { code: 'RETIC', label: 'Reticulocitos' }, { code: 'PLT', label: 'Plaquetas' }, { code: 'WBC', label: 'Leucocitos' }, { code: 'LDH', label: 'LDH' }, { code: 'BILI', label: 'Bilirrubina' }, { code: 'HAPTO', label: 'Haptoglobina' }];
function shortDate(value: string) {
    return new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Panama' }).format(new Date(value));
}
export function Laboratories({ profile, patient, canEdit, canExport, onRegister, onNotice, revision }: {
    profile: string;
    patient?: FamilyCarePatient;
    canEdit: boolean;
    canExport: boolean;
    onRegister: () => void;
    onNotice: Notify;
    revision: number;
}) {
    const [loaded, setLoaded] = useState<{
        patientId: string;
        records: ClinicalRecords;
    } | null>(null);
    const [marker, setMarker] = useState('HGB');
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [reviewBusy, setReviewBusy] = useState<string | null>(null);
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
    const [editing, setEditing] = useState<{
        report: LabReport;
        result: LabResult;
    } | null>(null);
    const [localRevision, setLocalRevision] = useState(0);
    const records = loaded && loaded.patientId === patient?.id ? loaded.records : emptyClinicalRecords;
    const loading = Boolean(patient && loaded?.patientId !== patient.id);
    useEffect(() => {
        if (!patient)
            return;
        const controller = new AbortController();
        fetchClinicalRecords(patient.id, controller.signal).then((records) => setLoaded({ patientId: patient.id, records })).catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                onNotice('No fue posible cargar los laboratorios.', 'warning');
        });
        return () => controller.abort();
    }, [patient, revision, localRevision, onNotice]);
    useEffect(() => { setSummaryOpen(false); setEditing(null); setExpandedReportId(null); }, [patient?.id]);
    function refreshAfterCorrection(message: string, tone: 'success' | 'warning' = 'success') {
        setEditing(null);
        setLoaded(null);
        setLocalRevision((value) => value + 1);
        onNotice(message, tone);
    }
    const series = useMemo(() => records.labReports.flatMap((report) => {
        const result = report.results.find((item) => item.analyteCode === marker && item.valueNumeric !== null);
        return result ? [{ reportId: report.id, date: report.collectedAt, value: result.valueNumeric as number, unit: result.unit || '', low: result.referenceLow, high: result.referenceHigh, abnormal: Boolean(result.abnormalFlag) }] : [];
    }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [records, marker]);
    const values = series.map((item) => item.value);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const spread = Math.max(maximum - minimum, Math.abs(maximum) * 0.15, 1);
    const comparableUnits = new Set(series.map((item) => item.unit.trim().toLowerCase())).size <= 1;
    const change = comparableUnits && series.length > 1 ? series[series.length - 1].value - series[series.length - 2].value : null;
    const register = () => canEdit ? onRegister() : onNotice('Selecciona una persona con permiso de edición.', 'warning');
    async function changeReview(reportId: string, reviewed: boolean) {
        if (!patient || !canEdit)
            return;
        setReviewBusy(reportId);
        try {
            const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/lab-reports/${encodeURIComponent(reportId)}/review`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ reviewed }),
            });
            if (!response.ok)
                throw new Error('review_update_failed');
            setLoaded((current) => current?.patientId === patient.id ? {
                patientId: current.patientId,
                records: { ...current.records, labReports: current.records.labReports.map((report) => report.id === reportId ? { ...report, reviewedByUser: reviewed } : report) },
            } : current);
            onNotice(reviewed ? 'Hemograma marcado como revisado por la familia.' : 'La marca de revisión se retiró.');
        }
        catch {
            onNotice('No fue posible actualizar la marca de revisión.', 'warning');
        }
        finally {
            setReviewBusy(null);
        }
    }
    return <>
    <PageHeading eyebrow="LABORATORIOS" title={`Evolución clínica de ${profile}`} copy="Compara resultados por fecha, revisa cada informe y prepara un resumen para el médico." action={<div className="heading-actions">{patient && canExport && records.labReports.length > 0 && <button className="secondary-action" type="button" onClick={() => setSummaryOpen(true)}>Resumen para el médico</button>}<button className="primary-action" type="button" onClick={register}>＋ Registrar hemograma</button></div>}/>
    <div className="content-grid wide-main">
      <section className="panel module-panel">
        <div className="marker-tabs">{markers.map((item) => <button key={item.code} type="button" className={marker === item.code ? 'filter-pill active' : 'filter-pill'} onClick={() => setMarker(item.code)}>{item.label}</button>)}</div>
        {!patient ? <div className="empty-clinical"><strong>Selecciona una persona</strong><p>La evolución se muestra por expediente individual.</p></div>
            : loading ? <div className="empty-clinical"><strong>Cargando resultados…</strong></div>
                : series.length ? <>
              <div className="panel-heading"><div><p className="eyebrow">{markers.find((item) => item.code === marker)?.label.toUpperCase()}</p><h2>{series.length} mediciones registradas</h2></div>{change !== null && <span className={change < 0 ? 'trend-chip down' : 'trend-chip'}>{change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toLocaleString('es-PA', { maximumFractionDigits: 2 })} desde la anterior</span>}</div>
              {comparableUnits ? <div className="lab-chart real-chart">{series.map((point) => <div className={point.abnormal ? 'lab-point abnormal' : 'lab-point'} key={point.reportId}><span className="lab-value">{point.value}</span><div className="lab-stick" style={{ height: `${35 + ((point.value - minimum) / spread) * 115}px` }}><i /></div><small>{shortDate(point.date)}</small></div>)}</div> : <p className="lab-units-warning">Estos informes usan unidades distintas. Consulta los valores en la tabla; no se muestra una gráfica conjunta.</p>}
              <div className="lab-table"><div className="table-row lab-result-head"><span>Fecha</span><span>Resultado</span><span>Rango del laboratorio</span><span>Estado</span></div>{[...series].reverse().map((row) => <div className="table-row lab-result-head" key={row.reportId}><strong>{shortDate(row.date)}</strong><span>{row.value} {row.unit}</span><span>{row.low ?? '—'} – {row.high ?? '—'} {row.unit}</span><span className={row.abnormal ? 'range-status outside' : 'range-status'}>{row.abnormal ? 'Fuera del rango' : 'Sin marca'}</span></div>)}</div>
            </> : <div className="empty-clinical"><strong>Aún no hay resultados de {markers.find((item) => item.code === marker)?.label.toLowerCase()}</strong><p>Registra un hemograma y confirma los valores del informe.</p><button className="secondary-action" type="button" onClick={register}>Registrar primer resultado</button></div>}
        {patient && !loading && records.labReports.length > 0 && <div className="lab-review-list"><div className="lab-review-heading"><h2>Informes registrados</h2><p>La marca de revisión confirma que una persona de la familia comparó los datos con el original; no es una validación médica.</p></div>{records.labReports.map((report) => <article className="lab-review-item" key={report.id}><div><strong>{shortDate(report.collectedAt)}</strong><span>{report.laboratoryName || 'Laboratorio no registrado'} · {report.results.length} valores</span></div><span className={report.reviewedByUser ? 'review-badge reviewed' : 'review-badge'}>{report.reviewedByUser ? 'Revisado por la familia' : 'Pendiente de revisión'}</span><button type="button" aria-expanded={expandedReportId === report.id} onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)}>{expandedReportId === report.id ? 'Ocultar valores' : 'Ver valores'}</button>{canEdit && report.source !== 'healwave' && <button type="button" disabled={reviewBusy !== null} onClick={() => changeReview(report.id, !report.reviewedByUser)}>{reviewBusy === report.id ? 'Guardando…' : report.reviewedByUser ? 'Quitar marca' : 'Marcar revisado'}</button>}{expandedReportId === report.id && <div className="lab-report-values">{report.documentId && <a className="lab-original-link" target="_blank" rel="noreferrer" href={`/api/family-care/documents/${encodeURIComponent(report.documentId)}`}>Ver informe original ↗</a>}{report.source === 'healwave' && <span className="permission-status enabled">Healwave · solo lectura</span>}{report.results.map((result) => <div className="lab-report-value" key={result.id}><span><strong>{result.analyteName}</strong><small>{result.valueNumeric ?? result.valueText ?? '—'} {result.unit || ''} · Rango: {result.referenceLow ?? '—'}–{result.referenceHigh ?? '—'} {result.unit || ''}</small>{result.correctedByFamily && <small>Transcripción corregida por la familia</small>}</span>{canEdit && report.source !== 'healwave' && <button type="button" onClick={() => setEditing({ report, result })}>Corregir</button>}</div>)}</div>}</article>)}</div>}
      </section>
      <aside className="panel side-summary"><p className="eyebrow">SEGUIMIENTO SEGURO</p><h2>Comparación, no diagnóstico</h2><p className="body-copy">Cada valor conserva su unidad y el rango impreso por el laboratorio. Una marca solo indica que quedó fuera de ese rango.</p><div className="compression-stat"><strong>R2</strong><span>original protegido + vista móvil comprimida</span></div><div className="clinical-warning"><strong>Importante</strong><p>Los cambios de tratamiento y la interpretación corresponden al médico tratante.</p></div></aside>
    </div>
    {summaryOpen && patient && canExport && <LabSummaryModal patientName={patient.legalName} reports={records.labReports} onClose={() => setSummaryOpen(false)}/>}
    {editing && patient && canEdit && <LabResultEditor patient={patient} report={editing.report} result={editing.result} onClose={() => setEditing(null)} onSaved={() => refreshAfterCorrection('Valor corregido. Compara nuevamente el informe original y marca el hemograma como revisado.')} onConflict={() => refreshAfterCorrection('Otra persona cambió este valor. Se recargaron los datos; revisa antes de corregirlo.', 'warning')}/>}
  </>;
}
