export type ApiStatus = 'checking' | 'connected' | 'unavailable';

export function ApiStatusChip({ status, authenticated = false }: { status: ApiStatus; authenticated?: boolean }) {
  const label = authenticated
    ? 'Cuenta protegida · métricas demo'
    : status === 'connected'
      ? 'API conectada · datos demo'
      : status === 'checking'
        ? 'Verificando API'
        : 'Datos de demostración';
  return <span className={`demo-chip api-${status}`}><i aria-hidden="true" />{label}</span>;
}
