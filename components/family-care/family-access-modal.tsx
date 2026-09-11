'use client';

import { type FormEvent, useEffect, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';

type Member = { id: string; email: string; displayName: string; role: string; isSupervised: boolean };
type Invitation = { id: string; email: string; displayName: string; role: string; status: string; expiresAt: string; patientIds: string[]; isMinor: boolean; linkedPatientId: string | null };
type AccessData = { members: Member[]; invitations: Invitation[] };
type InviteResult = { activationToken: string; activationExpiresAt: string };

const roleNames: Record<string, string> = { owner: 'Administrador', caregiver: 'Cuidador', adult: 'Adulto', viewer: 'Solo consulta' };

export function FamilyAccessModal({ patients, onClose, onSaved }: { patients: FamilyCarePatient[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [data, setData] = useState<AccessData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'caregiver' | 'adult' | 'viewer'>('adult');
  const [canViewAll, setCanViewAll] = useState(false);
  const [canManageEmergency, setCanManageEmergency] = useState(true);
  const [isMinor, setIsMinor] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [linkedPatientId, setLinkedPatientId] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activationUrl, setActivationUrl] = useState('');

  function load() {
    fetch('/api/family-care/family/access')
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<AccessData>; })
      .then(setData)
      .catch(() => setError('Solo el administrador familiar puede gestionar accesos.'));
  }
  useEffect(load, []);

  function buildUrl(token: string) {
    return `${window.location.origin}/activar?token=${encodeURIComponent(token)}`;
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    onSaved('Enlace de activación copiado. Compártelo únicamente con la persona invitada.');
  }

  async function regenerate(invitation: Invitation) {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/family-care/family/invitations/${invitation.id}/activation`, { method: 'POST' });
      const payload = await response.json() as InviteResult;
      if (!response.ok || !payload.activationToken) throw new Error();
      const url = buildUrl(payload.activationToken);
      setActivationUrl(url);
      await copyUrl(url);
    } catch { setError('No fue posible generar el enlace. Puede que la invitación haya vencido.'); }
    finally { setSaving(false); }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!canViewAll && !selected.length) return setError('Selecciona al menos un expediente.');
    if (linkedPatientId && !selected.includes(linkedPatientId)) return setError('El perfil personal debe estar entre los expedientes permitidos.');
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/family-care/family/invitations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, displayName, role: isMinor ? 'viewer' : role,
          canViewAll: isMinor ? false : canViewAll,
          canManageEmergency: isMinor ? false : canManageEmergency,
          isMinor, linkedPatientId: linkedPatientId || null,
          patients: selected.map((patientId) => ({ patientId, canWrite: isMinor ? false : canWrite, canShare: false })),
        }),
      });
      const payload = await response.json() as InviteResult;
      if (!response.ok || !payload.activationToken) throw new Error();
      setActivationUrl(buildUrl(payload.activationToken));
      load();
      onSaved(`Invitación segura preparada para ${email}.`);
    } catch { setError('No fue posible preparar la invitación. Verifica el correo y los permisos.'); }
    finally { setSaving(false); }
  }

  function togglePatient(patientId: string) {
    setSelected((current) => current.includes(patientId) ? current.filter((id) => id !== patientId) : [...current, patientId]);
    if (linkedPatientId === patientId) setLinkedPatientId('');
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="profile-modal family-access-modal" role="dialog" aria-modal="true" aria-labelledby="family-access-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button><div className="profile-modal-heading"><span>♙</span><div><p className="eyebrow">ACCESO FAMILIAR</p><h2 id="family-access-title">Personas y permisos</h2></div></div><p className="profile-intro">Cada persona entra con su correo y contraseña. Tú decides qué expedientes puede consultar o editar.</p>
    {!formOpen ? <>
      <div className="access-people"><p className="eyebrow">INTEGRANTES ACTIVOS</p>{data?.members.map((member) => <div key={member.id}><span className="access-avatar">{member.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{member.displayName}</strong><small>{member.email} · {roleNames[member.role] || member.role}{member.isSupervised ? ' · Cuenta supervisada' : ''}</small></span><b>Activo</b></div>)}</div>
      <div className="access-people"><p className="eyebrow">INVITACIONES</p>{data?.invitations.length ? data.invitations.map((invitation) => <div key={invitation.id}><span className="access-avatar pending">{invitation.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{invitation.displayName}</strong><small>{invitation.email} · {roleNames[invitation.role]}{invitation.isMinor ? ' · Menor supervisada' : ''}</small></span>{invitation.status === 'pending' ? <button className="activation-link-button" disabled={saving} type="button" onClick={() => regenerate(invitation)}>Copiar enlace</button> : <b className="pending-label">{invitation.status}</b>}</div>) : <p className="muted-copy">No hay invitaciones pendientes.</p>}</div>
      {activationUrl && <div className="activation-result"><strong>Enlace listo</strong><span>Vence en 48 horas y solo se puede usar una vez.</span><button type="button" onClick={() => copyUrl(activationUrl)}>Copiar nuevamente</button></div>}
      {error && <p className="share-error" role="alert">{error}</p>}
      <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cerrar</button><button className="primary-action" type="button" onClick={() => { setActivationUrl(''); setFormOpen(true); }}>＋ Invitar familiar</button></div>
    </> : activationUrl ? <>
      <div className="activation-result success"><strong>Invitación creada</strong><span>Comparte este enlace únicamente con {displayName}. Vence en 48 horas y dejará de funcionar después de la activación.</span><code>{activationUrl}</code><button type="button" onClick={() => copyUrl(activationUrl)}>Copiar enlace seguro</button></div>
      <div className="profile-modal-actions"><button type="button" onClick={() => { setFormOpen(false); setActivationUrl(''); }}>Volver a integrantes</button><button className="primary-action" type="button" onClick={onClose}>Listo</button></div>
    </> : <form onSubmit={invite}>
      <div className="profile-form-grid"><label className="form-field"><span>Nombre</span><input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="form-field"><span>Correo de acceso</span><input required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="form-field"><span>Rol</span><select disabled={isMinor} value={isMinor ? 'viewer' : role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="adult">Adulto familiar</option><option value="caregiver">Cuidador</option><option value="viewer">Solo consulta</option></select></label><label className="toggle-field"><input type="checkbox" checked={isMinor} onChange={(event) => { const checked = event.target.checked; setIsMinor(checked); if (checked) { setRole('viewer'); setCanViewAll(false); setCanWrite(false); setCanManageEmergency(false); } }} /><span><strong>Cuenta de menor supervisada</strong><small>Solo consulta su perfil y puede activar SOS.</small></span></label><label className="toggle-field"><input type="checkbox" disabled={isMinor} checked={canManageEmergency} onChange={(event) => setCanManageEmergency(event.target.checked)} /><span><strong>Gestionar contactos SOS</strong><small>Activar SOS no requiere este permiso.</small></span></label></div>
      <fieldset className="patient-access"><legend>Expedientes permitidos</legend><label className="access-all"><input type="checkbox" disabled={isMinor} checked={canViewAll} onChange={(event) => setCanViewAll(event.target.checked)} /> Acceso a toda la familia</label>{!canViewAll && patients.map((patient) => <label key={patient.id}><input type="checkbox" checked={selected.includes(patient.id)} onChange={() => togglePatient(patient.id)} />{patient.preferredName || patient.legalName}</label>)}<label className="access-write"><input type="checkbox" disabled={isMinor} checked={canWrite} onChange={(event) => setCanWrite(event.target.checked)} /> Puede agregar y actualizar registros</label></fieldset>
      <label className="form-field linked-profile"><span>Perfil personal de esta cuenta</span><select value={linkedPatientId} onChange={(event) => { setLinkedPatientId(event.target.value); if (event.target.value && !selected.includes(event.target.value)) setSelected((current) => [...current, event.target.value]); }}><option value="">Ninguno / no corresponde</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.preferredName || patient.legalName}</option>)}</select><small>Vincula la cuenta al expediente de la persona y evita perfiles duplicados.</small></label>
      {isMinor && <div className="data-caution"><strong>Protección automática para menores</strong><span>Family Care bloqueará edición, compartir enlaces, exportar PDF, seguros y administración familiar. El acceso quedará asociado al tutor.</span></div>}
      {error && <p className="share-error" role="alert">{error}</p>}<div className="profile-modal-actions"><button type="button" onClick={() => setFormOpen(false)}>Volver</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Preparando…' : 'Crear enlace de activación'}</button></div>
    </form>}
  </section></div>;
}
