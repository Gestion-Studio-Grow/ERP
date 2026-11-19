"use server";

// ============================================================================
// Comprobantes de proveedor (MIA-50 T05 · O27, O28, O30, O44): la carga con su adjunto, la imputación a proyectos y a
// administración, el enlace con las cuotas del calendario y la anulación. Cada acción vuelve a pedir el permiso:
// esconder un botón no protege nada. Plata en centavos enteros. Sin la migración M1 (Gate 2), avisa y no escribe.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import type { Prisma } from "@/generated/prisma/client";
import { auditAdmin } from "@/lib/audit-core";
import { centavosDe } from "@/lib/dinero/redondeo";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { veLaPlata } from "./datos.server";
import type { ModuloGestion } from "./gestion-core";
import { actorActual, proyectoVisible, puede, registrarCambio, type Actor } from "./gestion.server";
import { claveDeEnvio } from "./pago-columnas";
import { esClaveRepetida } from "./rendiciones-core";
import { pendienteDelPago } from "./pago-parcial.server";
import { tiposDeCambio } from "./cobranza.server";
import {
  centavosDelTexto,
  DUPLICADO,
  errorDeAdjunto,
  errorDeCarga,
  esTratamiento,
  esVinculada,
  normalizarNumero,
  normalizarReferencia,
  tratamientoDelTipo,
  type TratamientoIva,
} from "./comprobantes-core";
import { errorDeImputacion, filaDeLinea, type Destino, type LineaEntrada } from "./imputacion-core";
import { parametrosDeComprobantes, SIN_M1, tomarCuotas } from "./comprobantes.server";
import { leerNumero } from "./core";
import { parametrosDelNegocio } from "./parametros/leer.server";
import { aCentavos, diaArgentino, fotoEnPesos, type FotoEnPesos } from "./moneda-bancos-core";
import { cambioDelMovimiento, guardarFotoTx, hayM6 } from "./moneda-bancos.server";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const txt = (v: FormDataEntryValue | null | undefined): string => String(v ?? "").trim();

function refrescar(proyectoIds: readonly (string | null)[] = []) {
  revalidatePath(`${RAIZ}/proveedores`);
  revalidatePath(`${RAIZ}/administracion`);
  revalidatePath(`${RAIZ}/direccion`);
  for (const id of new Set(proyectoIds)) if (id) revalidatePath(`${RAIZ}/${id}`);
}

/** Cargar e imputar comprobantes es de Administración: editar ALGUNO de esos módulos (matriz: «E:proveedores|pagos») y ver la plata. */
async function exigirAlguno(modulos: readonly ModuloGestion[]): Promise<Actor | string> {
  const a = await actorActual();
  if (!modulos.some((m) => puede(a, m, "editar"))) return "Para cargar comprobantes hace falta el permiso de editar Proveedores o Pagos: pedíselo a quien administra.";
  if (!veLaPlata(a.user)) return "Tu usuario no ve la plata del negocio: los comprobantes los carga Administración.";
  return a;
}
const actorDeComprobantes = () => exigirAlguno(["proveedores", "pagos"]);

/** Sin la tabla (M1 sin aplicar) devuelve el aviso en vez de caerse. */
async function conM1<T>(hacer: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await hacer();
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_M1 };
    throw e;
  }
}

/**
 * Candado sobre el comprobante, dentro de la transacción: imputar, enlazar, anular y crear la orden de pago
 * (`crearOrdenPago`) lo toman antes de leer lo que van a controlar, así dos a la vez no deciden sobre la misma foto
 * (certificación MIA-127, CERT-1 a CERT-3). Devuelve el comprobante tal como está después de esperar, o `null`.
 */
async function bloquearComprobante(tx: Prisma.TransactionClient, tenantId: string, id: string): Promise<{ anulado: boolean } | null> {
  const filas = await tx.$queryRaw<{ anuladoEl: Date | null }[]>`
    SELECT "anuladoEl" FROM "ProyectoComprobante" WHERE "tenantId" = ${tenantId} AND "id" = ${id} FOR UPDATE`;
  return filas.length === 0 ? null : { anulado: filas[0].anuladoEl !== null };
}

