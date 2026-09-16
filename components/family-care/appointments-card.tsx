import type { Appointment } from '@/lib/care-plan';
import type { FamilyCarePatient } from '@/lib/family-care-session';

export function AppointmentsCard({ appointments, loading, error, onOpen }: { appointments: { patient: FamilyCarePatient; appointment: Appointment }[]; loading: boolean; error: boolean; onOpen: () => void }) {
  const upcoming = appointments.filter(({ appointment }) => appointment.status === 'scheduled' && new Date(appointment.startsAt).getTime() >= Date.now()).sort((a, b) => a.appointment.startsAt.localeCompare(b.appointment.startsAt)).slice(0, 3);
  return <article className="panel appointments-panel"><div className="panel-heading"><div><p className="eyebrow">PRÓXIMAMENTE</p><h2>Citas próximas</h2></div><button type="button" className="add-button" aria-label="Abrir calendario" onClick={onOpen}>+</button></div><div className="appointment-list">{upcoming.length ? upcoming.map(({ patient, appointment }) => {
    const date = new Date(appointment.startsAt);
    return <div className="appointment" key={appointment.id}><div className="date-block blue"><strong>{new Intl.DateTimeFormat('es-PA', { day: 'numeric', timeZone: 'America/Panama' }).format(date)}</strong><span>{new Intl.DateTimeFormat('es-PA', { month: 'short', timeZone: 'America/Panama' }).format(date).toUpperCase()}</span></div><div className="appointment-info"><span>{new Intl.DateTimeFormat('es-PA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Panama' }).format(date)} · {patient.preferredName || patient.legalName}</span><strong>{appointment.reason}</strong><small>{[appointment.specialty, appointment.facilityName].filter(Boolean).join(' · ') || 'Sin lugar o especialidad registrados'}</small></div></div>;
  }) : <p className="dashboard-data-message">{loading ? 'Cargando citas…' : error ? 'No se pudieron cargar las citas.' : 'No hay citas próximas registradas.'}</p>}</div><button type="button" className="full-button" onClick={onOpen}>Abrir calendario</button></article>;
}
