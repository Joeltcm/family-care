'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { ApiStatusChip, type ApiStatus } from '@/components/family-care/api-status';
import { AppointmentModal } from '@/components/family-care/appointment-modal';
import { DocumentUploadModal } from '@/components/family-care/document-upload-modal';
import { EncounterModal } from '@/components/family-care/encounter-modal';
import { HemogramModal } from '@/components/family-care/hemogram-modal';
import { FamilyAccessModal } from '@/components/family-care/family-access-modal';
import { MedicationModal } from '@/components/family-care/medication-modal';
import { ProfileEditorModal } from '@/components/family-care/profile-editor-modal';
import { ShareRecordModal } from '@/components/family-care/share-record-modal';
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
import type { FamilyCarePatient, FamilyCareSession } from '@/lib/family-care-session';

const profileColors = ['#245f91', '#8a5d95', '#df765f', '#498477'];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FC';
}

export function FamilyCareApp() {
  const [activeProfile, setActiveProfile] = useState<ProfileId>('familia');
  const [activeSection, setActiveSection] = useState<SectionId>('inicio');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [session, setSession] = useState<FamilyCareSession | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [encounterOpen, setEncounterOpen] = useState(false);
  const [hemogramOpen, setHemogramOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [familyAccessOpen, setFamilyAccessOpen] = useState(false);
  const [clinicalRevision, setClinicalRevision] = useState(0);
  const [careRevision, setCareRevision] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const availableProfiles = session
    ? [
        { id: 'familia', name: 'Familia', initials: 'FC', color: '#0b6f69' },
        ...session.patients.map((patient, index) => ({
          id: patient.id,
          name: patient.preferredName || patient.legalName,
          initials: initials(patient.preferredName || patient.legalName),
          color: profileColors[index % profileColors.length],
        })),
      ]
    : profiles;
  const selectedProfile = availableProfiles.find((profile) => profile.id === activeProfile) ?? availableProfiles[0];
  const selectedPatient = session?.patients.find((patient) => patient.id === activeProfile);
  const accountName = session?.patients.find((patient) => patient.linkedToCurrentUser)?.preferredName || session?.user.displayName || 'Diógenes Joel';
  const accountSubtitle = session ? 'Cuenta familiar protegida' : 'Administrador familiar';

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
    fetch('/api/family-care/session', { method: 'POST', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('session_unavailable');
        return response.json() as Promise<FamilyCareSession>;
      })
      .then((value) => {
        setSession(value);
        if (value.created) {
          setNotice({ text: `Perfil protegido de ${value.user.displayName} creado correctamente.`, tone: 'success' });
          window.setTimeout(() => setNotice(null), 4200);
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSession(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    if (requested && navigation.some((item) => item.id === requested)) {
      window.setTimeout(() => setActiveSection(requested as SectionId), 0);
    }
  }, []);

  function navigate(section: SectionId) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const showNotice: Notify = useCallback((text, tone = 'success') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  function clinicalSaved(message: string) {
    setClinicalRevision((value) => value + 1);
    setEncounterOpen(false);
    setHemogramOpen(false);
    setDocumentOpen(false);
    showNotice(message);
  }

  function careSaved(message: string) {
    refreshCare();
    setAppointmentOpen(false);
    setMedicationOpen(false);
    showNotice(message);
  }

  function refreshCare() {
    setCareRevision((value) => value + 1);
    setClinicalRevision((value) => value + 1);
  }

  function openCareModal(kind: 'appointment' | 'medication') {
    if (!selectedPatient) {
      showNotice('Selecciona el perfil de la persona antes de agregar el registro.', 'warning');
      return;
    }
    if (!selectedPatient.canWrite) {
      showNotice('Este perfil está disponible solo para consulta.', 'warning');
      return;
    }
    if (kind === 'appointment') setAppointmentOpen(true);
    else setMedicationOpen(true);
  }

  function savePatientProfile(patient: FamilyCarePatient) {
    setSession((current) => current ? {
      ...current,
      patients: current.patients.map((item) => item.id === patient.id ? patient : item),
    } : current);
    setProfileEditorOpen(false);
    showNotice('Perfil clínico guardado correctamente.');
  }

  function openOwnProfile() {
    const ownPatient = session?.patients.find((patient) => patient.linkedToCurrentUser);
    if (ownPatient) setActiveProfile(ownPatient.id);
    navigate('expedientes');
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
        {session?.family.role === 'owner' && <button className="family-access-button" type="button" onClick={() => setFamilyAccessOpen(true)}><span>♙</span><span><strong>Accesos familiares</strong><small>Invitaciones y permisos</small></span><b>›</b></button>}
        <button className="user-card" type="button" onClick={openOwnProfile}><span className="avatar avatar-joel">{initials(accountName)}</span><span><strong>{accountName}</strong><small>{accountSubtitle}</small></span><span className="more">•••</span></button>
        <a className="switch-account-link" href="/signout-with-chatgpt?return_to=/"><span aria-hidden="true">⇄</span>Cambiar cuenta</a>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-brand" type="button" onClick={() => navigate('inicio')}><Image src="/app-icon.png" alt="" width={34} height={34} priority /><strong>Family Care</strong></button>
          <div className="profile-switcher" aria-label="Cambiar perfil">{availableProfiles.map((profile) => <button key={profile.id} type="button" className={activeProfile === profile.id ? 'profile-chip active' : 'profile-chip'} onClick={() => setActiveProfile(profile.id)} aria-pressed={activeProfile === profile.id}><span style={{ background: profile.color }}>{profile.initials}</span>{profile.name}</button>)}</div>
          <div className="top-actions"><ApiStatusChip status={apiStatus} authenticated={Boolean(session)} />{session?.family.role === 'owner' && <button className="icon-button family-mobile-access" type="button" aria-label="Gestionar accesos familiares" onClick={() => setFamilyAccessOpen(true)}>♙</button>}<a className="icon-button switch-account-mobile" href="/signout-with-chatgpt?return_to=/" aria-label="Cambiar cuenta">⇄</a><button className="icon-button" type="button" aria-label="Buscar">⌕</button><button className="icon-button notification-button" type="button" aria-label="Configurar notificaciones" onClick={() => navigate('calendario')}>◌<span /></button></div>
        </header>

        <div className="dashboard">
          {activeSection === 'inicio' && <Dashboard profile={selectedProfile.name} family={activeProfile === 'familia'} accountName={accountName} onNavigate={navigate} />}
          {activeSection === 'expedientes' && <Records profile={selectedProfile.name} patient={selectedPatient} onNotice={showNotice} canEdit={Boolean(selectedPatient?.canWrite)} canShare={Boolean(selectedPatient?.canShare)} onEdit={() => setProfileEditorOpen(true)} onShare={() => setShareOpen(true)} onRegister={() => setEncounterOpen(true)} revision={clinicalRevision} />}
          {activeSection === 'laboratorios' && <Laboratories profile={selectedProfile.name} patient={selectedPatient} canEdit={Boolean(selectedPatient?.canWrite)} onRegister={() => setHemogramOpen(true)} onNotice={showNotice} revision={clinicalRevision} />}
          {activeSection === 'medicamentos' && <Medications patients={session?.patients || []} patient={selectedPatient} onNotice={showNotice} onRegister={() => openCareModal('medication')} onChanged={refreshCare} revision={careRevision} />}
          {activeSection === 'calendario' && <Calendar patients={session?.patients || []} patient={selectedPatient} onNotice={showNotice} onRegister={() => openCareModal('appointment')} onChanged={refreshCare} revision={careRevision} />}
          {activeSection === 'documentos' && <Documents patient={selectedPatient} canEdit={Boolean(selectedPatient?.canWrite)} onUpload={() => setDocumentOpen(true)} onNotice={showNotice} revision={clinicalRevision} />}
          {activeSection === 'seguros' && <Insurance patients={session?.patients || []} onNotice={showNotice} />}
        </div>
        <button className="sos-button" type="button" onClick={() => setSosOpen(true)} aria-label="Abrir alerta SOS familiar"><span>SOS</span><small>Emergencia</small></button>
        <nav className="mobile-nav" aria-label="Navegación móvil">{navigation.slice(0, 4).map((item) => <button key={item.id} type="button" className={activeSection === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.symbol}</span>{item.label}</button>)}</nav>
      </main>
      {notice && <div className={`toast ${notice.tone}`} role="status">✓ {notice.text}</div>}
      {sosOpen && <SosModal patientId={selectedPatient?.id || null} person={selectedProfile.name} onNotice={(message) => showNotice(message)} onClose={() => setSosOpen(false)} />}
      {shareOpen && selectedPatient && <ShareRecordModal patientId={selectedPatient.id} patientName={selectedProfile.name} onNotice={showNotice} onClose={() => setShareOpen(false)} />}
      {profileEditorOpen && selectedPatient && <ProfileEditorModal patient={selectedPatient} onSaved={savePatientProfile} onClose={() => setProfileEditorOpen(false)} />}
      {encounterOpen && selectedPatient && <EncounterModal patient={selectedPatient} onSaved={() => clinicalSaved('Atención guardada en el expediente.')} onClose={() => setEncounterOpen(false)} />}
      {hemogramOpen && selectedPatient && <HemogramModal patient={selectedPatient} onSaved={clinicalSaved} onClose={() => setHemogramOpen(false)} />}
      {documentOpen && selectedPatient && <DocumentUploadModal patient={selectedPatient} onSaved={clinicalSaved} onClose={() => setDocumentOpen(false)} />}
      {appointmentOpen && selectedPatient && <AppointmentModal patient={selectedPatient} onSaved={() => careSaved('Cita guardada. Activa las alertas para recibir recordatorios.')} onClose={() => setAppointmentOpen(false)} />}
      {medicationOpen && selectedPatient && <MedicationModal patient={selectedPatient} onSaved={() => careSaved('Medicamento y horarios guardados.')} onClose={() => setMedicationOpen(false)} />}
      {familyAccessOpen && <FamilyAccessModal patients={session?.patients || []} onSaved={(message) => showNotice(message, 'info')} onClose={() => setFamilyAccessOpen(false)} />}
    </div>
  );
}
