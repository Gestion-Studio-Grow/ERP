import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dispatch,
  INITIAL_STATE,
  type WaPorts,
  type WaServiceInfo,
  type WaSessionState,
  type DispatchContext,
} from "./wa-dispatch";

// jueves 2026-07-02 10:00 local (mismo ancla que wa-intent.test).
const NOW = new Date(2026, 6, 2, 10, 0, 0);

const SERVICES: WaServiceInfo[] = [
  { id: "svc-corte", name: "Corte", price: 8000, durationMin: 30, aliases: ["corte de pelo"] },
  { id: "svc-color", name: "Color", price: 20000, durationMin: 90, aliases: ["tintura"] },
];

// Puertos falsos configurables. Registran las llamadas para poder afirmar efectos.
function fakePorts(over: Partial<WaPorts> = {}): WaPorts {
  return {
    listServices: async () => SERVICES,
    availableSlots: async () => ["15:00", "15:30", "16:00"],
    createBooking: async () => ({ id: "appt-1" }),
    createPaymentLink: async () => ({ url: "https://mpago.la/abc" }),
    businessInfo: async () => ({ hours: "Lun a Sáb 9 a 20", address: "Av. Falsa 123" }),
    ...over,
  };
}

function ctx(over: Partial<WaPorts> = {}): DispatchContext {
  return { now: NOW, from: "5491155551234", ports: fakePorts(over) };
}

async function run(text: string, state: WaSessionState = INITIAL_STATE, c: DispatchContext = ctx()) {
  return dispatch(text, state, c);
}

// --- Intenciones directas -----------------------------------------------------

test("GREETING desde idle da menú de bienvenida", async () => {
  const r = await run("hola");
  assert.match(r.text, /turno/i);
  assert.equal(r.effect.kind, "none");
  assert.equal(r.handoff, false);
  assert.equal(r.state.flow, "idle");
});

test("PRICE lista precios (todos o el pedido)", async () => {
  const all = await run("cuanto sale?");
  assert.match(all.text, /Corte: \$8\.000/);
  assert.match(all.text, /Color: \$20\.000/);

  const one = await run("cuanto sale el color?");
  assert.match(one.text, /Color/);
  assert.doesNotMatch(one.text, /Corte/);
});

test("HOURS devuelve dirección y horarios", async () => {
  const r = await run("a que hora abren?");
  assert.match(r.text, /Av\. Falsa 123/);
  assert.match(r.text, /Lun a Sáb/);
});

test("PAY crea link de pago (efecto payment_link)", async () => {
  const r = await run("quiero pagar");
  assert.equal(r.effect.kind, "payment_link");
  assert.match(r.text, /mpago\.la/);
});

test("INVOICE marca invoice_requested", async () => {
  const r = await run("necesito factura");
  assert.equal(r.effect.kind, "invoice_requested");
});

test("HUMAN → handoff", async () => {
  const r = await run("quiero hablar con una persona");
  assert.equal(r.handoff, true);
});

test("UNKNOWN → handoff, nunca deja colgado", async () => {
  const r = await run("asdkfj qwer");
  assert.equal(r.handoff, true);
});

test("CANCEL/RESCHEDULE derivan a humano (fuera del alcance del prototipo)", async () => {
  assert.equal((await run("quiero cancelar mi turno")).handoff, true);
  assert.equal((await run("necesito reprogramar")).handoff, true);
});

// --- Slot-filling del turno ---------------------------------------------------

test("BOOK sin datos pide el servicio", async () => {
  const r = await run("quiero sacar un turno");
  assert.equal(r.state.flow, "booking");
  assert.match(r.text, /servicio/i);
});

test("BOOK con servicio pide el día", async () => {
  const r = await run("quiero un turno para corte");
  assert.equal(r.state.flow, "booking");
  assert.equal(r.state.draft.serviceId, "svc-corte");
  assert.match(r.text, /d[ií]a/i);
});

test("BOOK con servicio+día ofrece los horarios disponibles", async () => {
  const r = await run("turno para corte el viernes");
  assert.equal(r.state.draft.dateISO, "2026-07-03");
  assert.match(r.text, /15:00/);
  assert.equal(r.state.flow, "booking");
});

test("sin horarios ese día, propone otro día", async () => {
  const c = ctx({ availableSlots: async () => [] });
  const r = await dispatch("turno para corte el viernes", INITIAL_STATE, c);
  assert.match(r.text, /otro d[ií]a/i);
  assert.equal(r.state.draft.dateISO, undefined); // limpia el día para re-preguntar
});

test("BOOK completo pasa a confirmación", async () => {
  const r = await run("turno para corte el viernes a las 15:30");
  assert.equal(r.state.flow, "confirm_booking");
  assert.match(r.text, /reservo/i);
  assert.equal(r.state.draft.time, "15:30");
});

test("flujo multi-turno: acumula slots entre mensajes", async () => {
  let s = INITIAL_STATE;
  let r = await run("hola quiero un turno", s);
  assert.equal(r.state.draft.serviceId, undefined); // pidió servicio
  s = r.state;

  r = await run("corte", s); // responde el servicio
  assert.equal(r.state.draft.serviceId, "svc-corte");
  s = r.state;

  r = await run("el viernes", s); // responde el día
  assert.equal(r.state.draft.dateISO, "2026-07-03");
  s = r.state;

  r = await run("a las 16", s); // responde la hora
  assert.equal(r.state.flow, "confirm_booking");
  assert.equal(r.state.draft.time, "16:00");
});

// --- Confirmación -------------------------------------------------------------

const CONFIRM_STATE: WaSessionState = {
  flow: "confirm_booking",
  draft: { serviceId: "svc-corte", serviceName: "Corte", dateISO: "2026-07-03", time: "15:30" },
};

test("AFFIRM en confirmación crea el turno", async () => {
  const r = await run("dale", CONFIRM_STATE);
  assert.equal(r.effect.kind, "booking_created");
  if (r.effect.kind === "booking_created") {
    assert.equal(r.effect.appointmentId, "appt-1");
    assert.equal(r.effect.time, "15:30");
  }
  assert.equal(r.state.flow, "idle"); // vuelve a idle
});

test("DENY en confirmación no reserva y ofrece cambiar", async () => {
  const r = await run("no", CONFIRM_STATE);
  assert.equal(r.effect.kind, "none");
  assert.equal(r.state.flow, "booking");
});

test("si el slot se ocupó al confirmar, ofrece otro horario", async () => {
  const c = ctx({
    createBooking: async () => {
      throw new Error("slot tomado");
    },
  });
  const r = await dispatch("dale", CONFIRM_STATE, c);
  assert.equal(r.effect.kind, "none");
  assert.equal(r.state.flow, "booking");
  assert.match(r.text, /otro/i);
});

test("crea el turno con el teléfono del contexto", async () => {
  let received: { from?: string } = {};
  const c = ctx({
    createBooking: async (input) => {
      received = input;
      return { id: "appt-9" };
    },
  });
  await dispatch("dale", CONFIRM_STATE, c);
  assert.equal(received.from, "5491155551234");
});
