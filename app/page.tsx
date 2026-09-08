'use client';

import { useState } from 'react';
import Image from 'next/image';

const profiles = [
  { id: 'familia', name: 'Familia', initials: 'FC', color: '#0b6f69' },
  { id: 'joel', name: 'Joel', initials: 'JT', color: '#245f91' },
  { id: 'esposa', name: 'María', initials: 'MC', color: '#8a5d95' },
  { id: 'hija', name: 'Sofía', initials: 'SC', color: '#df765f' },
];

const navigation = [
  ['Inicio', 'I'],
  ['Expedientes', 'E'],
  ['Laboratorios', 'L'],
  ['Medicamentos', 'M'],
  ['Calendario', 'C'],
  ['Documentos', 'D'],
  ['Seguros', 'S'],
];

const metrics = [
  { value: '18', label: 'Citas médicas', detail: '15 completadas', tone: 'teal' },
  { value: '1', label: 'Hospitalización', detail: '3 días en total', tone: 'coral' },
  { value: '4', label: 'Tratamientos', detail: '2 activos', tone: 'blue' },
  { value: '6', label: 'Especialistas', detail: 'Durante 2026', tone: 'violet' },
];

const appointments = [
  { day: '12', month: 'SEP', time: '9:30 a. m.', title: 'Control de hematología', person: 'Sofía', place: 'Hospital Pediátrico', tone: 'coral' },
  { day: '18', month: 'SEP', time: '3:00 p. m.', title: 'Consulta de reumatología', person: 'María', place: 'Clínica San Fernando', tone: 'violet' },
  { day: '25', month: 'SEP', time: '7:00 a. m.', title: 'Laboratorios de control', person: 'Joel', place: 'Laboratorio central', tone: 'blue' },
];

const monthlyVisits = [4, 7, 5, 9, 6, 11, 8, 13, 7, 10, 5, 8];