const YA_PAGADA = "Esa cuota ya está pagada.";
const CON_PARTES = "Esa cuota ya tiene partes pagadas desde el calendario: terminala ahí, no con una orden de pago.";

/** «2026-11-19» → la fecha al mediodía de Argentina (no se corre de día con el huso). */
function fechaDelForm(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Carga (O27) ─────────────────────────────────────────────────────────────

/**
 * Carga un comprobante con su adjunto. El mismo proveedor + tipo + número no entra dos veces: lo frena el índice único
 * de la base, no esta función. Opcional: imputarlo entero a un solo destino (`destino` = id de proyecto o «ADMINISTRACION»).
 */
export async function cargarComprobante(formData: FormData): Promise<Resultado<{ id: string; repetido?: boolean }>> {
  const a = await actorDeComprobantes();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  return conM1<{ id: string; repetido?: boolean }>(async () => {
    const p = await parametrosDeComprobantes(tenantId);
    const supplierId = txt(formData.get("supplierId"));
    const supplier = supplierId ? await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true, taxId: true } }) : null;
    if (!supplier) return { ok: false, error: "Elegí el proveedor." };
    const tipo = txt(formData.get("tipo"));
    const numero = normalizarNumero(txt(formData.get("numero")));
    const carga = {
      tipo,
      numero: numero ?? "",
      fecha: fechaDelForm(txt(formData.get("fecha"))),
      netoCentavos: centavosDelTexto(txt(formData.get("neto"))),
      ivaCentavos: centavosDelTexto(txt(formData.get("iva")) || "0"),
      totalCentavos: centavosDelTexto(txt(formData.get("total"))),
    };
    const error = errorDeCarga(carga, p.tipos);
    if (error) return { ok: false, error };

    // T08 · O31: un comprobante en otra moneda guarda el cambio con el que se fija su costo, según el parámetro
    // `moneda.cambioDelCosto` (provisional): «a mano» lo escribe quien carga; «del comprobante», el del día de su fecha.
    // «Del pago» todavía no tiene cómo re-fijar el costo al pagar: se toma el del comprobante con marca de provisional.
    const monedaComp = txt(formData.get("moneda")) || "ARS";
    let fotoComp: { foto: FotoEnPesos; cambioDia: string | null; criterio: string; provisional: boolean } | null = null;
    if (monedaComp !== "ARS") {
      const pr = await parametrosDelNegocio(tenantId);
      if (!pr["moneda.habilitadas"].valor.includes(monedaComp)) return { ok: false, error: `${monedaComp} no es una moneda habilitada del negocio.` };
      if (!(await hayM6())) return { ok: false, error: "Para cargar un comprobante en otra moneda falta una actualización de la base. Cargalo en pesos." };
      const criterio = pr["moneda.cambioDelCosto"].valor;
      let cambioCentavos: number;
      let cambioDia: string | null = null;
      if (criterio === "MANUAL") {
        cambioCentavos = aCentavos(leerNumero(txt(formData.get("cambio"))));
        if (!(cambioCentavos > 0)) return { ok: false, error: `Escribí el cambio del comprobante (pesos por 1 ${monedaComp}): el negocio lo carga a mano.` };
      } else {
        const r = await cambioDelMovimiento(prisma, tenantId, monedaComp, diaArgentino(carga.fecha!));
        if (!r.ok) return { ok: false, error: r.error };
        cambioCentavos = r.cambioCentavos;
        cambioDia = r.dia;
      }
      fotoComp = { foto: fotoEnPesos(monedaComp, carga.totalCentavos / 100, cambioCentavos), cambioDia, criterio, provisional: pr["moneda.cambioDelCosto"].provisional || criterio === "DEL_PAGO" };
    }

    const archivo = formData.get("adjunto");
    const adjunto = archivo instanceof File && archivo.size > 0 ? archivo : null;
    const errorAdj = errorDeAdjunto(adjunto ? { tipo: adjunto.type, tamano: adjunto.size } : null);
    if (errorAdj) return { ok: false, error: errorAdj };

    const vinculada = esVinculada(supplier, p.vinculadas);
    const referencia = normalizarReferencia(txt(formData.get("referencia")));
    if (referencia && !vinculada) return { ok: false, error: "La referencia entre sociedades es sólo para un proveedor marcado como sociedad vinculada (Configuración › Parámetros › Sociedades)." };

    // Imputación rápida: todo a un destino. El tratamiento del IVA sale del tipo (parámetro `iva.porComprobante`).
    const destino = txt(formData.get("destino"));
    const categoria = txt(formData.get("categoria"));
    let linea: LineaEntrada | null = null;
    if (destino) {
      const { tratamiento, provisional } = tratamientoDelTipo(tipo, p.ivaPorTipo, p.ivaProvisional);
      const esAdm = destino === "ADMINISTRACION";
      if (!esAdm && !(await proyectoVisible(a, destino))) return { ok: false, error: "Ese proyecto no existe o no lo ves." };
      linea = {
        destino: esAdm ? "ADMINISTRACION" : "PROYECTO",
        proyectoId: esAdm ? null : destino,
        sector: txt(formData.get("sector")) || null,
        categoria,
        detalle: "",
        netoCentavos: carga.netoCentavos,
        ivaCentavos: carga.ivaCentavos,
        ivaTratamiento: tratamiento,
        ivaProvisional: provisional,
      };
      const errorImp = errorDeImputacion(carga, [linea], p.listas);
      if (errorImp) return { ok: false, error: errorImp };
    }

    const clave = claveDeEnvio(formData.get("claveEnvio"));
    const datos = adjunto ? new Uint8Array(await adjunto.arrayBuffer()) : null;
    let id: string;
    try {
      id = await tenantTransaction(async (tx) => {
        const c = await tx.proyectoComprobante.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            tipo,
            numero: carga.numero,
            fecha: carga.fecha!,
            moneda: monedaComp,
            netoCentavos: BigInt(carga.netoCentavos),
            ivaCentavos: BigInt(carga.ivaCentavos),
            totalCentavos: BigInt(carga.totalCentavos),
            detalle: txt(formData.get("detalle")).slice(0, 300),
            vinculada,
            referenciaVinculada: vinculada ? referencia : null,
            modeloCompra: vinculada ? p.modeloCompra : null,
            modeloCompraProvisional: vinculada && p.modeloCompraProvisional,
            claveEnvio: clave,
            cargadoPorId: user.id,
            cargadoNombre: user.name,
          },
          select: { id: true },
        });
        if (adjunto && datos) {
          await tx.proyectoComprobanteAdjunto.create({
            data: { tenantId, comprobanteId: c.id, nombre: adjunto.name.slice(0, 120) || "comprobante", tipoMime: adjunto.type, tamanoBytes: adjunto.size, datos },
          });
        }
        if (linea) await tx.proyectoComprobanteLinea.create({ data: lineaParaGuardar(tenantId, c.id, linea, 0) });
        if (fotoComp) await guardarFotoTx(tx, tenantId, { origenTipo: "COMPROBANTE", origenId: c.id, foto: fotoComp.foto, cambioDia: fotoComp.cambioDia, criterio: fotoComp.criterio, criterioProvisional: fotoComp.provisional });
        await registrarCambio(tx, { tenantId, proyectoId: linea?.proyectoId ?? null, entidad: "ProyectoComprobante", entidadId: c.id, campo: "Comprobante cargado", despues: `${tipo} ${carga.numero} · ${supplier.name}`, autor: user.name });
        return c.id;
      });
    } catch (e) {
      if (!esClaveRepetida(e)) throw e;
      // El mismo envío dos veces (doble clic, red lenta): es el mismo comprobante, no un duplicado.
      if (clave) {
        const mismo = await prisma.proyectoComprobante.findFirst({ where: { tenantId, claveEnvio: clave }, select: { id: true } });
        if (mismo) return { ok: true, id: mismo.id, repetido: true };
      }
      return { ok: false, error: DUPLICADO };
    }
    await auditAdmin({ action: "proyecto.comprobante.cargar", entity: "ProyectoComprobante", entityId: id, changes: { tipo, numero: carga.numero, totalCentavos: carga.totalCentavos } });
    refrescar([linea?.proyectoId ?? null]);
    return { ok: true, id };
  });
}

