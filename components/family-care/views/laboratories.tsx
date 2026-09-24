'use client';
import { useEffect, useMemo, useState } from 'react';
import { LabSummaryModal } from '@/components/family-care/lab-summary-modal';
import { LabResultEditor } from '@/components/family-care/lab-result-editor';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { emptyClinicalRecords, fetchClinicalRecords, type ClinicalRecords, type LabReport, type LabResult } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

type Marker = { code: string; label: string; aliases: string[] };
type LabFocus = 'auto' | 'rheumatology' | 'hematology';

const hematologyMarkers: Marker[] = [
    { code: 'HGB', label: 'Hemoglobina', aliases: ['HGB', 'HEMOGLOBINA'] },
    { code: 'HCT', label: 'Hematocrito', aliases: ['HCT', 'HEMATOCRITO'] },
    { code: 'RETIC', label: 'Reticulocitos', aliases: ['RETIC', 'RETICULOCITOS'] },
    { code: 'PLT', label: 'Plaquetas', aliases: ['PLT', 'PLAQUETAS'] },
    { code: 'WBC', label: 'Leucocitos', aliases: ['WBC', 'LEUCOCITOS'] },
    { code: 'LDH', label: 'LDH', aliases: ['LDH', 'LACTATO DESHIDROGENASA'] },
    { code: 'BILI', label: 'Bilirrubina', aliases: ['BILI', 'BILIRRUBINA', 'BILIRRUBINA TOTAL'] },
    { code: 'HAPTO', label: 'Haptoglobina', aliases: ['HAPTO', 'HAPTOGLOBINA'] },
];

const rheumatologyGroups: Array<{ title: string; copy: string; markers: Marker[] }> = [
    {
        title: 'Inflamación', copy: 'Apoya el seguimiento de actividad junto con síntomas y examen clínico.', markers: [
            { code: 'CRP', label: 'Proteína C reactiva', aliases: ['CRP', 'PCR', 'PROTEINA C REACTIVA', 'PROTEINA C-REACTIVA'] },
            { code: 'ESR', label: 'VSG', aliases: ['ESR', 'VSG', 'VELOCIDAD DE SEDIMENTACION', 'VELOCIDAD DE SEDIMENTACION GLOBULAR'] },
        ],
    },
    {
        title: 'Autoinmunidad', copy: 'Marcadores diagnósticos o pronósticos; no equivalen por sí solos a actividad actual.', markers: [
            { code: 'RF', label: 'Factor reumatoide', aliases: ['RF', 'FR', 'FACTOR REUMATOIDE'] },
            { code: 'ANTI_CCP', label: 'Anti-CCP', aliases: ['ANTI CCP', 'ANTI-CCP', 'ANTI_CCP', 'ACPA', 'ANTICUERPOS ANTI CCP', 'ANTICUERPO ANTI CCP'] },
        ],
    },
    {
        title: 'Seguridad del tratamiento', copy: 'Agrupa controles hematológicos, hepáticos y renales cuando estén disponibles.', markers: [
            { code: 'WBC', label: 'Leucocitos', aliases: ['WBC', 'LEUCOCITOS'] },
            { code: 'HGB', label: 'Hemoglobina', aliases: ['HGB', 'HEMOGLOBINA'] },
            { code: 'PLT', label: 'Plaquetas', aliases: ['PLT', 'PLAQUETAS'] },
            { code: 'ALT', label: 'ALT / TGP', aliases: ['ALT', 'TGP', 'ALAT', 'ALANINO AMINOTRANSFERASA', 'TRANSAMINASA GLUTAMICO PIRUVICA'] },
            { code: 'AST', label: 'AST / TGO', aliases: ['AST', 'TGO', 'ASAT', 'ASPARTATO AMINOTRANSFERASA', 'TRANSAMINASA GLUTAMICO OXALACETICA'] },
            { code: 'CREA', label: 'Creatinina', aliases: ['CREA', 'CREAT', 'CREATININA'] },
            { code: 'EGFR', label: 'TFG estimada', aliases: ['EGFR', 'TFG', 'TFGE', 'FILTRADO GLOMERULAR', 'TASA DE FILTRACION GLOMERULAR'] },
        ],
    },
];
const rheumatologyMarkers = rheumatologyGroups.flatMap((group) => group.markers);

