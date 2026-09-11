'use client';

import { useState } from 'react';
import type { Notify } from '@/components/family-care/types';

type ShareResult = {
  id: string;
  url: string;
  pin: string;
  expiresAt: string;
  patientName: string;
};

export function ShareRecordModal({
  patientId,
  patientName,
  onClose,
  onNotice,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  onNotice: Notify;
}) {
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function createShare() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/family-care/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId, expiresInMinutes }),
      });
      const payload = await response.json() as ShareResult | { error: string };
      if (!response.ok || !('url' in payload)) throw new Error('error' in payload ? payload.error : 'share_failed');
      setResult(payload);
    } catch {
      setError('No fue posible crear el enlace. Verifica la conexión e inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    onNotice(`${label} copiado.`);
  }

  async function revoke() {
    if (!result) return;
    setLoading(true);
    try {
      const response = await fetch('/api/family-care/shares/' + encodeURIComponent(result.id), { method: 'DELETE' });
      if (!response.ok) throw new Error('revoke_failed');
      onNotice('Enlace revocado correctamente.');
      onClose();
    } catch {
      setError('No fue posible revocar el enlace.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close-modal" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <span className="share-mark" aria-hidden="true">↗</span>
      <p className="eyebrow">ACCESO MÉDICO TEMPORAL</p>
      <h2 id="share-title">Compartir expediente de {patientName}</h2>
      {!result ? <>
        <p>Se mostrará un resumen clínico de solo lectura. Pólizas, auditoría, identificadores y documentos originales quedan excluidos.</p>
        <label className="share-label" htmlFor="share-expiry">Caducidad del enlace</label>
        <select id="share-expiry" value={expiresInMinutes} onChange={(event) => setExpiresInMinutes(Number(event.target.value))}>
          <option value={15}>15 minutos</option>
          <option value={60}>1 hora</option>
          <option value={240}>4 horas</option>
          <option value={1440}>24 horas</option>
        </select>
        <div className="share-security-note"><strong>Protección adicional</strong><span>El médico necesitará también un PIN de 6 dígitos. Envíalo por un canal diferente.</span></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <button className="primary-action share-submit" disabled={loading} type="button" onClick={createShare}>{loading ? 'Creando…' : 'Generar enlace seguro'}</button>
      </> : <>
        <p>Enlace creado. Caduca el {new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.expiresAt))}.</p>
        <label className="share-label">Enlace médico</label>
        <div className="share-copy-row"><input value={result.url} readOnly aria-label="Enlace médico"/><button type="button" onClick={() => copy(result.url, 'Enlace')}>Copiar</button></div>
        <label className="share-label">PIN (enviar por separado)</label>
        <div className="share-pin"><strong>{result.pin}</strong><button type="button" onClick={() => copy(result.pin, 'PIN')}>Copiar PIN</button></div>
        <div className="share-actions"><a href={result.url} target="_blank" rel="noreferrer">Abrir vista médica</a><button type="button" disabled={loading} onClick={revoke}>Revocar enlace</button></div>
        {error && <p className="share-error" role="alert">{error}</p>}
        <p className="share-help">Tras introducir el PIN, la vista médica incluye el botón “Imprimir / Guardar como PDF”.</p>
      </>}
    </section>
  </div>;
}
