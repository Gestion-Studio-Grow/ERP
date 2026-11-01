"use server";

// ============================================================================
// PROYECTOS — escrituras. Cada acción vuelve a pedir el permiso y acota por negocio: esconder un
// botón no protege nada. La plata pide agenda:manage (dueño y administrativo); mover un trabajo,
// cargar tareas, archivos y stands, agenda:read (también el equipo de diseño y armado).
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import type { Prisma } from "@/generated/prisma/client";
import { clientePuedeResponder, esEtapa, esServicio, etapaAlAprobar, etapasDe, MEDIOS, metodoDeCaja, precioConMargen, redondear, sePuedeEditar, sumarDias, type MedioPago } from "./core";
import { computar, costosVigentes, COSTO_LABEL, disenoInicial, normalizarDiseno, TIPOS_STAND, type ClaveCosto, type DisenoStand } from "./stand";
import { configProyectos } from "./datos.server";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const MAX_ARCHIVOS = 30;
const MAX_IMAGEN = 1_400_000; // caracteres del data URL (~1 MB de imagen)

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null | undefined): number => {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fecha = (v: FormDataEntryValue | null): Date | null => {
  const s = txt(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00-03:00`);
};
const token = () => randomBytes(18).toString("base64url");
const imagenValida = (d: unknown): d is string => typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d) && d.length <= MAX_IMAGEN;
const urlValida = (u: string): boolean => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

function refrescar(id?: string) {
  revalidatePath(RAIZ);
  if (id) revalidatePath(`${RAIZ}/${id}`);
}

/** Todo lo que cuelga de un proyecto arranca comprobando que el proyecto es de este negocio. */
async function proyectoDelNegocio(id: string, tenantId: string) {
  return prisma.proyecto.findFirst({ where: { id, tenantId }, select: { id: true, numero: true, servicio: true, etapa: true, nombre: true } });
}

// ── Proyecto ────────────────────────────────────────────────────────────────

export async function crearProyecto(formData: FormData): Promise<Resultado<{ id: string }>> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const nombre = txt(formData.get("nombre"));
  const servicio = txt(formData.get("servicio"));
  const clienteId = txt(formData.get("clienteId"));
  const clienteNuevo = txt(formData.get("clienteNuevo"));
  const telefono = txt(formData.get("telefono")).replace(/[^\d+]/g, "");
  if (!nombre) return { ok: false, error: "Falta el nombre del proyecto." };
  if (!esServicio(servicio)) return { ok: false, error: "Elegí el servicio." };
  if (!clienteId && !clienteNuevo) return { ok: false, error: "Elegí un cliente o escribí uno nuevo." };

  for (let intento = 0; intento < 3; intento++) {
    try {
      const creado = await tenantTransaction(async (tx) => {
        const clientId = clienteId
          ? (await tx.client.findFirst({ where: { id: clienteId, tenantId }, select: { id: true } }))?.id
          : (await tx.client.create({ data: { tenantId, name: clienteNuevo, phone: telefono || `sin-tel-${randomBytes(4).toString("hex")}` } })).id;
        if (!clientId) throw new Error("CLIENTE");
        const ultimo = await tx.proyecto.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        return tx.proyecto.create({
          data: {
            tenantId,
            numero: (ultimo?.numero ?? 0) + 1,
            clientId,
            nombre,
            servicio,
            evento: txt(formData.get("evento")) || null,
            lugar: txt(formData.get("lugar")) || null,
            fechaArmado: fecha(formData.get("fechaArmado")),
            fechaEvento: fecha(formData.get("fechaEvento")),
            fechaDesarme: fecha(formData.get("fechaDesarme")),
            responsable: txt(formData.get("responsable")) || null,
            brief: txt(formData.get("brief")),
          },
          select: { id: true, numero: true },
        });
      });
      await auditAdmin({ action: "proyecto.crear", entity: "Proyecto", entityId: creado.id, changes: { numero: creado.numero, servicio } });
      refrescar();
      return { ok: true, id: creado.id };
    } catch (e) {
      if (e instanceof Error && e.message === "CLIENTE") return { ok: false, error: "Ese cliente no existe." };
      // Dos altas a la vez chocan en el número: se reintenta con el siguiente.
      if ((e as { code?: string }).code === "P2002" && intento < 2) continue;
      throw e;
    }
  }
  return { ok: false, error: "No se pudo crear el proyecto. Probá de nuevo." };
}

export async function guardarDatosProyecto(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const nombre = txt(formData.get("nombre"));
  if (!nombre) return;
  await prisma.proyecto.updateMany({
    where: { id, tenantId },
    data: {
      nombre,
      evento: txt(formData.get("evento")) || null,
      lugar: txt(formData.get("lugar")) || null,
      fechaArmado: fecha(formData.get("fechaArmado")),
      fechaEvento: fecha(formData.get("fechaEvento")),
      fechaDesarme: fecha(formData.get("fechaDesarme")),
      responsable: txt(formData.get("responsable")) || null,
      brief: txt(formData.get("brief")),
    },
  });
  refrescar(id);
}

export async function moverEtapa(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const etapa = txt(formData.get("etapa"));
  const p = await proyectoDelNegocio(id, tenantId);
  if (!p || !esEtapa(etapa) || !etapasDe(p.servicio).includes(etapa)) return;
  await prisma.proyecto.updateMany({ where: { id, tenantId }, data: { etapa } });
  await auditAdmin({ action: "proyecto.etapa", entity: "Proyecto", entityId: id, changes: { de: p.etapa, a: etapa } });
  refrescar(id);
}

// ── Tareas ──────────────────────────────────────────────────────────────────

export async function agregarTarea(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const proyectoId = txt(formData.get("proyectoId"));
  const titulo = txt(formData.get("titulo"));
  if (!titulo || !(await proyectoDelNegocio(proyectoId, tenantId))) return;
  await prisma.proyectoTarea.create({
    data: { tenantId, proyectoId, titulo, responsable: txt(formData.get("responsable")) || null, venceEl: fecha(formData.get("venceEl")) },
  });
  refrescar(proyectoId);
}

export async function alternarTarea(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const t = await prisma.proyectoTarea.findFirst({ where: { id, tenantId }, select: { proyectoId: true, hechaEl: true } });
  if (!t) return;
  await prisma.proyectoTarea.updateMany({ where: { id, tenantId }, data: { hechaEl: t.hechaEl ? null : new Date() } });
  refrescar(t.proyectoId);
}

// ── Archivos ────────────────────────────────────────────────────────────────

/** Imagen ya achicada en el navegador, o link a lo pesado (PDF, CAD, video) en la nube del negocio. */
export async function agregarArchivo(d: {
  proyectoId: string;
  tipo: string;
  nombre: string;
  datos?: string | null;
  url?: string | null;
  visibleCliente?: boolean;
}): Promise<Resultado<{ id: string }>> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  if (!(await proyectoDelNegocio(d.proyectoId, tenantId))) return { ok: false, error: "Ese proyecto no existe." };
  const tipo = ["RENDER", "DISENO", "PLANO", "REFERENCIA", "OTRO"].includes(d.tipo) ? d.tipo : "OTRO";
  const nombre = (d.nombre ?? "").trim().slice(0, 120) || "Archivo";
  const url = (d.url ?? "").trim();
  if (d.datos ? !imagenValida(d.datos) : !urlValida(url)) {
    return { ok: false, error: d.datos ? "La imagen es demasiado pesada o no es válida." : "Pegá un link que empiece con https://." };
  }
  const cuantos = await prisma.proyectoArchivo.count({ where: { tenantId, proyectoId: d.proyectoId } });
  if (cuantos >= MAX_ARCHIVOS) return { ok: false, error: `Un proyecto guarda hasta ${MAX_ARCHIVOS} archivos. Sacá alguno que ya no uses.` };
  const a = await prisma.proyectoArchivo.create({
    data: { tenantId, proyectoId: d.proyectoId, tipo, nombre, datos: d.datos || null, url: d.datos ? null : url, visibleCliente: !!d.visibleCliente && !!d.datos, subidoPor: user.name },
    select: { id: true },
  });
  refrescar(d.proyectoId);
  return { ok: true, id: a.id };
}

export async function alternarVisibleArchivo(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const a = await prisma.proyectoArchivo.findFirst({ where: { id, tenantId }, select: { proyectoId: true, visibleCliente: true, datos: true } });
  if (!a || !a.datos) return;
  await prisma.proyectoArchivo.updateMany({ where: { id, tenantId }, data: { visibleCliente: !a.visibleCliente } });
  refrescar(a.proyectoId);
}

export async function borrarArchivo(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const a = await prisma.proyectoArchivo.findFirst({ where: { id, tenantId }, select: { proyectoId: true, nombre: true } });
  if (!a) return;
  await prisma.proyectoArchivo.deleteMany({ where: { id, tenantId } });
  await auditAdmin({ action: "proyecto.archivo.borrar", entity: "ProyectoArchivo", entityId: id, changes: { nombre: a.nombre } });
  refrescar(a.proyectoId);
}

// ── Presupuesto ─────────────────────────────────────────────────────────────

async function presupuestoDelNegocio(id: string, tenantId: string) {
  return prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, select: { id: true, proyectoId: true, estado: true, version: true } });
}

export async function nuevaVersionPresupuesto(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const proyectoId = txt(formData.get("proyectoId"));
  const p = await proyectoDelNegocio(proyectoId, tenantId);
  if (!p) return;
  const config = await configProyectos(tenantId);
  await tenantTransaction(async (tx) => {
    const ultima = await tx.proyectoPresupuesto.findFirst({
      where: { tenantId, proyectoId },
      orderBy: { version: "desc" },
      include: { items: { orderBy: { posicion: "asc" } } },
    });
    // Ya hay un borrador abierto: se sigue con ése, no se abren dos.
    if (ultima?.estado === "BORRADOR") return;
    const nueva = await tx.proyectoPresupuesto.create({
      data: {
        tenantId,
        proyectoId,
        version: (ultima?.version ?? 0) + 1,
        token: token(),
        ivaPct: ultima?.ivaPct ?? config.ivaPct,
        presentacion: ultima?.presentacion ?? "",
        condiciones: ultima?.condiciones || config.condiciones,
      },
    });
    if (ultima?.items.length) {
      await tx.proyectoItem.createMany({
        data: ultima.items.map((i) => ({
          tenantId,
          presupuestoId: nueva.id,
          rubro: i.rubro,
          descripcion: i.descripcion,
          unidad: i.unidad,
          cantidad: i.cantidad,
          costo: i.costo,
          precio: i.precio,
          proveedor: i.proveedor,
          origen: i.origen,
          posicion: i.posicion,
        })),
      });
    }
  });
  refrescar(proyectoId);
}

export async function agregarItem(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const presupuestoId = txt(formData.get("presupuestoId"));
  const pr = await presupuestoDelNegocio(presupuestoId, tenantId);
  const descripcion = txt(formData.get("descripcion"));
  if (!pr || !sePuedeEditar(pr.estado) || !descripcion) return;
  const costo = Math.max(0, numero(formData.get("costo")));
  const { margenPct } = await configProyectos(tenantId);
  const precioCargado = numero(formData.get("precio"));
  await prisma.proyectoItem.create({
    data: {
      tenantId,
      presupuestoId,
      rubro: txt(formData.get("rubro")) || "General",
      descripcion,
      unidad: txt(formData.get("unidad")) || "u",
      cantidad: Math.max(0, numero(formData.get("cantidad"))) || 1,
      costo,
      // Sin precio cargado, sale del costo más el margen de la configuración.
      precio: precioCargado > 0 ? redondear(precioCargado) : precioConMargen(costo, margenPct),
      proveedor: txt(formData.get("proveedor")) || null,
      posicion: await prisma.proyectoItem.count({ where: { tenantId, presupuestoId } }),
    },
  });
  refrescar(pr.proyectoId);
}

export async function borrarItem(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const it = await prisma.proyectoItem.findFirst({ where: { id, tenantId }, select: { presupuesto: { select: { estado: true, proyectoId: true } } } });
  if (!it || !sePuedeEditar(it.presupuesto.estado)) return;
  await prisma.proyectoItem.deleteMany({ where: { id, tenantId } });
  refrescar(it.presupuesto.proyectoId);
}

export async function guardarTextosPresupuesto(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await presupuestoDelNegocio(id, tenantId);
  if (!pr || !sePuedeEditar(pr.estado)) return;
  await prisma.proyectoPresupuesto.updateMany({
    where: { id, tenantId },
    data: { presentacion: txt(formData.get("presentacion")), condiciones: txt(formData.get("condiciones")), ivaPct: Math.max(0, numero(formData.get("ivaPct"))) },
  });
  refrescar(pr.proyectoId);
}

/** Enviar congela la versión y la vuelve visible en su link. Las versiones anteriores abiertas quedan reemplazadas. */
export async function enviarPropuesta(formData: FormData): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await presupuestoDelNegocio(id, tenantId);
  if (!pr || !sePuedeEditar(pr.estado)) return;
  if ((await prisma.proyectoItem.count({ where: { tenantId, presupuestoId: id } })) === 0) return;
  const { validezDias } = await configProyectos(tenantId);
  const ahora = new Date();
  await tenantTransaction(async (tx) => {
    await tx.proyectoPresupuesto.updateMany({
      where: { tenantId, proyectoId: pr.proyectoId, estado: "ENVIADO", id: { not: id } },
      data: { estado: "REEMPLAZADO" },
    });
    await tx.proyectoPresupuesto.updateMany({ where: { id, tenantId, estado: "BORRADOR" }, data: { estado: "ENVIADO", enviadoEl: ahora, validoHasta: sumarDias(ahora, validezDias) } });
    await tx.proyecto.updateMany({ where: { id: pr.proyectoId, tenantId, etapa: { in: ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO"] } }, data: { etapa: "PROPUESTA" } });
  });
  await auditAdmin({ action: "proyecto.propuesta.enviar", entity: "ProyectoPresupuesto", entityId: id, changes: { version: pr.version } });
  refrescar(pr.proyectoId);
}

/** El cliente responde desde su link, sin login: la llave es el token y sólo vale una vez. */
export async function responderPropuesta(d: { token: string; aprueba: boolean; nombre: string; motivo?: string }): Promise<Resultado> {
  const tenantId = await getCurrentTenantId();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(d.token ?? "")) return { ok: false, error: "El link no es válido." };
  const nombre = (d.nombre ?? "").trim().slice(0, 120);
  if (!nombre) return { ok: false, error: "Escribí tu nombre para dejar constancia." };
  const pr = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId, token: d.token },
    select: { id: true, estado: true, validoHasta: true, proyectoId: true, proyecto: { select: { servicio: true, etapa: true } } },
  });
  if (!pr) return { ok: false, error: "El link no es válido." };
  if (!clientePuedeResponder(pr)) return { ok: false, error: "Esta propuesta ya no se puede responder. Escribinos y la actualizamos." };
  const ganada = await tenantTransaction(async (tx) => {
    // El estado va en el where: dos clics a la vez no responden dos veces.
    const r = await tx.proyectoPresupuesto.updateMany({
      where: { id: pr.id, tenantId, estado: "ENVIADO" },
      data: { estado: d.aprueba ? "APROBADO" : "RECHAZADO", respondidoEl: new Date(), respondidoPor: nombre, motivoRechazo: d.aprueba ? null : (d.motivo ?? "").trim().slice(0, 500) || null },
    });
    if (r.count === 0) return false;
    if (d.aprueba) {
      await tx.proyecto.updateMany({ where: { id: pr.proyectoId, tenantId }, data: { etapa: etapaAlAprobar(pr.proyecto.servicio, pr.proyecto.etapa) } });
    }
    return true;
  });
  if (!ganada) return { ok: false, error: "Esta propuesta ya fue respondida." };
  await auditPublic({ action: d.aprueba ? "proyecto.propuesta.aprobar" : "proyecto.propuesta.rechazar", entity: "ProyectoPresupuesto", entityId: pr.id, changes: { nombre } });
  revalidatePath(`/propuesta/${d.token}`);
  refrescar(pr.proyectoId);
  return { ok: true };
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export async function registrarCobro(formData: FormData) {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const proyectoId = txt(formData.get("proyectoId"));
  const medio = txt(formData.get("medio")) as MedioPago;
  const monto = redondear(numero(formData.get("monto")));
  if (!MEDIOS.includes(medio) || monto <= 0) return;
  const p = await proyectoDelNegocio(proyectoId, tenantId);
  if (!p) return;
  const nota = txt(formData.get("nota")) || null;
  // El cobro y su asiento en el libro de caja van juntos: o entran los dos o ninguno.
  const pago = await tenantTransaction(async (tx) => {
    const creado = await tx.proyectoPago.create({ data: { tenantId, proyectoId, medio, monto, nota, cobradoPor: user.name }, select: { id: true } });
    const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: session?.id ?? null,
        type: "VENTA",
        method: metodoDeCaja(medio),
        amount: monto,
        reason: `Proyecto #${p.numero} · ${p.nombre}${nota ? ` · ${nota}` : ""}`,
        proyectoPagoId: creado.id,
        createdBy: user.name,
      },
    });
    return creado;
  });
  await auditAdmin({ action: "proyecto.cobro", entity: "ProyectoPago", entityId: pago.id, changes: { monto, medio } });
  refrescar(proyectoId);
}

