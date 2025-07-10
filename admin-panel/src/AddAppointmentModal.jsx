import { useForm, Controller } from "react-hook-form";
import axios from "axios";
import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";

export default function AddAppointmentModal({ onClose, onAdd }) {
  const { register, handleSubmit, control, watch, reset } = useForm();
  const [services, setServices] = useState([]);
  const [freeTimes, setFreeTimes] = useState([]);
  const [daysOff, setDaysOff] = useState(["Sunday"]);

  const selectedDate = watch("date");
  const selectedServiceId = watch("service_id");

  useEffect(() => {
    axios
      .get("http://localhost:5000/services")
      .then((res) => setServices(res.data))
      .catch((err) => console.error("Fehler beim Laden der Services:", err));

    axios.get("http://localhost:5000/settings").then((res) => {
      const dayList = res.data.days_off || "Sunday";
      setDaysOff(dayList.split(",").map((d) => d.trim()));
    });
  }, []);

  useEffect(() => {
    const selectedService = services.find((s) => s.id === parseInt(selectedServiceId));
    if (selectedDate && selectedService) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      axios
        .post("http://localhost:5000/free-times", {
          date: dateStr,
          duration: selectedService.duration,
        })
        .then((res) => setFreeTimes(res.data.slots || []))
        .catch((err) => {
          console.error("Fehler beim Abrufen der freien Zeiten:", err);
          setFreeTimes([]);
        });
    }
  }, [selectedDate, selectedServiceId, services]);

  const onSubmit = async (data) => {
    const start = `${format(data.date, "yyyy-MM-dd")}T${data.time}:00`;
    try {
      await axios.post("http://localhost:5000/create-event", {
        name: data.name,
        phone: data.phone,
        service_id: parseInt(data.service_id),
        start,
      });

      onAdd();
      reset();
      onClose();
    } catch (err) {
      console.error("Fehler beim Erstellen:", err);
      alert("Fehler beim Speichern des Termins.");
    }
  };

  const isWorkingDay = (date) => {
    const day = format(date, "EEEE");
    return !daysOff.includes(day);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4"
      >
        <h3 className="text-xl font-bold text-blue-700">➕ Termin hinzufügen</h3>

        <div>
          <label className="block text-sm font-medium">👤 Name</label>
          <input
            {...register("name", { required: true })}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">📞 Telefonnummer</label>
          <input
            {...register("phone", { required: true })}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">💈 Service</label>
          <select
            {...register("service_id", { required: true })}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">-- auswählen --</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">📅 Datum</label>
          <Controller
            name="date"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <DatePicker
                {...field}
                selected={field.value}
                onChange={(date) => field.onChange(date)}
                filterDate={isWorkingDay}
                minDate={new Date()}
                placeholderText="Datum auswählen"
                dateFormat="yyyy-MM-dd"
                className="w-full border px-3 py-2 rounded"
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">🕒 Uhrzeit</label>
          <select
            {...register("time", { required: true })}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">-- auswählen --</option>
            {freeTimes.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
