'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';
import { emptyClinicalRecords, fetchClinicalRecords, type ClinicalRecords } from '@/lib/clinical-records';
import type { FamilyCarePatient } from '@/lib/family-care-session';

const markers = [{ code: 'HGB', label: 'Hemoglobina' }, { code: 'HCT', label: 'Hematocrito' }, { code: 'RETIC', label: 'Reticulocitos' }, { code: 'PLT', label: 'Plaquetas' }, { code: 'WBC', label: 'Leucocitos' }, { code: 'LDH', label: 'LDH' }, { code: 'BILI', label: 'Bilirrubina' }, { code: 'HAPTO', label: 'Haptoglobina' }];

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Panama' }).format(new Date(value));
}

export function Laboratories({ profile, patient, canEdit, onRegister, onNotice, revision }: { profile: string; patient?: FamilyCarePatient; canEdit: boolean; onRegister: () => void; onNotice: Notify; revision: number }) {
  const [loaded, setLoaded] = useState<{ patientId: string; records: ClinicalRecords } | null>(null);
  const [marker, setMarker] = useState('HGB');
  const records = loaded && loaded.patientId === patient?.id ? loaded.records : emptyClinicalRecords;
  const loading = Boolean(patient && loaded?.patientId !== patient.id);

  useEffect(() => {
    if (!patient) return;
    const controller = new AbortController();
    fetchClinicalRecords(patient.id, controller.signal).then((records) => setLoaded({ patientId: patient.id, records })).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onNotice('No fue posible cargar los laboratorios.', 'warning');
    });
    return () => controller.abort();
  }, [patient, revision, onNotice]);

  const series = useMemo(() => records.labReports.flatMap((report) => {
    const result = report.results.find((item) => item.analyteCode === marker && item.valueNumeric !== null);
    return result ? [{ reportId: report.id, date: report.collectedAt, value: result.valueNumeric as number, unit: result.unit || '', low: result.referenceLow, high: result.referenceHigh, abnormal: Boolean(result.abnormalFlag) }] : [];
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [records, marker]);
  const values = series.map((item) => item.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const spread = Math.max(maximum - minimum, Math.abs(maximum) * 0.15, 1);
  const change = series.length > 1 ? series[series.length - 1].value - series[series.length - 2].value : null;
  const register = () => canEdit ? onRegister() : onNotice('Selecciona una persona con permiso de edición.', 'warning');

  return <><PageHeading eyebrow="LABORATORIOS" title={`Evolución clínica de ${profile}`} copy="Registra resultados revisados, conserva el informe original y compara cada marcador por fecha." action={<button className="primary-action" type="button" onClick={register}>＋ Registrar hemograma</button>} /><div className="content-grid wide-main"><section className="panel module-panel"><div className="marker-tabs">{markers.map((item) => <button key={item.code} type="button" className={marker === item.code ? 'filter-pill active' : 'filter-pill'} onClick={() => setMarker(item.code)}>{item.label}</button>)}</div>{!patient ? <div className="empty-clinical"><strong>Selecciona una persona</strong><p>La evolución se muestra por expediente individual.</p></div> : loading ? <div className="empty-clinical"><strong>Cargando resultados…</strong></div> : series.length ? <><div className="panel-heading"><div><p className="eyebrow">{markers.find((item) => item.code === marker)?.label.toUpperCase()}</p><h2>{series.length} mediciones confirmadas</h2></div>{change !== null && <span className={change < 0 ? 'trend-chip down' : 'trend-chip'}>{change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toLocaleString('es-PA', { maximumFractionDigits: 2 })} desde el anterior</span>}</div><div className="lab-chart real-chart">{series.map((point) => <div className={point.abnormal ? 'lab-point abnormal' : 'lab-point'} key={point.reportId}><span className="lab-value">{point.value}</span><div className="lab-stick" style={{ height: `${35 + ((point.value - minimum) / spread) * 115}px` }}><i /></div><small>{shortDate(point.date)}</small></div>)}</div><div className="lab-table"><div className="table-row lab-result-head"><span>Fecha</span><span>Resultado</span><span>Rango del laboratorio</span><span>Estado</span></div>{[...series].reverse().map((row) => <div className="table-row lab-result-head" key={row.reportId}><strong>{shortDate(row.date)}</strong><span>{row.value} {row.unit}</span><span>{row.low ?? '—'} – {row.high ?? '—'} {row.unit}</span><span className={row.abnormal ? 'range-status outside' : 'range-status'}>{row.abnormal ? 'Fuera del rango' : 'Sin marca'}</span></div>)}</div></> : <div className="empty-clinical"><strong>Aún no hay resultados de {markers.find((item) => item.code === marker)?.label.toLowerCase()}</strong><p>Registra un hemograma y confirma los valores del informe.</p><button className="secondary-action" type="button" onClick={register}>Registrar primer resultado</button></div>}</section><aside className="panel side-summary"><p className="eyebrow">SEGUIMIENTO SEGURO</p><h2>Comparación, no diagnóstico</h2><p className="body-copy">Cada valor conserva su unidad y el rango impreso por el laboratorio. Una marca solo indica que quedó fuera de ese rango.</p><div className="compression-stat"><strong>R2</strong><span>original protegido + vista móvil comprimida</span></div><div className="clinical-warning"><strong>Importante</strong><p>Los cambios de tratamiento y la interpretación corresponden al médico tratante.</p></div></aside></div></>;
}
