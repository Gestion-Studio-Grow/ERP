"use server";

// ============================================================================
// PADEL-CLASES · E7 — Grupal con integrantes: lo que hace el PROFE con cada persona de la clase.
// ============================================================================
//
// En una GRUPAL el alumno de la clase es el titular (paga su parte con el pago de la clase: «Cobré»
// de siempre). Acá van los integrantes: sumar, quitar (sólo si no pagó), cobrar su parte, validar o
// devolver su comprobante y mandarle el WhatsApp con su monto.
//
// Plata: cada escritura va en una transacción, con `tenantId` en cada where, y condicionada al pago
// leído (`updateMany … where pagoEstado`): un doble toque o dos personas a la vez cobran UNA vez; la
// segunda recibe «Ese cobro ya cambió». Los montos salen de la config con `redondear` (lib/dinero).

import { prisma } from "@/lib/prisma";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import {
  MOTIVO_AUSENTE_SE_COBRA,
  MOTIVO_COMPROBANTE_LABEL,
  esMedioCobro,
  esMotivoComprobante,
  integrantesValidos,
  linkWhatsApp,
  montoPorPersona,
  parteDeIntegrante,
  personasConIntegrantes,
  pesos,
  precioAlQuedarSolo,
  precioDe,
  puedeCobrarProfe,
  puedeQuitarIntegrante,
  redondear,
  revisionEnClaseCaida,
  transicionPago,
  type IntegranteEntrada,
  type MedioCobro,
  type MotivoComprobante,
} from "./core";
import { configPadel } from "./datos.server";
import { listaPara } from "./paquetes.server";
import { ErrorNegocio, conErrorNegocio, refrescar, saldoEnTx, type Resultado } from "./acciones-compartido";
import { CLASE_CAIDA, bloquearClaseDeIntegranteEnTx, crearIntegrantesEnTx, esIntegranteRepetido, waParaIntegrante } from "./grupal.server";

const idValido = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x);

/** Estados de la clase en los que se suman integrantes: la que viene y la que ya se dio (vino uno más). */
const SE_SUMAN = ["PEDIDA", "CONFIRMADA", "DADA"];

async function delProfe() {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  return getCurrentTenantId();
}

const SELECT_INTEGRANTE = {
  id: true, claseId: true, alumnoId: true, nombre: true, telefono: true, monto: true, pagoEstado: true, pagoMedio: true,
  alumno: { select: { token: true } },
  clase: { select: { id: true, estado: true, motivoCancel: true, empiezaEn: true, client: { select: { name: true } }, alumno: { select: { token: true } }, club: { select: { nombre: true } } } },
} as const;

/**
 * «+ Integrante» desde la clase (Hoy o la ficha): un alumno existente, o nombre (y celular). Sólo en
 * una grupal viva. Si es el primero y el titular todavía no pagó, el titular pasa a pagar SU parte
 * (precio por persona). Si el titular ya pagó la clase ENTERA (grupal de antes, sin integrantes), no
 * se suma nadie que pague aparte: se cobraría dos veces.
 */
