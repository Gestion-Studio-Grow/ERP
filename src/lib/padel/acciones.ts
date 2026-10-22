"use server";

// ============================================================================
// PADEL-CLASES — escrituras DEL PROFE (panel). Cada acción pide agenda:manage (esconder un botón
// no protege nada), acota todo por `tenantId` y deja su rastro en la auditoría (auditAdmin).
// ============================================================================
//
// Las públicas (turnero y link del alumno) viven en acciones-alumno.ts; lo que comparten las dos
// puertas (tipos, frenos, choque, avisos, saldo), en acciones-compartido.ts.
//
// Las altas y movidas de clase van en `bookingTransaction` (Serializable con reintento): dos
// toques a la vez no dejan dos clases en la misma franja (ADR-004/023). Las escrituras de estado
// van condicionadas al estado leído (`updateMany … where estado`): si cambió en el medio, «Esa
// clase ya cambió», y no se pisa nada.
//
// Cada acción que le cambia algo al alumno devuelve `ConAviso`: `wa` (el link con el mensaje listo),
// `enviado: true` si salió solo por la Cloud API, y `avisoId` para la cola (marcarAvisado). Las de
// varias clases (confirmarTodos, recordarVarios, suspenderDia) devuelven `avisos: AvisoEnCola[]`.
//
// La plata pagada nunca se pierde: una clase pagada que se cancela queda ACREDITADO (saldo a favor)
// y el saldo paga sola la próxima clase entera que se agenda o se confirma (core.ts → saldoAFavor).
//
// O-1: el link de un alumno que el profe todavía no reconoció se regenera la primera vez que lo
// confirma, lo agenda o se la da (reconocerAlumno), y el profe puede «Regenerar link».

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { leerImporte } from "@/lib/dinero/leer";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import {
  ESTADOS_QUE_OCUPAN,
  MOTIVO_AUSENTE_NO_SE_COBRA,
  MOTIVO_AUSENTE_SE_COBRA,
  MOTIVO_CANCEL_LABEL,
  MOTIVO_COMPROBANTE_LABEL,
  armarMensaje,
  detalleDeuda,
  diaHumano,
  diasEntre,
  duracionValida,
  esDeuda,
  esMedioCobro,
  esMotivoCancel,
  esMotivoComprobante,
  esTipoClase,
  fechaValida,
  horaHumana,
  horaValida,
  linkWhatsApp,
  nombreValido,
  pagoAlCancelar,
  pagoAlNoVino,
  COMPROBANTE_NO_APLICA,
  MOTIVO_OTRO_CAMBIO_CONFIRMADO,
  conLinkVigente,
  pesos,
  plantillaDeCancelacion,
  precioDe,
  proponerMovidas,
  proximaSemana,
  puedeCobrarProfe,
  redondear,
  sumarDias,
  telefonoAlumno,
  textoAlternativas,
  transicionClase,
  transicionPago,
  type ClavePlantilla,
  type EventoClase,
  type EventoPago,
  type MedioCobro,
  type MotivoCancel,
  type MotivoComprobante,
  type TipoClase,
} from "./core";
import { AVISOS_QUE_ESPERAN, configPadel, libresCercanos, libresDelDia, libresEnRango } from "./datos.server";
import {
  ErrorNegocio,
  OTRA_PERSONA_CAMBIO,
  RAIZ,
  SIN_AVISO,
  YA_PAGADA_CON_SALDO,
  alumnoPorTelefono,
  avisarAlAlumno,
  choqueEn,
  conErrorNegocio,
  respuestaDeError,
  nuevoToken,
  origen,
  pagoConSaldo,
  reconocerAlumno,
  refrescar,
  regenerarToken,
  saldoEnTx,
  tokenParaMandar,
  type AvisoEnCola,
  type ConAviso,
  type Resultado,
} from "./acciones-compartido";

// Para los importadores de antes: los tipos siguen saliendo también de acá.
export type { AvisoEnCola, ConAviso, Resultado } from "./acciones-compartido";

/** Clases que todavía se pueden mover, cancelar o cambiar: las que no pasaron ni se cerraron. */
const ACTIVAS = ["PEDIDA", "CONFIRMADA"];

async function claseDelProfe(id: string) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const clase = await prisma.padelClase.findFirst({
    where: { tenantId, id: String(id ?? "") },
    select: {
      id: true, estado: true, pagoEstado: true, pagoMedio: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, precio: true, alumnoId: true, clientId: true,
      motivoCancel: true, repiteDe: true,
      alumno: { select: { id: true, token: true } },
      client: { select: { name: true, phone: true } },
    },
  });
  if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
  const config = await configPadel(tenantId);
  const alumno = { id: clase.alumno.id, token: clase.alumno.token, nombre: clase.client.name, telefono: clase.client.phone };
  return { tenantId, clase, config, alumno };
}

/** Ids de clases que manda la pantalla: strings cortos, sin repetir, como mucho `max`. */
function idsLimpios(ids: unknown, max: number): string[] {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))].slice(0, max);
}

/** Horarios que el profe le ofrece al alumno: fechas válidas, futuras, como mucho tres. */
function alternativasValidas(isos: unknown, ahora = new Date()): string[] {
  return (Array.isArray(isos) ? isos : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => new Date(x))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() > ahora.getTime())
    .map((d) => d.toISOString())
    .slice(0, 3);
}

const MENSAJE_POR_EVENTO: Partial<Record<EventoClase, { clave: ClavePlantilla; tipo: string }>> = {
  confirmar: { clave: "confirmada", tipo: "confirmada" },
  rechazar: { clave: "rechazada", tipo: "rechazada" },
  cancelar: { clave: "rechazada", tipo: "cancelada" },
};

type OpcionesTransicion = {
  /** Cancelar o rechazar con motivo (chips de la hoja «Cancelar»). */
  motivo?: MotivoCancel;
  /** «¿Le ofrecés otro?»: hasta 3 horarios (ISO) que van en el WhatsApp con su link al turnero. */
  alternativas?: string[];
  /** «No vino»: ¿se cobra igual? (sólo para `ausente`). */
  seCobra?: boolean;
};

type ResultadoTransicion = Resultado<ConAviso & { aFavor?: number; comprobanteNoAplica?: boolean; linkNuevo?: boolean; claseId: string; nombre: string; cambioDe?: string }>;

/**
 * El corazón de confirmar, rechazar, dar, ausente y cancelar (un toque). Devuelve el WhatsApp listo
 * si corresponde. Cancelar o rechazar una clase PAGADA la deja ACREDITADO (`aFavor`). Confirmar con
 * saldo a favor que la cubre la deja pagada con «Saldo a favor». Un pedido vencido (SIN_RESPUESTA)
 * se puede dar igual si el alumno vino (O-3). Confirmar, dar o marcar ausente a un alumno que el
 * profe todavía no había reconocido le regenera el link (O-1): `linkNuevo`.
 *
 * confirmarCambio: si la clase que se confirma es un pedido de cambio del alumno (aviso
 * «cambio-pedido», `repiteDe` = la vieja), la vieja se cancela en la MISMA transacción y su pago pasa
 * a la nueva (pagada → saldo a favor que paga la nueva; comprobante por revisar → viaja a la nueva).
 */
