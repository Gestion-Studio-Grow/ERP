"use server";

import { prisma } from "@/lib/prisma";
import { bookingTransaction } from "@/lib/rls";
import { revalidatePath } from "next/cache";
import { auditPublic } from "@/lib/audit-core";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { getPublicBookingData, type ResultadoAccion } from "@/lib/actions";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { validateBookingContact } from "@/lib/contact-validation";
import { fichaQueChoca, normalizarTelefono } from "@/lib/clientes/telefono";
import { crearFichaEnTx } from "@/lib/clientes/crear-ficha";
import { leerMiTurno } from "@/lib/turnos/mi-turno";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { enInicioPorApps } from "@/app/admin/(dashboard)/inicio/piloto";
import { getLocation } from "@/lib/settings";
import { nextBusinessDays } from "@/lib/datetime";
import type { BookingData } from "@/app/(site)/_ch/types";
import { cambiosDeFicha, validarFichaFiscal } from "@/lib/fiscal/ficha-fiscal";

// Es un endpoint PÚBLICO ("use server" + lo llama la página del turno, sin sesión): quien
// tenga el link del turno lo puede invocar. Por eso NO trae la ficha de la clienta —notas,
// email, teléfono— ni los datos de la profesional (email, teléfono, comisión): sólo lo que la
// página muestra (`SELECT_MI_TURNO`, turnos/mi-turno.ts), siempre dentro del negocio.
export async function getMyAppointment(id: string) {
  return leerMiTurno(prisma, await getCurrentTenantId(), String(id ?? ""));
}

export async function createReview(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();

  if (rating < 1 || rating > 5) {
    throw new Error("La calificación debe ser de 1 a 5 estrellas.");
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, review: true },
  });

  if (appointment.status !== "COMPLETED") {
    throw new Error("Solo se puede dejar una reseña de un turno ya realizado.");
  }
  if (appointment.review) {
    throw new Error("Ya dejaste una reseña para este turno.");
  }

  const review = await prisma.review.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId,
      professionalId: appointment.professionalId,
      clientName: appointment.client.name,
      rating,
      comment: comment || null,
    },
  });

  await auditPublic({
    action: "create",
    entity: "Review",
    entityId: review.id,
    clientPhone: appointment.client.phone,
    changes: { rating, appointmentId },
  });

  revalidatePath(`/reserva/turno/${appointmentId}`);
}

export async function cancelMyAppointment(formData: FormData) {
  const id = String(formData.get("id"));

  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id } });

  if (appointment.status === "CANCELLED") {
    throw new Error("Este turno ya estaba cancelado.");
  }
  if (appointment.status === "COMPLETED") {
    throw new Error("Este turno ya se realizó, no se puede cancelar.");
  }
  if (appointment.startsAt.getTime() < Date.now()) {
    throw new Error("No se puede cancelar un turno que ya pasó.");
  }

  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  await auditPublic({ action: "cancel", entity: "Appointment", entityId: id });
  revalidatePath(`/reserva/turno/${id}`);
  revalidatePath("/admin/turnos");
}

// El cliente mueve su propio turno a otra fecha/hora desde el link de "Tu turno",
// sin cancelar + volver a reservar (que le hacía perder el horario si otro lo
// tomaba en el medio). Conserva profesional, servicio, precio congelado, estado y
// pago: solo cambia el horario. La validación de choques es la misma del alta
// (assertSlotAvailable), excluyendo el propio turno. No usa requireCapability: es
// acción pública, autorizada por poseer el id del turno (igual que cancelar).
export async function rescheduleMyAppointment(formData: FormData) {
  const id = String(formData.get("id"));
  const startsAtIso = String(formData.get("startsAt"));
  if (!id || !startsAtIso) {
    throw new Error("Elegí un nuevo horario para reprogramar.");
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { service: true, professional: { include: { box: true } } },
  });

  // Mismos estados que se pueden cancelar: solo turnos vivos y futuros.
  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    throw new Error("Este turno no se puede reprogramar.");
  }
  if (appointment.startsAt.getTime() < Date.now()) {
    throw new Error("No se puede reprogramar un turno que ya pasó.");
  }

  const startsAt = new Date(startsAtIso);
  if (startsAt.getTime() < Date.now()) {
    throw new Error("Elegí un horario futuro.");
  }
  const endsAt = new Date(startsAt.getTime() + appointment.service.durationMin * 60000);

  const { professional } = appointment;
  if (!professional.active || professional.deletedAt) {
    throw new Error("Ese profesional ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new Error("Ese profesional no tiene un box activo asignado.");
  }
  const boxId = professional.boxId;

  // El profesional debe trabajar en ese horario (misma regla que el alta).
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(professional.id, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new Error("Ese horario no está disponible. Elegí otro.");
  }

  await bookingTransaction(async (tx) => {
    await assertSlotAvailable(tx, {
      professionalId: professional.id,
      boxId,
      serviceId: appointment.serviceId,
      startsAt,
      endsAt,
      excludeAppointmentId: id,
    });

    // El recordatorio que ya salió era para la fecha VIEJA: se limpia para que el barrido
    // avise la nueva (igual que la reprogramación desde la agenda, en actions.ts).
    await tx.appointment.update({
      where: { id },
      data: { startsAt, endsAt, reminderSentAt: null },
    });
  });

  await auditPublic({
    action: "reschedule",
    entity: "Appointment",
    entityId: id,
    changes: { from: { startsAt: appointment.startsAt }, to: { startsAt } },
  });

  revalidatePath(`/reserva/turno/${id}`);
  revalidatePath("/admin/turnos");
}

