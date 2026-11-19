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
import { cierraAlCentavo, comparacionesDeRevision, rechazoDeRevision } from "./liquidacion-proyecto-core";
import { eventoTerminado, hayM5, liquidacionDelProyecto, medirProyecto, quienesCobran, rendicionesPendientes, SIN_M5 } from "./liquidacion-proyecto.server";
import type { ParticipanteFoto } from "./precio-proyecto-core";

export type ResultadoLiq = { ok: true; listo?: string } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const CAMPO = "Liquidación del proyecto";
const COBRA = "Cobrás en este proyecto: la revisa y la aprueba otra persona.";
const txt = (v: FormDataEntryValue | null | undefined, max = 300): string => String(v ?? "").trim().slice(0, max);

/** Rechazo de la transacción: aborta y vuelve como mensaje. */
class Rechazo extends Error {}

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
  if (a.rol !== "ADMINISTRACION") return { ok: false, error: "Sólo Administración declara los costos completos del proyecto." };
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
  const cobran = await quienesCobran(tx, a.tenantId, proyectoId, lineas.map((l) => ({ personaId: l.personaId }) as ParticipanteFoto));
  if (a.personaId && cobran.has(a.personaId)) throw new Rechazo(COBRA);
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

/**
 * O22 · Dirección aprueba con el código de su app EN ESE MOMENTO. Vuelve a hacer la cuenta desde las filas guardadas: si
 * no da Total venta − costo real al centavo, no aprueba. El paso REVISADA → APROBADA es condicionado: una sola aprobada.
 * Queda congelada: lo que entra después va a ajuste (T12).
 */
export async function aprobarLiquidacionProyecto(formData: FormData): Promise<ResultadoLiq> {
  const proyectoId = txt(formData.get("proyectoId"), 40);
  const codigo = txt(formData.get("codigo"), 20);
  const a = await entrar(proyectoId);
  if (typeof a === "string") return { ok: false, error: a };
  if (a.rol !== "DIRECCION") return { ok: false, error: "Sólo Dirección aprueba la liquidación del proyecto." };
  if (!codigo) return { ok: false, error: "Escribí el código de tu app de autenticación para aprobar." };
  const { tenantId } = a;
  const factor = await prisma.proyectoSegundoFactor.findUnique({ where: { tenantId_userId: { tenantId, userId: a.user.id } }, select: { activadoEl: true } });
  // Sin factor activo no se aprueba: `comprobarCodigo` lo activaría con este mismo código.
  if (!factor?.activadoEl) return { ok: false, error: "Para aprobar, primero activá el ingreso en dos pasos de tu usuario." };
  const c = await comprobarCodigo({ id: a.user.id, tenantId, email: a.user.email, role: a.user.role }, codigo);
  if (!c.ok) return { ok: false, error: c.error };
  try {
    await tenantTransaction(async (tx) => {
      const liq = await liquidacionDelProyecto(tx, tenantId, proyectoId);
      if (!liq) throw new Rechazo("Primero Administración declara los costos completos.");
      if (liq.estado === "APROBADA") throw new Rechazo("Ya está aprobada: queda congelada.");
      if (liq.estado !== "REVISADA") throw new Rechazo("Antes de aprobarla, alguien que no cobra en el proyecto la tiene que revisar.");
      await exigirQueNoCobre(tx, a, proyectoId, liq.lineas);
      if (liq.esperado !== liq.totalVenta - liq.costoReal || !cierraAlCentavo(liq.lineas, liq.esperado)) {
        throw new Rechazo("La suma de las filas no da Total venta − costo real al centavo: no se aprueba. Avisá a Gestión Studio Grow.");
      }
      const hecho = await tx.proyectoLiquidacionProyecto.updateMany({ where: { id: liq.id, tenantId, estado: "REVISADA" }, data: { estado: "APROBADA", aprobadaPor: a.user.id, aprobadaNombre: a.nombre, aprobadaEl: new Date() } });
      if (hecho.count === 0) throw new Rechazo("Ya está aprobada: queda congelada.");
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "LiquidacionProyecto", entidadId: liq.id, campo: CAMPO, antes: "Revisada", despues: "Aprobada", autor: a.nombre });
    });
    return listo(proyectoId, "Aprobada y congelada. Entra a la liquidación del mes cuando se cumpla «cuándo se paga».");
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}
