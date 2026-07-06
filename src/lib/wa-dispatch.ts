// Dispatcher conversacional al ERP — capa 3 del comercio conversacional por WhatsApp
// (sector AGENCIA DIGITAL, satélite del ERP). Toma el mensaje del cliente, lo pasa por
// el router de intención (`wa-intent`) y ORQUESTA la conversación contra el ERP:
// slot-filling del turno (servicio → fecha → hora → confirmación), consulta de precios
// y horarios, link de pago, factura y handoff a humano.
//
// Diseño con PUERTOS inyectados (`WaPorts`): el dispatcher es orquestación PURA y
// determinista dado (estado, mensaje, resultados de los puertos). Las Server Actions
// reales del ERP (createAppointment / getAvailableSlots / plugin Mercado Pago / plugin
// ARCA) las implementa un adaptador delgado en el handler HTTP — acá se testea con
// puertos falsos, sin DB ni red. `now` se inyecta (fechas relativas deterministas).
//
// Alcance del prototipo: BOOK completo (con confirmación y creación), PRICE, HOURS,
// PAY, INVOICE, HUMAN, GREETING. CANCEL/RESCHEDULE se reconocen y derivan a humano
// porque requieren identificar el turno existente del cliente (lookup por teléfono),
// que se cablea cuando exista ese puerto — el flujo de slot-filling ya queda listo
// para reutilizarse en el reagendado.

import { parseWaMessage, type WaServiceRef } from "./wa-intent";

// --- Puertos al ERP (los implementa el adaptador con las Server Actions reales) ---

export type WaServiceInfo = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  aliases?: string[];
};

export type WaPorts = {
  // catálogo del tenant (para matchear servicio, listar precios y resolver id).
  listServices: () => Promise<WaServiceInfo[]>;
  // slots disponibles ("HH:MM") para un servicio y una fecha ISO.
  availableSlots: (serviceId: string, dateISO: string) => Promise<string[]>;
  // crea el turno y devuelve su id (o lanza si el slot se ocupó recién).
  createBooking: (input: { serviceId: string; dateISO: string; time: string; from: string }) => Promise<{ id: string }>;
  // link de pago de Mercado Pago para el cliente.
  createPaymentLink: (input: { from: string }) => Promise<{ url: string }>;
  // horarios y dirección del negocio, ya en texto.
  businessInfo: () => Promise<{ hours: string; address: string }>;
};

// --- Estado de conversación (lo persiste el adaptador por teléfono) ---

export type WaFlow = "idle" | "booking" | "confirm_booking";

export type WaDraft = {
  serviceId?: string;
  serviceName?: string;
  dateISO?: string;
  time?: string;
};

export type WaSessionState = {
  flow: WaFlow;
  draft: WaDraft;
};

export const INITIAL_STATE: WaSessionState = { flow: "idle", draft: {} };

// --- Salida ---

export type WaEffect =
  | { kind: "none" }
  | { kind: "booking_created"; appointmentId: string; serviceName: string; dateISO: string; time: string }
  | { kind: "payment_link"; url: string }
  | { kind: "invoice_requested" };

export type WaReply = {
  // texto a enviar al cliente.
  text: string;
  // estado siguiente (a persistir por teléfono).
  state: WaSessionState;
  // efecto ejecutado contra el ERP (para trazar/testear).
  effect: WaEffect;
  // ¿derivar a un agente humano?
  handoff: boolean;
};

export type DispatchContext = {
  now: Date;
  from: string; // teléfono del cliente (para crear turno / link)
  ports: WaPorts;
};

// --- Orquestador principal ----------------------------------------------------

