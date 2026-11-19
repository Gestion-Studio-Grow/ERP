"use server";

// ============================================================================
// LIQUIDACIÓN DEL PROYECTO (GSG-MIA-171 · T10): declarar «costos completos» (O20), revisar (O21) y aprobar con segundo
// factor (O22). Cada paso vuelve a pedir su permiso, que el proyecto sea visible y, para revisar y aprobar, que quien lo
// hace no cobre en el proyecto. El paso a la liquidación mensual (O23) vive en `generarLiquidaciones`.
// Sin M5 aplicada (Gate 2), responde «falta la base» en vez de reventar.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { actorActual, proyectoVisible, puede, registrarCambio, type Actor } from "./gestion.server";
import { hayM3 } from "./precio-foto.server";
import { comprobarCodigo } from "./segundo-factor.server";
import { randomUUID } from "node:crypto";
import { claveMes } from "./gestion-core";
import { cierraAlCentavo, comparacionesDeRevision, compensarConSaldos, rechazoDeRevision, saldosAFavor, SIN_FICHA_NO_REVISA } from "./liquidacion-proyecto-core";
import { eventoTerminado, hayM5, liquidacionDelProyecto, medirProyecto, propuestaDeAjuste, quienesCobran, rendicionesPendientes, SIN_M5, type DetalleAjuste, type LiquidacionGuardada } from "./liquidacion-proyecto.server";
import type { ParticipanteFoto } from "./precio-proyecto-core";

export type ResultadoLiq = { ok: true; listo?: string } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const CAMPO = "Liquidación del proyecto";
const COBRA = "Cobrás en este proyecto: la revisa y la aprueba otra persona.";
const txt = (v: FormDataEntryValue | null | undefined, max = 300): string => String(v ?? "").trim().slice(0, max);

/** Rechazo de la transacción: aborta y vuelve como mensaje. */
class Rechazo extends Error {}

/** La puerta por rol de declarar y aprobar (la matriz de permisos la lee de acá: `SOLO:<rol>`). */
const soloRol = (a: Actor, rol: "DIRECCION" | "ADMINISTRACION"): boolean => a.rol === rol;

async function entrar(proyectoId: string): Promise<Actor | string> {
  const a = await actorActual();
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) return "Ese proyecto no existe.";
  if (!(await hayM5())) return SIN_M5;
  return a;
}

const listo = (proyectoId: string, texto: string): ResultadoLiq => {
  revalidatePath(`${RAIZ}/${proyectoId}`);
  revalidatePath(`${RAIZ}/administracion`);
  return { ok: true, listo: texto };
};

/**
 * O20 · Administración declara «costos completos»: con el evento terminado y ninguna rendición abierta, congela el costo
 * (monto e ids, en REPEATABLE READ: la misma foto) y arma el borrador. Una por proyecto: el segundo envío no hace otra.
 */
export async function declararCostosCompletos(formData: FormData): Promise<ResultadoLiq> {
  const proyectoId = txt(formData.get("proyectoId"), 40);
  const a = await entrar(proyectoId);
  if (typeof a === "string") return { ok: false, error: a };
  if (!soloRol(a, "ADMINISTRACION")) return { ok: false, error: "Sólo Administración declara los costos completos del proyecto." };
  const { tenantId } = a;
  const m3 = await hayM3();
  try {
    const r = await tenantTransaction(
      async (tx) => {
        if (await liquidacionDelProyecto(tx, tenantId, proyectoId)) return "ya";
        const p = await tx.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { nombre: true, fechaEvento: true, fechaFin: true } });
        if (!p) throw new Rechazo("Ese proyecto no existe.");
        if (!eventoTerminado(p)) throw new Rechazo("El evento todavía no terminó: los costos completos se declaran después de la fecha de fin.");
        const pendientes = await rendicionesPendientes(tx, tenantId, proyectoId);
        if (pendientes.length > 0) throw new Rechazo(`Hay rendiciones sin cerrar: ${pendientes.join("; ")}. Cerralas antes de declarar los costos completos.`);
        const m = await medirProyecto(tx, tenantId, proyectoId, m3);
        if (!m) throw new Rechazo("El proyecto no tiene precio aprobado con su foto (equipo y reparto): sin eso no hay liquidación.");
        if (!m.calculo.cierra) throw new Rechazo("La cuenta no cierra al centavo con la foto del precio. Avisá a Gestión Studio Grow.");
        const cab = await tx.proyectoLiquidacionProyecto.create({
          data: {
            tenantId,
            proyectoId,
            presupuestoId: m.foto.presupuestoId,
            fotoVersion: m.foto.version,
            totalVenta: BigInt(m.foto.totalVenta),
            costoReal: BigInt(m.costoReal),
            comprobantes: BigInt(m.comprobantes),
            facturado: BigInt(m.facturado),
            cobrado: BigInt(m.cobrado),
            esperado: BigInt(m.calculo.esperado),
            costoDetalle: m.costoDetalle,
            parametros: m.parametros,
            avisos: m.calculo.avisos,
            declaradaPor: a.user.id,
            declaradaNombre: a.nombre,
          },
          select: { id: true },
        });
        await tx.proyectoLiquidacionProyectoLinea.createMany({
          data: m.calculo.lineas.map((l) => ({
            tenantId,
            liquidacionId: cab.id,
            clave: l.clave,
            personaId: l.personaId,
            nombre: l.nombre,
            funcion: l.funcion,
            comision: BigInt(l.comision),
            reparto: BigInt(l.reparto),
            redondeo: BigInt(l.redondeo),
            rentabilidad: BigInt(l.rentabilidad),
            total: BigInt(l.total),
            detalle: l.detalle,
          })),
        });
        await registrarCambio(tx, { tenantId, proyectoId, entidad: "LiquidacionProyecto", entidadId: cab.id, campo: CAMPO, antes: null, despues: "Borrador", autor: a.nombre });
        return "hecha";
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return listo(proyectoId, r === "ya" ? "Ya estaba declarada: el borrador es el mismo." : "Costos completos declarados: el borrador está listo para revisar.");
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    // Dos envíos a la vez: el segundo choca con la clave única (o con la foto del primero). Si quedó una, es la misma.
    if (await liquidacionDelProyecto(prisma, tenantId, proyectoId)) return listo(proyectoId, "Ya estaba declarada: el borrador es el mismo.");
    throw e;
  }
}