async function transicionar(id: string, evento: EventoClase, op: OpcionesTransicion = {}): Promise<ResultadoTransicion> {
  return conErrorNegocio(async () => {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const nuevo = transicionClase(clase.estado, evento, "profe");
    if (!nuevo) throw new ErrorNegocio("Esa clase ya cambió. Actualizá la pantalla.");
    const ahora = new Date();
    const motivoTexto = op.motivo ? MOTIVO_CANCEL_LABEL[op.motivo] : null;
    const sello: Record<string, Date | string | null> =
      nuevo === "CONFIRMADA" ? { confirmadaEl: ahora } :
      nuevo === "RECHAZADA" ? { rechazadaEl: ahora, ...(motivoTexto ? { motivoCancel: motivoTexto } : {}) } :
      nuevo === "DADA" ? { dadaEl: ahora } :
      nuevo === "CANCELADA" ? { canceladaEl: ahora, motivoCancel: motivoTexto ?? "La canceló el profe" } :
      // «No vino»: si se cobra queda escrito en motivoCancel (provisional hasta la columna seCobra de T4).
      nuevo === "AUSENTE" && op.seCobra !== undefined ? { motivoCancel: op.seCobra ? MOTIVO_AUSENTE_SE_COBRA : MOTIVO_AUSENTE_NO_SE_COBRA } : {};
    // Al confirmar se congela el precio vigente: si después cambia la lista, esta clase no se discute.
    const precio = nuevo === "CONFIRMADA" ? { precio: precioDe(config, esTipoClase(clase.tipo) ? clase.tipo : "INDIVIDUAL", clase.personas) } : {};
    // Cancelada o rechazada: si estaba pagada, la plata queda a favor (pagoAlCancelar). «No vino → no
    // se cobra» sobre una ya pagada, lo mismo (O-3 de la CERT T2+T3, pagoAlNoVino).
    const pago =
      nuevo === "CANCELADA" || nuevo === "RECHAZADA" ? pagoAlCancelar(clase) :
      nuevo === "AUSENTE" && op.seCobra !== undefined ? pagoAlNoVino(clase, op.seCobra) :
      null;
    const comprobanteNoAplica = Boolean(pago && "pagoNota" in pago && pago.pagoNota === COMPROBANTE_NO_APLICA);
    const r = await bookingTransaction(async (tx) => {
      // Un pedido vencido liberó su franja (M-031): darlo la vuelve a ocupar, si nadie la tomó.
      if (clase.estado === "SIN_RESPUESTA" && (await choqueEn(tx, tenantId, clase.empiezaEn, clase.terminaEn, id))) {
        throw new ErrorNegocio("En ese horario ya quedó otra clase.");
      }
      const cambio = nuevo === "CONFIRMADA" ? await confirmarCambio(tx, tenantId, clase, ahora) : null;
      const conSaldo =
        nuevo === "CONFIRMADA" && clase.pagoEstado === "PENDIENTE" && !cambio?.pagoDeLaVieja
          ? pagoConSaldo(await saldoEnTx(tx, tenantId, clase.alumnoId, id), Number("precio" in precio ? precio.precio : clase.precio))
          : null;
      const n = await tx.padelClase.updateMany({
        where: { tenantId, id, estado: clase.estado, pagoEstado: clase.pagoEstado },
        data: { estado: nuevo, ...sello, ...precio, ...(pago ?? {}), ...(conSaldo ?? {}), ...(cambio?.pagoDeLaVieja ?? {}) },
      });
      if (n.count === 0) throw new ErrorNegocio("Esa clase ya cambió. Actualizá la pantalla.");
      const link = ["CONFIRMADA", "DADA", "AUSENTE"].includes(nuevo)
        ? await reconocerAlumno(tx, tenantId, alumno, { excluir: id })
        : { token: alumno.token, regenerado: false };
      return { conSaldo: Boolean(conSaldo), cambioDe: cambio?.empiezaEn ?? null, ...link };
    });
    const tokenViejo = alumno.token;
    alumno.token = r.token;
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: id, destino: "PROFE", leidoEl: null }, data: { leidoEl: ahora } });
    const cambioPago = r.conSaldo ? "SALDO_A_FAVOR" : comprobanteNoAplica ? "COMPROBANTE_NO_APLICA" : pago?.pagoEstado;
    await auditAdmin({
      action: `padel.${evento}`, entity: "PadelClase", entityId: id,
      changes: { de: clase.estado, a: nuevo, ...(cambioPago ? { pago: cambioPago } : {}), ...(op.motivo ? { motivo: op.motivo } : {}), ...(op.seCobra !== undefined ? { seCobra: op.seCobra } : {}), ...(r.cambioDe ? { cancelaLaDe: r.cambioDe.toISOString() } : {}) },
    });
    const acreditada = pago?.pagoEstado === "ACREDITADO";
    // Con motivo: lluvia o club cerrado → «Se suspende por…»; el resto, «No puedo…».
    const conMotivo = op.motivo && (nuevo === "CANCELADA" || nuevo === "RECHAZADA") ? plantillaDeCancelacion(op.motivo) : null;
    // Dar o ausente no le mandan nada al alumno; si su link se renovó, le va el link nuevo.
    const m = conMotivo
      ? { clave: conMotivo.clave, tipo: nuevo === "RECHAZADA" ? "rechazada" : "cancelada" }
      : MENSAJE_POR_EVENTO[evento] ?? (r.regenerado ? { clave: "linkAlumno" as const, tipo: "link" } : undefined);
    const turnero = `${await origen()}/clases`;
    const extras = [
      r.cambioDe ? `La del ${diaHumano(r.cambioDe)} a las ${horaHumana(r.cambioDe)} quedó cancelada.` : "",
      r.conSaldo ? YA_PAGADA_CON_SALDO : acreditada ? `Lo que pagaste (${pesos(Number(clase.precio))}) te queda a favor para la próxima.` : "",
      op.alternativas?.length ? textoAlternativas(op.alternativas, turnero) : "",
    ].filter(Boolean);
    const aviso = m
      ? await avisarAlAlumno({
          tenantId, config, clave: m.clave, tipo: m.tipo, alumno,
          clase: { ...clase, ...("precio" in precio ? precio : {}) },
          vars: conMotivo?.motivo ? { motivo: conMotivo.motivo } : undefined,
          extra: extras.join(" ") || undefined,
        })
      : SIN_AVISO;
    refrescar(alumno.token, tokenViejo);
    return {
      ok: true as const, ...aviso, claseId: id, nombre: alumno.nombre,
      ...(acreditada ? { aFavor: Number(clase.precio) } : {}),
      ...(comprobanteNoAplica ? { comprobanteNoAplica: true } : {}),
      ...(r.regenerado ? { linkNuevo: true } : {}),
      ...(r.cambioDe ? { cambioDe: r.cambioDe.toISOString() } : {}),
    };
  });
}

/**
 * confirmarCambio (ver transicionar). Adentro de la transacción. Devuelve null si la clase no es un
 * pedido de cambio; si lo es, cancela la vieja y dice qué pago hereda la nueva.
 */
async function confirmarCambio(
  tx: Parameters<Parameters<typeof bookingTransaction>[0]>[0],
  tenantId: string,
  clase: { id: string; alumnoId: string; repiteDe: string | null },
  ahora: Date,
): Promise<{ empiezaEn: Date; pagoDeLaVieja: Record<string, unknown> | null } | null> {
  if (!clase.repiteDe) return null;
  const pedido = await tx.padelAviso.findFirst({ where: { tenantId, destino: "PROFE", tipo: "cambio-pedido", claseId: clase.id }, select: { id: true } });
  if (!pedido) return null;
  // O-5 (CERT T2+T3): si el alumno pidió DOS cambios de la misma clase, al confirmar uno el otro ya
  // no tiene sentido: se rechaza acá, en la misma transacción, y su aviso se da por leído. Sólo los
  // pedidos de cambio (aviso «cambio-pedido»): un «la semana que viene igual» también usa `repiteDe`
  // y ése sigue su curso. O-5b: vale también si el alumno ya había cancelado la vieja (por eso va
  // antes de buscarla viva). O-5c: el motivo le dice la verdad («Ya confirmaste otro horario…»).
  const hermanas = await tx.padelClase.findMany({
    where: { tenantId, alumnoId: clase.alumnoId, repiteDe: clase.repiteDe, estado: "PEDIDA", id: { not: clase.id } },
    select: { id: true },
  });
  if (hermanas.length) {
    const deCambio = await tx.padelAviso.findMany({
      where: { tenantId, destino: "PROFE", tipo: "cambio-pedido", claseId: { in: hermanas.map((h) => h.id) } },
      select: { claseId: true },
    });
    const ids = [...new Set(deCambio.map((a) => a.claseId).filter((x): x is string => Boolean(x)))];
    if (ids.length) {
      await tx.padelClase.updateMany({
        where: { tenantId, id: { in: ids }, estado: "PEDIDA" },
        data: { estado: "RECHAZADA", rechazadaEl: ahora, motivoCancel: MOTIVO_OTRO_CAMBIO_CONFIRMADO },
      });
      await tx.padelAviso.updateMany({ where: { tenantId, destino: "PROFE", claseId: { in: ids }, leidoEl: null }, data: { leidoEl: ahora } });
    }
  }
  const vieja = await tx.padelClase.findFirst({
    where: { tenantId, id: clase.repiteDe, alumnoId: clase.alumnoId, estado: { in: ACTIVAS } },
    select: { id: true, estado: true, empiezaEn: true, pagoEstado: true, pagoMedio: true, comprobante: true, comprobanteEnviadoEl: true },
  });
  if (!vieja) return null;
  // El comprobante por revisar viaja a la nueva (el profe lo valida ahí); lo pagado queda a favor y
  // paga la nueva con el saldo (pagoAlCancelar → ACREDITADO; saldoEnTx lo ve en esta transacción).
  const viajaRevision = vieja.pagoEstado === "EN_REVISION";
  const n = await tx.padelClase.updateMany({
    where: { tenantId, id: vieja.id, estado: vieja.estado, pagoEstado: vieja.pagoEstado },
    data: {
      estado: "CANCELADA", canceladaEl: ahora, motivoCancel: "La pasó a otro horario",
      ...(viajaRevision ? { pagoEstado: "PENDIENTE", comprobante: null, comprobanteEnviadoEl: null } : pagoAlCancelar(vieja) ?? {}),
    },
  });
  if (n.count === 0) throw new ErrorNegocio("La clase de antes cambió recién. Actualizá la pantalla.");
  return {
    empiezaEn: vieja.empiezaEn,
    pagoDeLaVieja: viajaRevision ? { pagoEstado: "EN_REVISION", pagoMedio: vieja.pagoMedio, comprobante: vieja.comprobante, comprobanteEnviadoEl: vieja.comprobanteEnviadoEl } : null,
  };
}