// ============================================================================
// DATOS DEL MODAL DE RESERVA — se piden al abrirlo, no en cada página.
// ============================================================================
//
// Antes el layout del sitio se los pasaba al `BookingProvider` como props. Eso
// significaba serializar los ~70 servicios de CH con todos sus campos DENTRO DEL
// HTML DE CADA PÁGINA —dos veces, por cómo viaja el payload de React— para
// alimentar un modal que la mayoría de las visitas no abre. Eran unos 40 KB que
// pagaba todo el mundo por las dudas.
//
// Ahora los trae esta acción cuando hace falta. Para que nadie espere, el botón
// "Reservar" la dispara al pasarle el mouse por encima o al recibir el foco por
// teclado: en el tiempo que tarda alguien en decidir el clic, los datos ya
// llegaron. Si igual llega antes, el modal muestra que está cargando.
//
// PÚBLICA a propósito, como el resto de este archivo: son los mismos datos que
// hasta ayer estaban embebidos en el HTML de la vidriera — precios y nombres de
// servicios, sin nada de clientes ni de la agenda.
export async function getBookingDataPublic(): Promise<BookingData> {
  const [{ groups, professionals }, location] = await Promise.all([
    getPublicBookingData(),
    getLocation(),
  ]);
  return {
    groups,
    professionals,
    days: nextBusinessDays(14),
    whatsapp: location.whatsapp,
  };
}


