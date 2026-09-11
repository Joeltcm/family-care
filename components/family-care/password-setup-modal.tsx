'use client';

import { type FormEvent, useState } from 'react';

export function PasswordSetupModal({ onClose, onConfigured }: { onClose: () => void; onConfigured: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    if (password.length < 12 || !/[A-ZÁÉÍÓÚÑ]/.test(password) || !/[0-9]/.test(password)) return setError('Usa al menos 12 caracteres, una mayúscula y un número.');
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/auth/setup-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error();
      onConfigured();
    } catch { setError('No fue posible configurar la contraseña. Intenta nuevamente.'); setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="profile-modal password-setup-modal" role="dialog" aria-modal="true" aria-labelledby="password-setup-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button><div className="profile-modal-heading"><span>⌁</span><div><p className="eyebrow">ACCESO DIRECTO</p><h2 id="password-setup-title">Crea tu contraseña</h2></div></div><p className="profile-intro">Después podrás ingresar desde Cloudflare con tu correo, sin usar una cuenta de OpenAI.</p><form onSubmit={submit}><div className="profile-form-grid"><label className="form-field full"><span>Nueva contraseña</span><div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setVisible((value) => !value)}>{visible ? 'Ocultar' : 'Ver'}</button></div><small>12 caracteres o más, con una mayúscula y un número.</small></label><label className="form-field full"><span>Confirmar contraseña</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label></div>{error && <p className="share-error" role="alert">{error}</p>}<div className="profile-modal-actions"><button type="button" onClick={onClose}>Ahora no</button><button className="primary-action" disabled={saving} type="submit">{saving ? 'Protegiendo…' : 'Guardar contraseña'}</button></div></form></section></div>;
}