async function exigirQueNoCobre(tx: Prisma.TransactionClient, a: Actor, proyectoId: string, lineas: readonly { personaId: string | null }[]) {
  // MIA-179: sin ficha (p. ej. el dueño, Dirección por su rol del ERP) no se sabe si cobra; falla cerrado.
  if (!a.personaId) throw new Rechazo(SIN_FICHA_NO_REVISA);
  const cobran = await quienesCobran(tx, a.tenantId, proyectoId, lineas.map((l) => ({ personaId: l.personaId }) as ParticipanteFoto));
  if (cobran.has(a.personaId)) throw new Rechazo(COBRA);
}

/**
 * O21 · La revisión: costo real contra comprobantes y facturado contra cobrado (lo cobrado se vuelve a medir ahora). Con
 * diferencia pide una nota. Quien cobra en el proyecto no revisa.
 */
export async function revisarLiquidacionProyecto(formData: FormData): Promise<ResultadoLiq> {
  const proyectoId = txt(formData.get("proyectoId"), 40);
  const nota = txt(formData.get("nota"), 500);
  const a = await entrar(proyectoId);
  if (typeof a === "string") return { ok: false, error: a };
  if (!puede(a, "liquidaciones", "editar")) return { ok: false, error: "No tenés permiso para revisar liquidaciones." };
  const { tenantId } = a;
  const m3 = await hayM3();
  try {
    await tenantTransaction(async (tx) => {
      const liq = await liquidacionDelProyecto(tx, tenantId, proyectoId);
      if (!liq) throw new Rechazo("Primero Administración declara los costos completos.");
      if (liq.estado !== "BORRADOR") throw new Rechazo(liq.estado === "APROBADA" ? "Ya está aprobada: queda congelada." : "Ya está revisada.");
      await exigirQueNoCobre(tx, a, proyectoId, liq.lineas);
      const ahora = await medirProyecto(tx, tenantId, proyectoId, m3);
      const facturado = ahora?.facturado ?? Number(liq.facturado);
      const cobrado = ahora?.cobrado ?? Number(liq.cobrado);
      const rechazo = rechazoDeRevision(comparacionesDeRevision({ costoReal: Number(liq.costoReal), comprobantes: Number(liq.comprobantes), facturado, cobrado }), nota);
      if (rechazo) throw new Rechazo(rechazo);
      const hecho = await tx.proyectoLiquidacionProyecto.updateMany({
        where: { id: liq.id, tenantId, estado: "BORRADOR" },
        data: { estado: "REVISADA", revisadaPor: a.user.id, revisadaNombre: a.nombre, revisadaEl: new Date(), notaRevision: nota || null, facturado: BigInt(facturado), cobrado: BigInt(cobrado) },
      });
      if (hecho.count === 0) throw new Rechazo("Ya está revisada.");
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "LiquidacionProyecto", entidadId: liq.id, campo: CAMPO, antes: "Borrador", despues: nota ? `Revisada · ${nota}` : "Revisada", autor: a.nombre });
    });
    return listo(proyectoId, "Revisada. Ahora la aprueba Dirección con su código.");
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}