function normalized(value: string | null | undefined) {
    return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function matchesMarker(result: LabResult, marker: Marker) {
    const values = [normalized(result.analyteCode), normalized(result.analyteName)];
    return marker.aliases.some((alias) => values.includes(normalized(alias)));
}
function shortDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Panama' }).format(date);
}
function latestResult(reports: LabReport[], marker: Marker) {
    return reports.flatMap((report) => report.results.filter((result) => matchesMarker(result, marker)).map((result) => ({ report, result }))).sort((a, b) => Date.parse(b.report.collectedAt) - Date.parse(a.report.collectedAt))[0] || null;
}
function resultReading(result: LabResult) {
    return `${result.valueNumeric ?? result.valueText ?? '—'}${result.unit ? ` ${result.unit}` : ''}`;
}

function RheumatologyOverview({ records }: { records: ClinicalRecords }) {
    const activity = records.healwave.profile?.disease_activity?.trim();
    const updatedAt = records.healwave.profile?.updated_at;
    const clinicalMeasures: Marker[] = [
        { code: 'DAS28', label: 'DAS28', aliases: ['DAS28', 'DAS 28', 'DAS28 CRP', 'DAS28 ESR', 'DAS28 PCR', 'DAS28 VSG'] },
        { code: 'CDAI', label: 'CDAI', aliases: ['CDAI'] },
        { code: 'SDAI', label: 'SDAI', aliases: ['SDAI'] },
        { code: 'RAPID3', label: 'RAPID3', aliases: ['RAPID3', 'RAPID 3'] },
    ];
    return <div className="rheumatology-overview">
      <div className="rheumatology-heading"><div><p className="eyebrow">SEGUIMIENTO REUMATOLÓGICO</p><h2>Artritis reumatoide</h2><p>Vista organizada con los datos reales del expediente y de Healwave.</p></div><span className="healwave-inline">Healwave · solo lectura</span></div>
      <div className="rheumatology-summary-grid">
        <article className="disease-activity-card"><small>ACTIVIDAD CONSIGNADA</small><strong>{activity || 'Sin registro'}</strong><span>{updatedAt ? `Actualizado ${shortDate(updatedAt)}` : activity ? 'Sin fecha clínica disponible' : 'Pendiente de registrar en Healwave'}</span></article>
        <article className="clinical-score-card"><div><small>EVALUACIONES CLÍNICAS</small><strong>Actividad compuesta</strong><p>DAS28, CDAI, SDAI y RAPID3 combinan información clínica; Family Care no los estima con resultados incompletos.</p></div><div className="score-list">{clinicalMeasures.map((measure) => { const latest = latestResult(records.labReports, measure); return <span key={measure.code}><b>{measure.label}</b><em>{latest ? resultReading(latest.result) : 'No registrado'}</em></span>; })}</div></article>
      </div>
      <div className="rheumatology-groups">{rheumatologyGroups.map((group) => <section key={group.title} className="rheumatology-group"><div><h3>{group.title}</h3><p>{group.copy}</p></div><div className="rheumatology-marker-grid">{group.markers.map((item) => { const latest = latestResult(records.labReports, item); return <article className={latest?.result.abnormalFlag ? 'rheumatology-marker flagged' : 'rheumatology-marker'} key={item.code}><small>{item.label}</small><strong>{latest ? resultReading(latest.result) : 'Sin registros'}</strong><span>{latest ? `${shortDate(latest.report.collectedAt)} · ${latest.report.source === 'healwave' ? 'Healwave' : 'Family Care'}` : 'Se mostrará al estar disponible'}</span></article>; })}</div></section>)}</div>
    </div>;
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
    const [loaded, setLoaded] = useState<{ patientId: string; records: ClinicalRecords } | null>(null);
    const [marker, setMarker] = useState<{ patientId: string; code: string } | null>(null);
    const [focus, setFocus] = useState<{ patientId: string; value: LabFocus } | null>(null);
    const [summaryPatientId, setSummaryPatientId] = useState<string | null>(null);
    const [reviewBusy, setReviewBusy] = useState<string | null>(null);
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ patientId: string; report: LabReport; result: LabResult } | null>(null);
    const [localRevision, setLocalRevision] = useState(0);
    const records = loaded && loaded.patientId === patient?.id ? loaded.records : emptyClinicalRecords;
    const loading = Boolean(patient && loaded?.patientId !== patient.id);
    const hasRheumatology = records.healwave.status === 'connected';
    const selectedFocus = focus && focus.patientId === patient?.id ? focus.value : 'auto';
    const selectedMarker = marker && marker.patientId === patient?.id ? marker.code : 'HGB';
    const effectiveFocus = selectedFocus === 'auto' ? (hasRheumatology ? 'rheumatology' : 'hematology') : selectedFocus;
    const activeMarkers = effectiveFocus === 'rheumatology' ? rheumatologyMarkers : hematologyMarkers;
    const activeMarker = activeMarkers.find((item) => item.code === selectedMarker) || activeMarkers[0];

    useEffect(() => {
        if (!patient) return;
        const controller = new AbortController();
        fetchClinicalRecords(patient.id, controller.signal).then((records) => setLoaded({ patientId: patient.id, records })).catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === 'AbortError')) onNotice('No fue posible cargar los laboratorios.', 'warning');
        });
        return () => controller.abort();
    }, [patient, revision, localRevision, onNotice]);
    function refreshAfterCorrection(message: string, tone: 'success' | 'warning' = 'success') {
        setEditing(null);
        setLoaded(null);
        setLocalRevision((value) => value + 1);
        onNotice(message, tone);
    }
    const series = useMemo(() => records.labReports.flatMap((report) => {
        const result = report.results.find((item) => matchesMarker(item, activeMarker) && item.valueNumeric !== null);
        return result ? [{ reportId: report.id, date: report.collectedAt, value: result.valueNumeric as number, unit: result.unit || '', low: result.referenceLow, high: result.referenceHigh, abnormal: Boolean(result.abnormalFlag) }] : [];
    }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [records, activeMarker]);
    const values = series.map((item) => item.value);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const spread = Math.max(maximum - minimum, Math.abs(maximum) * 0.15, 1);
    const comparableUnits = new Set(series.map((item) => item.unit.trim().toLowerCase())).size <= 1;
    const change = comparableUnits && series.length > 1 ? series[series.length - 1].value - series[series.length - 2].value : null;
    const register = () => canEdit ? onRegister() : onNotice('Selecciona una persona con permiso de edición.', 'warning');

    async function changeReview(reportId: string, reviewed: boolean) {
        if (!patient || !canEdit) return;
        setReviewBusy(reportId);
        try {
            const response = await fetch(`/api/family-care/patients/${encodeURIComponent(patient.id)}/lab-reports/${encodeURIComponent(reportId)}/review`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewed }) });
            if (!response.ok) throw new Error('review_update_failed');
            setLoaded((current) => current?.patientId === patient.id ? { patientId: current.patientId, records: { ...current.records, labReports: current.records.labReports.map((report) => report.id === reportId ? { ...report, reviewedByUser: reviewed } : report) } } : current);
            onNotice(reviewed ? 'Informe marcado como revisado por la familia.' : 'La marca de revisión se retiró.');
        } catch { onNotice('No fue posible actualizar la marca de revisión.', 'warning'); }
        finally { setReviewBusy(null); }
    }

    return <>
      <PageHeading eyebrow="LABORATORIOS" title={`Evolución clínica de ${profile}`} copy="Compara resultados por fecha, revisa cada informe y prepara un resumen para el médico." action={<div className="heading-actions">{patient && canExport && records.labReports.length > 0 && <button className="secondary-action" type="button" onClick={() => setSummaryPatientId(patient.id)}>Resumen para el médico</button>}<button className="primary-action" type="button" onClick={register}>＋ Añadir hemograma</button></div>}/>
      {hasRheumatology && !loading && patient && <div className="lab-focus-switch" role="group" aria-label="Tipo de seguimiento"><button type="button" className={effectiveFocus === 'rheumatology' ? 'active' : ''} onClick={() => { setFocus({ patientId: patient.id, value: 'rheumatology' }); setMarker({ patientId: patient.id, code: 'CRP' }); }}>Reumatología</button><button type="button" className={effectiveFocus === 'hematology' ? 'active' : ''} onClick={() => { setFocus({ patientId: patient.id, value: 'hematology' }); setMarker({ patientId: patient.id, code: 'HGB' }); }}>Hematología</button></div>}
      {hasRheumatology && effectiveFocus === 'rheumatology' && !loading && <RheumatologyOverview records={records}/>}
      <div className="content-grid wide-main">
        <section className="panel module-panel">
          <div className="lab-trend-heading"><div><p className="eyebrow">EVOLUCIÓN POR MARCADOR</p><h2>Comparar mediciones</h2></div><p>Selecciona un marcador para revisar su evolución con la unidad y el rango de cada laboratorio.</p></div>
          <div className="marker-tabs">{activeMarkers.map((item) => <button key={item.code} type="button" className={activeMarker.code === item.code ? 'filter-pill active' : 'filter-pill'} onClick={() => patient && setMarker({ patientId: patient.id, code: item.code })}>{item.label}</button>)}</div>
          {!patient ? <div className="empty-clinical"><strong>Selecciona una persona</strong><p>La evolución se muestra por expediente individual.</p></div>
            : loading ? <div className="empty-clinical"><strong>Cargando resultados…</strong></div>
              : series.length ? <>
                <div className="panel-heading"><div><p className="eyebrow">{activeMarker.label.toUpperCase()}</p><h2>{series.length} mediciones registradas</h2></div>{change !== null && <span className={change < 0 ? 'trend-chip down' : 'trend-chip'}>{change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toLocaleString('es-PA', { maximumFractionDigits: 2 })} desde la anterior</span>}</div>
                {comparableUnits ? <div className="lab-chart real-chart">{series.map((point) => <div className={point.abnormal ? 'lab-point abnormal' : 'lab-point'} key={point.reportId}><span className="lab-value">{point.value}</span><div className="lab-stick" style={{ height: `${35 + ((point.value - minimum) / spread) * 115}px` }}><i /></div><small>{shortDate(point.date)}</small></div>)}</div> : <p className="lab-units-warning">Estos informes usan unidades distintas. Consulta los valores en la tabla; no se muestra una gráfica conjunta.</p>}
                <div className="lab-table"><div className="table-row lab-result-head"><span>Fecha</span><span>Resultado</span><span>Rango del laboratorio</span><span>Estado</span></div>{[...series].reverse().map((row) => <div className="table-row lab-result-head" key={row.reportId}><strong>{shortDate(row.date)}</strong><span>{row.value} {row.unit}</span><span>{row.low ?? '—'} – {row.high ?? '—'} {row.unit}</span><span className={row.abnormal ? 'range-status outside' : 'range-status'}>{row.abnormal ? 'Fuera del rango' : 'Sin marca'}</span></div>)}</div>
              </> : <div className="empty-clinical"><strong>Aún no hay resultados de {activeMarker.label.toLowerCase()}</strong><p>{hasRheumatology && effectiveFocus === 'rheumatology' ? 'Se mostrará aquí cuando el dato esté disponible en Healwave o en un informe del expediente.' : 'Añade un hemograma y confirma los valores del informe.'}</p>{effectiveFocus === 'hematology' && <button className="secondary-action" type="button" onClick={register}>Añadir primer resultado</button>}</div>}
          {patient && !loading && records.labReports.length > 0 && <div className="lab-review-list"><div className="lab-review-heading"><h2>Informes registrados</h2><p>La marca de revisión confirma que una persona de la familia comparó los datos con el original; no es una validación médica.</p></div>{records.labReports.map((report) => <article className="lab-review-item" key={report.id}><div><strong>{report.panelName || 'Informe de laboratorio'} · {shortDate(report.collectedAt)}</strong><span>{report.laboratoryName || 'Laboratorio no registrado'} · {report.results.length} valores</span></div><span className={report.reviewedByUser ? 'review-badge reviewed' : 'review-badge'}>{report.reviewedByUser ? 'Revisado por la familia' : 'Pendiente de revisión'}</span><button type="button" aria-expanded={expandedReportId === report.id} onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)}>{expandedReportId === report.id ? 'Ocultar valores' : 'Ver valores'}</button>{canEdit && report.source !== 'healwave' && <button type="button" disabled={reviewBusy !== null} onClick={() => changeReview(report.id, !report.reviewedByUser)}>{reviewBusy === report.id ? 'Guardando…' : report.reviewedByUser ? 'Quitar marca' : 'Marcar revisado'}</button>}{expandedReportId === report.id && <div className="lab-report-values">{report.documentId && <a className="lab-original-link" target="_blank" rel="noreferrer" href={`/api/family-care/documents/${encodeURIComponent(report.documentId)}`}>Ver informe original ↗</a>}{report.source === 'healwave' && <span className="permission-status enabled">Healwave · solo lectura</span>}{report.results.map((result) => <div className="lab-report-value" key={result.id}><span><strong>{result.analyteName}</strong><small>{resultReading(result)} · Rango: {result.referenceLow ?? '—'}–{result.referenceHigh ?? '—'} {result.unit || ''}</small>{result.correctedByFamily && <small>Transcripción corregida por la familia</small>}</span>{canEdit && report.source !== 'healwave' && <button type="button" onClick={() => setEditing({ patientId: patient.id, report, result })}>Corregir</button>}</div>)}</div>}</article>)}</div>}
        </section>
        <aside className="panel side-summary"><p className="eyebrow">SEGUIMIENTO SEGURO</p><h2>Comparación, no diagnóstico</h2><p className="body-copy">Cada valor conserva su unidad y el rango impreso por el laboratorio. Una marca solo indica que quedó fuera de ese rango.</p>{hasRheumatology && <div className="profile-summary-block"><span>En reumatología</span><p>La actividad clínica, los síntomas y la revisión de articulaciones complementan los análisis. La frecuencia de control depende del tratamiento y del reumatólogo.</p></div>}<div className="compression-stat"><strong>R2</strong><span>original protegido + vista móvil comprimida</span></div><div className="clinical-warning"><strong>Importante</strong><p>Los cambios de tratamiento y la interpretación corresponden al médico tratante.</p></div></aside>
      </div>
      {summaryPatientId === patient?.id && patient && canExport && <LabSummaryModal patientName={patient.legalName} reports={records.labReports} onClose={() => setSummaryPatientId(null)}/>}
      {editing && editing.patientId === patient?.id && patient && canEdit && <LabResultEditor patient={patient} report={editing.report} result={editing.result} onClose={() => setEditing(null)} onSaved={() => refreshAfterCorrection('Valor corregido. Compara nuevamente el informe original y marca el informe como revisado.')} onConflict={() => refreshAfterCorrection('Otra persona cambió este valor. Se recargaron los datos; revisa antes de corregirlo.', 'warning')}/>}
    </>;
}
