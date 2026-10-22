"use server";

// ============================================================================
// PADEL-CLASES · T4 — escrituras DEL PROFE sobre el modelo nuevo: clubes, turnos fijos, paquetes,
// grupales con participantes, pago parcial y reglas. Sin pantallas (las hace la Tanda 5).
// ============================================================================
//
// Mismas reglas que acciones.ts: cada acción pide agenda:manage, acota por `tenantId`, deja rastro en
// la auditoría (auditAdmin) y lo que mueve plata o franjas va en `bookingTransaction` (Serializable con
// reintento) con escrituras condicionadas a lo leído: dos toques a la vez nunca cobran dos veces.
//
// Base sin la migración 20261023120000_padel_reingenieria (producción hoy, Gate 2): TODAS contestan
// `{ ok: false, error: SIN_ACTUALIZACION }` («Esta función se habilita cuando se active la actualización
// de la base»), nunca un 500, y no tocan nada de lo de la T1-T3.
//
// Vive aparte de acciones.ts (que ya pasa las 1.100 líneas) para que las pantallas de la T5 importen
// todo lo nuevo de un solo lugar. Las piezas que comparten (paquete y club adentro de la transacción)
// están en acciones-compartido.ts.

import { prisma } from "@/lib/prisma";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { businessWallTimeToUtc, dateStrInBusinessTz, dayOfWeekForDate, todayInBusinessTz } from "@/lib/datetime";
import {
  aplicarPagoParcial,
  clubValido,
  esMedioCobro,
  esTipoClase,
  estadoPaquete,
  fechaValida,
  horaHumana,
  horaValida,
  lugarTomado,
  paqueteValido,
  pesos,
  puedeCobrarProfe,
  redondear,
  sumarDias,
  textoSemana,
  type MedioCobro,
} from "./core";
import { configPadel } from "./datos.server";
import { SIN_ACTUALIZACION, faltaModeloT4 } from "./modelo";
import { modeloT4 } from "./modelo.server";
import { generarSemanaDelNegocio, type ResultadoSemana } from "./semana.server";
import {
  ErrorNegocio,
  OTRA_PERSONA_CAMBIO,
  SIN_AVISO,
  avisarAlAlumno,
  clubYTraslado,
  refrescar,
  respuestaDeError,
  type AvisoEnCola,
  type ConAviso,
  type Resultado,
} from "./acciones-compartido";

/**
 * El envoltorio de toda acción de la T4: permiso, negocio, «se habilita cuando…» si la base no tiene
 * la migración (antes de tocar nada, y también si una tabla o columna falta a mitad de camino), y los
 * errores de negocio como `{ ok: false, error }`.
 */
async function conModelo<T>(fn: (tenantId: string) => Promise<T>, textoChoque: string = OTRA_PERSONA_CAMBIO): Promise<T | { ok: false; error: string }> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!(await modeloT4())) return { ok: false, error: SIN_ACTUALIZACION };
  try {
    return await fn(tenantId);
  } catch (e) {
    if (faltaModeloT4(e)) return { ok: false, error: SIN_ACTUALIZACION };
    const r = respuestaDeError(e, textoChoque);
    if (r) return r;
    throw e;
  }
}

const id40 = (v: unknown) => String(v ?? "").slice(0, 40);

// ════════════════════════════════════════════════════════════════════════════
// CLUBES
// ════════════════════════════════════════════════════════════════════════════

export type DatosClub = {
  nombre: string;
  direccion?: string | null;
  mapsUrl?: string | null;
  trasladoMin?: number | string | null;
  /** Lo que el profe le paga al club (por hora, por clase o por mes según `modoCobroClub`). */
  costoCancha?: number | string | null;
  /** «por-hora» | «por-clase» | «mensual» (lista blanca MODOS_COBRO_CLUB). */
  modoCobroClub?: string | null;
  techada?: boolean;
};

/** Alta de un club (Ajustes → Clubes). */
export async function crearClub(datos: DatosClub): Promise<Resultado<{ clubId: string }>> {
  return conModelo(async (tenantId) => {
    const v = clubValido(datos ?? { nombre: "" });
    if (typeof v === "string") throw new ErrorNegocio(v);
    const c = await prisma.padelClub.create({ data: { tenantId, ...v }, select: { id: true } });
    await auditAdmin({ action: "padel.club.crear", entity: "PadelClub", entityId: c.id, changes: { nombre: v.nombre, modo: v.modoCobroClub, costo: v.costoCancha } });
    refrescar();
    return { ok: true as const, clubId: c.id };
  });
}

/** Editar un club, o darlo de baja (`activo: false`: deja de ofrecerse; lo hecho queda). */
export async function editarClub(clubId: string, datos: DatosClub & { activo?: boolean }): Promise<Resultado> {
  return conModelo(async (tenantId) => {
    const v = clubValido(datos ?? { nombre: "" });
    if (typeof v === "string") throw new ErrorNegocio(v);
    const n = await prisma.padelClub.updateMany({ where: { tenantId, id: id40(clubId) }, data: { ...v, ...(typeof datos.activo === "boolean" ? { activo: datos.activo } : {}) } });
    if (n.count === 0) throw new ErrorNegocio("No encontramos ese club.");
    await auditAdmin({ action: "padel.club.editar", entity: "PadelClub", entityId: id40(clubId), changes: { nombre: v.nombre, modo: v.modoCobroClub, costo: v.costoCancha, ...(typeof datos.activo === "boolean" ? { activo: datos.activo } : {}) } });
    refrescar();
    return { ok: true as const };
  });
}