/**
 * Confirmar, rechazar, dar, ausente o cancelar: un toque (ver transicionar). La firma de siempre.
 */
export async function moverClase(id: string, evento: EventoClase): Promise<Resultado<ConAviso & { aFavor?: number; linkNuevo?: boolean }>> {
  return transicionar(id, evento);
}

/**
 * Cancelar con motivo (hoja «Cancelar», M-061) o «No puedo» en un pedido (M-043). Un pedido se
 * rechaza; una confirmada se cancela. Lluvia o club cerrado → «Se suspende por…». Con
 * `alternativasIso` (hasta 3), el WhatsApp pregunta «¿Te sirve … o …?» con el link al turnero en esa
 * hora. Si estaba pagada, queda a favor (T1).
 */
export async function cancelarConMotivo(claseId: string, motivo: MotivoCancel, alternativasIso?: string[]): Promise<ResultadoTransicion> {
  if (!esMotivoCancel(motivo)) return { ok: false, error: "Elegí el motivo." };
  return conErrorNegocio(async () => {
    const { clase } = await claseDelProfe(claseId);
    const evento: EventoClase = clase.estado === "PEDIDA" ? "rechazar" : "cancelar";
    return transicionar(claseId, evento, { motivo, alternativas: alternativasValidas(alternativasIso) });
  });
}

/**
 * «Mover» (F2, M-032/M-033): la misma clase a otra hora, en una transacción. Conserva estado, pago,
 * precio y tipo; la franja vieja queda libre. Un solo WhatsApp: «Te pasé la clase del … al …». La
 * movida queda registrada en el aviso al alumno (tipo «movida») y en la auditoría. El profe puede
 * mover fuera de su grilla (lo arregló en la cancha); lo único que se frena es pisar otra clase:
 * «Se ocupó recién», y la clase sigue donde estaba.
 */
export async function moverHorario(claseId: string, nuevaHoraIso: string): Promise<Resultado<ConAviso & { cuando: string }>> {
  return conErrorNegocio(async () => {
    const { tenantId, clase, config, alumno } = await claseDelProfe(claseId);
    if (!ACTIVAS.includes(clase.estado)) throw new ErrorNegocio("Esa clase ya no se puede mover.");
    const nueva = new Date(nuevaHoraIso);
    if (Number.isNaN(nueva.getTime())) throw new ErrorNegocio("Elegí día y hora.");
    if (nueva.getTime() <= Date.now()) throw new ErrorNegocio("Elegí una hora que no haya pasado.");
    if (nueva.getTime() === clase.empiezaEn.getTime()) throw new ErrorNegocio("La clase ya es a esa hora.");
    const terminaEn = new Date(nueva.getTime() + (clase.terminaEn.getTime() - clase.empiezaEn.getTime()));
    await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, nueva, terminaEn, clase.id)) throw new ErrorNegocio("Se ocupó recién. Elegí otra hora.");
      const n = await tx.padelClase.updateMany({
        where: { tenantId, id: clase.id, estado: clase.estado, empiezaEn: clase.empiezaEn },
        data: { empiezaEn: nueva, terminaEn },
      });
      if (n.count === 0) throw new ErrorNegocio("Esa clase ya cambió. Actualizá la pantalla.");
    });
    await auditAdmin({ action: "padel.mover", entity: "PadelClase", entityId: clase.id, changes: { de: clase.empiezaEn.toISOString(), a: nueva.toISOString() } });
    const aviso = await avisarAlAlumno({
      tenantId, config, clave: "movida", tipo: "movida", alumno,
      clase: { ...clase, empiezaEn: nueva },
      vars: { diaAnterior: diaHumano(clase.empiezaEn), horaAnterior: horaHumana(clase.empiezaEn) },
    });
    refrescar(alumno.token);
    return { ok: true as const, ...aviso, cuando: `${diaHumano(nueva)} ${horaHumana(nueva)}` };
  });
}

/**
 * Las horas libres de un día para el profe (hoja Mover y Agendar): dentro de su grilla, sin
 * anticipación mínima. `excluirClaseId`: la clase que se está moviendo (su propio horario cuenta
 * como libre y la duración es la suya).
 */
export async function horasLibres(fecha: string, excluirClaseId?: string): Promise<Resultado<{ libres: string[] }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!fechaValida(fecha)) return { ok: false, error: "Elegí el día." };
  let duracionMin: number | undefined;
  if (excluirClaseId) {
    const c = await prisma.padelClase.findFirst({ where: { tenantId, id: String(excluirClaseId) }, select: { empiezaEn: true, terminaEn: true } });
    if (!c) return { ok: false, error: "No encontramos esa clase." };
    duracionMin = Math.round((c.terminaEn.getTime() - c.empiezaEn.getTime()) / 60_000);
  }
  const { libres } = await libresDelDia(tenantId, fecha, new Date(), excluirClaseId, { anticipacionMin: 0, duracionMin });
  return { ok: true, libres };
}

/**
 * «No puedo → ¿Le ofrecés otro?» (M-043): hasta 3 horas libres cercanas (ese día y el siguiente),
 * con las reglas del turnero (la anticipación del alumno), porque el alumno las va a pedir ahí.
 */
export async function alternativasPara(claseId: string): Promise<Resultado<{ alternativas: string[] }>> {
  return conErrorNegocio(async () => {
    const { tenantId, clase } = await claseDelProfe(claseId);
    const duracionMin = Math.round((clase.terminaEn.getTime() - clase.empiezaEn.getTime()) / 60_000);
    return { ok: true as const, alternativas: await libresCercanos(tenantId, clase.empiezaEn, { excluir: clase.id, duracionMin, n: 3 }) };
  });
}

/**
 * «Cobré» (M-040): Efectivo, Transferencia o Mercado Pago, en un toque. Cobra TOTAL: el pago parcial
 * necesita la columna `pagado` y queda para T4 (anotarlo en `pagoNota` sería un parche). `recibo`:
 * además le manda «Recibí el pago» al alumno.
 */
export async function cobrar(claseId: string, medio: MedioCobro, opciones?: { recibo?: boolean }): Promise<Resultado<ConAviso>> {
  if (!esMedioCobro(medio)) return { ok: false, error: "Elegí cómo te pagó." };
  return conErrorNegocio(async () => {
    const { tenantId, clase, config, alumno } = await claseDelProfe(claseId);
    if (!puedeCobrarProfe({ ...clase, precio: Number(clase.precio) })) {
      throw new ErrorNegocio(["PAGADO", "ACREDITADO", "DEVUELTO"].includes(clase.pagoEstado) ? "Esa clase ya está cobrada." : "Esa clase no se puede cobrar.");
    }
    const ahora = new Date();
    const n = await prisma.padelClase.updateMany({
      where: { tenantId, id: clase.id, estado: clase.estado, pagoEstado: clase.pagoEstado },
      data: { pagoEstado: "PAGADO", pagoMedio: medio, pagoValidadoEl: ahora },
    });
    if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: clase.id, destino: "PROFE", tipo: "comprobante", leidoEl: null }, data: { leidoEl: ahora } });
    await auditAdmin({ action: "padel.pago.cobrar", entity: "PadelClase", entityId: clase.id, changes: { de: clase.pagoEstado, a: "PAGADO", medio, monto: Number(clase.precio) } });
    const aviso = opciones?.recibo ? await avisarAlAlumno({ tenantId, config, clave: "pagoOk", tipo: "pago-ok", clase, alumno }) : SIN_AVISO;
    refrescar(alumno.token);
    return { ok: true as const, ...aviso };
  }, OTRA_PERSONA_CAMBIO);
}