function lineaParaGuardar(tenantId: string, comprobanteId: string, l: LineaEntrada, orden: number) {
  const f = filaDeLinea(l, orden);
  return {
    tenantId,
    comprobanteId,
    orden,
    destino: f.destino,
    proyectoId: f.proyectoId,
    sector: f.sector,
    categoria: f.categoria,
    detalle: f.detalle.slice(0, 200),
    netoCentavos: BigInt(f.netoCentavos),
    ivaCentavos: BigInt(f.ivaCentavos),
    ivaTratamiento: f.ivaTratamiento,
    ivaProvisional: f.ivaProvisional,
    costoCentavos: BigInt(f.costoCentavos),
  };
}

// ── Imputación (O28 · O30) ──────────────────────────────────────────────────

export interface LineaDelForm {
  destino: Destino;
  proyectoId: string | null;
  sector: string | null;
  categoria: string;
  detalle: string;
  netoCentavos: number;
  ivaCentavos: number;
  ivaTratamiento: TratamientoIva;
}

/**
 * Reemplaza la imputación entera del comprobante. Las líneas suman el comprobante al centavo (neto y IVA), o no se guarda
 * nada. La marca de provisional queda sólo en la línea cuyo tratamiento del IVA salió del parámetro provisional: si
 * Administración lo cambió a mano, ya lo decidió una persona.
 */