export async function dispatch(
  text: string,
  state: WaSessionState,
  ctx: DispatchContext,
): Promise<WaReply> {
  const services = await ctx.ports.listServices();
  const serviceRefs: WaServiceRef[] = services.map((s) => ({ name: s.name, aliases: s.aliases }));
  const intent = parseWaMessage(text, { now: ctx.now, services: serviceRefs });
  const inFlow = state.flow === "booking" || state.flow === "confirm_booking";
  const hasSlot = Boolean(intent.entities.service || intent.entities.date || intent.entities.time);

  // 1) Pedido explícito de humano → handoff siempre (aunque esté reservando).
  if (intent.kind === "HUMAN") {
    return reply("Te paso con alguien del equipo. Aguardá un momento 🙂", INITIAL_STATE, { kind: "none" }, true);
  }

  // 2) Confirmación en curso: sí crea el turno, no lo descarta. Cualquier otra cosa
  //    se reinterpreta como intención nueva más abajo.
  if (state.flow === "confirm_booking") {
    if (intent.kind === "AFFIRM") return confirmBooking(state, ctx);
    if (intent.kind === "DENY") {
      return reply(
        "Sin problema, no lo reservo. ¿Querés que busque otro día u horario?",
        { flow: "booking", draft: { ...state.draft, time: undefined } },
        { kind: "none" },
        false,
      );
    }
  }

  // 3) Intenciones directas (desde cualquier flujo). Si estaba reservando, PRICE/HOURS
  //    responden sin perder el borrador (para poder retomar la reserva después).
  switch (intent.kind) {
    case "PRICE":
      return priceReply(services, intent.entities.service?.name, inFlow ? state : INITIAL_STATE);
    case "HOURS": {
      const info = await ctx.ports.businessInfo();
      return reply(`📍 ${info.address}\n🕒 ${info.hours}`, inFlow ? state : INITIAL_STATE, { kind: "none" }, false);
    }
    case "PAY": {
      const { url } = await ctx.ports.createPaymentLink({ from: ctx.from });
      return reply(`Podés abonar desde acá: ${url}`, INITIAL_STATE, { kind: "payment_link", url }, false);
    }
    case "INVOICE":
      return reply(
        "Perfecto, te preparo la factura. Un asesor la emite y te la envía.",
        INITIAL_STATE,
        { kind: "invoice_requested" },
        false,
      );
    case "CANCEL":
    case "RESCHEDULE":
      // Requiere identificar el turno existente del cliente (lookup por teléfono):
      // fuera del alcance del prototipo → handoff. El slot-filling de abajo ya queda
      // listo para reutilizarse en el reagendado cuando exista ese puerto.
      return reply(
        intent.kind === "CANCEL"
          ? "Para cancelar tu turno te paso con el equipo así lo hacen al instante."
          : "Para reprogramar te paso con el equipo. Decime también qué día te queda mejor.",
        INITIAL_STATE,
        { kind: "none" },
        true,
      );
    case "GREETING":
      if (state.flow === "idle") return greetingReply();
      break; // mid-reserva un "hola" no corta el flujo → sigue al slot-filling
  }

  // 4) Slot-filling: si estamos reservando, si el cliente pidió un turno, o si el
  //    mensaje trae algún dato de turno (servicio/fecha/hora), avanzamos la reserva.
  //    Un mensaje suelto que responde un slot llega como UNKNOWN pero trae la entidad.
  if (inFlow || intent.kind === "BOOK" || hasSlot) {
    return bookingFlow(state, intent.entities, ctx);
  }

  // 5) Nada accionable desde idle → a una persona (nunca dejar al cliente sin respuesta).
  return reply(
    "No te entendí del todo. Te derivo con una persona que te ayuda mejor.",
    INITIAL_STATE,
    { kind: "none" },
    true,
  );
}

// --- Sub-flujos ---------------------------------------------------------------

