export type ApiStatus = 'checking' | 'connected' | 'unavailable';

export function ApiStatusChip({ status }: { status: ApiStatus }) {
  const label = status === 'connected' ? 'API conectada · datos demo' : status === 'checking' ? 'Verificando API' : 'Datos de demostración';
  return <span className={`demo-chip api-${status}`}><i aria-hidden="true" />{label}</span>;
}