export async function agregarIntegrante(claseId: string, entrada: IntegranteEntrada): Promise<Resultado<{ integranteId: string; nombre: string; monto: number; wa: string | null }>> {
  const tenantId = await delProfe();
  if (!idValido(claseId)) return { ok: false, error: "No encontramos esa clase." };
  const v = integrantesValidos([entrada]);
  if (!v.ok) return { ok: false, error: v.error };
  try {
    return await conErrorNegocio(async () => {
      // T5 · La parte de cada uno sale de la lista del club de la clase (si tiene precio propio).
      const deLaClase = await prisma.padelClase.findFirst({ where: { tenantId, id: claseId }, select: { clubId: true } });
      const config = await listaPara(tenantId, await configPadel(tenantId), deLaClase?.clubId);
      const monto = montoPorPersona(config);
      const r = await bookingTransaction(async (tx) => {
        const clase = await tx.padelClase.findFirst({
          where: { tenantId, id: claseId },
          select: { id: true, tipo: true, estado: true, pagoEstado: true, precio: true, alumnoId: true, empiezaEn: true, client: { select: { name: true } }, alumno: { select: { token: true } }, club: { select: { nombre: true } } },
        });
        if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
        if (clase.tipo !== "GRUPAL") throw new ErrorNegocio("Es individual: pasala a grupal (Editar) para sumar integrantes.");
        if (!SE_SUMAN.includes(clase.estado)) throw new ErrorNegocio("A esa clase ya no se le suman integrantes.");
        const ya = await tx.padelIntegrante.count({ where: { tenantId, claseId: clase.id } });
        const primero = ya === 0;
        if (primero && clase.pagoEstado !== "PENDIENTE" && Number(clase.precio) > monto) {
          throw new ErrorNegocio("El titular ya pagó la clase entera: no se suman integrantes que paguen aparte.");
        }
        const [nuevo] = await crearIntegrantesEnTx(tx, tenantId, { claseId: clase.id, titularId: clase.alumnoId, entradas: v.lista, monto });
        const n = await tx.padelClase.updateMany({
          where: { tenantId, id: clase.id, estado: clase.estado, pagoEstado: clase.pagoEstado },
          data: { personas: personasConIntegrantes(ya + 1), ...(primero && clase.pagoEstado === "PENDIENTE" ? { precio: monto } : {}) },
        });
        if (n.count === 0) throw new ErrorNegocio("Esa clase cambió recién. Actualizá la pantalla.");
        return { clase, nuevo };
      });
      await auditAdmin({ action: "padel.integrante.agregar", entity: "PadelIntegrante", entityId: r.nuevo.id, changes: { claseId, monto, vinculado: Boolean(r.nuevo.alumnoId) } });
      const wa = await waParaIntegrante(tenantId, { integrante: { ...r.nuevo, monto }, titular: r.clase.client.name, empiezaEn: r.clase.empiezaEn, alias: config.aliasCbu, club: r.clase.club?.nombre ?? null });
      refrescar(r.clase.alumno.token, r.nuevo.token ?? undefined);
      return { ok: true as const, integranteId: r.nuevo.id, nombre: r.nuevo.nombre, monto, wa };
    });
  } catch (e) {
    if (esIntegranteRepetido(e)) return { ok: false, error: "Ese integrante ya está en la clase." };
    throw e;
  }
}

