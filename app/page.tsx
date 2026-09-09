'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import {
  appointments,
  documents,
  hemogramSeries,
  medications,
  metrics,
  monthlyVisits,
  navigation,
  profiles,
  type ProfileId,
  type SectionId,
} from '@/lib/demo-data';

type Notice = { tone: 'success' | 'info'; text: string } | null;

export default function Home() {
  const [activeProfile, setActiveProfile] = useState<ProfileId>('familia');
  const [activeSection, setActiveSection] = useState<SectionId>('inicio');
  const [sosOpen, setSosOpen] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedProfile = profiles.find((profile) => profile.id === activeProfile) ?? profiles[0];

  function navigate(section: SectionId) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showNotice(text: string, tone: Notice['tone'] = 'success') {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 4200);
  }

  function handleDemoUpload(file?: File) {
    if (file) showNotice(`${file.name} preparado para compresión y revisión. No se guardó ningún dato real.`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" type="button" onClick={() => navigate('inicio')}>
          <Image src="/app-icon.png" alt="" width={43} height={43} className="brand-icon" priority />
          <span><strong>Family Care</strong><small>Salud en familia</small></span>
        </button>
        <nav aria-label="Navegación principal" className="main-nav">
          <p className="nav-heading">TU ESPACIO</p>
          {navigation.map((item) => <button key={item.id} className={activeSection === item.id ? 'nav-item active' : 'nav-item'} type="button" onClick={() => navigate(item.id)}><span className="nav-symbol" aria-hidden="true">{item.symbol}</span>{item.label}{'badge' in item && <span className="nav-badge">{item.badge}</span>}</button>)}
        </nav>
        <div className="sidebar-support"><div className="shield-mark">✓</div><div><strong>Información protegida</strong><span>Acceso familiar privado</span></div></div>
        <button className="user-card" type="button"><span className="avatar avatar-joel">JT</span><span><strong>Joel</strong><small>Administrador familiar</small></span><span className="more">•••</span></button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-brand" type="button" onClick={() => navigate('inicio')}><Image src="/app-icon.png" alt="" width={34} height={34} priority /><strong>Family Care</strong></button>
          <div className="profile-switcher" aria-label="Cambiar perfil">{profiles.map((profile) => <button key={profile.id} type="button" className={activeProfile === profile.id ? 'profile-chip active' : 'profile-chip'} onClick={() => setActiveProfile(profile.id)} aria-pressed={activeProfile === profile.id}><span style={{ background: profile.color }}>{profile.initials}</span>{profile.name}</button>)}</div>
          <div className="top-actions"><span className="demo-chip">Datos de demostración</span><button className="icon-button" type="button" aria-label="Buscar">⌕</button><button className="icon-button notification-button" type="button" aria-label="Notificaciones">◌<span /></button></div>
        </header>

        <div className="dashboard">
          {activeSection === 'inicio' && <Dashboard profile={selectedProfile.name} family={activeProfile === 'familia'} onNavigate={navigate} />}
          {activeSection === 'expedientes' && <Records profile={selectedProfile.name} onNotice={showNotice} />}
          {activeSection === 'laboratorios' && <Laboratories profile={selectedProfile.name} onUpload={() => fileInput.current?.click()} />}
          {activeSection === 'medicamentos' && <Medications onNotice={showNotice} />}
          {activeSection === 'calendario' && <Calendar onNotice={showNotice} />}
          {activeSection === 'documentos' && <Documents onUpload={() => fileInput.current?.click()} />}
          {activeSection === 'seguros' && <Insurance onNotice={showNotice} />}
        </div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/*,.pdf" onChange={(event) => handleDemoUpload(event.target.files?.[0])} />
        <button className="sos-button" type="button" onClick={() => setSosOpen(true)} aria-label="Abrir alerta SOS familiar"><span>SOS</span><small>Emergencia</small></button>
        <nav className="mobile-nav" aria-label="Navegación móvil">{navigation.slice(0, 4).map((item) => <button key={item.id} type="button" className={activeSection === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.symbol}</span>{item.label}</button>)}</nav>
      </main>
      {notice && <div className={`toast ${notice.tone}`} role="status">✓ {notice.text}</div>}
      {sosOpen && <SosModal person={selectedProfile.name} sent={sosSent} onSend={() => { setSosSent(true); window.setTimeout(() => setSosSent(false), 5000); }} onClose={() => setSosOpen(false)} />}
    </div>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="welcome-row section-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="welcome-copy">{copy}</p></div>{action}</section>;
}

function Dashboard({ profile, family, onNavigate }: { profile: string; family: boolean; onNavigate: (id: SectionId) => void }) {
  return <>
    <PageHeading eyebrow="MARTES, 8 DE SEPTIEMBRE" title={family ? 'Buenos días, Joel' : `Resumen de ${profile}`} copy={family ? 'Aquí tienes una vista clara de la salud de tu familia.' : 'Consulta próximos controles, evolución y documentos importantes.'} action={<div className="period-control"><button type="button">‹</button><span>Resumen 2026</span><button type="button">›</button></div>} />
    <section className="metric-grid" aria-label="Resumen anual">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-topline"><span className="metric-dot" /><span>Este año</span></div><strong>{metric.value}</strong><h2>{metric.label}</h2><p>{metric.detail}</p></article>)}</section>
    <section className="dashboard-grid"><div className="primary-column">
      <article className="panel care-panel"><div className="panel-heading"><div><p className="eyebrow">SEGUIMIENTO ACTIVO</p><h2>Planes de cuidado</h2></div><button type="button" className="text-button" onClick={() => onNavigate('expedientes')}>Ver todos</button></div><div className="care-list">
        <button className="care-item daughter" type="button" onClick={() => onNavigate('laboratorios')}><span className="care-person"><span className="avatar avatar-sofia">SC</span><span><strong>Sofía</strong><small>Seguimiento hematológico</small></span></span><span className="care-reading"><small>Última hemoglobina</small><strong>10.8 <small>g/dL</small></strong><em>↑ 1.4 desde julio</em></span><span className="care-next"><small>Próximo control</small><strong>12 sep.</strong><small>en 4 días</small></span><span className="round-link">›</span></button>
        <button className="care-item wife" type="button" onClick={() => onNavigate('expedientes')}><span className="care-person"><span className="avatar avatar-maria">MC</span><span><strong>María</strong><small>Artritis reumatoide</small></span></span><span className="care-reading"><small>Estado reciente</small><strong className="status-stable">Estable</strong><em>Sin brotes en 21 días</em></span><span className="healwave-source"><i className="source-pulse" /><span><small>Fuente externa</small><strong>Healwave</strong><small>Solo lectura</small></span></span><span className="round-link">›</span></button>
      </div></article>
      <article className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD FAMILIAR</p><h2>Atención médica durante el año</h2></div><div className="legend"><span /> Consultas y controles</div></div><div className="bar-chart">{monthlyVisits.map((value, index) => <div className="bar-column" key={index}><div className="bar-track"><div className="bar-fill" style={{ height: `${value * 6}px` }} /></div><span>{'EFMAMJJASOND'[index]}</span></div>)}</div></article>
    </div><aside className="secondary-column"><AppointmentsCard onOpen={() => onNavigate('calendario')} /><article className="panel quick-panel"><p className="eyebrow">ACCESO RÁPIDO</p><h2>¿Qué deseas registrar?</h2><div className="quick-grid"><button type="button" onClick={() => onNavigate('expedientes')}><span>＋</span>Consulta</button><button type="button" onClick={() => onNavigate('laboratorios')}><span>↥</span>Laboratorio</button><button type="button" onClick={() => onNavigate('medicamentos')}><span>◷</span>Medicamento</button><button type="button" onClick={() => onNavigate('documentos')}><span>▣</span>Documento</button></div></article></aside></section>
  </>;
}

function Records({ profile, onNotice }: { profile: string; onNotice: (text: string) => void }) {
  const timeline = [
    { date: '27 AGO 2026', title: 'Hemograma de control', meta: 'Laboratorio · Sofía', copy: 'Resultados estructurados y documento original asociados al seguimiento hematológico.', tag: 'Laboratorio' },
    { date: '14 AGO 2026', title: 'Consulta de reumatología', meta: 'Reumatología · María', copy: 'Resumen proveniente de Healwave. Fuente externa marcada como solo lectura.', tag: 'Healwave' },
    { date: '03 JUL 2026', title: 'Hospitalización', meta: 'Hematología pediátrica · Sofía', copy: 'Episodio con ingreso, alta, indicaciones, medicamentos y documentos relacionados.', tag: 'Hospitalización' },
  ];
  return <><PageHeading eyebrow="EXPEDIENTE LONGITUDINAL" title={`Historia clínica de ${profile}`} copy="Consultas, hospitalizaciones, especialistas, diagnósticos y archivos en una sola línea de tiempo." action={<button className="primary-action" onClick={() => onNotice('Formulario de consulta preparado en modo demostración.')} type="button">＋ Registrar atención</button>} /><div className="content-grid wide-main"><section className="panel module-panel"><div className="filter-row"><button className="filter-pill active" type="button">Todo</button><button className="filter-pill" type="button">Consultas</button><button className="filter-pill" type="button">Hospitalizaciones</button><button className="filter-pill" type="button">Especialistas</button></div><div className="timeline">{timeline.map((entry) => <article className="timeline-item" key={entry.title}><div className="timeline-dot" /><div><span>{entry.date}</span><h2>{entry.title}</h2><p>{entry.meta}</p><small>{entry.copy}</small></div><em>{entry.tag}</em></article>)}</div></section><aside className="panel side-summary"><p className="eyebrow">COBERTURA DEL EXPEDIENTE</p><h2>Información clínica completa</h2>{['Antecedentes y alergias', 'Diagnósticos y condiciones', 'Consultas de cualquier especialidad', 'Hospitalizaciones y procedimientos', 'Recetas, referencias y adjuntos'].map((item) => <p className="check-row" key={item}><span>✓</span>{item}</p>)}<div className="readonly-note"><strong>Healwave</strong><p>La futura integración consultará una fuente secundaria de solo lectura. Family Care nunca escribirá en producción.</p></div></aside></div></>;
}

function Laboratories({ profile, onUpload }: { profile: string; onUpload: () => void }) {
  const max = Math.max(...hemogramSeries.map((item) => item.hb));
  return <><PageHeading eyebrow="LABORATORIOS" title={`Evolución clínica de ${profile}`} copy="Carga hemogramas, conserva el documento original y compara valores estructurados por fecha." action={<button className="primary-action" type="button" onClick={onUpload}>↥ Subir hemograma</button>} /><div className="content-grid wide-main"><section className="panel module-panel"><div className="panel-heading"><div><p className="eyebrow">HEMOGLOBINA</p><h2>Tendencia de demostración</h2></div><span className="safe-chip">↑ 14.9% desde julio</span></div><div className="lab-chart">{hemogramSeries.map((point) => <div className="lab-point" key={point.date}><span className="lab-value">{point.hb}</span><div className="lab-stick" style={{ height: `${(point.hb / max) * 150}px` }}><i /></div><small>{point.date}</small></div>)}</div><div className="lab-table"><div className="table-row table-head"><span>Fecha</span><span>Hemoglobina</span><span>Plaquetas</span><span>Leucocitos</span></div>{hemogramSeries.map((row) => <div className="table-row" key={row.date}><strong>{row.date}</strong><span>{row.hb} g/dL</span><span>{row.platelets} mil/µL</span><span>{row.leukocytes} mil/µL</span></div>)}</div></section><aside className="panel side-summary"><p className="eyebrow">CARGA INTELIGENTE</p><h2>Almacenamiento optimizado</h2><p className="body-copy">Las imágenes se redimensionarán y convertirán a WebP/AVIF; los PDF se optimizarán sin eliminar el original cuando tenga valor clínico.</p><div className="compression-stat"><strong>−68%</strong><span>ahorro estimado en imágenes</span></div><div className="clinical-warning"><strong>Importante</strong><p>Las tendencias no diagnostican. Los rangos y alertas deben ser configurados o validados por el médico tratante.</p></div></aside></div></>;
}

function Medications({ onNotice }: { onNotice: (text: string) => void }) {
  return <><PageHeading eyebrow="MEDICAMENTOS" title="Tratamientos y recordatorios" copy="Dosis, horarios, recetas y adherencia, siempre conforme a la indicación médica." action={<button className="primary-action" type="button" onClick={() => onNotice('Registro de medicamento preparado en modo demostración.')}>＋ Agregar medicamento</button>} /><section className="card-list">{medications.map((med) => <article className="panel medication-card" key={med.name}><span className={`medicine-icon ${med.tone}`}>Rx</span><div><p>{med.person}</p><h2>{med.name}</h2><span>{med.schedule}</span></div><div className="med-status"><small>{med.status}</small><button type="button" onClick={() => onNotice('Dosis marcada únicamente en la demostración.')}>Marcar tomada</button></div></article>)}</section><div className="clinical-warning standalone"><strong>Seguridad farmacológica</strong><p>Family Care registrará la prescripción; no recomendará iniciar, suspender ni modificar dosis. Las alertas clínicas requerirán reglas validadas.</p></div></>;
}

function Calendar({ onNotice }: { onNotice: (text: string) => void }) {
  return <><PageHeading eyebrow="AGENDA FAMILIAR" title="Citas y controles" copy="Incluye medicina general, laboratorios y visitas a cualquier especialista." action={<button className="primary-action" type="button" onClick={() => onNotice('Nueva cita preparada en modo demostración.')}>＋ Nueva cita</button>} /><div className="calendar-layout"><section className="panel month-panel"><div className="month-title"><button type="button">‹</button><h2>Septiembre 2026</h2><button type="button">›</button></div><div className="calendar-grid">{['L','M','M','J','V','S','D'].map((d, i) => <strong key={`${d}-${i}`}>{d}</strong>)}{Array.from({ length: 35 }, (_, i) => i - 1).map((day, i) => <button type="button" className={[12,18,25].includes(day) ? 'has-event' : ''} key={i}>{day > 0 && day <= 30 ? day : ''}</button>)}</div></section><aside><AppointmentsCard onOpen={() => onNotice('Ya estás viendo el calendario completo.')} /></aside></div></>;
}

function Documents({ onUpload }: { onUpload: () => void }) {
  return <><PageHeading eyebrow="ARCHIVO CLÍNICO" title="Documentos y recetas" copy="Recetas, referencias, resultados, epicrisis y pólizas, con versiones y trazabilidad." action={<button className="primary-action" type="button" onClick={onUpload}>↥ Subir documento</button>} /><section className="panel module-panel"><div className="document-list">{documents.map((doc) => <article className="document-row" key={doc.name}><span className="document-icon">PDF</span><div><h2>{doc.name}</h2><p>{doc.type} · {doc.person}</p></div><span>{doc.size}</span><button type="button" aria-label={`Opciones de ${doc.name}`}>•••</button></article>)}</div></section></>;
}

function Insurance({ onNotice }: { onNotice: (text: string) => void }) {
  return <><PageHeading eyebrow="SEGUROS" title="Pólizas y coberturas" copy="Vigencia, beneficiarios, autorizaciones, reclamaciones y teléfonos de asistencia." action={<button className="primary-action" type="button" onClick={() => onNotice('Registro de póliza preparado en modo demostración.')}>＋ Agregar póliza</button>} /><div className="content-grid wide-main"><section className="insurance-card"><div><p>SEGURO MÉDICO FAMILIAR</p><h2>Plan de demostración</h2><span>Póliza •••• 2841</span></div><strong>Vigente</strong><footer><span>Renovación<br/><b>31 dic 2026</b></span><span>Deducible<br/><b>B/. 500.00</b></span><span>Asistencia<br/><b>24 horas</b></span></footer></section><aside className="panel side-summary"><p className="eyebrow">ACCESO RÁPIDO</p><h2>Gestiones del seguro</h2>{['Solicitar autorización', 'Registrar reclamación', 'Ver beneficiarios', 'Llamar a asistencia'].map((item) => <button className="insurance-action" type="button" key={item} onClick={() => onNotice(`${item}: acción demostrativa.`)}>{item}<span>›</span></button>)}</aside></div></>;
}

function AppointmentsCard({ onOpen }: { onOpen: () => void }) {
  return <article className="panel appointments-panel"><div className="panel-heading"><div><p className="eyebrow">PRÓXIMAMENTE</p><h2>Citas familiares</h2></div><button type="button" className="add-button">+</button></div><div className="appointment-list">{appointments.map((a) => <div className="appointment" key={a.title}><div className={`date-block ${a.tone}`}><strong>{a.day}</strong><span>{a.month}</span></div><div className="appointment-info"><span>{a.time} · {a.person}</span><strong>{a.title}</strong><small>{a.specialty} · {a.place}</small></div></div>)}</div><button type="button" className="full-button" onClick={onOpen}>Abrir calendario</button></article>;
}

function SosModal({ person, sent, onSend, onClose }: { person: string; sent: boolean; onSend: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" type="button" onClick={onClose}>×</button><div className="sos-mark">SOS</div><p className="eyebrow">MODO DE SIMULACIÓN</p><h2 id="sos-title">Alerta familiar de emergencia</h2><p>Se notificará a los contactos autorizados de <strong>{person}</strong>. Esta prueba no realiza llamadas reales.</p><div className="sos-contacts"><span className="avatar-group"><i>JT</i><i>MC</i><i>+1</i></span><span>3 contactos configurados</span></div>{sent ? <div className="test-success" role="status">✓ Simulación enviada correctamente</div> : <button className="send-sos" type="button" onClick={onSend}>Mantener para enviar prueba</button>}<button className="cancel-button" type="button" onClick={onClose}>Cancelar</button></section></div>;
}