/**
 * «Cobrar todo» (F4, M-039): todas las deudas del alumno (esDeuda: dadas sin pagar y «no vino» que se
 * cobra) quedan PAGADAS con ese medio en UNA transacción. Si alguna cambió en el medio, no se toca
 * ninguna. Lo que tiene el comprobante por revisar no entra (se valida aparte).
 */
export async function cobrarTodo(alumnoId: string, medio: MedioCobro): Promise<Resultado<{ cantidad: number; total: number }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!esMedioCobro(medio)) return { ok: false, error: "Elegí cómo te pagó." };
  return conErrorNegocio(async () => {
    const r = await tenantTransaction(async (tx) => {
      const a = await tx.padelAlumno.findFirst({ where: { tenantId, id: String(alumnoId ?? "") }, select: { id: true, token: true } });
      if (!a) throw new ErrorNegocio("No encontramos ese alumno.");
      const candidatas = await tx.padelClase.findMany({
        where: {
          tenantId, alumnoId: a.id, precio: { gt: 0 }, pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO", "EN_REVISION"] },
          OR: [{ estado: "DADA" }, { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }],
        },
        select: { id: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true, motivoCancel: true },
      });
      const deudas = candidatas.filter((c) => esDeuda({ ...c, precio: Number(c.precio) }));
      if (!deudas.length) throw new ErrorNegocio("No te debe nada.");
      const n = await tx.padelClase.updateMany({
        where: { tenantId, alumnoId: a.id, id: { in: deudas.map((c) => c.id) }, pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO", "EN_REVISION"] } },
        data: { pagoEstado: "PAGADO", pagoMedio: medio, pagoValidadoEl: new Date() },
      });
      if (n.count !== deudas.length) throw new ErrorNegocio("Algo cambió recién. Actualizá la pantalla.");
      return { token: a.token, cantidad: deudas.length, total: redondear(deudas.reduce((s, c) => s + Number(c.precio), 0)) };
    }, { tenantId });
    await auditAdmin({ action: "padel.pago.cobrarTodo", entity: "PadelAlumno", entityId: String(alumnoId), changes: { medio, clases: r.cantidad, total: r.total } });
    refrescar(r.token);
    return { ok: true as const, cantidad: r.cantidad, total: r.total };
  }, OTRA_PERSONA_CAMBIO);
}

/**
 * «Confirmar todos» (F6, M-034): confirma cada pedido (cada uno en su transacción, con su saldo y su
 * reconocimiento) y devuelve la cola de avisos «Avisar a Juan (1 de 3)». Lo que no se pudo
 * confirmar (cambió en el medio) vuelve en `fallidas` con su motivo.
 */
export async function confirmarTodos(ids: string[]): Promise<Resultado<{ avisos: AvisoEnCola[]; fallidas: { claseId: string; error: string }[] }>> {
  await requireCapability("agenda:manage");
  const lista = idsLimpios(ids, 30);
  if (!lista.length) return { ok: false, error: "No hay pedidos para confirmar." };
  const avisos: AvisoEnCola[] = [];
  const fallidas: { claseId: string; error: string }[] = [];
  for (const id of lista) {
    const r = await transicionar(id, "confirmar");
    if (r.ok) avisos.push({ wa: r.wa, enviado: r.enviado, avisoId: r.avisoId ?? null, claseId: id, nombre: r.nombre });
    else fallidas.push({ claseId: id, error: r.error });
  }
  return { ok: true, avisos, fallidas };
}

/**
 * «Recordar a los 8» (F5, M-041): un recordatorio (con el link del alumno) por cada clase confirmada
 * que viene, en una cola. Cada envío queda como PadelAviso «recordatorio»: cuando el profe toca el
 * link (marcarAvisado) o sale por la Cloud API, la tarjeta dice «recordado ✓» (hoy().recordadas). Si
 * ya había uno de hoy sin mandar, se reusa (no se duplica); si ya salió, no se repite.
 */
export async function recordarVarios(ids: string[]): Promise<Resultado<{ avisos: AvisoEnCola[]; yaRecordadas: string[] }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const lista = idsLimpios(ids, 40);
  if (!lista.length) return { ok: false, error: "No hay clases para recordar." };
  const ahora = new Date();
  const inicioHoy = businessWallTimeToUtc(todayInBusinessTz(), "00:00");
  const [config, clases, previos] = await Promise.all([
    configPadel(tenantId),
    prisma.padelClase.findMany({
      where: { tenantId, id: { in: lista }, estado: "CONFIRMADA", empiezaEn: { gt: ahora } },
      orderBy: { empiezaEn: "asc" },
      select: { id: true, empiezaEn: true, precio: true, alumno: { select: { id: true, token: true } }, client: { select: { name: true, phone: true } } },
    }),
    prisma.padelAviso.findMany({
      where: { tenantId, destino: "ALUMNO", tipo: "recordatorio", claseId: { in: lista }, createdAt: { gte: inicioHoy } },
      orderBy: { createdAt: "desc" },
      select: { id: true, claseId: true, enviadoEl: true, texto: true },
    }),
  ]);
  const avisos: AvisoEnCola[] = [];
  const yaRecordadas: string[] = [];
  for (const c of clases) {
    const deEsta = previos.filter((p) => p.claseId === c.id);
    if (deEsta.some((p) => p.enviadoEl)) {
      yaRecordadas.push(c.id);
      continue;
    }
    const sinMandar = deEsta[0];
    if (sinMandar) {
      // O-12 (CERT T2+T3): si el link del alumno se renovó entre medio, el texto guardado lleva el
      // viejo. Se pone el vigente (en el aviso guardado también) antes de reusarlo.
      const texto = conLinkVigente(sinMandar.texto, c.alumno.token);
      if (texto !== sinMandar.texto) await prisma.padelAviso.updateMany({ where: { tenantId, id: sinMandar.id, enviadoEl: null }, data: { texto } });
      avisos.push({ wa: linkWhatsApp(c.client.phone, texto), enviado: false, avisoId: sinMandar.id, claseId: c.id, nombre: c.client.name });
      continue;
    }
    const alumno = { id: c.alumno.id, token: c.alumno.token, nombre: c.client.name, telefono: c.client.phone };
    const a = await avisarAlAlumno({ tenantId, config, clave: "recordatorio", tipo: "recordatorio", clase: c, alumno });
    avisos.push({ ...a, claseId: c.id, nombre: c.client.name });
  }
  await auditAdmin({ action: "padel.recordarVarios", entity: "PadelClase", changes: { clases: avisos.length, yaRecordadas: yaRecordadas.length } });
  revalidatePath(RAIZ, "layout");
  return { ok: true, avisos, yaRecordadas };
}

/**
 * La cola de avisos: el profe tocó «Avisar a Juan» (abrió WhatsApp con el texto) → ese aviso queda
 * mandado (`enviadoEl`) y sale de «Sin avisar». Sólo avisos al alumno de ESTE negocio; si ya estaba
 * marcado, no hace nada. Lo importa la ColaAvisos de la pantalla (Tanda 2B) de acá.
 */
export async function marcarAvisado(avisoId: string): Promise<Resultado<{ marcado: boolean }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (typeof avisoId !== "string" || !avisoId || avisoId.length > 40) return { ok: false, error: "No encontramos ese aviso." };
  const n = await prisma.padelAviso.updateMany({ where: { tenantId, id: avisoId, destino: "ALUMNO", enviadoEl: null }, data: { enviadoEl: new Date() } });
  revalidatePath(RAIZ, "layout");
  return { ok: true, marcado: n.count > 0 };
}

/**
 * «Ayer quedaron sin cerrar» (F10, M-044): Dada o No vino de un toque sobre una clase pasada. Dar
 * suma a la deuda si no estaba pagada; «No vino» sigue la regla de marcarNoVino.
 */
export async function cerrarPasada(claseId: string, accion: "dar" | "ausente", seCobra = false): Promise<Resultado<ConAviso & { linkNuevo?: boolean }>> {
  if (accion === "dar") return transicionar(claseId, "dar");
  if (accion === "ausente") return marcarNoVino(claseId, seCobra);
  return { ok: false, error: "Elegí «Dada» o «No vino»." };
}