async function bookingFlow(
  state: WaSessionState,
  entities: ReturnType<typeof parseWaMessage>["entities"],
  ctx: DispatchContext,
): Promise<WaReply> {
  const services = await ctx.ports.listServices();
  const draft: WaDraft = { ...state.draft };

  // servicio: si el intent trajo uno, resolver su id.
  if (entities.service) {
    const svc = services.find((s) => s.name === entities.service!.name);
    if (svc) {
      draft.serviceId = svc.id;
      draft.serviceName = svc.name;
    }
  }
  if (entities.date) draft.dateISO = entities.date;
  if (entities.time) draft.time = entities.time;

  // pedir el primer slot faltante, en orden.
  if (!draft.serviceId) {
    return reply(
      `Dale, ¿para qué servicio? ${serviceMenu(services)}`,
      { flow: "booking", draft },
      { kind: "none" },
      false,
    );
  }
  if (!draft.dateISO) {
    return reply(
      `Perfecto, ${draft.serviceName}. ¿Qué día te viene bien? (ej. "mañana", "el viernes")`,
      { flow: "booking", draft },
      { kind: "none" },
      false,
    );
  }
  if (!draft.time) {
    const slots = await ctx.ports.availableSlots(draft.serviceId, draft.dateISO);
    if (slots.length === 0) {
      return reply(
        `Uy, no me quedan horarios para el ${draft.dateISO}. ¿Probamos otro día?`,
        { flow: "booking", draft: { ...draft, dateISO: undefined } },
        { kind: "none" },
        false,
      );
    }
    return reply(
      `Para el ${draft.dateISO} tengo: ${slots.join(", ")}. ¿Cuál te sirve?`,
      { flow: "booking", draft },
      { kind: "none" },
      false,
    );
  }

  // todo completo → confirmar antes de crear.
  return reply(
    `Confirmame: ${draft.serviceName} el ${draft.dateISO} a las ${draft.time}. ¿Lo reservo? (sí/no)`,
    { flow: "confirm_booking", draft },
    { kind: "none" },
    false,
  );
}

async function confirmBooking(state: WaSessionState, ctx: DispatchContext): Promise<WaReply> {
  const { serviceId, serviceName, dateISO, time } = state.draft;
  if (!serviceId || !serviceName || !dateISO || !time) {
    // estado inconsistente (no debería pasar): reiniciar con seguridad.
    return reply("Retomemos: ¿qué servicio querés reservar?", { flow: "booking", draft: {} }, { kind: "none" }, false);
  }
  try {
    const { id } = await ctx.ports.createBooking({ serviceId, dateISO, time, from: ctx.from });
    return reply(
      `¡Listo! Te reservé ${serviceName} el ${dateISO} a las ${time}. Te espero 🙌`,
      INITIAL_STATE,
      { kind: "booking_created", appointmentId: id, serviceName, dateISO, time },
      false,
    );
  } catch {
    // el slot pudo ocuparse entre la oferta y la confirmación.
    return reply(
      "Se me ocupó ese horario justo recién 😕. ¿Buscamos otro?",
      { flow: "booking", draft: { ...state.draft, time: undefined } },
      { kind: "none" },
      false,
    );
  }
}

// --- Respuestas simples -------------------------------------------------------

function greetingReply(): WaReply {
  return reply(
    "¡Hola! 👋 Puedo ayudarte a sacar un turno, ver precios y horarios, o pasarte con una persona. ¿Qué necesitás?",
    INITIAL_STATE,
    { kind: "none" },
    false,
  );
}

function priceReply(services: WaServiceInfo[], onlyName: string | undefined, keepState: WaSessionState): WaReply {
  const list = onlyName ? services.filter((s) => s.name === onlyName) : services;
  const shown = list.length ? list : services;
  const lines = shown.map((s) => `• ${s.name}: $${s.price.toLocaleString("es-AR")}`).join("\n");
  return reply(`Estos son los precios:\n${lines}\n¿Querés que te reserve alguno?`, keepState, { kind: "none" }, false);
}

function serviceMenu(services: WaServiceInfo[]): string {
  return services.map((s) => s.name).join(" / ");
}

function reply(text: string, state: WaSessionState, effect: WaEffect, handoff: boolean): WaReply {
  return { text, state, effect, handoff };
}
