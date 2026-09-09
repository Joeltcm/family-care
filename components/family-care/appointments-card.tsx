import { appointments } from '@/lib/demo-data';

export function AppointmentsCard({ onOpen }: { onOpen: () => void }) {
  return <article className="panel appointments-panel"><div className="panel-heading"><div><p className="eyebrow">PRÓXIMAMENTE</p><h2>Citas familiares</h2></div><button type="button" className="add-button" aria-label="Agregar cita">+</button></div><div className="appointment-list">{appointments.map((appointment) => <div className="appointment" key={appointment.title}><div className={`date-block ${appointment.tone}`}><strong>{appointment.day}</strong><span>{appointment.month}</span></div><div className="appointment-info"><span>{appointment.time} · {appointment.person}</span><strong>{appointment.title}</strong><small>{appointment.specialty} · {appointment.place}</small></div></div>)}</div><button type="button" className="full-button" onClick={onOpen}>Abrir calendario</button></article>;
}