/**
 * «No vino» (M-045): AUSENTE. Con «Se cobra igual», la clase es deuda (esDeuda la cuenta) hasta que
 * se cobre; con «No se cobra», no. Queda escrito en `motivoCancel` — provisional hasta la columna
 * `seCobra` de T4 (TODO(T4)).
 */
export async function marcarNoVino(claseId: string, seCobra: boolean): Promise<Resultado<ConAviso & { aFavor?: number; comprobanteNoAplica?: boolean; linkNuevo?: boolean; seCobra: boolean }>> {
  const r = await transicionar(claseId, "ausente", { seCobra: Boolean(seCobra) });
  return r.ok ? { ...r, seCobra: Boolean(seCobra) } : r;
}

// ── Lluvia, viaje, torneo: suspender y bloquear ────────────────────────────

type AccionAfectadas = "nada" | "cancelar" | "proponer";
type Afectada = { claseId: string; nombre: string; empiezaEn: string; estado: string };
type ResultadoAfectadas = {
  afectadas: Afectada[];
  avisos: AvisoEnCola[];
  propuestas: { claseId: string; nombre: string; desde: string; propuesta: string | null }[];
  aFavor: number;
  fallidas: { claseId: string; error: string }[];
};

/** Bloqueo NO de un día (o parte), sin duplicar uno idéntico. Adentro de la transacción. */
async function bloquearEnTx(tx: Parameters<Parameters<typeof tenantTransaction>[0]>[0], tenantId: string, fecha: string, desde: string, hasta: string) {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  const ya = await tx.padelDisponibilidad.findFirst({ where: { tenantId, fecha: dia, desde, hasta, tipo: "NO" }, select: { id: true } });
  if (!ya) await tx.padelDisponibilidad.create({ data: { tenantId, fecha: dia, desde, hasta, tipo: "NO" } });
}

/** Las clases vivas (pedidas o confirmadas) que todavía no empezaron y caen en esas ventanas. */
async function clasesAfectadas(tenantId: string, ventanas: { fecha: string; desde: string; hasta: string }[]) {
  const ahora = new Date();
  const filas = await prisma.padelClase.findMany({
    where: {
      tenantId,
      estado: { in: ACTIVAS },
      empiezaEn: { gte: ahora },
      OR: ventanas.map((v) => ({ empiezaEn: { lt: businessWallTimeToUtc(v.fecha, v.hasta) }, terminaEn: { gt: businessWallTimeToUtc(v.fecha, v.desde) } })),
    },
    orderBy: { empiezaEn: "asc" },
    select: { id: true, empiezaEn: true, terminaEn: true, estado: true, client: { select: { name: true } } },
  });
  return filas;
}

/**
 * Qué hacer con las clases afectadas por un bloqueo:
 *  · «cancelar»: cada una se cancela (o se rechaza, si era un pedido) con el motivo → cola de avisos;
 *    las pagadas quedan a favor (`aFavor` = la suma).
 *  · «proponer»: a cada una, el primer hueco libre que viene (proponerMovidas); se confirma de a una
 *    con moverHorario.
 *  · «nada»: sólo la lista (la pantalla ofrece cancelar o mover).
 */
async function resolverAfectadas(
  tenantId: string,
  filas: Awaited<ReturnType<typeof clasesAfectadas>>,
  accion: AccionAfectadas,
  motivo: MotivoCancel,
  buscarDesde: string,
  diasDeBusqueda: number,
): Promise<ResultadoAfectadas> {
  const afectadas: Afectada[] = filas.map((c) => ({ claseId: c.id, nombre: c.client.name, empiezaEn: c.empiezaEn.toISOString(), estado: c.estado }));
  const out: ResultadoAfectadas = { afectadas, avisos: [], propuestas: [], aFavor: 0, fallidas: [] };
  if (accion === "cancelar") {
    for (const c of filas) {
      const r = await transicionar(c.id, c.estado === "PEDIDA" ? "rechazar" : "cancelar", { motivo });
      if (r.ok) {
        out.avisos.push({ wa: r.wa, enviado: r.enviado, avisoId: r.avisoId ?? null, claseId: c.id, nombre: r.nombre });
        out.aFavor += r.aFavor ?? 0;
      } else out.fallidas.push({ claseId: c.id, error: r.error });
    }
  } else if (accion === "proponer" && filas.length) {
    // Sin anticipación: el profe decide (y el bloqueo recién creado ya saca lo que no se puede).
    const libres = await libresEnRango(tenantId, buscarDesde, diasDeBusqueda, { anticipacionMin: 0 });
    const nombre = new Map(filas.map((c) => [c.id, c.client.name]));
    out.propuestas = proponerMovidas(filas.map((c) => ({ id: c.id, empiezaEn: c.empiezaEn })), libres).map((p) => ({ ...p, nombre: nombre.get(p.claseId) ?? "" }));
  }
  return out;
}

const esAccionAfectadas = (v: unknown): v is AccionAfectadas => v === "nada" || v === "cancelar" || v === "proponer";

/**
 * «🌧 Se suspende» (F3, M-036/M-037): bloquea el día (todo, o desde/hasta) para que el turnero no lo
 * ofrezca, y resuelve las clases que caían ahí: «cancelar» (motivo Lluvia por defecto; cola 1 de N;
 * las pagadas quedan a favor) o «proponer» (primer hueco libre siguiente para cada una).
 */
export async function suspenderDia(
  fecha: string,
  desde: string | null | undefined,
  hasta: string | null | undefined,
  accion: AccionAfectadas,
  motivo: MotivoCancel = "LLUVIA",
): Promise<Resultado<ResultadoAfectadas>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const d = desde || "00:00";
  const h = hasta || "23:59";
  if (!fechaValida(fecha) || !horaValida(d) || !horaValida(h) || h <= d) return { ok: false, error: "Elegí el día (y si querés, desde y hasta qué hora)." };
  if (!esAccionAfectadas(accion)) return { ok: false, error: "Elegí qué hacemos con las clases." };
  if (!esMotivoCancel(motivo)) return { ok: false, error: "Elegí el motivo." };
  await tenantTransaction((tx) => bloquearEnTx(tx, tenantId, fecha, d, h), { tenantId });
  const filas = await clasesAfectadas(tenantId, [{ fecha, desde: d, hasta: h }]);
  const r = await resolverAfectadas(tenantId, filas, accion, motivo, fecha, 8);
  await auditAdmin({ action: "padel.suspender", entity: "PadelDisponibilidad", changes: { fecha, desde: d, hasta: h, accion, motivo, clases: filas.length } });
  refrescar();
  return { ok: true, ...r };
}

/**
 * «Bloquear días» (E18, M-038): un viaje o un torneo del `desde` al `hasta` (como mucho 62 días):
 * un bloqueo de día completo por día (sin duplicar) y las clases que caían adentro. Con «nada»
 * devuelve la lista para ofrecer cancelar o mover; con «cancelar» o «proponer», como suspenderDia.
 */
export async function bloquearRango(desde: string, hasta: string, accion: AccionAfectadas = "nada", motivo: MotivoCancel = "OTRO"): Promise<Resultado<ResultadoAfectadas & { dias: number }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const dias = diasEntre(desde, hasta, 63);
  if (!dias.length) return { ok: false, error: "Elegí desde y hasta qué día." };
  if (dias.length > 62) return { ok: false, error: "Como mucho dos meses de una vez." };
  if (!esAccionAfectadas(accion)) return { ok: false, error: "Elegí qué hacemos con las clases." };
  if (!esMotivoCancel(motivo)) return { ok: false, error: "Elegí el motivo." };
  await tenantTransaction(async (tx) => {
    for (const f of dias) await bloquearEnTx(tx, tenantId, f, "00:00", "23:59");
  }, { tenantId });
  const filas = await clasesAfectadas(tenantId, dias.map((f) => ({ fecha: f, desde: "00:00", hasta: "23:59" })));
  const r = await resolverAfectadas(tenantId, filas, accion, motivo, sumarDias(hasta, 1), 14);
  await auditAdmin({ action: "padel.bloquearRango", entity: "PadelDisponibilidad", changes: { desde, hasta, dias: dias.length, accion, clases: filas.length } });
  refrescar();
  return { ok: true, dias: dias.length, ...r };
}

// ── Alumnos ─────────────────────────────────────────────────────────────────