/** Anular no borra: escribe la contrapartida con fecha de hoy, como el taller. Un día cerrado no se reescribe. */
export async function anularCobro(formData: FormData) {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pago = await prisma.proyectoPago.findFirst({ where: { id, tenantId }, select: { id: true, proyectoId: true, anuladoEl: true, monto: true, proyecto: { select: { numero: true } } } });
  if (!pago || pago.anuladoEl) return;
  await tenantTransaction(async (tx) => {
    const r = await tx.proyectoPago.updateMany({ where: { id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: user.name } });
    if (r.count === 0) return;
    const venta = await tx.cashMovement.findFirst({ where: { tenantId, proyectoPagoId: id, type: "VENTA" }, select: { amount: true, method: true } });
    if (!venta) return;
    const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: session?.id ?? null,
        type: "EGRESO",
        method: venta.method,
        amount: venta.amount,
        reason: `Anulación · Proyecto #${pago.proyecto.numero}`,
        proyectoPagoId: id,
        createdBy: user.name,
      },
    });
  });
  await auditAdmin({ action: "proyecto.cobro.anular", entity: "ProyectoPago", entityId: id, changes: { monto: pago.monto } });
  refrescar(pago.proyectoId);
}

// ── Armador de stands ───────────────────────────────────────────────────────