/** El club de un tramo de la grilla semanal (M-126: «el martes 16–21 en Norte»). `clubId: null` lo saca. */
export async function asignarClubATramo(diaSemana: number, desde: string, hasta: string, clubId: string | null): Promise<Resultado<{ tramos: number }>> {
  return conModelo(async (tenantId) => {
    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6 || !horaValida(desde) || !horaValida(hasta)) throw new ErrorNegocio("Elegí el día y el horario.");
    if (clubId) {
      const c = await prisma.padelClub.findFirst({ where: { tenantId, id: id40(clubId), activo: true }, select: { id: true } });
      if (!c) throw new ErrorNegocio("No encontramos ese club.");
    }
    const n = await prisma.padelDisponibilidad.updateMany({ where: { tenantId, diaSemana, desde, hasta, fecha: null, tipo: "DA" }, data: { clubId: clubId ? id40(clubId) : null } });
    if (n.count === 0) throw new ErrorNegocio("Ese tramo no está en tus horarios.");
    await auditAdmin({ action: "padel.club.tramo", entity: "PadelDisponibilidad", changes: { diaSemana, desde, hasta, clubId } });
    refrescar();
    return { ok: true as const, tramos: n.count };
  });
}

/**
 * «¿Llego?» antes de agendar (M-123): «No llegás: Club Sur queda a 30 min», o `noLlega: null`. Lo mismo
 * chequea `agendarClase` con `clubId` (acciones.ts) antes de escribir.
 */
export async function chequearTraslado(fecha: string, hora: string, clubId: string, duracionMin?: number): Promise<Resultado<{ noLlega: string | null; costoCancha: number | null }>> {
  return conModelo(async (tenantId) => {
    if (!fechaValida(fecha) || !horaValida(hora)) throw new ErrorNegocio("Elegí día y hora.");
    const config = await configPadel(tenantId);
    const empiezaEn = businessWallTimeToUtc(fecha, hora);
    const terminaEn = new Date(empiezaEn.getTime() + (duracionMin && duracionMin > 0 ? duracionMin : config.duracionMin) * 60_000);
    const c = await clubYTraslado(tenantId, clubId, empiezaEn, terminaEn, config.reglas.trasladoMinDefault);
    if ("error" in c) throw new ErrorNegocio(c.error);
    return { ok: true as const, noLlega: c.noLlega, costoCancha: c.costoCancha };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TURNOS FIJOS (series)
// ════════════════════════════════════════════════════════════════════════════

export type DatosSerie = {
  alumnoId: string;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  /** "19:00" */
  hora: string;
  duracionMin?: number;
  tipo?: string;
  personas?: number;
  clubId?: string | null;
  /** "YYYY-MM-DD" (por defecto hoy). */
  desde?: string;
  /** "YYYY-MM-DD" o null = sin fin. */
  hasta?: string | null;
};

/**
 * «Todas las semanas» (M-129): el turno fijo de un alumno. No crea clases: las crea generarSemana (y
 * mientras tanto el turnero ya no ofrece esa hora, M-116). Chequea que no pise otro turno fijo activo.
 */
export async function crearSerie(d: DatosSerie): Promise<Resultado<{ serieId: string; resumen: string }>> {
  return conModelo(async (tenantId) => {
    const config = await configPadel(tenantId);
    const diaSemana = Number(d?.diaSemana);
    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6 || !horaValida(String(d?.hora ?? ""))) throw new ErrorNegocio("Elegí el día y la hora.");
    const desde = d.desde && fechaValida(d.desde) ? d.desde : todayInBusinessTz();
    const hasta = d.hasta ? (fechaValida(d.hasta) ? d.hasta : null) : null;
    if (d.hasta && !hasta) throw new ErrorNegocio("La fecha de fin no es válida.");
    if (hasta && hasta < desde) throw new ErrorNegocio("La fecha de fin es antes del comienzo.");
    const duracionMin = d.duracionMin && Number.isInteger(d.duracionMin) && d.duracionMin >= 30 && d.duracionMin <= 180 ? d.duracionMin : config.duracionMin;
    const tipo = esTipoClase(d.tipo) ? d.tipo : "INDIVIDUAL";
    const personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Math.trunc(Number(d.personas)) || 2)) : 1;
    const r = await bookingTransaction(async (tx) => {
      const alumno = await tx.padelAlumno.findFirst({ where: { tenantId, id: id40(d.alumnoId) }, select: { id: true, client: { select: { name: true } } } });
      if (!alumno) throw new ErrorNegocio("No encontramos ese alumno.");
      if (d.clubId) {
        const club = await tx.padelClub.findFirst({ where: { tenantId, id: id40(d.clubId), activo: true }, select: { id: true } });
        if (!club) throw new ErrorNegocio("No encontramos ese club.");
      }
      // Otro turno fijo activo el mismo día que se pise en horario (y en fechas) → no.
      const mismoDia = await tx.padelSerie.findMany({
        where: { tenantId, activa: true, diaSemana, OR: [{ hasta: null }, { hasta: { gte: new Date(`${desde}T00:00:00.000Z`) } }] },
        select: { hora: true, duracionMin: true, desde: true, alumno: { select: { client: { select: { name: true } } } } },
      });
      const ini = Number(d.hora.slice(0, 2)) * 60 + Number(d.hora.slice(3, 5));
      const pisa = mismoDia.find((s) => {
        const i = Number(s.hora.slice(0, 2)) * 60 + Number(s.hora.slice(3, 5));
        return ini < i + s.duracionMin && i < ini + duracionMin && (!hasta || s.desde.toISOString().slice(0, 10) <= hasta);
      });
      if (pisa) throw new ErrorNegocio(`Ese horario ya es el turno fijo de ${pisa.alumno.client.name.split(" ")[0]}.`);
      const s = await tx.padelSerie.create({
        data: {
          tenantId, alumnoId: alumno.id, diaSemana, hora: d.hora, duracionMin, tipo, personas, clubId: d.clubId ? id40(d.clubId) : null,
          desde: new Date(`${desde}T00:00:00.000Z`), hasta: hasta ? new Date(`${hasta}T00:00:00.000Z`) : null,
        },
        select: { id: true },
      });
      return { id: s.id, nombre: alumno.client.name };
    }, { tenantId });
    const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][diaSemana];
    const resumen = `todos los ${dia} ${d.hora}${hasta ? ` hasta ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}` : ""}`;
    await auditAdmin({ action: "padel.serie.crear", entity: "PadelSerie", entityId: r.id, changes: { alumnoId: d.alumnoId, diaSemana, hora: d.hora, desde, hasta } });
    refrescar();
    return { ok: true as const, serieId: r.id, resumen };
  });
}