/** Quitar un integrante: sólo si no pagó ni mandó comprobante (lo que entró no se pierde). */
export async function quitarIntegrante(integranteId: string): Promise<Resultado> {
  const tenantId = await delProfe();
  if (!idValido(integranteId)) return { ok: false, error: "No encontramos ese integrante." };
  return conErrorNegocio(async () => {
    // T5 · Si queda solo, paga el individual de la lista del club de su clase (si tiene propio).
    const deLaParte = await prisma.padelIntegrante.findFirst({ where: { tenantId, id: integranteId }, select: { clase: { select: { clubId: true } } } });
    const config = await listaPara(tenantId, await configPadel(tenantId), deLaParte?.clase.clubId);
    const r = await tenantTransaction(async (tx) => {
      // Clase bloqueada (FOR UPDATE) ANTES de leer o borrar la parte: el mismo orden clase →
      // integrante que la cancelación, sin deadlock. Una clase caída no es error: quitar a quien no
      // pagó no mueve plata (y su precio no se toca, ver precioAlQuedarSolo).
      const claseId = await bloquearClaseDeIntegranteEnTx(tx, tenantId, integranteId, { paraEscribirClase: true, aceptarCaida: true });
      const i = await tx.padelIntegrante.findFirst({ where: { tenantId, id: integranteId, claseId }, select: SELECT_INTEGRANTE });
      if (!i) throw new ErrorNegocio("Ese integrante cambió recién. Actualizá la pantalla.");
      if (!puedeQuitarIntegrante(i)) throw new ErrorNegocio(`${i.nombre.split(" ")[0]} ya pagó o mandó el comprobante: no se quita.`);
      const clase = await tx.padelClase.findFirst({ where: { tenantId, id: claseId }, select: { estado: true, pagoEstado: true, precio: true } });
      if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
      const partes = await tx.padelIntegrante.findMany({ where: { tenantId, claseId }, select: { monto: true } });
      const n = await tx.padelIntegrante.deleteMany({ where: { tenantId, id: i.id, pagoEstado: "PENDIENTE" } });
      if (n.count === 0) throw new ErrorNegocio("Ese integrante cambió recién. Actualizá la pantalla.");
      const quedan = partes.length - 1;
      // Se fue el último: si la clase todavía no se dio y el titular no pagó, vuelve a INDIVIDUAL al
      // precio individual, tope lo que pagaba el grupo entero (una suba de lista no le cae).
      const solo = quedan === 0
        ? precioAlQuedarSolo({ ...clase, precio: Number(clase.precio) }, precioDe(config, "INDIVIDUAL", 1), partes.map((p) => Number(p.monto)))
        : null;
      const data = solo !== null ? { tipo: "INDIVIDUAL" as const, personas: 1, precio: solo } : { personas: personasConIntegrantes(quedan) };
      const m = await tx.padelClase.updateMany({ where: { tenantId, id: claseId, estado: clase.estado, pagoEstado: clase.pagoEstado }, data });
      if (m.count === 0) throw new ErrorNegocio("Esa clase cambió recién. Actualizá la pantalla.");
      return { i, solo };
    }, { tenantId });
    await auditAdmin({ action: "padel.integrante.quitar", entity: "PadelIntegrante", entityId: r.i.id, changes: { claseId: r.i.claseId, nombre: r.i.nombre, ...(r.solo !== null ? { individual: r.solo } : {}) } });
    refrescar(r.i.clase.alumno.token, r.i.alumno?.token);
    return { ok: true as const };
  });
}

/** «Cobré» la parte de un integrante (efectivo, transferencia o Mercado Pago). Un doble toque cobra una vez. */
export async function cobrarIntegrante(integranteId: string, medio: MedioCobro): Promise<Resultado<{ monto: number }>> {
  const tenantId = await delProfe();
  if (!esMedioCobro(medio)) return { ok: false, error: "Elegí cómo te pagó." };
  if (!idValido(integranteId)) return { ok: false, error: "No encontramos ese integrante." };
  return conErrorNegocio(async () => {
    const r = await tenantTransaction(async (tx) => {
      // Clase bloqueada y viva ANTES de leer la parte: una cancelación a la vez no la deja PAGADO.
      const claseId = await bloquearClaseDeIntegranteEnTx(tx, tenantId, integranteId);
      const i = await tx.padelIntegrante.findFirst({ where: { tenantId, id: integranteId, claseId }, select: SELECT_INTEGRANTE });
      if (!i) throw new ErrorNegocio("Ese integrante cambió recién. Actualizá la pantalla.");
      const parte = parteDeIntegrante(i.clase, { ...i, monto: Number(i.monto) });
      if (!puedeCobrarProfe(parte)) {
        throw new ErrorNegocio(["PAGADO", "ACREDITADO", "DEVUELTO"].includes(i.pagoEstado) ? "Esa parte ya está cobrada." : "Esa parte todavía no se puede cobrar.");
      }
      const n = await tx.padelIntegrante.updateMany({
        where: { tenantId, id: i.id, pagoEstado: i.pagoEstado },
        data: { pagoEstado: "PAGADO", pagoMedio: medio, pagoValidadoEl: new Date() },
      });
      if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
      return i;
    }, { tenantId });
    await auditAdmin({ action: "padel.integrante.cobrar", entity: "PadelIntegrante", entityId: r.id, changes: { claseId: r.claseId, de: r.pagoEstado, a: "PAGADO", medio, monto: Number(r.monto) } });
    refrescar(r.clase.alumno.token, r.alumno?.token);
    return { ok: true as const, monto: redondear(Number(r.monto)) };
  });
}