/**
 * «+ Alumno» (E9, M-042): nombre, celular y nivel. Si el celular ya es de un alumno: «Ya es tu
 * alumno: Lucía» con su `alumnoId` (la pantalla abre su ficha; no se duplica). Si había una ficha de
 * cliente con ese celular (otro módulo), se usa esa.
 */
export async function crearAlumno(nombre: string, telefono: string, nivel?: string): Promise<Resultado<{ alumnoId: string }> | { ok: false; error: string; alumnoId: string }> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const n = nombreValido(nombre);
  if (!n) return { ok: false, error: "Poné el nombre (de 2 a 60 letras)." };
  const t = telefonoAlumno(telefono);
  if (!t) return { ok: false, error: "Poné el celular con código de área, por ejemplo 11 5555-1234." };
  const niv = String(nivel ?? "").trim().slice(0, 30);
  const r = await tenantTransaction(async (tx) => {
    const ya = await tx.padelAlumno.findFirst({ where: { tenantId, client: { phone: t } }, select: { id: true, client: { select: { name: true } } } });
    if (ya) return { duplicado: true as const, id: ya.id, nombre: ya.client.name };
    const ficha = await tx.client.findFirst({ where: { tenantId, phone: t }, select: { id: true } });
    const cliente = ficha ?? (await tx.client.create({ data: { tenantId, name: n, phone: t }, select: { id: true } }));
    const a = await tx.padelAlumno.create({ data: { tenantId, clientId: cliente.id, token: nuevoToken(), nivel: niv }, select: { id: true } });
    return { duplicado: false as const, id: a.id, nombre: n };
  }, { tenantId });
  if (r.duplicado) return { ok: false, error: `Ya es tu alumno: ${r.nombre}`, alumnoId: r.id };
  await auditAdmin({ action: "padel.alumno.crear", entity: "PadelAlumno", entityId: r.id });
  refrescar();
  return { ok: true, alumnoId: r.id };
}

/**
 * Editar la ficha (E9, M-042): nombre, celular, nivel y notas. El próximo WhatsApp va al celular
 * nuevo. Si cambia el celular, el link se regenera (el número viejo pudo haber recibido el link: deja
 * de andar) y la respuesta lo dice (`linkNuevo`) para mandárselo al nuevo. Un celular que ya es de
 * otro alumno no se acepta.
 */
export async function editarAlumno(
  alumnoId: string,
  cambios: { nombre?: string; telefono?: string; nivel?: string; notas?: string },
): Promise<Resultado<{ linkNuevo: boolean }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const c = cambios ?? {};
  const nombre = c.nombre !== undefined ? nombreValido(c.nombre) : undefined;
  if (nombre === null) return { ok: false, error: "Poné el nombre (de 2 a 60 letras)." };
  const telefono = c.telefono !== undefined ? telefonoAlumno(c.telefono) : undefined;
  if (telefono === "") return { ok: false, error: "Poné el celular con código de área, por ejemplo 11 5555-1234." };
  return conErrorNegocio(async () => {
    const r = await tenantTransaction(async (tx) => {
      const a = await tx.padelAlumno.findFirst({ where: { tenantId, id: String(alumnoId ?? "") }, select: { id: true, token: true, clientId: true, client: { select: { phone: true } } } });
      if (!a) throw new ErrorNegocio("No encontramos ese alumno.");
      const cambiaTel = telefono !== undefined && telefono !== a.client.phone;
      if (cambiaTel) {
        const otro = await tx.padelAlumno.findFirst({ where: { tenantId, id: { not: a.id }, client: { phone: telefono } }, select: { client: { select: { name: true } } } });
        if (otro) throw new ErrorNegocio(`Ese celular ya es de ${otro.client.name}.`);
      }
      if (nombre !== undefined || cambiaTel) {
        await tx.client.updateMany({ where: { tenantId, id: a.clientId }, data: { ...(nombre ? { name: nombre } : {}), ...(cambiaTel ? { phone: telefono } : {}) } });
      }
      const datos = {
        ...(c.nivel !== undefined ? { nivel: String(c.nivel).trim().slice(0, 30) } : {}),
        ...(c.notas !== undefined ? { notas: String(c.notas).trim().slice(0, 1000) || null } : {}),
      };
      if (Object.keys(datos).length) await tx.padelAlumno.updateMany({ where: { tenantId, id: a.id }, data: datos });
      const token = cambiaTel ? await regenerarToken(tx, tenantId, a.id) : a.token;
      return { tokenViejo: a.token, token, linkNuevo: cambiaTel };
    }, { tenantId });
    await auditAdmin({ action: "padel.alumno.editar", entity: "PadelAlumno", entityId: String(alumnoId), changes: { campos: Object.keys(c), linkNuevo: r.linkNuevo } });
    refrescar(r.token, r.tokenViejo);
    return { ok: true as const, linkNuevo: r.linkNuevo };
  }, OTRA_PERSONA_CAMBIO);
}

/**
 * «Recordarle» (Plata, M-074): el WhatsApp con el detalle de lo que debe, el total y el alias.
 */
export async function recordarDeuda(alumnoId: string): Promise<Resultado<ConAviso & { total: number }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: String(alumnoId ?? "") }, select: { id: true, token: true, client: { select: { name: true, phone: true } } } });
  if (!a) return { ok: false, error: "No encontramos ese alumno." };
  const [config, clases] = await Promise.all([
    configPadel(tenantId),
    prisma.padelClase.findMany({
      where: { tenantId, alumnoId: a.id, precio: { gt: 0 }, OR: [{ estado: "DADA" }, { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }] },
      select: { estado: true, pagoEstado: true, pagoMedio: true, precio: true, motivoCancel: true, empiezaEn: true },
    }),
  ]);
  const d = detalleDeuda(clases.map((c) => ({ ...c, precio: Number(c.precio) })));
  if (d.cantidad === 0) return { ok: false, error: "No te debe nada." };
  const aviso = await avisarAlAlumno({
    tenantId, config, clave: "recordatorioDeuda", tipo: "recordatorio-deuda", clase: null,
    alumno: { id: a.id, token: a.token, nombre: a.client.name, telefono: a.client.phone },
    vars: { detalle: d.detalle, total: pesos(d.total) },
  });
  return { ok: true, ...aviso, total: d.total };
}

// ── Clase: editar y comprobante ─────────────────────────────────────────────

/**
 * «Editar clase» (E33, M-064): duración, tipo y personas, precio a mano. Si cambia la duración, se
 * vuelve a mirar que no pise otra clase. Si cambia el tipo o las personas y no vino precio, se toma
 * el de la lista. Una clase ya pagada no cambia de precio (el saldo y los cobros quedarían mal).
 */
export async function editarClase(
  id: string,
  cambios: { duracionMin?: number; tipo?: string; personas?: number; precio?: number | string },
): Promise<Resultado> {
  return conErrorNegocio(async () => {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    if (!["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE"].includes(clase.estado)) throw new ErrorNegocio("Esa clase ya no se puede editar.");
    const c = cambios ?? {};
    const data: Record<string, unknown> = {};
    let terminaEn: Date | null = null;
    if (c.duracionMin !== undefined) {
      const dur = Number(c.duracionMin);
      if (!duracionValida(dur)) throw new ErrorNegocio("La duración va de 30 a 180 minutos.");
      terminaEn = new Date(clase.empiezaEn.getTime() + dur * 60_000);
      if (terminaEn.getTime() !== clase.terminaEn.getTime()) data.terminaEn = terminaEn;
      else terminaEn = null;
    }
    let tipo: TipoClase = esTipoClase(clase.tipo) ? clase.tipo : "INDIVIDUAL";
    let personas = clase.personas;
    if (c.tipo !== undefined) {
      if (!esTipoClase(c.tipo)) throw new ErrorNegocio("Elegí individual o con amigos.");
      tipo = c.tipo;
    }
    if (c.personas !== undefined || c.tipo !== undefined) personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Math.trunc(Number(c.personas ?? personas)) || 2)) : 1;
    if (tipo !== clase.tipo) data.tipo = tipo;
    if (personas !== clase.personas) data.personas = personas;
    let precioNuevo: number | null = null;
    if (c.precio !== undefined) {
      const l = typeof c.precio === "number" ? { estado: "ok" as const, valor: c.precio } : leerImporte(String(c.precio));
      if (l.estado !== "ok" || !Number.isFinite(l.valor) || l.valor < 0 || l.valor > 10_000_000) throw new ErrorNegocio("Poné un precio válido.");
      precioNuevo = redondear(l.valor);
    } else if (data.tipo !== undefined || data.personas !== undefined) {
      precioNuevo = precioDe(config, tipo, personas);
    }
    if (precioNuevo !== null && precioNuevo !== Number(clase.precio)) {
      if (["PAGADO", "ACREDITADO", "DEVUELTO"].includes(clase.pagoEstado)) throw new ErrorNegocio("Esa clase ya está pagada: el precio no se cambia.");
      data.precio = precioNuevo;
    }
    if (!Object.keys(data).length) return { ok: true as const };
    await bookingTransaction(async (tx) => {
      if (terminaEn && (ESTADOS_QUE_OCUPAN as readonly string[]).includes(clase.estado) && (await choqueEn(tx, tenantId, clase.empiezaEn, terminaEn, clase.id))) {
        throw new ErrorNegocio(`Con ${Math.round((terminaEn.getTime() - clase.empiezaEn.getTime()) / 60_000)} minutos pisa otra clase.`);
      }
      const n = await tx.padelClase.updateMany({ where: { tenantId, id: clase.id, estado: clase.estado, pagoEstado: clase.pagoEstado }, data });
      if (n.count === 0) throw new ErrorNegocio("Esa clase ya cambió. Actualizá la pantalla.");
    });
    await auditAdmin({ action: "padel.editarClase", entity: "PadelClase", entityId: clase.id, changes: { ...data, ...(data.terminaEn ? { terminaEn: (data.terminaEn as Date).toISOString() } : {}) } });
    refrescar(alumno.token);
    return { ok: true as const };
  });
}