/** Las clases ya generadas de una serie en un rango que se pueden soltar (sin plata adentro). */
async function soltarGeneradas(tx: Parameters<Parameters<typeof bookingTransaction>[0]>[0], tenantId: string, serieId: string, desde: string, hasta: string | null, motivo: string) {
  const where = {
    tenantId, serieId, estado: { in: ["PEDIDA", "CONFIRMADA"] },
    serieFecha: { gte: new Date(`${desde}T00:00:00.000Z`), ...(hasta ? { lte: new Date(`${hasta}T00:00:00.000Z`) } : {}) },
  };
  // Sólo las que no tienen plata: una pagada (o con comprobante) queda viva y el profe decide.
  const sueltas = await tx.padelClase.updateMany({
    where: { ...where, pagoEstado: "PENDIENTE", pagado: 0 },
    data: { estado: "CANCELADA", canceladaEl: new Date(), motivoCancel: motivo },
  });
  const conPlata = await tx.padelClase.count({ where });
  return { canceladas: sueltas.count, conPlata };
}

/**
 * Pausar el turno fijo (M-130: «pauso 2 semanas»): de `desde` (por defecto hoy) a `hasta`. Esas
 * semanas el turnero las ofrece libres; las clases ya generadas sin plata se cancelan («Pausa del
 * turno fijo»), las que tienen plata quedan (`conPlata`) para que el profe decida.
 */
export async function pausarSerie(serieId: string, hasta: string, desde?: string): Promise<Resultado<{ canceladas: number; conPlata: number }>> {
  return conModelo(async (tenantId) => {
    const d = desde && fechaValida(desde) ? desde : todayInBusinessTz();
    if (!fechaValida(hasta) || hasta < d) throw new ErrorNegocio("Elegí hasta cuándo la pausás.");
    const r = await bookingTransaction(async (tx) => {
      const n = await tx.padelSerie.updateMany({
        where: { tenantId, id: id40(serieId), activa: true },
        data: { pausadaDesde: new Date(`${d}T00:00:00.000Z`), pausadaHasta: new Date(`${hasta}T00:00:00.000Z`) },
      });
      if (n.count === 0) throw new ErrorNegocio("No encontramos ese turno fijo.");
      return soltarGeneradas(tx, tenantId, id40(serieId), d, hasta, "Pausa del turno fijo");
    }, { tenantId });
    await auditAdmin({ action: "padel.serie.pausar", entity: "PadelSerie", entityId: id40(serieId), changes: { desde: d, hasta, ...r } });
    refrescar();
    return { ok: true as const, ...r };
  });
}

/**
 * Cortar el turno fijo (M-131 «Dar de baja»): deja de generar desde `desde` (por defecto hoy). Las
 * clases generadas desde ahí sin plata se cancelan; las que tienen plata quedan (`conPlata`).
 */
export async function cortarSerie(serieId: string, desde?: string): Promise<Resultado<{ canceladas: number; conPlata: number }>> {
  return conModelo(async (tenantId) => {
    const d = desde && fechaValida(desde) ? desde : todayInBusinessTz();
    const r = await bookingTransaction(async (tx) => {
      const s = await tx.padelSerie.findFirst({ where: { tenantId, id: id40(serieId), activa: true }, select: { id: true, desde: true } });
      if (!s) throw new ErrorNegocio("No encontramos ese turno fijo.");
      const ultimo = sumarDias(d, -1);
      const desdeSerie = s.desde.toISOString().slice(0, 10);
      // Si nunca llegó a empezar, se apaga; si no, termina el día anterior al corte.
      await tx.padelSerie.updateMany({
        where: { tenantId, id: s.id },
        data: ultimo < desdeSerie ? { activa: false } : { hasta: new Date(`${ultimo}T00:00:00.000Z`) },
      });
      return soltarGeneradas(tx, tenantId, s.id, d, null, "Se cortó el turno fijo");
    }, { tenantId });
    await auditAdmin({ action: "padel.serie.cortar", entity: "PadelSerie", entityId: id40(serieId), changes: { desde: d, ...r } });
    refrescar();
    return { ok: true as const, ...r };
  });
}

/**
 * generarSemana (M-117), la puerta del profe: genera las clases de la semana de `desde` (por defecto
 * la que viene) desde los turnos fijos. Idempotente. Devuelve la cola «Avisar a Juan su semana».
 */
