const {
  normalizeDateInput,
  phoneFromChatId,
  YES,
  NO,
} = require("../utils/dates");
const { getFreeTimes, suggestNextDates, promptDates, showSlots } = require("./availability");

function createFlows({ api, sessions, locale, localeName, settings }) {
  async function listServicesMessage(services) {
    const sorted = [...services].sort((a, b) => (a.position || 0) - (b.position || 0));
    let text = locale.chooseService;
    sorted.forEach((service) => {
      text += `${service.position}. ${service.name}\n`;
    });
    return text;
  }

  async function startBooking(chatId, services, send) {
    if (!services.length) {
      await send(locale.servicesUnavailable);
      return;
    }
    await sessions.clear(chatId);
    await send(await listServicesMessage(services));
    await sessions.set(chatId, { step: "choose_service" });
  }

  async function handleChooseService(chatId, message, services, send) {
    const session = (await sessions.get(chatId)) || {};
    const position = Number(message);
    const service = services.find((item) => Number(item.position) === position);
    if (!service) {
      await send(locale.invalidService);
      return;
    }
    session.service = service;
    const res = await api.get(`/api/services/${service.id}/stylists`, { params: { active: true } });
    const stylists = res.data || [];
    if (!stylists.length) {
      await send(locale.noStylists);
      await sessions.clear(chatId);
      return;
    }
    let text = locale.chooseStylist;
    stylists.forEach((stylist, index) => {
      text += `${index + 1}. ${stylist.name}\n`;
    });
    session.stylists = stylists;
    session.step = "choose_stylist";
    await sessions.set(chatId, session);
    await send(text);
  }

  async function handleChooseStylist(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const stylists = session.stylists || [];
    const index = Number(message) - 1;
    if (Number.isNaN(index) || index < 0 || index >= stylists.length) {
      await send(locale.invalidNumber);
      return;
    }
    const selected = stylists[index];
    session.stylist_id = selected.id;
    session.stylist_name = selected.name;
    session.calendar_id = selected.calendar_id;
    sessions.resetDateTime(session);
    const duration = session.service?.duration || 30;
    const suggestions = await suggestNextDates(
      api,
      undefined,
      duration,
      session.stylist_id,
    );
    session.suggested_dates = suggestions.map((item) => item.date);
    session.step = "enter_date";
    await sessions.set(chatId, session);
    await send(locale.stylistSelected(selected.name));
    await promptDates(send, locale, localeName, selected.name, suggestions);
  }

  async function handleEnterDate(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const trimmed = String(message || "").trim();
    let date = normalizeDateInput(trimmed);
    if (!date && /^\d+$/.test(trimmed) && session.suggested_dates) {
      const picked = session.suggested_dates[Number(trimmed) - 1];
      if (picked) date = picked;
    }
    if (!date) {
      await send(locale.enterDate);
      return;
    }
    const duration = session.service?.duration || 30;
    const { slots, reason } = await getFreeTimes(api, {
      date,
      duration,
      stylistId: session.stylist_id,
    });
    session.date = date;
    session.available_slots = slots;
    if (!(await showSlots(send, locale, date, slots, reason))) {
      session.step = "enter_date";
      await sessions.set(chatId, session);
      return;
    }
    session.step = "choose_time";
    await sessions.set(chatId, session);
  }

  async function handleChooseTime(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const slots = session.available_slots || [];
    const trimmed = String(message || "").trim();
    let time = null;
    if (/^\d{1,2}:\d{2}$/.test(trimmed) && slots.includes(trimmed.padStart(5, "0"))) {
      time = trimmed.padStart(5, "0");
    } else if (/^\d+$/.test(trimmed)) {
      time = slots[Number(trimmed) - 1] || null;
    }
    if (!time) {
      await send(locale.invalidNumber);
      return;
    }
    session.time = time;
    session.step = "enter_name";
    await sessions.set(chatId, session);
    await send(locale.enterName);
  }

  async function handleEnterName(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const name = String(message || "").trim();
    if (!name) {
      await send(locale.enterName);
      return;
    }
    const phone = phoneFromChatId(chatId);
    const start = `${session.date}T${session.time}:00`;
    const res = await api.post("/api/appointments", {
      name,
      phone,
      service_id: session.service.id,
      stylist_id: session.stylist_id,
      start,
    });
    const code = res.data?.reservation_code;
    const template =
      (await settings.get("booking_text")) ||
      "Appointment confirmed.\n{service}\n{date} at {time}\n{name}\nReservation code: {code}";
    const text = template
      .replace("{service}", session.service.name)
      .replace("{date}", session.date)
      .replace("{time}", session.time)
      .replace("{name}", name)
      .replace("{code}", code || "");
    await send(text);
    await sessions.clear(chatId);
  }

  async function startCancel(chatId, message, send) {
    const parts = String(message || "").trim().split(/\s+/);
    const maybeCode = parts.length > 1 ? parts.slice(1).join(" ") : "";
    if (maybeCode) {
      await confirmExisting(chatId, maybeCode, "confirm_cancel", send);
      return;
    }
    await sessions.set(chatId, { step: "enter_cancel_code" });
    await send(locale.askCodeCancel);
  }

  async function startChange(chatId, message, send) {
    const parts = String(message || "").trim().split(/\s+/);
    const maybeCode = parts.length > 1 ? parts.slice(1).join(" ") : "";
    if (maybeCode) {
      await confirmExisting(chatId, maybeCode, "change_date", send);
      return;
    }
    await sessions.set(chatId, { step: "enter_change_code" });
    await send(locale.askCodeChange);
  }

  async function confirmExisting(chatId, code, nextStep, send) {
    const phone = phoneFromChatId(chatId);
    try {
      const res = await api.get(`/api/appointments/${encodeURIComponent(code)}`, { params: { phone } });
      const appt = res.data;
      const summary = `${appt.service} – ${appt.date} ${appt.time} (${appt.reservation_code})`;
      if (nextStep === "confirm_cancel") {
        await sessions.set(chatId, { step: "confirm_cancel", code: appt.reservation_code });
        await send(locale.confirmCancel(summary));
      } else {
        await sessions.set(chatId, {
          step: "change_date",
          code: appt.reservation_code,
          service: { duration: appt.duration },
          stylist_id: appt.stylist_id,
          stylist_name: appt.stylist_name,
        });
        await send(locale.confirmChange(summary));
        const suggestions = await suggestNextDates(api, undefined, appt.duration || 30, appt.stylist_id);
        const session = (await sessions.get(chatId)) || {};
        session.suggested_dates = suggestions.map((item) => item.date);
        session.step = "change_date";
        await sessions.set(chatId, session);
        await promptDates(send, locale, localeName, appt.stylist_name, suggestions);
      }
    } catch {
      await send(locale.notFound);
      await sessions.clear(chatId);
    }
  }

  async function handleCancelCode(chatId, message, send) {
    await confirmExisting(chatId, String(message).trim(), "confirm_cancel", send);
  }

  async function handleConfirmCancel(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const answer = String(message || "").trim().toLowerCase();
    if (NO.has(answer)) {
      await sessions.clear(chatId);
      await send(locale.sessionEnded);
      return;
    }
    if (!YES.has(answer)) {
      await send(locale.confirmCancel(session.code || ""));
      return;
    }
    await api.delete(`/api/appointments/${encodeURIComponent(session.code)}`);
    await send((await settings.get("cancel_text")) || locale.cancelled);
    await sessions.clear(chatId);
  }

  async function handleChangeCode(chatId, message, send) {
    await confirmExisting(chatId, String(message).trim(), "change_date", send);
  }

  async function handleChangeDate(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const trimmed = String(message || "").trim();
    let date = normalizeDateInput(trimmed);
    if (!date && /^\d+$/.test(trimmed) && session.suggested_dates) {
      date = session.suggested_dates[Number(trimmed) - 1];
    }
    if (!date) {
      await send(locale.enterDate);
      return;
    }
    const { slots, reason } = await getFreeTimes(api, {
      date,
      duration: session.service?.duration || 30,
      stylistId: session.stylist_id,
    });
    session.date = date;
    session.available_slots = slots;
    if (!(await showSlots(send, locale, date, slots, reason))) {
      await sessions.set(chatId, session);
      return;
    }
    session.step = "change_time";
    await sessions.set(chatId, session);
  }

  async function handleChangeTime(chatId, message, send) {
    const session = (await sessions.get(chatId)) || {};
    const slots = session.available_slots || [];
    const trimmed = String(message || "").trim();
    let time = null;
    if (/^\d{1,2}:\d{2}$/.test(trimmed) && slots.includes(trimmed.padStart(5, "0"))) {
      time = trimmed.padStart(5, "0");
    } else if (/^\d+$/.test(trimmed)) {
      time = slots[Number(trimmed) - 1] || null;
    }
    if (!time) {
      await send(locale.invalidNumber);
      return;
    }
    await api.put(`/api/appointments/${encodeURIComponent(session.code)}`, {
      new_date: session.date,
      new_time: time,
    });
    await send(`${session.date} ${time}`);
    await sessions.clear(chatId);
  }

  return {
    startBooking,
    handleChooseService,
    handleChooseStylist,
    handleEnterDate,
    handleChooseTime,
    handleEnterName,
    startCancel,
    startChange,
    handleCancelCode,
    handleConfirmCancel,
    handleChangeCode,
    handleChangeDate,
    handleChangeTime,
  };
}

module.exports = { createFlows };