/**
 * El comprobante que mandó un integrante: «Validar» (queda pagada su parte) o «No es válido» con
 * motivo (vuelve a pendiente con la nota, y él manda otro). Devuelve el WhatsApp para avisarle.
 */
export async function revisarComprobanteIntegrante(integranteId: string, evento: "validar" | "noValido", motivo?: MotivoComprobante): Promise<Resultado<{ wa: string | null }>> {
  const tenantId = await delProfe();
  if (!idValido(integranteId)) return { ok: false, error: "No encontramos ese integrante." };
  if (evento !== "validar" && evento !== "noValido") return { ok: false, error: "Elegí qué hacemos con el comprobante." };
  if (evento === "noValido" && !esMotivoComprobante(motivo)) return { ok: false, error: "Elegí por qué no es válido." };
  return conErrorNegocio(async () => {
    const nota = evento === "noValido" && motivo ? MOTIVO_COMPROBANTE_LABEL[motivo] : null;
    const r = await tenantTransaction(async (tx) => {
      // Clase bloqueada ANTES de leer la parte: una cancelación a la vez no la deja PAGADO. Si la
      // clase ya se cayó, el comprobante que quedó mandado igual se revisa (revisionEnClaseCaida):
      // «Está bien» → a favor; «No es válido» → pendiente. No queda trabado.
      const claseId = await bloquearClaseDeIntegranteEnTx(tx, tenantId, integranteId, { aceptarCaida: true });
      const i = await tx.padelIntegrante.findFirst({ where: { tenantId, id: integranteId, claseId }, select: SELECT_INTEGRANTE });
      if (!i) throw new ErrorNegocio("Ese integrante cambió recién. Actualizá la pantalla.");
      const caida = (CLASE_CAIDA as readonly string[]).includes(i.clase.estado);
      if (caida && i.pagoEstado !== "EN_REVISION") throw new ErrorNegocio("Esa clase se canceló: esa parte ya no se cobra. Si había pagado, le queda a favor.");
      const nuevo = caida ? revisionEnClaseCaida(i.pagoEstado, i.clase.estado, evento) : transicionPago(i.pagoEstado, i.clase.estado, evento, "profe")
        // M-045: la AUSENTE que se cobra igual también se valida.
        ?? (i.clase.estado === "AUSENTE" && i.clase.motivoCancel === MOTIVO_AUSENTE_SE_COBRA ? transicionPago(i.pagoEstado, "DADA", evento, "profe") : null);
      if (!nuevo) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
      const n = await tx.padelIntegrante.updateMany({
        where: { tenantId, id: i.id, pagoEstado: i.pagoEstado },
        data: evento === "validar" ? { pagoEstado: nuevo, pagoValidadoEl: new Date(), pagoNota: null } : { pagoEstado: nuevo, pagoNota: nota },
      });
      if (n.count === 0) throw new ErrorNegocio("Ese cobro ya cambió. Actualizá la pantalla.");
      return { ...i, nuevo };
    }, { tenantId });
    await auditAdmin({ action: `padel.integrante.${evento}`, entity: "PadelIntegrante", entityId: r.id, changes: { claseId: r.claseId, de: r.pagoEstado, a: r.nuevo, ...(nota ? { nota } : {}) } });
    const primero = r.nombre.split(" ")[0];
    const texto = r.nuevo === "ACREDITADO"
      ? `¡Hola ${primero}! Recibí tu pago de ${pesos(Number(r.monto))}. Como la clase se canceló, te queda a favor (o te lo devuelvo).`
      : evento === "validar"
      ? `¡Hola ${primero}! Recibí tu pago de ${pesos(Number(r.monto))}. ¡Gracias!`
      : (CLASE_CAIDA as readonly string[]).includes(r.clase.estado)
      // Clase caída: no puede mandar otro (y no debe nada): no se le pide uno nuevo.
      ? `¡Hola ${primero}! No pude validar el comprobante (${nota}). Como la clase se canceló, no tenés nada pendiente; si me transferiste, escribime y lo vemos.`
      : `¡Hola ${primero}! No pude validar el comprobante (${nota}). ¿Me mandás otro?`;
    refrescar(r.clase.alumno.token, r.alumno?.token);
    return { ok: true as const, wa: linkWhatsApp(r.telefono, texto) };
  });
}