export default function Home() {
  const [activeProfile, setActiveProfile] = useState('familia');
  const [sosOpen, setSosOpen] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const selectedProfile = profiles.find((profile) => profile.id === activeProfile) ?? profiles[0];

  function sendTestAlert() {
    setSosSent(true);
    window.setTimeout(() => setSosSent(false), 5000);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image src="/app-icon.png" alt="" width={43} height={43} className="brand-icon" priority />
          <div><strong>Family Care</strong><span>Salud en familia</span></div>
        </div>

        <nav aria-label="Navegación principal" className="main-nav">
          <p className="nav-heading">TU ESPACIO</p>
          {navigation.map(([label, symbol], index) => (
            <button key={label} className={index === 0 ? 'nav-item active' : 'nav-item'} type="button">
              <span className="nav-symbol" aria-hidden="true">{symbol}</span>{label}
              {label === 'Medicamentos' && <span className="nav-badge">2</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-support">
          <div className="shield-mark" aria-hidden="true">✓</div>
          <div><strong>Información protegida</strong><span>Acceso familiar privado</span></div>
        </div>

        <button className="user-card" type="button">
          <span className="avatar avatar-joel">JT</span>
          <span><strong>Joel</strong><small>Administrador familiar</small></span>
          <span className="more" aria-hidden="true">•••</span>
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><Image src="/app-icon.png" alt="" width={34} height={34} priority /><strong>Family Care</strong></div>
          <div className="profile-switcher" aria-label="Cambiar perfil">
            {profiles.map((profile) => (
              <button key={profile.id} type="button" className={activeProfile === profile.id ? 'profile-chip active' : 'profile-chip'} onClick={() => setActiveProfile(profile.id)} aria-pressed={activeProfile === profile.id}>
                <span style={{ background: profile.color }}>{profile.initials}</span>{profile.name}
              </button>
            ))}
          </div>
          <div className="top-actions">
            <span className="demo-chip">Datos de demostración</span>
            <button className="icon-button" type="button" aria-label="Buscar">⌕</button>
            <button className="icon-button notification-button" type="button" aria-label="Notificaciones">◌<span /></button>
          </div>
        </header>

        <div className="dashboard">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">MARTES, 8 DE SEPTIEMBRE</p>
              <h1>{activeProfile === 'familia' ? 'Buenos días, Joel' : `Resumen de ${selectedProfile.name}`}</h1>
              <p className="welcome-copy">{activeProfile === 'familia' ? 'Aquí tienes una vista clara de la salud de tu familia.' : 'Consulta próximos controles, evolución y documentos importantes.'}</p>
            </div>
            <div className="period-control"><button type="button" aria-label="Año anterior">‹</button><span>Resumen 2026</span><button type="button" aria-label="Año siguiente">›</button></div>
          </section>

          <section className="metric-grid" aria-label="Resumen anual">
            {metrics.map((metric) => (
              <article className={`metric-card ${metric.tone}`} key={metric.label}>
                <div className="metric-topline"><span className="metric-dot" /><span>Este año</span></div>
                <strong>{metric.value}</strong><h2>{metric.label}</h2><p>{metric.detail}</p>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <div className="primary-column">
              <article className="panel care-panel">
                <div className="panel-heading"><div><p className="eyebrow">SEGUIMIENTO ACTIVO</p><h2>Planes de cuidado</h2></div><button type="button" className="text-button">Ver todos</button></div>
                <div className="care-list">
                  <div className="care-item daughter">
                    <div className="care-person"><span className="avatar avatar-sofia">SC</span><div><strong>Sofía</strong><span>Seguimiento hematológico</span></div></div>
                    <div className="care-reading"><span>Última hemoglobina</span><strong>10.8 <small>g/dL</small></strong><em>↑ 1.4 desde julio</em></div>
                    <div className="care-next"><span>Próximo control</span><strong>12 sep.</strong><small>en 4 días</small></div>
                    <button type="button" className="round-link" aria-label="Abrir seguimiento de Sofía">›</button>
                  </div>
                  <div className="care-item wife">
                    <div className="care-person"><span className="avatar avatar-maria">MC</span><div><strong>María</strong><span>Artritis reumatoide</span></div></div>
                    <div className="care-reading"><span>Estado reciente</span><strong className="status-stable">Estable</strong><em>Sin brotes en 21 días</em></div>
                    <div className="healwave-source"><span className="source-pulse" /><div><span>Fuente externa</span><strong>Healwave</strong><small>Solo lectura</small></div></div>
                    <button type="button" className="round-link" aria-label="Abrir resumen de María">›</button>
                  </div>
                </div>
              </article>

              <article className="panel activity-panel">
                <div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD FAMILIAR</p><h2>Atención médica durante el año</h2></div><div className="legend"><span /> Consultas y controles</div></div>
                <div className="bar-chart" aria-label="Gráfica mensual de consultas y controles">
                  {monthlyVisits.map((value, index) => <div className="bar-column" key={index}><div className="bar-track"><div className="bar-fill" style={{ height: `${value * 6}px` }} /></div><span>{['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][index]}</span></div>)}
                </div>
              </article>
            </div>

            <aside className="secondary-column">
              <article className="panel appointments-panel">
                <div className="panel-heading"><div><p className="eyebrow">PRÓXIMAMENTE</p><h2>Citas familiares</h2></div><button type="button" className="add-button" aria-label="Agregar cita">+</button></div>
                <div className="appointment-list">
                  {appointments.map((appointment) => (
                    <div className="appointment" key={appointment.title}>
                      <div className={`date-block ${appointment.tone}`}><strong>{appointment.day}</strong><span>{appointment.month}</span></div>
                      <div className="appointment-info"><span>{appointment.time} · {appointment.person}</span><strong>{appointment.title}</strong><small>{appointment.place}</small></div>
                    </div>
                  ))}
                </div>
                <button type="button" className="full-button">Abrir calendario</button>
              </article>

              <article className="panel quick-panel">
                <p className="eyebrow">ACCESO RÁPIDO</p><h2>¿Qué deseas registrar?</h2>
                <div className="quick-grid"><button type="button"><span>＋</span>Consulta</button><button type="button"><span>↥</span>Laboratorio</button><button type="button"><span>◷</span>Medicamento</button><button type="button"><span>▣</span>Documento</button></div>
              </article>
            </aside>
          </section>
        </div>

        <button className="sos-button" type="button" onClick={() => setSosOpen(true)} aria-label="Abrir alerta SOS familiar"><span>SOS</span><small>Emergencia</small></button>
        <nav className="mobile-nav" aria-label="Navegación móvil">{navigation.slice(0, 4).map(([label, symbol], index) => <button key={label} type="button" className={index === 0 ? 'active' : ''}><span>{symbol}</span>{label}</button>)}</nav>
      </main>

      {sosOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSosOpen(false)}>
          <section className="sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close-modal" type="button" onClick={() => setSosOpen(false)} aria-label="Cerrar">×</button>
            <div className="sos-mark">SOS</div><p className="eyebrow">MODO DE SIMULACIÓN</p><h2 id="sos-title">Alerta familiar de emergencia</h2>
            <p>Se notificará a los contactos autorizados de <strong>{selectedProfile.name}</strong>. Esta prueba no realiza llamadas reales.</p>
            <div className="sos-contacts"><span className="avatar-group"><i>JT</i><i>MC</i><i>+1</i></span><span>3 contactos configurados</span></div>
            {sosSent ? <div className="test-success" role="status">✓ Simulación enviada correctamente</div> : <button className="send-sos" type="button" onClick={sendTestAlert}>Mantener para enviar prueba</button>}
            <button className="cancel-button" type="button" onClick={() => setSosOpen(false)}>Cancelar</button>
          </section>
        </div>
      )}
    </div>
  );
}
