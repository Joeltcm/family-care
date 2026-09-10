'use client';

import { useEffect, useState } from 'react';
import type { Notify } from '@/components/family-care/types';
import { disablePushNotifications, enablePushNotifications, pushNotificationState } from '@/lib/client/push-notifications';

export function NotificationPrompt({ onNotice }: { onNotice: Notify }) {
  const [state, setState] = useState<'checking' | 'unsupported' | 'off' | 'denied' | 'on'>('checking');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    pushNotificationState().then((value) => {
      setState(!value.supported ? 'unsupported' : value.subscribed ? 'on' : value.permission === 'denied' ? 'denied' : 'off');
    }).catch(() => setState('off'));
  }, []);

  async function toggle() {
    setWorking(true);
    try {
      if (state === 'on') {
        await disablePushNotifications();
        setState('off');
        onNotice('Alertas desactivadas en este dispositivo.', 'warning');
      } else {
        await enablePushNotifications();
        setState('on');
        onNotice('Alertas push activadas. Recibirás una notificación de prueba.');
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'push_permission_denied') setState('denied');
      onNotice(code === 'push_not_configured'
        ? 'Las alertas están preparadas, pero falta activar las claves del servidor.'
        : code === 'push_permission_denied'
          ? 'El navegador bloqueó las notificaciones. Puedes habilitarlas en sus ajustes.'
          : 'No fue posible activar las alertas en este dispositivo.', 'warning');
    } finally {
      setWorking(false);
    }
  }

  if (state === 'unsupported') return <div className="notification-strip muted"><span>◌</span><div><strong>Alertas no disponibles</strong><small>Este navegador no ofrece Web Push.</small></div></div>;
  return <div className={`notification-strip ${state === 'on' ? 'enabled' : ''}`}><span>◌</span><div><strong>{state === 'on' ? 'Alertas activas' : state === 'denied' ? 'Alertas bloqueadas' : 'Recibe recordatorios'}</strong><small>{state === 'on' ? 'Este dispositivo recibirá avisos privados.' : 'Los avisos no muestran diagnósticos ni nombres de medicamentos.'}</small></div><button type="button" disabled={working || state === 'checking' || state === 'denied'} onClick={toggle}>{working ? 'Procesando…' : state === 'on' ? 'Desactivar' : 'Activar'}</button></div>;
}