export async function generarSemana(desde?: string): Promise<Resultado<ResultadoSemana>> {
  return conModelo(async (tenantId) => {
    if (desde !== undefined && !fechaValida(desde)) throw new ErrorNegocio("Elegí la semana.");
    const r = await generarSemanaDelNegocio(tenantId, desde);
    if (!r) return { ok: false as const, error: SIN_ACTUALIZACION };
    await auditAdmin({ action: "padel.serie.generarSemana", entity: "PadelSerie", changes: { lunes: r.lunes, creadas: r.creadas, choques: r.choques.length } });
    refrescar();
    return { ok: true as const, ...r };
  });
}

/**
 * «Avisar a Juan su semana» (M-117): UN WhatsApp con sus clases de la semana de `lunes` («mar 19 y
 * jue 19») y su link. Marca leído el aviso de la bandeja.
 */
export async function avisarSemana(alumnoId: string, lunes: string): Promise<Resultado<ConAviso & { detalle: string }>> {
  return conModelo(async (tenantId) => {
    if (!fechaValida(lunes)) throw new ErrorNegocio("Elegí la semana.");
    const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: id40(alumnoId) }, select: { id: true, token: true, client: { select: { name: true, phone: true } } } });
    if (!a) throw new ErrorNegocio("No encontramos ese alumno.");
    const clases = await prisma.padelClase.findMany({
      where: { tenantId, alumnoId: a.id, serieId: { not: null }, estado: { in: ["PEDIDA", "CONFIRMADA"] }, empiezaEn: { gte: businessWallTimeToUtc(lunes, "00:00"), lt: businessWallTimeToUtc(sumarDias(lunes, 7), "00:00") } },
      orderBy: { empiezaEn: "asc" },
      select: { empiezaEn: true },
    });
    if (!clases.length) throw new ErrorNegocio("No tiene clases de turno fijo esa semana.");
    const detalle = textoSemana(clases);
    const config = await configPadel(tenantId);
    const aviso = await avisarAlAlumno({
      tenantId, config, clave: "semana", tipo: "semana", clase: null,
      alumno: { id: a.id, token: a.token, nombre: a.client.name, telefono: a.client.phone },
      vars: { detalle },
    });
    await prisma.padelAviso.updateMany({ where: { tenantId, destino: "PROFE", tipo: "semana", alumnoId: a.id, idExterno: `semana:${a.id}:${lunes}`, leidoEl: null }, data: { leidoEl: new Date() } });
    return { ok: true as const, ...aviso, detalle };
  });
}

/**
 * «Juan pide turno fijo mar 19:00» → «Aprobar» (M-132): crea la serie desde ESA clase (su día, hora,
 * duración, tipo y club), empezando la semana siguiente. Marca leído el pedido.
 */
export async function aprobarSerie(claseId: string): Promise<Resultado<{ serieId: string; resumen: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!(await modeloT4())) return { ok: false, error: SIN_ACTUALIZACION };
  const c = await prisma.padelClase.findFirst({
    where: { tenantId, id: id40(claseId) },
    select: { id: true, alumnoId: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, clubId: true },
  });
  if (!c) return { ok: false, error: "No encontramos esa clase." };
  const fecha = dateStrInBusinessTz(c.empiezaEn);
  const r = await crearSerie({
    alumnoId: c.alumnoId, diaSemana: dayOfWeekForDate(fecha), hora: horaHumana(c.empiezaEn),
    duracionMin: Math.round((c.terminaEn.getTime() - c.empiezaEn.getTime()) / 60_000), tipo: c.tipo, personas: c.personas, clubId: c.clubId,
    desde: sumarDias(fecha, 1),
  });
  if (r.ok) await prisma.padelAviso.updateMany({ where: { tenantId, destino: "PROFE", tipo: "serie-pedida", claseId: c.id, leidoEl: null }, data: { leidoEl: new Date() } });
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// PAQUETES
// ════════════════════════════════════════════════════════════════════════════

export type DatosPaquete = { nombre: string; clases: number; precio: number | string; venceDias: number };

/** Alta de un paquete (Ajustes → Paquetes, M-133). */
export async function crearPaquete(d: DatosPaquete): Promise<Resultado<{ paqueteId: string }>> {
  return conModelo(async (tenantId) => {
    const v = paqueteValido(d ?? {});
    if (typeof v === "string") throw new ErrorNegocio(v);
    const p = await prisma.padelPaquete.create({ data: { tenantId, ...v }, select: { id: true } });
    await auditAdmin({ action: "padel.paquete.crear", entity: "PadelPaquete", entityId: p.id, changes: v });
    refrescar();
    return { ok: true as const, paqueteId: p.id };
  });
}

/** Editar un paquete o dejar de venderlo (`activo: false`). Lo ya vendido no cambia. */
export async function editarPaquete(paqueteId: string, d: DatosPaquete & { activo?: boolean }): Promise<Resultado> {
  return conModelo(async (tenantId) => {
    const v = paqueteValido(d ?? {});
    if (typeof v === "string") throw new ErrorNegocio(v);
    const n = await prisma.padelPaquete.updateMany({ where: { tenantId, id: id40(paqueteId) }, data: { ...v, ...(typeof d.activo === "boolean" ? { activo: d.activo } : {}) } });
    if (n.count === 0) throw new ErrorNegocio("No encontramos ese paquete.");
    await auditAdmin({ action: "padel.paquete.editar", entity: "PadelPaquete", entityId: id40(paqueteId), changes: { ...v, ...(typeof d.activo === "boolean" ? { activo: d.activo } : {}) } });
    refrescar();
    return { ok: true as const };
  });
}

