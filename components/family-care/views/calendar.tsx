import { AppointmentsCard } from '@/components/family-care/appointments-card';
import { PageHeading } from '@/components/family-care/page-heading';
import type { Notify } from '@/components/family-care/types';

export function Calendar({ onNotice }: { onNotice: Notify }) {
  return <><PageHeading eyebrow="AGENDA FAMILIAR" title="Citas y controles" copy="Incluye medicina general, laboratorios y visitas a cualquier especialista." action={<button className="primary-action" type="button" onClick={() => onNotice('Nueva cita preparada en modo demostración.')}>＋ Nueva cita</button>} /><div className="calendar-layout"><section className="panel month-panel"><div className="month-title"><button type="button" aria-label="Mes anterior">‹</button><h2>Septiembre 2026</h2><button type="button" aria-label="Mes siguiente">›</button></div><div className="calendar-grid">{['L','M','M','J','V','S','D'].map((day, index) => <strong key={`${day}-${index}`}>{day}</strong>)}{Array.from({ length: 35 }, (_, index) => index - 1).map((day, index) => <button type="button" className={[12,18,25].includes(day) ? 'has-event' : ''} key={index}>{day > 0 && day <= 30 ? day : ''}</button>)}</div></section><aside><AppointmentsCard onOpen={() => onNotice('Ya estás viendo el calendario completo.')} /></aside></div></>;
}
