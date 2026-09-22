'use client';

import { type FormEvent, useEffect, useState } from 'react';
import type { FamilyCarePatient } from '@/lib/family-care-session';

type Member = { id: string; email: string; displayName: string; role: string; canViewAll: boolean; isSupervised: boolean; linkedPatientId: string | null; patientIds: string[] };
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
  const [inviteScope, setInviteScope] = useState<'all' | 'selected' | 'own'>('selected');
  const [canManageEmergency, setCanManageEmergency] = useState(true);
  const [isMinor, setIsMinor] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [linkedPatientId, setLinkedPatientId] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activationUrl, setActivationUrl] = useState('');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberScope, setMemberScope] = useState<'all' | 'selected' | 'own'>('selected');
  const [memberSelected, setMemberSelected] = useState<string[]>([]);

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
    if (inviteScope === 'selected' && !selected.length) return setError('Selecciona al menos un expediente.');
    if (inviteScope === 'own' && !linkedPatientId) return setError('Selecciona el perfil personal de esta cuenta.');
    if (inviteScope === 'selected' && linkedPatientId && !selected.includes(linkedPatientId)) return setError('El perfil personal debe estar entre los expedientes permitidos.');
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/family-care/family/invitations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, displayName, role: isMinor ? 'viewer' : role,
          canViewAll: !isMinor && inviteScope === 'all',
          canManageEmergency: isMinor ? false : canManageEmergency,
          isMinor, linkedPatientId: linkedPatientId || null,
          patients: (inviteScope === 'own' ? [linkedPatientId] : inviteScope === 'selected' ? selected : linkedPatientId ? [linkedPatientId] : [])
            .map((patientId) => ({ patientId, canWrite: isMinor || role === 'viewer' ? false : canWrite, canShare: false })),
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

  function startMemberEdit(member: Member) {
    setEditingMember(member);
    setMemberScope(member.isSupervised ? 'own' : member.canViewAll ? 'all' : member.linkedPatientId && member.patientIds.length === 1 && member.patientIds[0] === member.linkedPatientId ? 'own' : 'selected');
    setMemberSelected(member.patientIds);
    setError('');
  }

  async function saveMemberAccess(event: FormEvent) {
    event.preventDefault();
    if (!editingMember) return;
    if (memberScope === 'selected' && !memberSelected.length) return setError('Selecciona al menos un expediente.');
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/family-care/family/members/${encodeURIComponent(editingMember.id)}/access`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: memberScope, patientIds: memberScope === 'selected' ? memberSelected : [] }),
      });
      if (!response.ok) throw new Error();
      setEditingMember(null);
      load();
      onSaved('Permisos de lectura actualizados. Los perfiles retirados dejarán de estar disponibles al volver a consultar o iniciar sesión.');
    } catch { setError('No se pudieron actualizar los permisos. Inténtalo de nuevo.'); }
    finally { setSaving(false); }
  }

  function accessLabel(member: Member) {
    if (member.canViewAll) return 'Todos los perfiles';
    if (member.linkedPatientId && member.patientIds.length === 1 && member.patientIds[0] === member.linkedPatientId) return 'Solo su perfil';
    return `${member.patientIds.length} perfiles permitidos`;
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="profile-modal family-access-modal" role="dialog" aria-modal="true" aria-labelledby="family-access-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button><div className="profile-modal-heading"><span>♙</span><div><p className="eyebrow">ACCESO FAMILIAR</p><h2 id="family-access-title">Personas y permisos</h2></div></div><p className="profile-intro">Cada persona entra con su correo y contraseña. Tú decides qué expedientes puede consultar o editar.</p>
    {editingMember ? <form onSubmit={saveMemberAccess}>
      <p className="eyebrow">PERMISOS DE LECTURA</p><h3 className="member-access-title">{editingMember.displayName}</h3>
      <p className="profile-intro">Elige qué expedientes podrá consultar esta cuenta. Su perfil personal permanece accesible. Los permisos de edición de los perfiles retirados se revocarán.</p>
      <fieldset className="patient-access"><legend>Puede ver</legend>
        {!editingMember.isSupervised && <label><input type="radio" name="memberScope" checked={memberScope === 'all'} onChange={() => setMemberScope('all')} />Todos los perfiles familiares</label>}
        {!editingMember.isSupervised && <label><input type="radio" name="memberScope" checked={memberScope === 'selected'} onChange={() => setMemberScope('selected')} />Solo los perfiles seleccionados</label>}
        {editingMember.linkedPatientId && <label><input type="radio" name="memberScope" checked={memberScope === 'own'} onChange={() => setMemberScope('own')} />Solo su perfil</label>}
      </fieldset>
      {memberScope === 'selected' && <fieldset className="patient-access"><legend>Perfiles seleccionados</legend>{patients.map((patient) => <label key={patient.id}><input type="checkbox" checked={memberSelected.includes(patient.id)} disabled={patient.id === editingMember.linkedPatientId} onChange={() => setMemberSelected((current) => current.includes(patient.id) ? current.filter((id) => id !== patient.id) : [...current, patient.id])} />{patient.preferredName || patient.legalName}{patient.id === editingMember.linkedPatientId ? ' · perfil personal' : ''}</label>)}</fieldset>}
      {editingMember.isSupervised && <div className="data-caution"><strong>Cuenta supervisada</strong><span>Su acceso permanece limitado a su perfil personal, en modo consulta.</span></div>}
      {error && <p className="share-error" role="alert">{error}</p>}
      <div className="profile-modal-actions"><button type="button" disabled={saving} onClick={() => { setEditingMember(null); setError(''); }}>Cancelar</button><button className="primary-action" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar permisos'}</button></div>
    </form> : !formOpen ? <>
      <div className="access-people"><p className="eyebrow">INTEGRANTES ACTIVOS</p>{data?.members.map((member) => <div key={member.id}><span className="access-avatar">{member.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{member.displayName}</strong><small>{member.email} · {roleNames[member.role] || member.role}{member.isSupervised ? ' · Cuenta supervisada' : ''}</small><small>{accessLabel(member)}</small></span>{member.role === 'owner' ? <b>Administrador</b> : <button className="activation-link-button" type="button" onClick={() => startMemberEdit(member)}>Editar acceso</button>}</div>)}</div>
      <div className="access-people"><p className="eyebrow">INVITACIONES</p>{data?.invitations.length ? data.invitations.map((invitation) => <div key={invitation.id}><span className="access-avatar pending">{invitation.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{invitation.displayName}</strong><small>{invitation.email} · {roleNames[invitation.role]}{invitation.isMinor ? ' · Menor supervisada' : ''}</small></span>{invitation.status === 'pending' ? <button className="activation-link-button" disabled={saving} type="button" onClick={() => regenerate(invitation)}>Copiar enlace</button> : <b className="pending-label">{invitation.status}</b>}</div>) : <p className="muted-copy">No hay invitaciones pendientes.</p>}</div>
      {activationUrl && <div className="activation-result"><strong>Enlace listo</strong><span>Vence en 48 horas y solo se puede usar una vez.</span><button type="button" onClick={() => copyUrl(activationUrl)}>Copiar nuevamente</button></div>}
      {error && <p className="share-error" role="alert">{error}</p>}
      <div className="profile-modal-actions"><button type="button" onClick={onClose}>Cerrar</button><button className="primary-action" type="button" onClick={() => { setActivationUrl(''); setFormOpen(true); }}>＋ Invitar familiar</button></div>
    </> : activationUrl ? <>
      <div className="activation-result success"><strong>Invitación creada</strong><span>Comparte este enlace únicamente con {displayName}. Vence en 48 horas y dejará de funcionar después de la activación.</span><code>{activationUrl}</code><button type="button" onClick={() => copyUrl(activationUrl)}>Copiar enlace seguro</button></div>
      <div className="profile-modal-actions"><button type="button" onClick={() => { setFormOpen(false); setActivationUrl(''); }}>Volver a integrantes</button><button className="primary-action" type="button" onClick={onClose}>Listo</button></div>
    </> : <form onSubmit={invite}>
      <div className="profile-form-grid"><label className="form-field"><span>Nombre</span><input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="form-field"><span>Correo de acceso</span><input required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="form-field"><span>Rol</span><select disabled={isMinor} value={isMinor ? 'viewer' : role} onChange={(event) => { const next = event.target.value as typeof role; setRole(next); if (next === 'viewer') setCanWrite(false); }}><option value="adult">Adulto familiar</option><option value="caregiver">Cuidador</option><option value="viewer">Solo consulta</option></select></label><label className="toggle-field"><input type="checkbox" checked={isMinor} onChange={(event) => { const checked = event.target.checked; setIsMinor(checked); if (checked) { setRole('viewer'); setInviteScope('own'); setCanWrite(false); setCanManageEmergency(false); } }} /><span><strong>Cuenta de menor supervisada</strong><small>Solo consulta su perfil y puede activar SOS.</small></span></label><label className="toggle-field"><input type="checkbox" disabled={isMinor} checked={canManageEmergency} onChange={(event) => setCanManageEmergency(event.target.checked)} /><span><strong>Gestionar contactos SOS</strong><small>Activar SOS no requiere este permiso.</small></span></label></div>
      <fieldset className="patient-access"><legend>Puede ver</legend>{!isMinor && <label><input type="radio" name="inviteScope" checked={inviteScope === 'all'} onChange={() => setInviteScope('all')} />Todos los perfiles familiares</label>}{!isMinor && <label><input type="radio" name="inviteScope" checked={inviteScope === 'selected'} onChange={() => setInviteScope('selected')} />Solo los perfiles seleccionados</label>}<label><input type="radio" name="inviteScope" checked={inviteScope === 'own'} onChange={() => setInviteScope('own')} />Solo su perfil personal</label></fieldset>
      {inviteScope === 'selected' && <fieldset className="patient-access"><legend>Perfiles seleccionados</legend>{patients.map((patient) => <label key={patient.id}><input type="checkbox" checked={selected.includes(patient.id)} disabled={linkedPatientId === patient.id} onChange={() => togglePatient(patient.id)} />{patient.preferredName || patient.legalName}{linkedPatientId === patient.id ? ' · perfil personal' : ''}</label>)}</fieldset>}
      <label className="toggle-field"><input type="checkbox" disabled={isMinor || role === 'viewer'} checked={canWrite && !isMinor && role !== 'viewer'} onChange={(event) => setCanWrite(event.target.checked)} /><span><strong>Puede agregar y actualizar registros</strong><small>Solo en los perfiles que tenga permitidos.</small></span></label>
      <label className="form-field linked-profile"><span>Perfil personal de esta cuenta</span><select value={linkedPatientId} onChange={(event) => { setLinkedPatientId(event.target.value); if (event.target.value && !selected.includes(event.target.value)) setSelected((current) => [...current, event.target.value]); }}><option value="">Ninguno / no corresponde</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.preferredName || patient.legalName}</option>)}</select><small>Vincula la cuenta al expediente de la persona y evita perfiles duplicados.</small></label>
      {isMinor && <div className="data-caution"><strong>Protección automática para menores</strong><span>Family Care bloqueará edición, compartir enlaces, exportar PDF, seguros y administración familiar. El acceso quedará asociado al tutor.</span></div>}
      {error && <p className="share-error" role="alert">{error}</p>}<div className="profile-modal-actions"><button type="button" onClick={() => setFormOpen(false)}>Volver</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Preparando…' : 'Crear enlace de activación'}</button></div>
    </form>}
  </section></div>;
}
