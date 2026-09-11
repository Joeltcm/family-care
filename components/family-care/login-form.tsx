'use client';

import Image from 'next/image';
import { type FormEvent, useState } from 'react';

const errors: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no coinciden.',
  account_temporarily_locked: 'La cuenta está bloqueada temporalmente. Intenta nuevamente en 15 minutos.',
  identity_service_unreachable: 'No pudimos conectar con el servicio de acceso. Intenta de nuevo.',
};

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'login_failed');
      window.location.replace('/');
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'login_failed';
      setError(errors[code] || 'No fue posible iniciar sesión. Verifica los datos e intenta nuevamente.');
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Family Care">
        <div className="auth-brand"><Image src="/app-icon.png" alt="" width={54} height={54} priority /><span><strong>Family Care</strong><small>Salud en familia</small></span></div>
        <div className="auth-story-copy"><p className="eyebrow">EXPEDIENTE FAMILIAR PRIVADO</p><h1>La historia de salud de tu familia, siempre a mano.</h1><p>Citas, medicamentos, laboratorios, documentos y alertas reunidos en un espacio sencillo y protegido.</p></div>
        <div className="auth-trust"><span>✓</span><div><strong>Sesión cifrada y revocable</strong><small>La contraseña se protege con Argon2id y nunca se almacena en texto legible.</small></div></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading"><span className="auth-lock">⌁</span><p className="eyebrow">ACCESO PRIVADO</p><h2>Bienvenido</h2><p>Ingresa con el correo autorizado para tu familia.</p></div>
          <form onSubmit={submit} className="auth-form">
            <label><span>Correo electrónico</span><input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@correo.com" /></label>
            <label><span>Contraseña</span><div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{visible ? 'Ocultar' : 'Ver'}</button></div></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Verificando…' : 'Ingresar a Family Care'}</button>
          </form>
          <div className="auth-help"><strong>¿Es tu primer ingreso?</strong><span>Usa el enlace de activación que te compartió el administrador familiar.</span></div>
        </div>
        <p className="auth-footnote">Este acceso no sustituye servicios de emergencia. En Panamá, ante una urgencia llama al 911.</p>
      </section>
    </main>
  );
}