/** Lo que se comprueba antes de aprobar, sin escribir: se corre ANTES de pedir el código y otra vez adentro de la escritura. */
async function chequearAprobacion(tx: Prisma.TransactionClient, a: Actor, proyectoId: string): Promise<LiquidacionGuardada> {
  const liq = await liquidacionDelProyecto(tx, a.tenantId, proyectoId);
  if (!liq) throw new Rechazo("Primero Administración declara los costos completos.");
  if (liq.estado === "APROBADA") throw new Rechazo("Ya está aprobada: queda congelada.");
  if (liq.estado !== "REVISADA") throw new Rechazo("Antes de aprobarla, alguien que no cobra en el proyecto la tiene que revisar.");
  await exigirQueNoCobre(tx, a, proyectoId, liq.lineas);
  return liq;
}

/**
 * Pide el código de la app de Dirección. T12 (observación 3 de la certificación de la ola 4): primero se corre `chequear`,
 * que rechaza a quien no puede (sin ficha, cobra en el proyecto, estado equivocado) SIN gastar el código; recién después se
 * comprueba el código, que consume un código de respaldo o el paso de tiempo.
 */
async function conCodigo(a: Actor, codigo: string, chequear: () => Promise<unknown>): Promise<string | null> {
  if (!soloRol(a, "DIRECCION")) return "Sólo Dirección aprueba la liquidación del proyecto y sus ajustes.";
  if (!codigo) return "Escribí el código de tu app de autenticación para aprobar.";
  const factor = await prisma.proyectoSegundoFactor.findUnique({ where: { tenantId_userId: { tenantId: a.tenantId, userId: a.user.id } }, select: { activadoEl: true } });
  // Sin factor activo no se aprueba: `comprobarCodigo` lo activaría con este mismo código.
  if (!factor?.activadoEl) return "Para aprobar, primero activá el ingreso en dos pasos de tu usuario.";
  try {
    await chequear();
  } catch (e) {
    if (e instanceof Rechazo) return e.message;
    throw e;
  }
  const c = await comprobarCodigo({ id: a.user.id, tenantId: a.tenantId, email: a.user.email, role: a.user.role }, codigo);
  return c.ok ? null : c.error;
}

/**
 * O22 · Dirección aprueba con el código de su app EN ESE MOMENTO. Vuelve a hacer la cuenta desde las filas guardadas: si
 * no da Total venta − costo real al centavo, no aprueba. El paso REVISADA → APROBADA es condicionado: una sola aprobada.
 * Queda congelada: lo que entra después va a ajuste. T12 (O26): la línea de una persona que da negativa queda, en la misma
 * transacción, como saldo a favor de la empresa; no se descuenta de la mensual.
 */
export async function aprobarLiquidacionProyecto(formData: FormData): Promise<ResultadoLiq> {
  const proyectoId = txt(formData.get("proyectoId"), 40);
  const codigo = txt(formData.get("codigo"), 20);
  const a = await entrar(proyectoId);
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  const error = await conCodigo(a, codigo, () => tenantTransaction((tx) => chequearAprobacion(tx, a, proyectoId)));
  if (error) return { ok: false, error };
  try {
    await tenantTransaction(async (tx) => {
      const liq = await chequearAprobacion(tx, a, proyectoId);
      if (liq.esperado !== liq.totalVenta - liq.costoReal || !cierraAlCentavo(liq.lineas, liq.esperado)) {
        throw new Rechazo("La suma de las filas no da Total venta − costo real al centavo: no se aprueba. Avisá a Gestión Studio Grow.");
      }
      const hecho = await tx.proyectoLiquidacionProyecto.updateMany({ where: { id: liq.id, tenantId, estado: "REVISADA" }, data: { estado: "APROBADA", aprobadaPor: a.user.id, aprobadaNombre: a.nombre, aprobadaEl: new Date() } });
      if (hecho.count === 0) throw new Rechazo("Ya está aprobada: queda congelada.");
      const saldos = saldosAFavor(liq.lineas.map((l) => ({ personaId: l.personaId, monto: l.total })));
      if (saldos.length > 0) await tx.proyectoSaldoAFavor.createMany({ data: saldos.map((x) => ({ tenantId, personaId: x.personaId, liquidacionId: liq.id, monto: BigInt(x.monto) })) });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "LiquidacionProyecto", entidadId: liq.id, campo: CAMPO, antes: "Revisada", despues: "Aprobada", autor: a.nombre });
    });
    return listo(proyectoId, "Aprobada y congelada. Entra a la liquidación del mes cuando se cumpla «cuándo se paga».");
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}