export async function imputarComprobante(d: { comprobanteId: string; lineas: LineaDelForm[] }): Promise<Resultado> {
  const a = await actorDeComprobantes();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  return conM1<object>(async () => {
    const c = await prisma.proyectoComprobante.findFirst({
      where: { tenantId, id: String(d.comprobanteId ?? "") },
      select: { id: true, tipo: true, numero: true, netoCentavos: true, ivaCentavos: true, anuladoEl: true },
    });
    if (!c) return { ok: false, error: "Ese comprobante no existe." };
    if (c.anuladoEl) return { ok: false, error: "Ese comprobante está anulado: no se imputa." };
    const p = await parametrosDeComprobantes(tenantId);
    const porDefecto = tratamientoDelTipo(c.tipo, p.ivaPorTipo, p.ivaProvisional);
    const entrada = Array.isArray(d.lineas) ? d.lineas : [];
    const lineas: LineaEntrada[] = entrada.map((l) => {
      const t: TratamientoIva = esTratamiento(l.ivaTratamiento) ? l.ivaTratamiento : porDefecto.tratamiento;
      return {
        destino: l.destino === "ADMINISTRACION" ? "ADMINISTRACION" : "PROYECTO",
        proyectoId: l.destino === "ADMINISTRACION" ? null : String(l.proyectoId ?? "") || null,
        sector: String(l.sector ?? "").trim() || null,
        categoria: String(l.categoria ?? "").trim(),
        detalle: String(l.detalle ?? "").trim(),
        netoCentavos: Number(l.netoCentavos),
        ivaCentavos: Number(l.ivaCentavos),
        ivaTratamiento: t,
        ivaProvisional: t === porDefecto.tratamiento && porDefecto.provisional,
      };
    });
    const error = errorDeImputacion({ netoCentavos: Number(c.netoCentavos), ivaCentavos: Number(c.ivaCentavos) }, lineas, p.listas);
    if (error) return { ok: false, error };
    for (const id of new Set(lineas.map((l) => l.proyectoId).filter((x): x is string => !!x))) {
      if (!(await proyectoVisible(a, id))) return { ok: false, error: "Uno de los proyectos no existe o no lo ves." };
    }
    // El reemplazo, con el comprobante tomado: otra imputación a la vez espera y borra estas líneas, no las suma (CERT-1).
    const r = await tenantTransaction<{ error: string } | { antes: (string | null)[] }>(async (tx) => {
      const actual = await bloquearComprobante(tx, tenantId, c.id);
      if (!actual) return { error: "Ese comprobante no existe." };
      if (actual.anulado) return { error: "Ese comprobante está anulado: no se imputa." };
      const antes = await tx.proyectoComprobanteLinea.findMany({ where: { tenantId, comprobanteId: c.id }, select: { proyectoId: true } });
      await tx.proyectoComprobanteLinea.deleteMany({ where: { tenantId, comprobanteId: c.id } });
      await tx.proyectoComprobanteLinea.createMany({ data: lineas.map((l, i) => lineaParaGuardar(tenantId, c.id, l, i)) });
      await registrarCambio(tx, { tenantId, entidad: "ProyectoComprobante", entidadId: c.id, campo: "Imputación", despues: `${lineas.length} línea(s)`, autor: user.name });
      return { antes: antes.map((l) => l.proyectoId) };
    });
    if ("error" in r) return { ok: false, error: r.error };
    await auditAdmin({ action: "proyecto.comprobante.imputar", entity: "ProyectoComprobante", entityId: c.id, changes: { lineas: lineas.length } });
    refrescar([...r.antes, ...lineas.map((l) => l.proyectoId)]);
    return { ok: true };
  });
}

