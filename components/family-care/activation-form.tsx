'use client';

import Image from 'next/image';
import { type FormEvent, useEffect, useState } from 'react';

type ActivationDetails = { displayName: string; maskedEmail: string; isMinor: boolean; expiresAt: string };

export function ActivationForm() {
  const token = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('token') || '';
  const [details, setDetails] = useState<ActivationDetails | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      Promise.resolve().then(() => { setError('El enlace de activación está incompleto.'); setLoading(false); });
      return;
    }
    fetch('/api/auth/activation/details', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<ActivationDetails>;
    }).then(setDetails).catch(() => setError('Este enlace venció, ya fue utilizado o no es válido. Solicita uno nuevo.')).finally(() => setLoading(false));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    if (password.length < 12 || !/[A-ZÁÉÍÓÚÑ]/.test(password) || !/[0-9]/.test(password)) return setError('Usa al menos 12 caracteres, una mayúscula y un número.');
    setSubmitting(true); setError('');
    try {
      const response = await fetch('/api/auth/activation', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }),
      });
      if (!response.ok) throw new Error();
      window.location.replace('/');
    } catch {
      setError('No fue posible activar la cuenta. Solicita un enlace nuevo al administrador familiar.');
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page activation-page">
      <section className="auth-story" aria-label="Family Care">
        <div className="auth-brand"><Image src="/app-icon.png" alt="" width={54} height={54} priority /><span><strong>Family Care</strong><small>Salud en familia</small></span></div>
        <div className="auth-story-copy"><p className="eyebrow">INVITACIÓN FAMILIAR</p><h1>Tu salud, acompañada por quienes cuidan de ti.</h1><p>Configura tu acceso personal. El administrador decide exactamente qué expedientes puedes consultar.</p></div>
        {details?.isMinor && <div className="auth-trust minor"><span>♡</span><div><strong>Cuenta supervisada</strong><small>Este acceso pertenece a una persona menor de edad y es administrado por su padre, madre o tutor.</small></div></div>}
      </section>
      <section className="auth-panel"><div className="auth-card">
        <div className="auth-card-heading"><span className="auth-lock">✓</span><p className="eyebrow">ACTIVAR CUENTA</p><h2>{loading ? 'Validando invitación…' : details ? `Hola, ${details.displayName}` : 'Enlace no disponible'}</h2>{details && <p>Crearás acceso para <strong>{details.maskedEmail}</strong>.</p>}</div>
        {details && <form onSubmit={submit} className="auth-form">
          <label><span>Nueva contraseña</span><div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setVisible((value) => !value)}>{visible ? 'Ocultar' : 'Ver'}</button></div><small>12 caracteres o más, con una mayúscula y un número.</small></label>
          <label><span>Confirmar contraseña</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {details.isMinor && <div className="supervised-summary"><strong>Protecciones de esta cuenta</strong><span>Solo podrá consultar su expediente y usar SOS. No podrá editar datos, compartir expedientes, exportar PDF ni administrar familiares.</span></div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={submitting} type="submit">{submitting ? 'Activando…' : 'Activar y entrar'}</button>
        </form>}
        {!loading && !details && <><p className="auth-error" role="alert">{error}</p><a className="auth-secondary" href="/login">Volver al inicio de sesión</a></>}
      </div></section>
    </main>
  );
}