/** Cobro: validar el comprobante, devolverlo o «cobré» (efectivo). Adentro de moverPago y devolverComprobante. */
async function cambiarPago(id: string, evento: Exclude<EventoPago, "subir">, nota?: string): Promise<Resultado<ConAviso>> {
  return conErrorNegocio(async () => {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const nuevo = transicionPago(clase.pagoEstado, clase.estado, evento, "profe")
      // M-045: la AUSENTE que se cobra igual también se valida o se cobra.
      ?? (clase.estado === "AUSENTE" && clase.motivoCancel === MOTIVO_AUSENTE_SE_COBRA ? transicionPago(clase.pagoEstado, "DADA", evento, "profe") : null);
    if (!nuevo) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
    const ahora = new Date();
    const data =
      evento === "efectivo" ? { pagoEstado: nuevo, pagoMedio: "EFECTIVO", pagoValidadoEl: ahora } :
      evento === "validar" ? { pagoEstado: nuevo, pagoValidadoEl: ahora } :
      { pagoEstado: nuevo, pagoNota: (nota ?? "").slice(0, 200) || "No se pudo validar el comprobante" };
    const n = await prisma.padelClase.updateMany({ where: { tenantId, id, pagoEstado: clase.pagoEstado }, data });
    if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: id, destino: "PROFE", tipo: "comprobante", leidoEl: null }, data: { leidoEl: ahora } });
    await auditAdmin({ action: `padel.pago.${evento}`, entity: "PadelClase", entityId: id, changes: { de: clase.pagoEstado, a: nuevo, ...(evento === "noValido" && nota ? { nota } : {}) } });
    const aviso =
      evento === "validar" ? await avisarAlAlumno({ tenantId, config, clave: "pagoOk", tipo: "pago-ok", clase, alumno }) :
      evento === "noValido" ? await avisarAlAlumno({ tenantId, config, clave: "pagoNo", tipo: "pago-no", clase, alumno, extra: nota }) :
      SIN_AVISO;
    refrescar(alumno.token);
    return { ok: true as const, ...aviso };
  }, OTRA_PERSONA_CAMBIO);
}

/** Cobro: "cobré en efectivo", validar el comprobante o devolverlo. */
export async function moverPago(id: string, evento: Exclude<EventoPago, "subir">, nota?: string): Promise<Resultado<ConAviso>> {
  return cambiarPago(id, evento, nota);
}

/**
 * «No es válido» con motivo (M-076): Monto distinto · No se ve · Otra cuenta · Otro. El alumno lo ve
 * en su link (`pagoNota`, en criollo) y en el WhatsApp, y puede mandar otro.
 */
export async function devolverComprobante(id: string, motivo: MotivoComprobante): Promise<Resultado<ConAviso>> {
  if (!esMotivoComprobante(motivo)) return { ok: false, error: "Elegí por qué no es válido." };
  return cambiarPago(id, "noValido", MOTIVO_COMPROBANTE_LABEL[motivo]);
}

/**
 * "Agendar la próxima": la misma hora la semana que viene, CONFIRMADA. El profe puede agendar
 * fuera de su grilla (lo arregló en la cancha); lo único que se frena es pisar otra clase.
 */
export async function agendarProxima(id: string): Promise<Resultado<ConAviso & { cuando: string; linkNuevo?: boolean }>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const empiezaEn = proximaSemana(clase.empiezaEn);
    const terminaEn = proximaSemana(clase.terminaEn);
    const { nueva, link } = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio(`El ${diaHumano(empiezaEn)} a las ${horaHumana(empiezaEn)} ya está ocupado.`);
      // Antes de crear la clase (que ya cuenta como «agendada por el profe»): ¿había que renovar el link?
      const link = await reconocerAlumno(tx, tenantId, alumno);
      const precio = precioDe(config, esTipoClase(clase.tipo) ? clase.tipo : "INDIVIDUAL", clase.personas);
      const conSaldo = pagoConSaldo(await saldoEnTx(tx, tenantId, clase.alumnoId), precio);
      const nueva = await tx.padelClase.create({
        data: {
          tenantId, alumnoId: clase.alumnoId, clientId: clase.clientId, empiezaEn, terminaEn, tipo: clase.tipo, personas: clase.personas,
          estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", repiteDe: clase.id, precio, ...(conSaldo ?? {}),
        },
        select: { id: true, empiezaEn: true, precio: true, pagoMedio: true },
      });
      return { nueva, link };
    });
    await auditAdmin({ action: "padel.agendarProxima", entity: "PadelClase", entityId: nueva.id, changes: { repiteDe: clase.id, ...(link.regenerado ? { linkNuevo: true } : {}) } });
    const tokenViejo = alumno.token;
    alumno.token = link.token;
    const aviso = await avisarAlAlumno({ tenantId, config, clave: "proxima", tipo: "proxima", clase: nueva, alumno, extra: nueva.pagoMedio === "SALDO_A_FAVOR" ? YA_PAGADA_CON_SALDO : undefined });
    refrescar(alumno.token, tokenViejo);
    return { ok: true, ...aviso, cuando: `${diaHumano(empiezaEn)} ${horaHumana(empiezaEn)}`, ...(link.regenerado ? { linkNuevo: true } : {}) };
  } catch (e) {
    const r = respuestaDeError(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Alta directa del profe (le pidieron la clase en la cancha): alumno existente o nuevo. Si el alumno
 * ya existía y el profe todavía no lo había reconocido, su link se regenera (O-1).
 */
export async function agendarClase(fd: FormData): Promise<Resultado<ConAviso & { cuando: string; linkNuevo?: boolean }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const fecha = String(fd.get("fecha") ?? "");
  const horaTxt = String(fd.get("hora") ?? "");
  if (!fechaValida(fecha) || !horaValida(horaTxt)) return { ok: false, error: "Elegí día y hora." };
  const tipo: TipoClase = esTipoClase(fd.get("tipo")) ? (fd.get("tipo") as TipoClase) : "INDIVIDUAL";
  const personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Number(fd.get("personas")) || 2)) : 1;
  const alumnoId = String(fd.get("alumnoId") ?? "");
  const nombre = nombreValido(fd.get("nombre"));
  const telefono = telefonoAlumno(String(fd.get("telefono") ?? ""));
  if (!alumnoId && (!nombre || !telefono)) return { ok: false, error: "Elegí un alumno, o poné nombre y celular de uno nuevo." };

  const config = await configPadel(tenantId);
  const empiezaEn = businessWallTimeToUtc(fecha, horaTxt);
  const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);
  try {
    const r = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio("Ese horario ya tiene una clase.");
      const alumno = alumnoId
        ? await tx.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { id: true, token: true, clientId: true } })
        : await alumnoPorTelefono(tx, tenantId, telefono, nombre!);
      if (!alumno) throw new ErrorNegocio("No encontramos ese alumno.");
      const link = await reconocerAlumno(tx, tenantId, alumno, { recienCreado: "recienCreado" in alumno ? Boolean(alumno.recienCreado) : false });
      const precio = precioDe(config, tipo, personas);
      const conSaldo = pagoConSaldo(await saldoEnTx(tx, tenantId, alumno.id), precio);
      const clase = await tx.padelClase.create({
        data: {
          tenantId, alumnoId: alumno.id, clientId: alumno.clientId, empiezaEn, terminaEn, tipo, personas,
          estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio, ...(conSaldo ?? {}),
        },
        select: { id: true, empiezaEn: true, precio: true, pagoMedio: true },
      });
      const cliente = await tx.client.findFirst({ where: { tenantId, id: alumno.clientId }, select: { name: true, phone: true } });
      return { clase, tokenViejo: alumno.token, regenerado: link.regenerado, alumno: { id: alumno.id, token: link.token, nombre: cliente?.name ?? "", telefono: cliente?.phone ?? "" } };
    });
    await auditAdmin({ action: "padel.agendar", entity: "PadelClase", entityId: r.clase.id, ...(r.regenerado ? { changes: { linkNuevo: true } } : {}) });
    const aviso = await avisarAlAlumno({ tenantId, config, clave: "proxima", tipo: "proxima", clase: r.clase, alumno: r.alumno, extra: r.clase.pagoMedio === "SALDO_A_FAVOR" ? YA_PAGADA_CON_SALDO : undefined });
    refrescar(r.alumno.token, r.tokenViejo);
    return { ok: true, ...aviso, cuando: `${diaHumano(empiezaEn)} ${horaHumana(empiezaEn)}`, ...(r.regenerado ? { linkNuevo: true } : {}) };
  } catch (e) {
    const r = respuestaDeError(e);
    if (r) return r;
    throw e;
  }
}