/** Lo que se comprueba antes de aprobar un ajuste. Sin nada pendiente devuelve null (el segundo envío no hace otro). */
async function chequearAjuste(tx: Prisma.TransactionClient, a: Actor, proyectoId: string) {
  const liq = await liquidacionDelProyecto(tx, a.tenantId, proyectoId);
  if (!liq || liq.estado !== "APROBADA") throw new Rechazo("El ajuste es para una liquidación ya aprobada.");
  await exigirQueNoCobre(tx, a, proyectoId, liq.lineas);
  const propuesta = await propuestaDeAjuste(tx, a.tenantId, liq);
  return propuesta ? { liq, propuesta } : null;
}

const YA_AJUSTADO = "No hay comprobantes nuevos para ajustar: el ajuste ya estaba hecho.";

/**
 * O24 · Un comprobante que llega después de aprobar NO reabre la liquidación: Dirección aprueba, con el código de su app,
 * un ajuste en el período abierto (un renglón por línea que cambia). Candado por liquidación (`FOR UPDATE`): dos envíos a
 * la vez hacen un solo ajuste; el segundo encuentra el comprobante ya cubierto. Liquidación + ajustes = Total venta − costo
 * real nuevo, o no se escribe nada. Lo que le toca de menos a una persona queda como saldo a favor de la empresa (O26).
 */
export async function aprobarAjusteTardio(formData: FormData): Promise<ResultadoLiq> {
  const proyectoId = txt(formData.get("proyectoId"), 40);
  const codigo = txt(formData.get("codigo"), 20);
  const a = await entrar(proyectoId);
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  let nada = false;
  const error = await conCodigo(a, codigo, async () => {
    nada = !(await tenantTransaction((tx) => chequearAjuste(tx, a, proyectoId)));
    if (nada) throw new Rechazo(YA_AJUSTADO);
  });
  if (nada) return listo(proyectoId, YA_AJUSTADO);
  if (error) return { ok: false, error };
  try {
    const r = await tenantTransaction(async (tx) => {
      const cab = await liquidacionDelProyecto(tx, tenantId, proyectoId);
      if (!cab) throw new Rechazo("El ajuste es para una liquidación ya aprobada.");
      await tx.$queryRaw`SELECT id FROM "ProyectoLiquidacionProyecto" WHERE id = ${cab.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const hay = await chequearAjuste(tx, a, proyectoId);
      if (!hay) return "ya";
      const { liq, propuesta: p } = hay;
      if (!p.cierra) throw new Rechazo("La liquidación más los ajustes no da Total venta − costo real al centavo: no se ajusta. Avisá a Gestión Studio Grow.");
      const detalle: DetalleAjuste = { lote: randomUUID(), comprobantes: p.pendientes, costoRealAntes: p.costoRealAntes, costoRealNuevo: p.costoRealNuevo, periodo: claveMes(new Date()) };
      const motivo = `${p.pendientes.every((c) => c.costo < 0) ? "Comprobante anulado" : "Comprobante tardío"}: ${p.pendientes.map((c) => c.origen).join("; ")}`.slice(0, 300);
      // MIA-184 (A): lo positivo de una persona primero cancela su saldo a favor abierto en este proyecto (con la cabecera
      // trabada: los saldos de esta liquidación sólo se tocan bajo este mismo candado); el resto va a la mensual.
      const abiertos = await tx.proyectoSaldoAFavor.findMany({ where: { tenantId, liquidacionId: liq.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, personaId: true, monto: true, aplicado: true } });
      const { compensado, aplicar } = compensarConSaldos(p.renglones, abiertos);
      for (const x of aplicar) await tx.proyectoSaldoAFavor.updateMany({ where: { tenantId, id: x.saldoId }, data: { aplicado: { increment: BigInt(x.monto) } } });
      await tx.proyectoLiquidacionProyectoAjuste.createMany({
        data: p.renglones.map((x) => {
          const d: DetalleAjuste = compensado.has(x.lineaId) ? { ...detalle, compensado: compensado.get(x.lineaId) } : detalle;
          return { tenantId, liquidacionId: liq.id, lineaId: x.lineaId, motivo, monto: BigInt(x.monto), detalle: d as unknown as Prisma.InputJsonValue, autorId: a.user.id, autorNombre: a.nombre };
        }),
      });
      const saldos = saldosAFavor(p.renglones);
      if (saldos.length > 0) await tx.proyectoSaldoAFavor.createMany({ data: saldos.map((x) => ({ tenantId, personaId: x.personaId, liquidacionId: liq.id, monto: BigInt(x.monto) })) });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "LiquidacionProyecto", entidadId: liq.id, campo: CAMPO, antes: "Aprobada", despues: `Ajuste aprobado · ${p.renglones.length} renglones`, autor: a.nombre });
      return "hecho";
    });
    return listo(proyectoId, r === "ya" ? YA_AJUSTADO : "Ajuste aprobado. La liquidación aprobada no cambió: el ajuste queda debajo.");
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}
