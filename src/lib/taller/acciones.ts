"use server";

// ============================================================================
// TALLER — escrituras. Cada acción vuelve a pedir el permiso y acota por negocio:
// esconder un botón no protege nada. La plata pide agenda:manage (dueño y
// administrativo); mover el auto y cargar fotos, agenda:read (también el mecánico).
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import {
  CLAVES_PLANTILLA,
  conRecargo,
  esEstado,
  formatoPatente,
  MEDIOS,
  normalizarPatente,
  precioConMargen,
  recargoPct,
  redondear,
  sumarDias,
  totales,
  type MedioPago,
} from "./core";
import { asentarCobroInTx, descontarRepuestosInTx, detalleDelCobro, revertirCobroInTx } from "./caja";
import { configTaller, vehiculoPorPatente } from "./datos.server";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/taller";
const MAX_FOTOS = 12;
const MAX_FOTO = 400_000; // caracteres del data URL (~300 KB de imagen)

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null | undefined): number => {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const entero = (v: unknown): number | null => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const fecha = (v: FormDataEntryValue | null): Date | null => {
  const s = txt(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00-03:00`);
};
const fotoValida = (d: unknown): d is string => typeof d === "string" && d.startsWith("data:image/jpeg;base64,") && d.length <= MAX_FOTO;

function refrescar(ordenId?: string) {
  revalidatePath(RAIZ);
  if (ordenId) revalidatePath(`${RAIZ}/orden/${ordenId}`);
}

// ── Ingreso ─────────────────────────────────────────────────────────────────

export async function buscarPatente(raw: string) {
  await requireCapability("agenda:read");
  const patente = normalizarPatente(raw);
  if (!formatoPatente(patente)) return { valida: false as const };
  const tenantId = await getCurrentTenantId();
  const v = await vehiculoPorPatente(tenantId, patente);
  if (!v) return { valida: true as const, encontrado: false as const };
  const abierta = await prisma.tallerOrden.findFirst({
    where: { tenantId, vehiculoId: v.id, estado: { not: "ENTREGADO" } },
    select: { id: true, numero: true },
  });
  return {
    valida: true as const,
    encontrado: true as const,
    marca: v.marca,
    modelo: v.modelo,
    anio: v.anio,
    km: v.km,
    cliente: v.client.name,
    telefono: v.client.phone,
    abierta,
  };
}

export interface DatosIngreso {
  patente: string;
  marca: string;
  modelo: string;
  anio?: string;
  km?: string;
  combustible?: number;
  cliente: string;
  telefono: string;
  problema: string;
  firma?: string | null;
  firmaNombre?: string;
}

export async function ingresarVehiculo(d: DatosIngreso): Promise<Resultado<{ id: string; numero: number; token: string }>> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const patente = normalizarPatente(d.patente);
  if (!formatoPatente(patente)) return { ok: false, error: "La patente no es válida. Va como ABC123 o AB123CD." };
  const cliente = (d.cliente ?? "").trim();
  const telefono = (d.telefono ?? "").replace(/[^\d+]/g, "");
  if (!cliente) return { ok: false, error: "Falta el nombre del cliente." };
  if (telefono.replace(/\D/g, "").length < 8) return { ok: false, error: "Falta el teléfono del cliente (para avisarle por WhatsApp)." };
  const km = entero(d.km);
  const anio = entero(d.anio);
  const firma = typeof d.firma === "string" && d.firma.startsWith("data:image/png;base64,") && d.firma.length < 120_000 ? d.firma : null;

  for (let intento = 0; intento < 3; intento++) {
    try {
      const creada = await tenantTransaction(async (tx) => {
        let v = await tx.tallerVehiculo.findUnique({ where: { tenantId_patente: { tenantId, patente } } });
        let clientId = v?.clientId ?? null;
        if (!clientId) {
          const existente = await tx.client.findFirst({ where: { tenantId, phone: telefono } });
          clientId = existente?.id ?? (await tx.client.create({ data: { tenantId, name: cliente, phone: telefono, tallerEtiquetas: ["particular"] } })).id;
        }
        if (v) {
          v = await tx.tallerVehiculo.update({
            where: { id: v.id },
            data: { marca: d.marca.trim() || v.marca, modelo: d.modelo.trim() || v.modelo, anio: anio ?? v.anio, km: km ?? v.km },
          });
        } else {
          v = await tx.tallerVehiculo.create({
            data: { tenantId, clientId, patente, marca: d.marca.trim(), modelo: d.modelo.trim(), anio, km },
          });
        }
        const ultima = await tx.tallerOrden.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        return tx.tallerOrden.create({
          data: {
            tenantId,
            numero: (ultima?.numero ?? 0) + 1,
            vehiculoId: v.id,
            clientId: v.clientId,
            km,
            combustible: typeof d.combustible === "number" ? Math.max(0, Math.min(8, Math.round(d.combustible))) : null,
            problema: (d.problema ?? "").trim(),
            token: randomBytes(18).toString("base64url"),
            firmaIngreso: firma,
            firmaNombre: firma ? (d.firmaNombre?.trim() || cliente) : null,
            // Si lo ingresa un mecánico, la orden nace suya.
            mecanicoUserId: user.role === "PROFESSIONAL" ? user.id : null,
            mecanicoNombre: user.role === "PROFESSIONAL" ? user.name : null,
          },
          select: { id: true, numero: true, token: true },
        });
      });
      await auditAdmin({ action: "taller.ingreso", entity: "TallerOrden", entityId: creada.id, changes: { patente, numero: creada.numero } });
      refrescar();
      return { ok: true, ...creada };
    } catch (e) {
      // Dos ingresos a la vez pueden pedir el mismo número: el índice único lo frena y se reintenta.
      const code = (e as { code?: string }).code;
      if (code !== "P2002" || intento === 2) {
        console.error("[taller] ingreso", e);
        return { ok: false, error: "No se pudo guardar el ingreso. Probá de nuevo." };
      }
    }
  }
  return { ok: false, error: "No se pudo guardar el ingreso. Probá de nuevo." };
}

// ── Fotos ───────────────────────────────────────────────────────────────────

export async function agregarFoto(ordenId: string, datos: string, momento: string): Promise<Resultado> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  if (!fotoValida(datos)) return { ok: false, error: "La foto es muy pesada o no es una imagen." };
  const orden = await prisma.tallerOrden.findFirst({ where: { id: ordenId, tenantId }, select: { id: true, _count: { select: { fotos: true } } } });
  if (!orden) return { ok: false, error: "Esa orden no existe." };
  if (orden._count.fotos >= MAX_FOTOS) return { ok: false, error: `Hasta ${MAX_FOTOS} fotos por orden.` };
  await prisma.tallerFoto.create({
    data: { tenantId, ordenId, datos, momento: ["INGRESO", "TRABAJO", "ENTREGA"].includes(momento) ? momento : "TRABAJO" },
  });
  refrescar(ordenId);
  return { ok: true };
}

export async function quitarFoto(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const foto = await prisma.tallerFoto.findFirst({ where: { id, tenantId }, select: { ordenId: true } });
  if (!foto) return;
  await prisma.tallerFoto.deleteMany({ where: { id, tenantId } });
  refrescar(foto.ordenId);
}

// ── Estado, diagnóstico y mecánico ──────────────────────────────────────────

export async function cambiarEstado(formData: FormData) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const estado = txt(formData.get("estado"));
  // La entrega tiene su propio paso (garantía, próximo service): no se llega por acá.
  if (!esEstado(estado) || estado === "ENTREGADO") return;
  const orden = await prisma.tallerOrden.findFirst({ where: { id, tenantId }, select: { estado: true, mecanicoUserId: true } });
  if (!orden || orden.estado === "ENTREGADO") return;
  await prisma.tallerOrden.updateMany({
    where: { id, tenantId },
    data: {
      estado,
      // El mecánico que toma un auto sin dueño se lo queda.
      ...(user.role === "PROFESSIONAL" && !orden.mecanicoUserId ? { mecanicoUserId: user.id, mecanicoNombre: user.name } : {}),
    },
  });
  await auditAdmin({ action: "taller.estado", entity: "TallerOrden", entityId: id, changes: { de: orden.estado, a: estado } });
  refrescar(id);
}

export async function guardarTrabajo(formData: FormData) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const mecanicoUserId = txt(formData.get("mecanicoUserId")) || null;
  let mecanico: { id: string; name: string } | null = null;
  if (mecanicoUserId) {
    mecanico = await prisma.user.findFirst({ where: { id: mecanicoUserId, tenantId, active: true }, select: { id: true, name: true } });
  }
  await prisma.tallerOrden.updateMany({
    where: { id, tenantId, estado: { not: "ENTREGADO" } },
    data: {
      diagnostico: txt(formData.get("diagnostico")) || null,
      horas: Math.max(0, numero(formData.get("horas"))),
      // Sólo quien gestiona reasigna; el mecánico no se saca ni le pasa el auto a otro.
      ...(user.role !== "PROFESSIONAL" ? { mecanicoUserId: mecanico?.id ?? null, mecanicoNombre: mecanico?.name ?? null } : {}),
    },
  });
  refrescar(id);
}

// ── Presupuesto ─────────────────────────────────────────────────────────────

export async function agregarItem(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const ordenId = txt(formData.get("ordenId"));
  const orden = await prisma.tallerOrden.findFirst({ where: { id: ordenId, tenantId, estado: { not: "ENTREGADO" } }, select: { id: true, _count: { select: { items: true } } } });
  if (!orden) return;
  const tipo = txt(formData.get("tipo")) === "REPUESTO" ? "REPUESTO" : "MANO_OBRA";
  const traidoPorCliente = tipo === "REPUESTO" && formData.get("traidoPorCliente") === "on";
  const productId = tipo === "REPUESTO" ? txt(formData.get("productId")) || null : null;
  let descripcion = txt(formData.get("descripcion"));
  const cantidad = Math.max(0.01, numero(formData.get("cantidad")) || 1);
  const costo = Math.max(0, numero(formData.get("costo")));
  let precio = Math.max(0, numero(formData.get("precio")));

  if (productId) {
    const p = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { name: true, price: true } });
    if (!p) return;
    if (!descripcion) descripcion = p.name;
    if (!precio && p.price) precio = p.price;
  }
  if (!descripcion) return;
  // Sin precio a mano pero con costo: se propone costo + el margen del taller.
  if (!precio && costo && !traidoPorCliente) precio = precioConMargen(costo, (await configTaller(tenantId)).margenPct);

  await prisma.tallerItem.create({
    data: {
      tenantId,
      ordenId,
      tipo,
      descripcion: traidoPorCliente && !/cliente/i.test(descripcion) ? `${descripcion} (lo trae el cliente)` : descripcion,
      cantidad,
      costo: traidoPorCliente ? 0 : costo,
      precio: traidoPorCliente ? 0 : redondear(precio),
      productId,
      traidoPorCliente,
      posicion: orden._count.items,
    },
  });
  refrescar(ordenId);
}

export async function quitarItem(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const item = await prisma.tallerItem.findFirst({ where: { id, tenantId }, select: { ordenId: true } });
  if (!item) return;
  await prisma.tallerItem.deleteMany({ where: { id, tenantId } });
  refrescar(item.ordenId);
}

/** El taller anota la respuesta que el cliente dio de palabra o por WhatsApp. */
export async function decidirItem(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const decision = txt(formData.get("decision"));
  if (!["PENDIENTE", "APROBADO", "RECHAZADO"].includes(decision)) return;
  const item = await prisma.tallerItem.findFirst({ where: { id, tenantId }, select: { ordenId: true } });
  if (!item) return;
  await prisma.tallerItem.updateMany({ where: { id, tenantId }, data: { decision } });
  refrescar(item.ordenId);
}

/** Se llama al tocar "Enviar por WhatsApp": deja la orden esperando al cliente y fija la validez. */
export async function marcarPresupuestoEnviado(ordenId: string): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const orden = await prisma.tallerOrden.findFirst({ where: { id: ordenId, tenantId }, select: { estado: true, _count: { select: { items: true } } } });
  if (!orden) return { ok: false, error: "Esa orden no existe." };
  if (orden._count.items === 0) return { ok: false, error: "Cargá al menos un ítem antes de enviar el presupuesto." };
  const { validezDias } = await configTaller(tenantId);
  const ahora = new Date();
  await prisma.tallerOrden.updateMany({
    where: { id: ordenId, tenantId },
    data: {
      presupuestoEnviadoEl: ahora,
      presupuestoValidoHasta: sumarDias(ahora, validezDias),
      ...(["RECIBIDO", "DIAGNOSTICO"].includes(orden.estado) ? { estado: "ESPERANDO_APROBACION" } : {}),
    },
  });
  refrescar(ordenId);
  return { ok: true };
}

/** PÚBLICA (sin login): el cliente aprueba o rechaza ítem por ítem desde su link. */
export async function responderPresupuesto(token: string, decisiones: Record<string, string>): Promise<Resultado> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, error: "Link inválido." };
  const tenantId = await getCurrentTenantId();
  const orden = await prisma.tallerOrden.findFirst({
    where: { tenantId, token },
    select: { id: true, estado: true, presupuestoValidoHasta: true, items: { select: { id: true, decision: true } } },
  });
  if (!orden) return { ok: false, error: "No encontramos esta orden." };
  if (orden.estado === "ENTREGADO" || orden.estado === "LISTO") return { ok: false, error: "Este trabajo ya está terminado." };
  if (orden.presupuestoValidoHasta && orden.presupuestoValidoHasta.getTime() < Date.now()) {
    return { ok: false, error: "El presupuesto venció. Escribinos y te lo actualizamos." };
  }
  const cambios = orden.items.filter((i) => ["APROBADO", "RECHAZADO"].includes(decisiones?.[i.id]) && decisiones[i.id] !== i.decision);
  await tenantTransaction(async (tx) => {
    for (const i of cambios) {
      await tx.tallerItem.updateMany({ where: { id: i.id, tenantId, ordenId: orden.id }, data: { decision: decisiones[i.id] } });
    }
    const quedan = await tx.tallerItem.findMany({ where: { tenantId, ordenId: orden.id }, select: { decision: true } });
    const todoRespondido = quedan.every((q) => q.decision !== "PENDIENTE");
    const algoAprobado = quedan.some((q) => q.decision === "APROBADO");
    await tx.tallerOrden.updateMany({
      where: { id: orden.id, tenantId },
      data: {
        presupuestoRespondidoEl: new Date(),
        // Con todo respondido y algo aprobado, el auto pasa solo a reparación.
        ...(orden.estado === "ESPERANDO_APROBACION" && todoRespondido && algoAprobado ? { estado: "EN_REPARACION" } : {}),
      },
    });
  });
  await auditPublic({ action: "taller.presupuesto.respuesta", entity: "TallerOrden", entityId: orden.id, changes: { items: cambios.length } });
  revalidatePath(`/seguimiento/${token}`);
  refrescar(orden.id);
  return { ok: true };
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export async function registrarPago(formData: FormData) {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const ordenId = txt(formData.get("ordenId"));
  const medio = txt(formData.get("medio")) as MedioPago;
  const monto = redondear(numero(formData.get("monto")));
  if (!MEDIOS.includes(medio) || monto <= 0) return;
  const orden = await prisma.tallerOrden.findFirst({
    where: { id: ordenId, tenantId },
    select: { id: true, numero: true, vehiculo: { select: { patente: true } } },
  });
  if (!orden) return;
  const cuotas = Math.max(1, entero(formData.get("cuotas")) ?? 1);
  const nota = txt(formData.get("nota")) || null;
  const { recargos } = await configTaller(tenantId);
  const { recargo } = conRecargo(monto, recargoPct(medio, cuotas, recargos));
  // El cobro y su asiento en el libro de caja van juntos: o entran los dos o ninguno.
  const pago = await tenantTransaction(async (tx) => {
    const creado = await tx.tallerPago.create({
      data: { tenantId, ordenId, medio, monto, recargo, cuotas: medio === "CREDITO" ? cuotas : 1, nota, cobradoPor: user.name },
    });
    await asentarCobroInTx(tx, tenantId, {
      pagoId: creado.id,
      medio,
      monto,
      recargo,
      detalle: detalleDelCobro(orden.numero, orden.vehiculo.patente, nota),
      actor: `user:${user.id}`,
    });
    return creado;
  });
  await auditAdmin({ action: "taller.cobro", entity: "TallerPago", entityId: pago.id, changes: { ordenId, medio, monto, recargo } });
  refrescar(ordenId);
  revalidatePath("/admin/caja");
}

/** Un cobro no se borra: queda anulado, con su contrapartida en el libro de caja. */
export async function anularPago(formData: FormData) {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pago = await prisma.tallerPago.findFirst({
    where: { id, tenantId, anuladoEl: null },
    include: { orden: { select: { numero: true, vehiculo: { select: { patente: true } } } } },
  });
  if (!pago) return;
  const hecho = await tenantTransaction(async (tx) => {
    // Sólo anula quien llega primero: un doble toque no escribe dos contrapartidas.
    const r = await tx.tallerPago.updateMany({ where: { id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: user.name } });
    if (r.count !== 1) return false;
    await revertirCobroInTx(tx, tenantId, {
      pagoId: id,
      detalle: detalleDelCobro(pago.orden.numero, pago.orden.vehiculo.patente),
      actor: `user:${user.id}`,
    });
    return true;
  });
  if (!hecho) return;
  await auditAdmin({ action: "taller.cobro.anulado", entity: "TallerPago", entityId: id, changes: { ordenId: pago.ordenId, medio: pago.medio, monto: pago.monto } });
  refrescar(pago.ordenId);
  revalidatePath("/admin/caja");
}

// ── Entrega ─────────────────────────────────────────────────────────────────

export async function entregar(formData: FormData): Promise<void> {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const orden = await prisma.tallerOrden.findFirst({
    where: { id, tenantId },
    include: {
      client: { select: { tallerCtaCte: true } },
      items: { select: { tipo: true, cantidad: true, precio: true, decision: true, traidoPorCliente: true, productId: true, descripcion: true } },
      pagos: { where: { anuladoEl: null }, select: { monto: true } },
    },
  });
  if (!orden || orden.estado === "ENTREGADO") return;
  const saldo = redondear(totales(orden.items).aprobado - orden.pagos.reduce((s, p) => s + p.monto, 0));
  // Con saldo sólo se lleva el auto quien tiene cuenta corriente, o si el dueño lo confirma a mano.
  if (saldo > 0.5 && !orden.client.tallerCtaCte && formData.get("entregarConSaldo") !== "on") return;

  const config = await configTaller(tenantId);
  const ahora = new Date();
  const dias = Math.max(0, entero(formData.get("garantiaDias")) ?? config.garantiaDias);
  const condicion = config.condicionIva;
  await tenantTransaction(async (tx) => {
    // La condición va en el WHERE: si dos personas entregan a la vez, sólo una pasa, y el stock
    // se descuenta una sola vez.
    const entregada = await tx.tallerOrden.updateMany({
      where: { id, tenantId, estado: { not: "ENTREGADO" } },
      data: {
        estado: "ENTREGADO",
        entregadoEl: ahora,
        garantiaHasta: dias ? sumarDias(ahora, dias) : null,
        garantiaDetalle: txt(formData.get("garantiaDetalle")) || null,
        comprobanteTipo: condicion === "MONOTRIBUTO" ? "C" : "B",
      },
    });
    if (entregada.count !== 1) return;
    await descontarRepuestosInTx(tx, tenantId, { numero: orden.numero, items: orden.items, actor: `user:${user.id}` });
    const proxKm = entero(formData.get("proximoServiceKm"));
    const proxFecha = fecha(formData.get("proximoServiceFecha"));
    await tx.tallerVehiculo.updateMany({
      where: { id: orden.vehiculoId, tenantId },
      data: {
        ...(orden.km ? { km: orden.km } : {}),
        ...(proxKm ? { proximoServiceKm: proxKm } : {}),
        ...(proxFecha ? { proximoServiceFecha: proxFecha } : {}),
      },
    });
  });
  await auditAdmin({ action: "taller.entrega", entity: "TallerOrden", entityId: id, changes: { saldo } });
  refrescar(id);
}

export async function marcarResenaPedida(ordenId: string): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  await prisma.tallerOrden.updateMany({ where: { id: ordenId, tenantId }, data: { resenaPedidaEl: new Date() } });
  refrescar(ordenId);
}

// ── Vehículo y cliente ──────────────────────────────────────────────────────

const ETIQUETAS = ["particular", "flota", "empresa", "VIP"];

export async function guardarVehiculo(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const v = await prisma.tallerVehiculo.findFirst({ where: { id, tenantId }, select: { clientId: true } });
  if (!v) return;
  await tenantTransaction(async (tx) => {
    await tx.tallerVehiculo.updateMany({
      where: { id, tenantId },
      data: {
        marca: txt(formData.get("marca")),
        modelo: txt(formData.get("modelo")),
        anio: entero(formData.get("anio")),
        color: txt(formData.get("color")) || null,
        km: entero(formData.get("km")),
        vtvVence: fecha(formData.get("vtvVence")),
        proximoServiceFecha: fecha(formData.get("proximoServiceFecha")),
        proximoServiceKm: entero(formData.get("proximoServiceKm")),
        notas: txt(formData.get("notas")) || null,
      },
    });
    await tx.client.updateMany({
      where: { id: v.clientId, tenantId },
      data: {
        tallerEtiquetas: ETIQUETAS.filter((e) => formData.getAll("etiquetas").includes(e)),
        tallerCtaCte: formData.get("ctaCte") === "on",
      },
    });
  });
  revalidatePath(`${RAIZ}/vehiculos`);
  revalidatePath(`${RAIZ}/vehiculos/${id}`);
}

// ── Avisos ──────────────────────────────────────────────────────────────────

export async function marcarAvisoEnviado(clave: string): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (typeof clave !== "string" || clave.length > 120) return;
  await prisma.tallerAvisoEnviado.upsert({
    where: { tenantId_clave: { tenantId, clave } },
    create: { tenantId, clave },
    update: { enviadoEl: new Date() },
  });
  revalidatePath(`${RAIZ}/avisos`);
}

// ── Configuración ───────────────────────────────────────────────────────────

export async function guardarConfig(formData: FormData) {
  // Márgenes, recargos y datos de cobro: sólo el dueño.
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const plantillas: Record<string, string> = {};
  for (const k of CLAVES_PLANTILLA) {
    const v = txt(formData.get(`plantilla_${k}`));
    if (v) plantillas[k] = v.slice(0, 900);
  }
  const pct = (k: string) => Math.max(0, Math.min(300, numero(formData.get(k))));
  const data = {
    margenPct: pct("margenPct"),
    validezDias: Math.max(1, entero(formData.get("validezDias")) ?? 7),
    garantiaDias: Math.max(0, entero(formData.get("garantiaDias")) ?? 90),
    valorHora: Math.max(0, numero(formData.get("valorHora"))),
    aliasCbu: txt(formData.get("aliasCbu")) || null,
    linkMercadoPago: txt(formData.get("linkMercadoPago")) || null,
    linkResena: txt(formData.get("linkResena")) || null,
    condicionIva: txt(formData.get("condicionIva")) === "RESPONSABLE_INSCRIPTO" ? "RESPONSABLE_INSCRIPTO" : "MONOTRIBUTO",
    recargos: { debito: pct("r_debito"), cuotas1: pct("r_cuotas1"), cuotas3: pct("r_cuotas3"), cuotas6: pct("r_cuotas6"), cuotas12: pct("r_cuotas12") },
    plantillas,
  };
  await prisma.tallerConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await auditAdmin({ action: "taller.config", entity: "TallerConfig", entityId: tenantId });
  revalidatePath(`${RAIZ}/config`);
}