// ── Cuotas del calendario ↔ comprobante (O13) ───────────────────────────────

/**
 * Enlaza una cuota de pago del calendario al comprobante que la factura: desde ahí deja de contar como prevista (la
 * cuenta el comprobante) y la orden de pago dice qué cuota cancela. Sólo una cuota en pesos, del mismo proveedor, sin
 * pagar y sin partes pagadas; las cuotas enlazadas no pasan el total del comprobante.
 */
export async function enlazarCuota(formData: FormData): Promise<Resultado> {
  const a = await actorDeComprobantes();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  return conM1<object>(async () => {
    const comprobanteId = txt(formData.get("comprobanteId"));
    const cuotaId = txt(formData.get("cuotaId"));
    const [c, q] = await Promise.all([
      prisma.proyectoComprobante.findFirst({ where: { tenantId, id: comprobanteId }, select: { id: true, supplierId: true, moneda: true, totalCentavos: true, anuladoEl: true } }),
      prisma.proyectoCuota.findFirst({ where: { tenantId, id: cuotaId }, select: { id: true, tipo: true, monto: true, moneda: true, supplierId: true, proyectoId: true, pagadoEl: true, anuladoEl: true, concepto: true } }),
    ]);
    if (!c || c.anuladoEl) return { ok: false, error: "Ese comprobante no existe o está anulado." };
    if (!q || q.tipo === "COBRO" || q.anuladoEl) return { ok: false, error: "Esa cuota de pago no existe." };
    if (q.proyectoId && !(await proyectoVisible(a, q.proyectoId))) return { ok: false, error: "Esa cuota de pago no existe." };
    if (q.supplierId !== c.supplierId) return { ok: false, error: "La cuota es de otro proveedor." };
    if (q.moneda !== c.moneda) return { ok: false, error: `La cuota está en ${q.moneda} y el comprobante en ${c.moneda}: no se enlazan.` };
    if (q.pagadoEl) return { ok: false, error: YA_PAGADA };
    const tc = await tiposDeCambio(tenantId);
    if ((await pendienteDelPago(tenantId, q, tc)) < q.monto) return { ok: false, error: CON_PARTES };
    try {
      // La suma contra el total, con el comprobante tomado: el segundo enlace a la vez espera y ve el primero (CERT-3).
      const error = await tenantTransaction(async (tx) => {
        const actual = await bloquearComprobante(tx, tenantId, c.id);
        if (!actual || actual.anulado) return "Ese comprobante no existe o está anulado.";
        // CERT-4: después, la cuota, con el candado que toma `marcarCuota` al pagarla a mano. Pagada (toda o una parte)
        // mientras tanto → no se enlaza. Lo de afuera era sólo para contestar rápido.
        const cuota = (await tomarCuotas(tx, tenantId, [q.id])).get(q.id);
        if (!cuota || cuota.anulado) return "Esa cuota de pago no existe.";
        if (cuota.pagado) return YA_PAGADA;
        if ((await pendienteDelPago(tenantId, { ...q, pagadoEl: null }, tc, tx)) < q.monto) return CON_PARTES;
        // `marcarCuota` corre en Serializable: su foto puede ser de antes de este enlace. Una versión nueva de la fila de
        // la cuota hace que, al tomar el candado después, Postgres la aborte y el reintento vea el enlace.
        await tx.$executeRaw`UPDATE "ProyectoCuota" SET "pagadoEl" = "pagadoEl" WHERE "tenantId" = ${tenantId} AND "id" = ${q.id}`;
        const ya = await tx.proyectoCuotaComprobante.findMany({ where: { tenantId, comprobanteId: c.id }, select: { cuota: { select: { monto: true } } } });
        const enlazado = ya.reduce((s, x) => s + centavosDe(x.cuota.monto), 0);
        if (enlazado + centavosDe(q.monto) > Number(c.totalCentavos)) return "Las cuotas enlazadas pasarían el total del comprobante.";
        await tx.proyectoCuotaComprobante.create({ data: { tenantId, cuotaId: q.id, comprobanteId: c.id, creadoPor: user.name } });
        await registrarCambio(tx, { tenantId, proyectoId: q.proyectoId, entidad: "ProyectoCuota", entidadId: q.id, campo: "Comprobante", despues: c.id, autor: user.name });
        return null;
      });
      if (error) return { ok: false, error };
    } catch (e) {
      if (esClaveRepetida(e)) return { ok: false, error: "Esa cuota ya está enlazada a un comprobante." };
      throw e;
    }
    refrescar([q.proyectoId]);
    return { ok: true };
  });
}