/** El link del alumno por WhatsApp (para mandárselo la primera vez o si lo perdió). */
export async function mandarLinkAlAlumno(alumnoId: string): Promise<Resultado<{ wa: string | null; linkNuevo?: boolean }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { id: true, token: true, client: { select: { name: true, phone: true } } } });
  if (!a) return { ok: false, error: "No encontramos ese alumno." };
  // Si todavía no lo reconociste, va un link recién hecho (O-1).
  const { token, regenerado } = await tokenParaMandar(tenantId, a);
  if (regenerado) {
    await auditAdmin({ action: "padel.regenerarLink", entity: "PadelAlumno", entityId: alumnoId, changes: { motivo: "mandar-link-sin-reconocer" } });
    refrescar(token, a.token);
  }
  const config = await configPadel(tenantId);
  const texto = armarMensaje(config.plantillas.linkAlumno, { nombre: a.client.name.split(" ")[0], link: `${await origen()}/alumno/${token}` });
  return { ok: true, wa: linkWhatsApp(a.client.phone, texto), ...(regenerado ? { linkNuevo: true } : {}) };
}

/**
 * «Regenerar link» (O-1): el profe le hace un link nuevo al alumno y el viejo deja de andar en el
 * acto (si alguien más lo tenía —un teléfono perdido, un tercero que tipeó su celular—, queda
 * afuera). Devuelve el WhatsApp con el link nuevo, listo para mandar al número registrado.
 */
export async function regenerarLink(alumnoId: string): Promise<Resultado<{ wa: string | null }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { token: true, client: { select: { name: true, phone: true } } } });
  if (!a) return { ok: false, error: "No encontramos ese alumno." };
  const token = nuevoToken();
  // Condicionado al token leído: dos toques a la vez no dejan dos links distintos dando vueltas.
  const n = await prisma.padelAlumno.updateMany({ where: { tenantId, id: alumnoId, token: a.token }, data: { token } });
  if (n.count === 0) return { ok: false, error: "Ese link ya cambió. Actualizá la pantalla." };
  await auditAdmin({ action: "padel.regenerarLink", entity: "PadelAlumno", entityId: alumnoId });
  const config = await configPadel(tenantId);
  const texto = armarMensaje(config.plantillas.linkAlumno, { nombre: a.client.name.split(" ")[0], link: `${await origen()}/alumno/${token}` });
  refrescar(token, a.token);
  return { ok: true, wa: linkWhatsApp(a.client.phone, texto) };
}

/** Recordatorio de la clase (para las de mañana): el WhatsApp listo. */
export async function recordatorio(id: string): Promise<Resultado<ConAviso>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    return { ok: true, ...(await avisarAlAlumno({ tenantId, config, clave: "recordatorio", tipo: "recordatorio", clase, alumno })) };
  } catch (e) {
    const r = respuestaDeError(e);
    if (r) return r;
    throw e;
  }
}

/**
 * «Le devolví»: el profe le devolvió en mano lo que había quedado a favor de esa clase.
 * ACREDITADO → DEVUELTO, y sale del saldo. No deja el saldo en negativo (si parte ya se usó, no corre).
 */
export async function devolverSaldo(claseId: string): Promise<Resultado<{ aFavor: number }>> {
  try {
    const { tenantId, clase } = await claseDelProfe(claseId);
    const nuevo = transicionPago(clase.pagoEstado, clase.estado, "devolver", "profe");
    if (!nuevo) return { ok: false, error: "Esa clase no tiene plata a favor para devolver." };
    // Serializable, como las altas que usan el saldo: devolver y usar a la vez no lo deja negativo.
    const r = await bookingTransaction(async (tx) => {
      const saldo = await saldoEnTx(tx, tenantId, clase.alumnoId);
      if (saldo < Number(clase.precio)) throw new ErrorNegocio("Parte de ese saldo ya se usó en otra clase: no se puede devolver entero.");
      const n = await tx.padelClase.updateMany({ where: { tenantId, id: claseId, pagoEstado: "ACREDITADO" }, data: { pagoEstado: nuevo } });
      if (n.count === 0) throw new ErrorNegocio("Ese saldo ya cambió. Actualizá la pantalla.");
      return { aFavor: saldo - Number(clase.precio) };
    });
    await auditAdmin({ action: "padel.pago.devolver", entity: "PadelClase", entityId: claseId, changes: { de: clase.pagoEstado, a: nuevo } });
    refrescar(clase.alumno.token);
    return { ok: true, aFavor: r.aFavor };
  } catch (e) {
    const r = respuestaDeError(e, OTRA_PERSONA_CAMBIO);
    if (r) return r;
    throw e;
  }
}

export async function marcarAvisosLeidos(): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  await prisma.padelAviso.updateMany({ where: { tenantId, destino: "PROFE", leidoEl: null, tipo: { in: [...AVISOS_QUE_ESPERAN, "proxima"] } }, data: { leidoEl: new Date() } });
  revalidatePath(RAIZ, "layout");
}

// ── Configuración ───────────────────────────────────────────────────────────

// O-9b (CERT T2+T3): el `guardarConfig(FormData)` de la primera pantalla de Ajustes se retiró. Ninguna
// pantalla lo usaba (Ajustes guarda de a un campo con `guardarCampoConfig`, acciones-config.ts), pero
// seguía exportado como Server Action y reconstruía el JSON de plantillas desde el formulario: pisaba
// los textos editados y la marca de la Bienvenida.
// O-9c (vuelta 3): `guardarHorarios(FormData)` también se retiró por lo mismo: ninguna pantalla lo
// importaba. La grilla semanal se guarda con `guardarCampoConfig("horarios", …)`.

/** Bloquear un día (o una parte): lluvia, viaje, torneo. El turnero deja de ofrecerlo. */
export async function agregarBloqueo(fd: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const fecha = String(fd.get("fecha") ?? "");
  const desde = String(fd.get("desde") ?? "") || "00:00";
  const hasta = String(fd.get("hasta") ?? "") || "23:59";
  if (!fechaValida(fecha) || !horaValida(desde) || !horaValida(hasta) || hasta <= desde) return { ok: false, error: "Elegí el día (y si querés, desde y hasta qué hora)." };
  await prisma.padelDisponibilidad.create({ data: { tenantId, fecha: new Date(`${fecha}T00:00:00.000Z`), desde, hasta, tipo: "NO" } });
  await auditAdmin({ action: "padel.bloqueo", entity: "PadelDisponibilidad", changes: { fecha, desde, hasta } });
  refrescar();
  return { ok: true };
}

export async function quitarBloqueo(fd: FormData): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  await prisma.padelDisponibilidad.deleteMany({ where: { tenantId, id: String(fd.get("id") ?? ""), fecha: { not: null } } });
  refrescar();
}