/**
 * Vender un paquete a un alumno (M-134). `medio` = cobrado en el momento (queda PAGADO); sin medio,
 * queda a cobrar (`cobrarPaquete`). `idempotencia`: la clave que manda la pantalla (una por apertura de
 * la hoja): el doble toque devuelve la MISMA venta, nunca vende ni cobra dos veces.
 */
export async function venderPaquete(alumnoId: string, paqueteId: string, medio: MedioCobro | null, idempotencia: string): Promise<Resultado<{ paqueteAlumnoId: string; repetida: boolean; texto: string }>> {
  return conModelo(async (tenantId) => {
    if (medio !== null && !esMedioCobro(medio)) throw new ErrorNegocio("Elegí cómo te pagó.");
    const clave = String(idempotencia ?? "").trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(clave)) throw new ErrorNegocio("Volvé a abrir «Vender paquete».");
    const ya = await prisma.padelPaqueteAlumno.findFirst({ where: { tenantId, idempotencia: clave }, select: { id: true, clasesTotal: true, venceEl: true } });
    if (ya) return { ok: true as const, paqueteAlumnoId: ya.id, repetida: true, texto: `${ya.clasesTotal} de ${ya.clasesTotal}` };
    const [alumno, paquete] = await Promise.all([
      prisma.padelAlumno.findFirst({ where: { tenantId, id: id40(alumnoId) }, select: { id: true, token: true } }),
      prisma.padelPaquete.findFirst({ where: { tenantId, id: id40(paqueteId), activo: true }, select: { id: true, nombre: true, clases: true, precio: true, venceDias: true } }),
    ]);
    if (!alumno) throw new ErrorNegocio("No encontramos ese alumno.");
    if (!paquete) throw new ErrorNegocio("No encontramos ese paquete.");
    const ahora = new Date();
    const venceEl = new Date(ahora.getTime() + paquete.venceDias * 86_400_000);
    let creado: { id: string };
    try {
      creado = await prisma.padelPaqueteAlumno.create({
        data: {
          tenantId, paqueteId: paquete.id, alumnoId: alumno.id, clasesTotal: paquete.clases, precio: paquete.precio, venceEl, idempotencia: clave,
          ...(medio ? { pagoEstado: "PAGADO", pagoMedio: medio } : {}),
        },
        select: { id: true },
      });
    } catch (e) {
      // Carrera del doble toque: el otro ganó → la misma venta.
      if (!isUniqueViolation(e, "idempotencia")) throw e;
      const otro = await prisma.padelPaqueteAlumno.findFirst({ where: { tenantId, idempotencia: clave }, select: { id: true } });
      if (!otro) throw e;
      return { ok: true as const, paqueteAlumnoId: otro.id, repetida: true, texto: `${paquete.clases} de ${paquete.clases}` };
    }
    await auditAdmin({ action: "padel.paquete.vender", entity: "PadelPaqueteAlumno", entityId: creado.id, changes: { alumnoId: alumno.id, paquete: paquete.nombre, precio: Number(paquete.precio), medio } });
    refrescar(alumno.token);
    const vence = venceEl.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
    return { ok: true as const, paqueteAlumnoId: creado.id, repetida: false, texto: `${paquete.clases} de ${paquete.clases} · vence ${vence}` };
  });
}

/** Cobrar un paquete vendido a cuenta. Condicionado a PENDIENTE: dos toques no cobran dos veces. */
export async function cobrarPaquete(paqueteAlumnoId: string, medio: MedioCobro): Promise<Resultado> {
  return conModelo(async (tenantId) => {
    if (!esMedioCobro(medio)) throw new ErrorNegocio("Elegí cómo te pagó.");
    const n = await prisma.padelPaqueteAlumno.updateMany({ where: { tenantId, id: id40(paqueteAlumnoId), pagoEstado: "PENDIENTE" }, data: { pagoEstado: "PAGADO", pagoMedio: medio } });
    if (n.count === 0) throw new ErrorNegocio("Ese paquete ya está cobrado.");
    await auditAdmin({ action: "padel.paquete.cobrar", entity: "PadelPaqueteAlumno", entityId: id40(paqueteAlumnoId), changes: { medio } });
    refrescar();
    return { ok: true as const };
  });
}