export async function crearStand(formData: FormData): Promise<Resultado<{ id: string; proyectoId: string }>> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const proyectoId = txt(formData.get("proyectoId"));
  if (!(await proyectoDelNegocio(proyectoId, tenantId))) return { ok: false, error: "Ese proyecto no existe." };
  const cuantos = await prisma.proyectoStand.count({ where: { tenantId, proyectoId } });
  const diseno = disenoInicial(TIPOS_STAND[1]);
  const s = await prisma.proyectoStand.create({
    data: { tenantId, proyectoId, nombre: cuantos ? `Opción ${cuantos + 1}` : "Opción 1", diseno: diseno as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  refrescar(proyectoId);
  return { ok: true, id: s.id, proyectoId };
}

export async function guardarStand(d: { id: string; nombre: string; diseno: DisenoStand }): Promise<Resultado> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const diseno = normalizarDiseno(d.diseno);
  if (!diseno) return { ok: false, error: "El diseño no es válido." };
  const r = await prisma.proyectoStand.updateMany({
    where: { id: d.id, tenantId },
    data: { nombre: (d.nombre ?? "").trim().slice(0, 80) || "Stand", diseno: diseno as unknown as Prisma.InputJsonValue },
  });
  if (r.count === 0) return { ok: false, error: "Ese stand no existe." };
  return { ok: true };
}

/** Pasa el cómputo del stand al presupuesto en borrador. Reemplaza lo que vino de ESTE stand, no lo cargado a mano. */
export async function computoAlPresupuesto(d: { standId: string }): Promise<Resultado<{ lineas: number; proyectoId: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const stand = await prisma.proyectoStand.findFirst({ where: { id: d.standId, tenantId }, select: { id: true, nombre: true, proyectoId: true, diseno: true } });
  const diseno = stand && normalizarDiseno(stand.diseno);
  if (!stand || !diseno) return { ok: false, error: "Ese stand no existe." };
  const config = await configProyectos(tenantId);
  const origen = `stand:${stand.id}`;
  const lineas = computar(diseno);
  await tenantTransaction(async (tx) => {
    let borrador = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId: stand.proyectoId, estado: "BORRADOR" }, select: { id: true } });
    if (!borrador) {
      const ultima = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId: stand.proyectoId }, orderBy: { version: "desc" }, select: { version: true } });
      borrador = await tx.proyectoPresupuesto.create({
        data: { tenantId, proyectoId: stand.proyectoId, version: (ultima?.version ?? 0) + 1, token: token(), ivaPct: config.ivaPct, condiciones: config.condiciones },
        select: { id: true },
      });
    }
    await tx.proyectoItem.deleteMany({ where: { tenantId, presupuestoId: borrador.id, origen } });
    const base = await tx.proyectoItem.count({ where: { tenantId, presupuestoId: borrador.id } });
    await tx.proyectoItem.createMany({
      data: lineas.map((l, i) => ({
        tenantId,
        presupuestoId: borrador.id,
        rubro: l.rubro,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        costo: config.costos[l.clave],
        precio: precioConMargen(config.costos[l.clave], config.margenPct),
        
        origen,
        posicion: base + i,
      })),
    });
  });
  refrescar(stand.proyectoId);
  return { ok: true, lineas: lineas.length, proyectoId: stand.proyectoId };
}

// ── Configuración ───────────────────────────────────────────────────────────

export async function guardarConfig(formData: FormData) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const costos: Partial<Record<ClaveCosto, number>> = {};
  for (const k of Object.keys(COSTO_LABEL) as ClaveCosto[]) {
    const v = formData.get(`costo_${k}`);
    if (v !== null) costos[k] = Math.max(0, numero(v));
  }
  const data = {
    margenPct: Math.max(0, numero(formData.get("margenPct"))),
    validezDias: Math.max(1, Math.round(numero(formData.get("validezDias"))) || 15),
    ivaPct: Math.max(0, numero(formData.get("ivaPct"))),
    condiciones: txt(formData.get("condiciones")),
    costosStand: costosVigentes(costos) as unknown as Prisma.InputJsonValue,
  };
  await prisma.proyectoConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await auditAdmin({ action: "proyecto.config", entity: "ProyectoConfig", entityId: tenantId, changes: { margenPct: data.margenPct, validezDias: data.validezDias, ivaPct: data.ivaPct } });
  revalidatePath(`${RAIZ}/config`);
}