// ============================================================================
// LA EXCEPCIÓN DE ESTE ARCHIVO: una acción de ADMIN, con guarda.
// ============================================================================
//
// El resto de `client-actions.ts` es superficie pública: la autoriza tener el id del turno.
// `updateClient` no: es la ficha del cliente desde el panel y exige `clients:manage`.
//
// Por qué existe. La ficha era 100 % lectura y no había NINGUNA acción que escribiera un
// `Client` fuera del `{ isResident }` del alta de turno. Un teléfono mal tipeado no se
// corregía nunca — y ese es el teléfono al que sale el recordatorio (`reminder-sweep.ts`
// manda a `appt.client.phone`), así que la clienta no recibía el aviso y nadie entendía por
// qué. La única vía disponible era reservarle otro turno con el teléfono bien, que crea una
// SEGUNDA ficha y parte el historial en dos. De paso, `clients:manage` estaba otorgada a
// RECEPTION y anunciada por los blueprints como "ficha de clientes" sin que ningún
// `requireCapability` la consumiera: un permiso que no permitía nada.
//
// QUÉ SE GUARDA EN `phone`: lo que la persona tipeó (trim + espacios colapsados), NO la
// clave normalizada. Es deliberado y es por el alta: `createManualAppointment` y
// `createBookingFromModal` reusan la ficha con `findFirst({ where: { phone } })`, match
// EXACTO sobre el string. Si acá reescribiéramos "11 4000-7919" como "1140007919", la
// próxima vez que la recepcionista tipee el teléfono como siempre lo tipea, el alta no
// encontraría la ficha y crearía una nueva — o sea, el mismo bug que vinimos a arreglar,
// dado vuelta. La normalización se usa sólo para COMPARAR. Cuando el alta también normalice
// (es `src/lib/actions.ts`), esto se puede revisar.
export async function updateClient(formData: FormData): Promise<ResultadoAccion> {
  // DEVUELVE resultado en vez de tirar: un `throw` dentro de una Server Action llega a
  // producción como "Minified React error #441" y quien lo lee es la recepcionista.
  await requireCapability("clients:manage");

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const phone = String(formData.get("phone") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const birthDateStr = String(formData.get("birthDate") ?? "").trim();

  if (!id) return { ok: false, error: "Falta indicar qué cliente se edita." };
  if (!name) return { ok: false, error: "El nombre no puede quedar vacío." };
  if (!phone) return { ok: false, error: "El teléfono no puede quedar vacío: es por donde sale el recordatorio." };

  // Misma autoridad de forma que el alta (CH-A1): el dato que entra por acá termina en el
  // mismo lugar que el que entra por el modal de reserva.
  const contacto = validateBookingContact(phone, email);
  if (!contacto.ok) return { ok: false, error: contacto.error };

  let birthDate: Date | null = null;
  if (birthDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) {
      return { ok: false, error: "La fecha de nacimiento no es válida." };
    }
    // Mediodía UTC, no medianoche: un cumpleaños es una fecha, no un instante, y guardarlo
    // a las 00:00Z lo corre un día para atrás al mostrarlo en cualquier huso negativo
    // (Argentina es UTC-3). Con las 12:00Z la fecha se lee igual en todo el continente.
    birthDate = new Date(`${birthDateStr}T12:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime())) {
      return { ok: false, error: "La fecha de nacimiento no es válida." };
    }
  }

  // `findUnique` viene scopeado al tenant por la extensión de Prisma (tenant-scope): un id
  // de otro tenant devuelve null acá, no una ficha ajena.
  const antes = await prisma.client.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Esa ficha de cliente no existe." };

  // EL TELÉFONO ES LA CLAVE NATURAL. Si se lo edita a uno que ya tiene otra ficha, quedan
  // dos clientas con el mismo número y el alta de turno elige la que le da el `findFirst`:
  // los turnos nuevos van a una y el historial viejo queda en la otra. Se RECHAZA y se dice
  // cuál es la otra ficha. Unificar dos clientas (mover turnos, pedidos y cuenta corriente)
  // es otra operación, con su propia auditoría, y todavía no existe: hacerla de prepo acá,
  // en silencio, sería peor que no dejar.
  const clave = normalizarTelefono(phone);
  if (clave && clave !== normalizarTelefono(antes.phone)) {
    // Sin columna normalizada en `Client` no hay índice por el cual buscar: se comparan las
    // claves en memoria. Es un COUNT de fichas del tenant (miles, no millones) y corre sólo
    // cuando el teléfono cambia de verdad. Si algún día molesta, el arreglo es una columna
    // `phoneKey` con único por tenant, no un índice sobre el string tipeado.
    const otros = await prisma.client.findMany({ select: { id: true, name: true, phone: true } });
    // La DECISIÓN vive en `fichaQueChoca` (puro) para poder probarla con números de verdad:
    // acá adentro sólo se puede verificar por forma, y esa verificación queda verde aunque
    // alguien borre el chequeo.
    const choque = fichaQueChoca(id, phone, antes.phone, otros);
    if (choque) {
      return {
        ok: false,
        error:
          `Ese teléfono ya es el de la ficha de ${choque.name} (${choque.phone}). ` +
          // Con el Inicio por apps existe "Unificar fichas duplicadas"; fuera del piloto (CH) esa
          // app no está en su menú, y mandarla ahí sería un callejón: queda el texto de siempre.
          ((await enInicioPorApps())
            ? "Si son la misma persona, unificalas desde Clientes › Fichas duplicadas (lo hace la dueña o el dueño)."
            : "Si son la misma persona, hay que unificar las dos fichas: por ahora se hace a mano."),
      };
    }
  }

  const despues = {
    name,
    phone,
    email: email || null,
    notes: notes || null,
    birthDate,
  };

  // Sólo los campos que CAMBIARON, con su valor anterior al lado: para un dato de contacto
  // eso es lo que permite deshacer sin ir a buscar el backup.
  const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
  if (antes.name !== despues.name) cambios.name = { antes: antes.name, despues: despues.name };
  if (antes.phone !== despues.phone) cambios.phone = { antes: antes.phone, despues: despues.phone };
  if ((antes.email ?? null) !== despues.email) cambios.email = { antes: antes.email, despues: despues.email };
  if ((antes.notes ?? null) !== despues.notes) cambios.notes = { antes: antes.notes, despues: despues.notes };
  if ((antes.birthDate?.getTime() ?? null) !== (despues.birthDate?.getTime() ?? null)) {
    cambios.birthDate = { antes: antes.birthDate, despues: despues.birthDate };
  }

  if (Object.keys(cambios).length === 0) return { ok: true };

  await prisma.client.update({ where: { id }, data: despues });

  await auditAdmin({ action: "update", entity: "Client", entityId: id, changes: cambios });

  revalidatePath(`/admin/clientes/${id}`);
  revalidatePath("/admin/clientes");
  return { ok: true };
}

// ============================================================================
// NUEVA FICHA — la segunda acción de ADMIN de este archivo, con la misma guarda.
// ============================================================================
//
// En un negocio de turnos la ficha nace sola al reservar. En un MOSTRADOR no nace nunca: la
// venta ata el pedido a la ficha sólo si ya existía (order-core.ts), y crear fichas desde la
// tienda quedó para la app de Clientes. Sin esto, Magra no tiene a quién saludar el día del
// cumpleaños ni a quién recuperar.
//
// Al crearla, los pedidos que esa persona ya hizo con su número (sin ficha) quedan atados a
// ella en la MISMA transacción: su historial arranca completo. Un teléfono que ya es de otra
// ficha se rechaza y se dice cuál (misma regla que `updateClient`: una persona, una ficha).
export async function crearFicha(
  formData: FormData,
): Promise<{ ok: true; id: string; pedidos: number } | { ok: false; error: string; existenteId?: string }> {
  await requireCapability("clients:manage");
  const tenantId = await getCurrentTenantId();

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const phone = String(formData.get("phone") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const birthDateStr = String(formData.get("birthDate") ?? "").trim();

  if (!name) return { ok: false, error: "Falta el nombre." };
  if (!phone) return { ok: false, error: "Falta el teléfono: es por donde se le escribe." };
  const contacto = validateBookingContact(phone, email);
  if (!contacto.ok) return { ok: false, error: contacto.error };

  let birthDate: Date | null = null;
  if (birthDateStr) {
    // Mediodía UTC, igual que `updateClient`: un cumpleaños es una fecha, no un instante.
    birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDateStr) ? new Date(`${birthDateStr}T12:00:00.000Z`) : null;
    if (!birthDate || Number.isNaN(birthDate.getTime())) return { ok: false, error: "La fecha de cumpleaños no es válida." };
  }

  // La búsqueda del duplicado, el alta y el atado de pedidos van en UNA transacción con un
  // candado por número (crear-ficha.ts dice por qué y cómo).
  const r = await tenantTransaction((tx) =>
    crearFichaEnTx(tx, tenantId, { name, phone, email: email || null, notes: notes || null, birthDate }),
  );
  if (!r.ok) {
    const e = r.existente;
    return { ok: false, error: `Ese teléfono ya es de la ficha de ${e.name} (${e.phone}).`, existenteId: e.id };
  }
  const { id, pedidos } = r;

  await auditAdmin({ action: "create", entity: "Client", entityId: id, changes: { name, phone, pedidosVinculados: pedidos } });
  revalidatePath("/admin/clientes");
  return { ok: true, id, pedidos: pedidos.length };
}

// ============================================================================
// FICHA FISCAL DEL CLIENTE (R1-F5) — lo que copia su factura y decide la letra.
// ============================================================================
//
// Guarda documento, razón social, condición frente al IVA y domicilio de UNA ficha, validados
// sin inventar nada (`validarFichaFiscal`, src/lib/fiscal/ficha-fiscal.ts). Es una acción aparte
// de `updateClient` a propósito: el formulario de siempre (nombre, teléfono, cumpleaños) no cambia
// en nada, y lo fiscal se audita campo por campo con su valor anterior al lado. El negocio sale de
// la sesión (RLS + candado de la transacción): el id de una ficha ajena da "no existe".
const SELECT_FICHA_FISCAL = { docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true } as const;

export async function guardarFichaFiscal(formData: FormData): Promise<ResultadoAccion> {
  await requireCapability("clients:manage");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Falta indicar qué cliente se edita." };

  const campo = (clave: string) => {
    const v = formData.get(clave);
    return typeof v === "string" ? v : null;
  };
  const v = validarFichaFiscal({
    docTipo: campo("docTipo"),
    docNro: campo("docNro"),
    razonSocial: campo("razonSocial"),
    condicionIva: campo("condicionIva"),
    domicilio: campo("domicilio"),
  });
  if (!v.ok) return { ok: false, error: v.error };

  // Leer y escribir en la misma transacción: el valor anterior que queda en la auditoría es el
  // que se pisó, aunque dos personas guarden la misma ficha a la vez.
  const cambios = await tenantTransaction(async (tx) => {
    const antes = await tx.client.findFirst({ where: { id }, select: SELECT_FICHA_FISCAL });
    if (!antes) return null;
    const diferencias = cambiosDeFicha(antes, v.ficha);
    if (Object.keys(diferencias).length > 0) await tx.client.update({ where: { id }, data: v.ficha });
    return diferencias;
  });
  if (!cambios) return { ok: false, error: "Esa ficha de cliente no existe." };
  if (Object.keys(cambios).length === 0) return { ok: true };

  await auditAdmin({ action: "update", entity: "Client", entityId: id, changes: cambios });
  revalidatePath(`/admin/clientes/${id}`);
  revalidatePath("/admin/clientes");
  return { ok: true };
}