/** «Extender» (M-119): `dias` más desde hoy o desde el vencimiento, lo que sea más tarde. */
export async function extenderPaquete(paqueteAlumnoId: string, dias: number): Promise<Resultado<{ hasta: string }>> {
  return conModelo(async (tenantId) => {
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new ErrorNegocio("¿Cuántos días más? Entre 1 y 365.");
    const p = await prisma.padelPaqueteAlumno.findFirst({ where: { tenantId, id: id40(paqueteAlumnoId) }, select: { id: true, venceEl: true, extendidoHasta: true, clasesTotal: true, clasesUsadas: true } });
    if (!p) throw new ErrorNegocio("No encontramos ese paquete.");
    if (estadoPaquete(p, new Date()).quedan === 0) throw new ErrorNegocio("Ese paquete ya no tiene clases.");
    const base = Math.max((p.extendidoHasta ?? p.venceEl).getTime(), Date.now());
    const hasta = new Date(base + dias * 86_400_000);
    const n = await prisma.padelPaqueteAlumno.updateMany({ where: { tenantId, id: p.id, extendidoHasta: p.extendidoHasta }, data: { extendidoHasta: hasta } });
    if (n.count === 0) throw new ErrorNegocio(OTRA_PERSONA_CAMBIO);
    await auditAdmin({ action: "padel.paquete.extender", entity: "PadelPaqueteAlumno", entityId: p.id, changes: { dias, hasta: hasta.toISOString() } });
    refrescar();
    return { ok: true as const, hasta: hasta.toISOString() };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PAGO PARCIAL
// ════════════════════════════════════════════════════════════════════════════

/**
 * «Cobrar → Otro monto» (M-124): suma `monto` a lo pagado. Si completa, PAGADO; si no, sigue
 * PENDIENTE y la clase «debe $ 5.000». Condicionado a lo leído (`pagado` y `pagoEstado`): dos cobros
 * a la vez nunca suman dos veces. `recibo`: le manda «Recibí el pago» al alumno.
 */
export async function cobrarParcial(claseId: string, medio: MedioCobro, monto: number, opciones?: { recibo?: boolean }): Promise<Resultado<ConAviso & { pagado: number; resto: number }>> {
  return conModelo(async (tenantId) => {
    if (!esMedioCobro(medio)) throw new ErrorNegocio("Elegí cómo te pagó.");
    const clase = await prisma.padelClase.findFirst({
      where: { tenantId, id: id40(claseId) },
      select: { id: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true, motivoCancel: true, pagado: true, empiezaEn: true, alumno: { select: { id: true, token: true } }, client: { select: { name: true, phone: true } } },
    });
    if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
    const c = { ...clase, precio: Number(clase.precio), pagado: Number(clase.pagado) };
    if (!puedeCobrarProfe(c)) throw new ErrorNegocio(["PAGADO", "ACREDITADO", "DEVUELTO"].includes(c.pagoEstado) ? "Esa clase ya está cobrada." : "Esa clase no se puede cobrar.");
    const r = aplicarPagoParcial(c, Number(monto));
    if ("error" in r) throw new ErrorNegocio(r.error);
    const ahora = new Date();
    const n = await prisma.padelClase.updateMany({
      where: { tenantId, id: c.id, pagoEstado: c.pagoEstado, pagado: clase.pagado },
      data: r.completa ? { pagado: r.pagado, pagoEstado: "PAGADO", pagoMedio: medio, pagoValidadoEl: ahora } : { pagado: r.pagado, pagoMedio: medio },
    });
    if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
    await auditAdmin({ action: "padel.pago.parcial", entity: "PadelClase", entityId: c.id, changes: { medio, monto: Number(monto), pagado: r.pagado, resto: r.resto } });
    const aviso = opciones?.recibo
      ? await avisarAlAlumno({
          tenantId, config: await configPadel(tenantId), clave: "pagoOk", tipo: "pago-ok", clase: c,
          alumno: { id: clase.alumno.id, token: clase.alumno.token, nombre: clase.client.name, telefono: clase.client.phone },
          extra: r.resto > 0 ? `Quedan ${pesos(r.resto)}.` : undefined,
        })
      : SIN_AVISO;
    refrescar(clase.alumno.token);
    return { ok: true as const, ...aviso, pagado: r.pagado, resto: r.resto };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// GRUPALES CON PARTICIPANTES
// ════════════════════════════════════════════════════════════════════════════

const ACTIVAS = ["PEDIDA", "CONFIRMADA"];

type TxModelo = Parameters<Parameters<typeof bookingTransaction>[0]>[0];

/**
 * Pasa una grupal a «por participante» (adentro de la transacción): el titular es el primer participante
 * y la clase deja de cobrarse entera a uno (pagoEstado POR_PARTICIPANTE). Sólo una grupal viva sin plata
 * adentro: si ya se cobró entera, se cobra así.
 */
async function aPorParticipante(tx: TxModelo, tenantId: string, claseId: string, precioPersona: number) {
  const clase = await tx.padelClase.findFirst({
    where: { tenantId, id: claseId },
    select: { id: true, alumnoId: true, tipo: true, estado: true, pagoEstado: true, pagado: true, cupo: true, empiezaEn: true },
  });
  if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
  if (clase.tipo !== "GRUPAL") throw new ErrorNegocio("Sólo una clase grupal tiene participantes.");
  if (!ACTIVAS.includes(clase.estado) && clase.estado !== "DADA") throw new ErrorNegocio("Esa clase ya no está activa.");
  if (clase.pagoEstado !== "POR_PARTICIPANTE") {
    if (clase.pagoEstado !== "PENDIENTE" || Number(clase.pagado) > 0) throw new ErrorNegocio("Esa grupal ya tiene plata cobrada entera: no se puede repartir.");
    const n = await tx.padelClase.updateMany({ where: { tenantId, id: clase.id, pagoEstado: "PENDIENTE" }, data: { pagoEstado: "POR_PARTICIPANTE" } });
    if (n.count === 0) throw new ErrorNegocio("Esa clase cambió recién. Actualizá la pantalla.");
    await tx.padelParticipante.createMany({ data: [{ tenantId, claseId: clase.id, alumnoId: clase.alumnoId, precio: precioPersona }], skipDuplicates: true });
  }
  return clase;
}

/** Recalcula precio total (suma de partes) y personas (lugares tomados) de la clase. */
async function recalcularGrupal(tx: TxModelo, tenantId: string, claseId: string) {
  const ps = await tx.padelParticipante.findMany({ where: { tenantId, claseId }, select: { alumnoId: true, nombre: true, precio: true } });
  const tomados = ps.filter(lugarTomado).length;
  await tx.padelClase.updateMany({
    where: { tenantId, id: claseId },
    data: { precio: redondear(ps.reduce((s, p) => s + Number(p.precio), 0)), personas: Math.max(1, tomados) },
  });
  return { lugares: ps.length, tomados };
}

/**
 * Sumar un participante a una grupal (M-120/M-138): un alumno del profe, un nombre (amigo sin link) o
 * un «lugar libre» (ni alumno ni nombre). Cada uno con su parte (`precio`, por defecto el precio grupal
 * por persona). Respeta el cupo si es un grupo abierto (como mucho 8 lugares).
 */
export async function sumarParticipante(claseId: string, p: { alumnoId?: string | null; nombre?: string | null; precio?: number }): Promise<Resultado<{ participanteId: string; lugares: number; tomados: number }>> {
  return conModelo(async (tenantId) => {
    const config = await configPadel(tenantId);
    const precio = p?.precio !== undefined ? Number(p.precio) : config.precioGrupal;
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorNegocio("Poné la parte de cada uno.");
    const nombre = p?.nombre ? String(p.nombre).replace(/\s+/g, " ").trim().slice(0, 60) || null : null;
    const r = await bookingTransaction(async (tx) => {
      const clase = await aPorParticipante(tx, tenantId, id40(claseId), precio);
      if (p?.alumnoId) {
        const a = await tx.padelAlumno.findFirst({ where: { tenantId, id: id40(p.alumnoId) }, select: { id: true } });
        if (!a) throw new ErrorNegocio("No encontramos ese alumno.");
        const ya = await tx.padelParticipante.findFirst({ where: { tenantId, claseId: clase.id, alumnoId: a.id }, select: { id: true } });
        if (ya) throw new ErrorNegocio("Ya está en esta clase.");
      }
      const actuales = await tx.padelParticipante.count({ where: { tenantId, claseId: clase.id } });
      const tope = clase.cupo ?? 4;
      if (actuales >= Math.min(8, tope)) throw new ErrorNegocio(clase.cupo ? "El grupo ya está completo." : "Una grupal es de hasta 4.");
      const nuevo = await tx.padelParticipante.create({
        data: { tenantId, claseId: clase.id, alumnoId: p?.alumnoId ? id40(p.alumnoId) : null, nombre, precio: redondear(precio) },
        select: { id: true },
      });
      return { id: nuevo.id, ...(await recalcularGrupal(tx, tenantId, clase.id)) };
    }, { tenantId });
    await auditAdmin({ action: "padel.grupal.sumar", entity: "PadelParticipante", entityId: r.id, changes: { claseId, alumnoId: p?.alumnoId ?? null, precio } });
    refrescar();
    return { ok: true as const, participanteId: r.id, lugares: r.lugares, tomados: r.tomados };
  });
}

/** Sacar un participante (no el titular, y no si ya pagó: primero se le devuelve). */
export async function quitarParticipante(participanteId: string): Promise<Resultado<{ lugares: number; tomados: number }>> {
  return conModelo(async (tenantId) => {
    const r = await bookingTransaction(async (tx) => {
      const p = await tx.padelParticipante.findFirst({ where: { tenantId, id: id40(participanteId) }, select: { id: true, claseId: true, alumnoId: true, pagoEstado: true, clase: { select: { alumnoId: true } } } });
      if (!p) throw new ErrorNegocio("No encontramos ese participante.");
      if (p.alumnoId && p.alumnoId === p.clase.alumnoId) throw new ErrorNegocio("Es el titular de la clase: cancelá la clase o cambiala de alumno.");
      if (["PAGADO", "EN_REVISION"].includes(p.pagoEstado)) throw new ErrorNegocio("Ya pagó (o mandó el comprobante): resolvé esa plata antes de sacarlo.");
      const n = await tx.padelParticipante.deleteMany({ where: { tenantId, id: p.id, pagoEstado: p.pagoEstado } });
      if (n.count === 0) throw new ErrorNegocio("Ese participante cambió recién. Actualizá la pantalla.");
      return { claseId: p.claseId, ...(await recalcularGrupal(tx, tenantId, p.claseId)) };
    }, { tenantId });
    await auditAdmin({ action: "padel.grupal.quitar", entity: "PadelParticipante", entityId: id40(participanteId), changes: { claseId: r.claseId } });
    refrescar();
    return { ok: true as const, lugares: r.lugares, tomados: r.tomados };
  });
}

/** Cobrar la parte de UN participante (M-121). Condicionado al estado leído: nunca dos veces. */
export async function cobrarParticipante(participanteId: string, medio: MedioCobro): Promise<Resultado<{ pagaron: number; total: number }>> {
  return conModelo(async (tenantId) => {
    if (!esMedioCobro(medio)) throw new ErrorNegocio("Elegí cómo te pagó.");
    const r = await tenantTransaction(async (tx) => {
      const p = await tx.padelParticipante.findFirst({ where: { tenantId, id: id40(participanteId) }, select: { id: true, claseId: true, pagoEstado: true, precio: true } });
      if (!p) throw new ErrorNegocio("No encontramos ese participante.");
      if (!["PENDIENTE", "EN_REVISION"].includes(p.pagoEstado)) throw new ErrorNegocio("Esa parte ya está cobrada.");
      const n = await tx.padelParticipante.updateMany({ where: { tenantId, id: p.id, pagoEstado: p.pagoEstado }, data: { pagoEstado: "PAGADO", pagoMedio: medio, pagoValidadoEl: new Date() } });
      if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
      const todos = await tx.padelParticipante.findMany({ where: { tenantId, claseId: p.claseId }, select: { alumnoId: true, nombre: true, pagoEstado: true } });
      const conLugar = todos.filter(lugarTomado);
      return { claseId: p.claseId, monto: Number(p.precio), pagaron: conLugar.filter((x) => x.pagoEstado === "PAGADO").length, total: conLugar.length };
    }, { tenantId });
    await auditAdmin({ action: "padel.grupal.cobrar", entity: "PadelParticipante", entityId: id40(participanteId), changes: { claseId: r.claseId, medio, monto: r.monto } });
    refrescar();
    return { ok: true as const, pagaron: r.pagaron, total: r.total };
  });
}

/**
 * Grupo abierto (M-122): la grupal queda con `cupo` lugares para que los alumnos se sumen desde el
 * turnero (sumarmeAGrupal). Entre los tomados y 8.
 */
export async function abrirGrupo(claseId: string, cupo: number): Promise<Resultado<{ libres: number }>> {
  return conModelo(async (tenantId) => {
    if (!Number.isInteger(cupo) || cupo < 2 || cupo > 8) throw new ErrorNegocio("El grupo es de 2 a 8.");
    const config = await configPadel(tenantId);
    const r = await bookingTransaction(async (tx) => {
      const clase = await aPorParticipante(tx, tenantId, id40(claseId), config.precioGrupal);
      const ps = await tx.padelParticipante.findMany({ where: { tenantId, claseId: clase.id }, select: { alumnoId: true, nombre: true } });
      const tomados = ps.filter(lugarTomado).length;
      if (cupo < tomados) throw new ErrorNegocio(`Ya hay ${tomados} anotados.`);
      await tx.padelClase.updateMany({ where: { tenantId, id: clase.id }, data: { cupo } });
      return { libres: cupo - tomados };
    }, { tenantId });
    await auditAdmin({ action: "padel.grupal.abrir", entity: "PadelClase", entityId: id40(claseId), changes: { cupo } });
    refrescar();
    return { ok: true as const, libres: r.libres };
  });
}

/**
 * «Avisar a cada uno su parte» (M-120): un WhatsApp por participante con alumno («Tu parte es
 * $ 12.000»), como cola «Avisar a Ana (1 de 3)». Los que no tienen alumno (amigo sin link) no van.
 */
export async function avisarParticipantes(claseId: string): Promise<Resultado<{ avisos: AvisoEnCola[] }>> {
  return conModelo(async (tenantId) => {
    const clase = await prisma.padelClase.findFirst({ where: { tenantId, id: id40(claseId) }, select: { id: true, empiezaEn: true, estado: true, pagoEstado: true } });
    if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
    if (clase.pagoEstado !== "POR_PARTICIPANTE") throw new ErrorNegocio("Esa clase no tiene participantes.");
    if (clase.estado !== "CONFIRMADA") throw new ErrorNegocio("Primero confirmá la clase.");
    const ps = await prisma.padelParticipante.findMany({
      where: { tenantId, claseId: clase.id, alumnoId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { precio: true, alumno: { select: { id: true, token: true, client: { select: { name: true, phone: true } } } } },
    });
    const config = await configPadel(tenantId);
    const avisos: AvisoEnCola[] = [];
    for (const p of ps) {
      if (!p.alumno) continue;
      const a = await avisarAlAlumno({
        tenantId, config, clave: "parteGrupal", tipo: "parte-grupal",
        clase: { id: clase.id, empiezaEn: clase.empiezaEn, precio: p.precio },
        alumno: { id: p.alumno.id, token: p.alumno.token, nombre: p.alumno.client.name, telefono: p.alumno.client.phone },
      });
      avisos.push({ ...a, claseId: clase.id, nombre: p.alumno.client.name });
    }
    await auditAdmin({ action: "padel.grupal.avisar", entity: "PadelClase", entityId: clase.id, changes: { avisos: avisos.length } });
    return { ok: true as const, avisos };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// REGLAS (PadelConfig, T4)
// ════════════════════════════════════════════════════════════════════════════

const REGLAS_BOOLEANAS = ["ausenteSeCobra", "tardiaSeCobra", "confirmarConocidos"] as const;
type ReglaBooleana = (typeof REGLAS_BOOLEANAS)[number];

/**
 * Guardar una regla nueva (Ajustes → Reglas, M-142..M-144), con lista blanca: las tres de sí/no,
 * `cierreAutoHoras` (0–72), `trasladoMinDefault` (0–240) y `recordatorioHora` ("20:00" o vacío).
 */
export async function guardarRegla(clave: string, valor: unknown): Promise<Resultado<{ valor: boolean | number | string | null }>> {
  return conModelo(async (tenantId) => {
    let data: Record<string, boolean | number | string | null>;
    if ((REGLAS_BOOLEANAS as readonly string[]).includes(clave)) {
      if (typeof valor !== "boolean") throw new ErrorNegocio("Elegí sí o no.");
      data = { [clave as ReglaBooleana]: valor };
    } else if (clave === "cierreAutoHoras" || clave === "trasladoMinDefault") {
      const n = Number(valor);
      const max = clave === "cierreAutoHoras" ? 72 : 240;
      if (!Number.isInteger(n) || n < 0 || n > max) throw new ErrorNegocio(`Poné un número de 0 a ${max}.`);
      data = { [clave]: n };
    } else if (clave === "recordatorioHora") {
      const h = valor == null || valor === "" ? null : String(valor);
      if (h !== null && !horaValida(h)) throw new ErrorNegocio("Poné la hora como 20:00.");
      data = { recordatorioHora: h };
    } else {
      throw new ErrorNegocio("Esa regla no existe.");
    }
    await prisma.padelConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data, select: { id: true } });
    await auditAdmin({ action: "padel.config.regla", entity: "PadelConfig", entityId: tenantId, changes: data });
    refrescar();
    return { ok: true as const, valor: Object.values(data)[0] };
  });
}