/** El WhatsApp a un integrante con SU monto (y su link, si está vinculado a un alumno). */
export async function avisarIntegrante(integranteId: string): Promise<Resultado<{ wa: string | null }>> {
  const tenantId = await delProfe();
  if (!idValido(integranteId)) return { ok: false, error: "No encontramos ese integrante." };
  const i = await prisma.padelIntegrante.findFirst({ where: { tenantId, id: integranteId }, select: SELECT_INTEGRANTE });
  if (!i) return { ok: false, error: "No encontramos ese integrante." };
  if (!i.telefono) return { ok: false, error: `${i.nombre.split(" ")[0]} no tiene celular cargado.` };
  const config = await configPadel(tenantId);
  const wa = await waParaIntegrante(tenantId, {
    integrante: { ...i, monto: Number(i.monto) }, titular: i.clase.client.name, empiezaEn: i.clase.empiezaEn, alias: config.aliasCbu, club: i.clase.club?.nombre ?? null,
  });
  return { ok: true, wa };
}

/**
 * «Le devolví» la parte acreditada de un integrante (su clase se canceló): ACREDITADO → DEVUELTO. Si
 * está vinculado a un alumno, no deja su saldo negativo (Serializable, como devolverSaldo).
 */
export async function devolverParteIntegrante(integranteId: string): Promise<Resultado<{ aFavor: number }>> {
  const tenantId = await delProfe();
  if (!idValido(integranteId)) return { ok: false, error: "No encontramos ese integrante." };
  return conErrorNegocio(async () => {
    const r = await bookingTransaction(async (tx) => {
      const i = await tx.padelIntegrante.findFirst({ where: { tenantId, id: integranteId }, select: SELECT_INTEGRANTE });
      if (!i) throw new ErrorNegocio("No encontramos ese integrante.");
      const nuevo = transicionPago(i.pagoEstado, i.clase.estado, "devolver", "profe");
      if (!nuevo) throw new ErrorNegocio("Esa parte no tiene plata a favor para devolver.");
      const monto = Number(i.monto);
      const saldo = i.alumnoId ? await saldoEnTx(tx, tenantId, i.alumnoId) : monto;
      if (saldo < monto) throw new ErrorNegocio("Parte de ese saldo ya se usó en otra clase: no se puede devolver entero.");
      const n = await tx.padelIntegrante.updateMany({ where: { tenantId, id: i.id, pagoEstado: "ACREDITADO" }, data: { pagoEstado: nuevo } });
      if (n.count === 0) throw new ErrorNegocio("Ese saldo ya cambió. Actualizá la pantalla.");
      return { i, aFavor: i.alumnoId ? redondear(saldo - monto) : 0 };
    });
    await auditAdmin({ action: "padel.integrante.devolver", entity: "PadelIntegrante", entityId: r.i.id, changes: { de: "ACREDITADO", a: "DEVUELTO", monto: Number(r.i.monto) } });
    refrescar(r.i.clase.alumno.token, r.i.alumno?.token);
    return { ok: true as const, aFavor: r.aFavor };
  });
}
