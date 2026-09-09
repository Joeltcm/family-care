'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ApiStatusChip, type ApiStatus } from '@/components/family-care/api-status';
import { SosModal } from '@/components/family-care/sos-modal';
import type { Notice, Notify } from '@/components/family-care/types';
import { Calendar } from '@/components/family-care/views/calendar';
import { Dashboard } from '@/components/family-care/views/dashboard';
import { Documents } from '@/components/family-care/views/documents';
import { Insurance } from '@/components/family-care/views/insurance';
import { Laboratories } from '@/components/family-care/views/laboratories';
import { Medications } from '@/components/family-care/views/medications';
import { Records } from '@/components/family-care/views/records';
import { navigation, profiles, type ProfileId, type SectionId } from '@/lib/demo-data';

export function FamilyCareApp() {
  const [activeProfile, setActiveProfile] = useState<ProfileId>('familia');
  const [activeSection, setActiveSection] = useState<SectionId>('inicio');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [sosOpen, setSosOpen] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedProfile = profiles.find((profile) => profile.id === activeProfile) ?? profiles[0];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/family-care/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('api_unavailable');
        return response.json();
      })
      .then(() => setApiStatus('connected'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setApiStatus('unavailable');
      });
    return () => controller.abort();
  }, []);

  function navigate(section: SectionId) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const showNotice: Notify = (text, tone = 'success') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 4200);
  };

  function handleDemoUpload(file?: File) {
    if (file) showNotice(`${file.name} preparado para compresión y revisión. No se guardó ningún dato real.`);
  }

  function sendSimulatedSos() {
    setSosSent(true);
    window.setTimeout(() => setSosSent(false), 5000);
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
          <div className="top-actions"><ApiStatusChip status={apiStatus} /><button className="icon-button" type="button" aria-label="Buscar">⌕</button><button className="icon-button notification-button" type="button" aria-label="Notificaciones">◌<span /></button></div>
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
      {sosOpen && <SosModal person={selectedProfile.name} sent={sosSent} onSend={sendSimulatedSos} onClose={() => setSosOpen(false)} />}
    </div>
  );
}
