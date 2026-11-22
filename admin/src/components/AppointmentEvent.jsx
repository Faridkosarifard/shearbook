import { appointmentTooltip } from "../calendarHours";

export default function AppointmentEvent({ event }) {
  const row = event.resource || {};
  return (
    <div className="shearbook-event" title={appointmentTooltip(event)}>
      <div className="shearbook-event-name">{row.name || event.title}</div>
      {row.service ? <div className="shearbook-event-service">{row.service}</div> : null}
    </div>
  );
}