/** Saca el enlace, si ninguna orden viva paga esa cuota. */
export async function desenlazarCuota(formData: FormData): Promise<Resultado> {
  const a = await actorDeComprobantes();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  return conM1<object>(async () => {
    const cuotaId = txt(formData.get("cuotaId"));
    const enlace = await prisma.proyectoCuotaComprobante.findFirst({ where: { tenantId, cuotaId }, select: { id: true, cuota: { select: { proyectoId: true } } } });
    if (!enlace) return { ok: false, error: "Esa cuota no está enlazada." };
    const enOrden = await prisma.proyectoOrdenPagoLinea.count({ where: { tenantId, cuotaId, orden: { estado: { not: "ANULADA" } } } });
    if (enOrden > 0) return { ok: false, error: "Una orden de pago viva paga esa cuota: anulala primero." };
    await tenantTransaction(async (tx) => {
      await tx.proyectoCuotaComprobante.deleteMany({ where: { tenantId, id: enlace.id } });
      await registrarCambio(tx, { tenantId, proyectoId: enlace.cuota.proyectoId, entidad: "ProyectoCuota", entidadId: cuotaId, campo: "Comprobante", antes: "enlazada", despues: null, autor: user.name });
    });
    refrescar([enlace.cuota.proyectoId]);
    return { ok: true };
  });
}

// ── Anulación ───────────────────────────────────────────────────────────────

/** Anula un comprobante sin órdenes vivas: deja de sumar al costo y a lo que hay que pagar. No se borra. */
export async function anularComprobante(formData: FormData): Promise<Resultado> {
  const a = await actorDeComprobantes();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  return conM1<object>(async () => {
    const id = txt(formData.get("id"));
    const c = await prisma.proyectoComprobante.findFirst({ where: { tenantId, id }, select: { id: true, lineas: { select: { proyectoId: true } } } });
    if (!c) return { ok: false, error: "Ese comprobante no existe." };
    // Las órdenes vivas se cuentan con el comprobante tomado, el mismo candado que `crearOrdenPago`: si la orden llegó
    // primero, acá se ve; si llegó primero la anulación, la orden ve el comprobante anulado y no entra (CERT-2).
    const error = await tenantTransaction(async (tx) => {
      const actual = await bloquearComprobante(tx, tenantId, id);
      if (!actual) return "Ese comprobante no existe.";
      if (actual.anulado) return "Ese comprobante ya estaba anulado.";
      const vivas = await tx.proyectoOrdenPagoLinea.count({ where: { tenantId, comprobanteId: id, orden: { estado: { not: "ANULADA" } } } });
      if (vivas > 0) return "Ese comprobante está en una orden de pago viva: anulá la orden primero.";
      await tx.proyectoComprobante.updateMany({ where: { tenantId, id, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: user.name } });
      await tx.proyectoCuotaComprobante.deleteMany({ where: { tenantId, comprobanteId: id } });
      await registrarCambio(tx, { tenantId, entidad: "ProyectoComprobante", entidadId: id, campo: "Anulado", despues: user.name, autor: user.name });
      return null;
    });
    if (error) return { ok: false, error };
    await auditAdmin({ action: "proyecto.comprobante.anular", entity: "ProyectoComprobante", entityId: id, changes: {} });
    refrescar(c.lineas.map((l) => l.proyectoId));
    return { ok: true };
  });
}
