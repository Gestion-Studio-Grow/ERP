"use server";

// ============================================================================
// MIA T06 · PRESUPUESTO — líneas con sector, categoría y personal (O08), anticipo por línea y previsión de pagos (O12),
// y adicionales con aprobación interna y del cliente (O09, O11). Cada acción vuelve a pedir el permiso de su módulo y que
// el proyecto sea visible. Sin M2 aplicada (Gate 2) responden «falta la migración» y el resto del sistema sigue igual.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { sePuedeEditar } from "./core";
import { numeroDe } from "./ficha-core";
import type { ModuloGestion } from "./gestion-core";
import { actorActual, proyectoVisible, puede, regenerarCuotas, registrarCambio, type Actor } from "./gestion.server";
import { valoresDelNegocio } from "./parametros/leer.server";
import { aCentavos, errorDeAnticipo, errorDeAprobador, errorDeListas, errorDeMarcaPrevision, errorDePersonal, esPersonal, ESTADO_ADICIONAL_LABEL, type EstadoAdicional } from "./presupuesto-core";
import { FALTA_M2, hayM2 } from "./presupuesto-m2.server";

export type ResultadoPresupuesto = { ok: true; listo?: string } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const mal = (error: string) => ({ ok: false as const, error });
const refrescar = (id: string) => {
  revalidatePath(RAIZ);
  revalidatePath(`${RAIZ}/${id}`);
};

/** Un número opcional del formulario: vacío = null; mal escrito = NaN (se rechaza). */
const opcional = (v: FormDataEntryValue | null): number | null => {
  const s = txt(v);
  if (!s) return null;
  return numeroDe(s) ?? Number.NaN;
};

async function entrar(modulos: readonly ModuloGestion[], proyectoId: string): Promise<Actor | string> {
  const a = await actorActual();
  if (!modulos.some((m) => puede(a, m, "editar"))) return "No tenés permiso para hacer esto.";
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) return "Ese proyecto no existe.";
  if (!(await hayM2())) return FALTA_M2;
  return a;
}

/** Dos guardados casi juntos pueden chocar creando la misma cuota: el segundo intento ya la encuentra. */
async function regenerar(tenantId: string, proyectoId: string) {
  try {
    await regenerarCuotas(tenantId, proyectoId);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    await regenerarCuotas(tenantId, proyectoId);
  }
}

async function listasDelNegocio(tenantId: string) {
  const v = await valoresDelNegocio(tenantId);
  return { sectores: v["costos.sectores"], categorias: v["costos.categorias"] };
}

const personalDe = (formData: FormData) => ({ puestos: opcional(formData.get("puestos")), horas: opcional(formData.get("horas")), dias: opcional(formData.get("dias")) });

// ── Línea del presupuesto base (O08) ─────────────────────────────────────────

/**
 * Sector, categoría y personal de una línea del borrador. El personal define la cantidad (puestos × horas × días): así el
 * subtotal y el total de la versión salen de la misma cuenta que el resto de la ficha.
 */
export async function guardarLineaDetalle(formData: FormData): Promise<ResultadoPresupuesto> {
  const tId = await getCurrentTenantId();
  const itemId = txt(formData.get("itemId"));
  const item = await prisma.proyectoItem.findFirst({ where: { id: itemId, tenantId: tId }, select: { id: true, descripcion: true, cantidad: true, presupuesto: { select: { proyectoId: true, estado: true } } } });
  if (!item) return mal("Esa línea no existe.");
  const proyectoId = item.presupuesto.proyectoId;
  const a = await entrar(["cotizaciones", "ficha"], proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(item.presupuesto.estado)) return mal("Esta versión ya se envió: un cambio después de aprobado va como adicional.");
  const sector = txt(formData.get("sector"));
  const categoria = txt(formData.get("categoria"));
  const personal = personalDe(formData);
  const error = errorDeListas({ sector, categoria }, await listasDelNegocio(tId)) ?? errorDePersonal(personal);
  if (error) return mal(error);
  const cantidad = esPersonal(personal) ? personal.puestos! * personal.horas! * personal.dias! : null;
  await tenantTransaction(async (tx) => {
    const antes = await tx.proyectoLineaDetalle.findUnique({ where: { itemId }, select: { sector: true, categoria: true, puestos: true, horas: true, dias: true } });
    await tx.proyectoLineaDetalle.upsert({
      where: { itemId },
      create: { tenantId: tId, itemId, sector, categoria, ...personal },
      update: { sector, categoria, ...personal },
    });
    if (cantidad != null && cantidad !== item.cantidad) await tx.proyectoItem.updateMany({ where: { id: itemId, tenantId: tId }, data: { cantidad } });
    const resumen = (d: { sector: string | null; categoria: string | null; puestos: number | null; horas: number | null; dias: number | null } | null) =>
      d ? [d.sector, d.categoria, d.puestos ? `${d.puestos} puestos × ${d.horas} h × ${d.dias} días` : null].filter(Boolean).join(" · ") : null;
    await registrarCambio(tx, { tenantId: tId, proyectoId, entidad: "ProyectoItem", entidadId: itemId, campo: `Línea «${item.descripcion}»`, antes: resumen(antes), despues: resumen({ sector, categoria, ...personal }), autor: a.nombre });
  });
  // MIA-199 · P1-1: puestos × horas × días cambia la cantidad: las cuotas previstas se ponen al día (antes quedaban viejas).
  if (cantidad != null && cantidad !== item.cantidad) await regenerar(tId, proyectoId);
  refrescar(proyectoId);
  return { ok: true, listo: "Listo: guardaste la línea." };
}

/**
 * El % de anticipo de una línea (el saldo es el resto). Vale también con la versión aprobada: es el plan de pago al
 * proveedor, no el precio. Regenera sólo las dos cuotas de esa línea: lo ya pagado no se toca (`aplicarPlan`).
 */
export async function guardarAnticipoLinea(formData: FormData): Promise<ResultadoPresupuesto> {
  const tenantId = await getCurrentTenantId();
  const itemId = txt(formData.get("itemId"));
  const item = await prisma.proyectoItem.findFirst({ where: { id: itemId, tenantId }, select: { id: true, descripcion: true, presupuesto: { select: { proyectoId: true } } } });
  if (!item) return mal("Esa línea no existe.");
  const proyectoId = item.presupuesto.proyectoId;
  const a = await entrar(["cotizaciones", "pagos"], proyectoId);
  if (typeof a === "string") return mal(a);
  const pct = opcional(formData.get("anticipoPct"));
  if (pct != null) {
    const error = errorDeAnticipo(pct);
    if (error) return mal(error);
  }
  await tenantTransaction(async (tx) => {
    const antes = await tx.proyectoLineaDetalle.findUnique({ where: { itemId }, select: { anticipoPct: true } });
    await tx.proyectoLineaDetalle.upsert({ where: { itemId }, create: { tenantId, itemId, anticipoPct: pct }, update: { anticipoPct: pct } });
    const texto = (v: number | null | undefined) => (v == null ? "el del proveedor" : `${v} % anticipo · ${100 - v} % saldo`);
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoItem", entidadId: itemId, campo: `Anticipo de «${item.descripcion}»`, antes: texto(antes?.anticipoPct), despues: texto(pct), autor: a.nombre });
  });
  await regenerar(tenantId, proyectoId);
  refrescar(proyectoId);
  return { ok: true, listo: "Listo: cambiaste el anticipo de la línea." };
}

// ── Previsión de pagos (O12) ──────────────────────────────────────────────────

/** Los dos estados de Administración en una cuota de pago. Cada marca deja una fila en el historial. */
export async function marcarPrevision(formData: FormData): Promise<ResultadoPresupuesto> {
  const tenantId = await getCurrentTenantId();
  const cuotaId = txt(formData.get("cuotaId"));
  const confirmado = txt(formData.get("estado")) === "confirmado";
  const cuota = await prisma.proyectoCuota.findFirst({ where: { id: cuotaId, tenantId, tipo: "PAGO", anuladoEl: null }, select: { id: true, proyectoId: true, concepto: true } });
  if (!cuota?.proyectoId) return mal("Esa cuota no existe.");
  const a = await entrar(["pagos"], cuota.proyectoId);
  if (typeof a === "string") return mal(a);
  const error = errorDeMarcaPrevision(a.rol);
  if (error) return mal(error);
  const palabras = (await valoresDelNegocio(tenantId))["prevision.palabras"];
  const palabra = (c: boolean) => (c ? palabras.confirmado : palabras.sinConfirmar);
  const cambio = await tenantTransaction(async (tx) => {
    const antes = await tx.proyectoPrevisionEstado.findUnique({ where: { cuotaId }, select: { confirmado: true } });
    if ((antes?.confirmado ?? false) === confirmado) return false;
    const marca = { confirmado, marcadoPor: a.user.id, marcadoNombre: a.nombre, marcadoEl: new Date() };
    await tx.proyectoPrevisionEstado.upsert({ where: { cuotaId }, create: { tenantId, cuotaId, ...marca }, update: marca });
    await registrarCambio(tx, { tenantId, proyectoId: cuota.proyectoId, entidad: "ProyectoCuota", entidadId: cuotaId, campo: `Previsión · ${cuota.concepto}`, antes: palabra(antes?.confirmado ?? false), despues: palabra(confirmado), autor: a.nombre });
    return true;
  });
  if (!cambio) return mal(`Esa cuota ya estaba en «${palabra(confirmado)}».`);
  refrescar(cuota.proyectoId);
  return { ok: true, listo: `Listo: quedó «${palabra(confirmado)}».` };
}

// ── Adicionales (O09, O11) ────────────────────────────────────────────────────

/** Un adicional es un presupuesto aparte: nace en borrador, y sólo cuando el proyecto ya tiene su base aprobada. */
export async function crearAdicional(formData: FormData): Promise<ResultadoPresupuesto> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(["cotizaciones"], proyectoId);
  if (typeof a === "string") return mal(a);
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  if (!nombre) return mal("Escribí qué es el adicional (por ejemplo, «Pantalla extra»).");
  const { tenantId } = a;
  const base = await prisma.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId, estado: "APROBADO" }, select: { ivaPct: true } });
  if (!base) return mal("El adicional va después de aprobada la versión base: mientras tanto, cambiá la versión en borrador.");
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    try {
      const numero = await tenantTransaction(async (tx) => {
        const ultimo = await tx.proyectoAdicional.findFirst({ where: { tenantId, proyectoId }, orderBy: { numero: "desc" }, select: { numero: true } });
        const n = (ultimo?.numero ?? 0) + 1;
        const ad = await tx.proyectoAdicional.create({ data: { tenantId, proyectoId, numero: n, nombre, ivaPct: base.ivaPct, creadoPor: a.nombre } });
        await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: "Adicional nuevo", despues: `Adicional ${n} · ${nombre}`, autor: a.nombre });
        return n;
      });
      refrescar(proyectoId);
      return { ok: true, listo: `Listo: creaste el adicional ${numero}.` };
    } catch (e) {
      // Dos «nuevo adicional» a la vez: el número choca y se vuelve a tomar.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return mal("No se pudo numerar el adicional: probá de nuevo.");
}

/** La puerta la escribe cada acción (con `entrar` y sus módulos): así la lee `matriz-permisos.test.ts`. */
async function adicionalEditable(id: string, puerta: (proyectoId: string) => Promise<Actor | string>) {
  const tenantId = await getCurrentTenantId();
  const ad = await prisma.proyectoAdicional.findFirst({ where: { id, tenantId }, select: { id: true, proyectoId: true, numero: true, estado: true, nombre: true } }).catch(() => null);
  if (!ad) return "Ese adicional no existe.";
  const a = await puerta(ad.proyectoId);
  if (typeof a === "string") return a;
  return { a, ad, tenantId };
}

/** Una línea del adicional. Cambiar precios borra la aprobación interna: lo aprobado tiene que ser lo que se envía. */
export async function agregarLineaAdicional(formData: FormData): Promise<ResultadoPresupuesto> {
  const r = await adicionalEditable(txt(formData.get("adicionalId")), (p) => entrar(["cotizaciones"], p));
  if (typeof r === "string") return mal(r);
  const { a, ad, tenantId } = r;
  if (ad.estado !== "BORRADOR") return mal("Este adicional ya se envió.");
  const sector = txt(formData.get("sector"));
  const categoria = txt(formData.get("categoria"));
  const detalle = txt(formData.get("detalle")).slice(0, 200);
  const personal = personalDe(formData);
  const cantidad = opcional(formData.get("cantidad")) ?? 1;
  const costo = opcional(formData.get("costo")) ?? 0;
  const precio = opcional(formData.get("precio")) ?? 0;
  const anticipoPct = opcional(formData.get("anticipoPct"));
  if (!detalle) return mal("Escribí el detalle de la línea.");
  const error =
    errorDeListas({ sector, categoria }, await listasDelNegocio(tenantId)) ??
    errorDePersonal(personal) ??
    (Number.isNaN(cantidad) || cantidad <= 0 ? "La cantidad tiene que ser mayor que cero." : null) ??
    (Number.isNaN(costo) || Number.isNaN(precio) ? "Revisá el costo y el precio: son importes en pesos." : null) ??
    (anticipoPct != null ? errorDeAnticipo(anticipoPct) : null);
  if (error) return mal(error);
  const supplierId = txt(formData.get("supplierId")) || null;
  const proveedor = supplierId ? await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } }) : null;
  if (supplierId && !proveedor) return mal("Ese proveedor no existe.");
  await tenantTransaction(async (tx) => {
    const n = await tx.proyectoAdicionalLinea.count({ where: { tenantId, adicionalId: ad.id } });
    await tx.proyectoAdicionalLinea.create({
      data: { tenantId, adicionalId: ad.id, sector, categoria, detalle, supplierId: proveedor?.id ?? null, proveedor: proveedor?.name ?? null, cantidad, ...personal, costoCentavos: BigInt(aCentavos(costo)), precioCentavos: BigInt(aCentavos(precio)), anticipoPct, posicion: n },
    });
    await tx.proyectoAdicional.updateMany({ where: { id: ad.id, tenantId, estado: "BORRADOR" }, data: { aprobadoInternoPor: null, aprobadoInternoPorId: null, aprobadoInternoEl: null } });
    await registrarCambio(tx, { tenantId, proyectoId: ad.proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: `Adicional ${ad.numero} · línea nueva`, despues: detalle, autor: a.nombre });
  });
  refrescar(ad.proyectoId);
  return { ok: true, listo: "Listo: agregaste la línea." };
}

export async function borrarLineaAdicional(formData: FormData): Promise<ResultadoPresupuesto> {
  const r = await adicionalEditable(txt(formData.get("adicionalId")), (p) => entrar(["cotizaciones"], p));
  if (typeof r === "string") return mal(r);
  const { a, ad, tenantId } = r;
  if (ad.estado !== "BORRADOR") return mal("Este adicional ya se envió.");
  const lineaId = txt(formData.get("lineaId"));
  const borro = await tenantTransaction(async (tx) => {
    const l = await tx.proyectoAdicionalLinea.findFirst({ where: { id: lineaId, tenantId, adicionalId: ad.id }, select: { detalle: true } });
    if (!l) return false;
    await tx.proyectoAdicionalLinea.deleteMany({ where: { id: lineaId, tenantId } });
    await tx.proyectoAdicional.updateMany({ where: { id: ad.id, tenantId, estado: "BORRADOR" }, data: { aprobadoInternoPor: null, aprobadoInternoPorId: null, aprobadoInternoEl: null } });
    await registrarCambio(tx, { tenantId, proyectoId: ad.proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: `Adicional ${ad.numero} · línea borrada`, antes: l.detalle, autor: a.nombre });
    return true;
  });
  if (!borro) return mal("Esa línea no existe.");
  refrescar(ad.proyectoId);
  return { ok: true };
}

/** O09: sólo Dirección, y alguien que no esté en el equipo del proyecto. Queda quién y cuándo. */
export async function aprobarAdicionalInterno(formData: FormData): Promise<ResultadoPresupuesto> {
  const r = await adicionalEditable(txt(formData.get("adicionalId")), (p) => entrar(["cotizaciones"], p));
  if (typeof r === "string") return mal(r);
  const { a, ad, tenantId } = r;
  const enElEquipo = !!a.personaId && (await prisma.proyectoEquipo.count({ where: { tenantId, proyectoId: ad.proyectoId, personaId: a.personaId } })) > 0;
  const error = errorDeAprobador({ rol: a.rol, enElEquipo });
  if (error) return mal(error);
  if (ad.estado !== "BORRADOR") return mal("Este adicional ya se envió.");
  const aprobo = await tenantTransaction(async (tx) => {
    if ((await tx.proyectoAdicionalLinea.count({ where: { tenantId, adicionalId: ad.id } })) === 0) return "vacio" as const;
    const u = await tx.proyectoAdicional.updateMany({ where: { id: ad.id, tenantId, estado: "BORRADOR" }, data: { aprobadoInternoPor: a.nombre, aprobadoInternoPorId: a.user.id, aprobadoInternoEl: new Date() } });
    if (u.count === 0) return false;
    await registrarCambio(tx, { tenantId, proyectoId: ad.proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: `Adicional ${ad.numero} · aprobación interna`, despues: a.nombre, autor: a.nombre });
    return true;
  });
  if (aprobo === "vacio") return mal("Cargá al menos una línea antes de aprobar.");
  if (!aprobo) return mal("Este adicional cambió mientras aprobabas. Recargá la página.");
  refrescar(ad.proyectoId);
  return { ok: true, listo: `Listo: aprobaste el adicional ${ad.numero}.` };
}

/** Sin aprobación interna no sale (O09). */
export async function enviarAdicional(formData: FormData): Promise<ResultadoPresupuesto> {
  const r = await adicionalEditable(txt(formData.get("adicionalId")), (p) => entrar(["cotizaciones"], p));
  if (typeof r === "string") return mal(r);
  const { a, ad, tenantId } = r;
  const envio = await tenantTransaction(async (tx) => {
    const actual = await tx.proyectoAdicional.findFirst({ where: { id: ad.id, tenantId }, select: { estado: true, aprobadoInternoEl: true, _count: { select: { lineas: true } } } });
    if (!actual || actual.estado !== "BORRADOR") return "Este adicional ya se envió.";
    if (actual._count.lineas === 0) return "Cargá al menos una línea antes de enviar.";
    if (!actual.aprobadoInternoEl) return "Falta la aprobación interna: lo aprueba alguien de Dirección que no esté en el equipo.";
    const u = await tx.proyectoAdicional.updateMany({ where: { id: ad.id, tenantId, estado: "BORRADOR", aprobadoInternoEl: { not: null } }, data: { estado: "ENVIADO", enviadoEl: new Date() } });
    if (u.count === 0) return "Este adicional cambió mientras lo enviabas. Recargá la página.";
    await registrarCambio(tx, { tenantId, proyectoId: ad.proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: `Adicional ${ad.numero}`, antes: ESTADO_ADICIONAL_LABEL.BORRADOR, despues: ESTADO_ADICIONAL_LABEL.ENVIADO, autor: a.nombre });
    return null;
  });
  if (envio) return mal(envio);
  refrescar(ad.proyectoId);
  return { ok: true, listo: `Listo: el adicional ${ad.numero} quedó enviado al cliente.` };
}

/** La respuesta del cliente. Al aprobarse suma sus cuotas y sube el tope de cobro (O11); las del base no cambian. */
export async function responderAdicional(formData: FormData): Promise<ResultadoPresupuesto> {
  const r = await adicionalEditable(txt(formData.get("adicionalId")), (p) => entrar(["cotizaciones"], p));
  if (typeof r === "string") return mal(r);
  const { a, ad, tenantId } = r;
  const aprueba = txt(formData.get("respuesta")) === "APROBADO";
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  const motivo = txt(formData.get("motivo")).slice(0, 500);
  if (!nombre) return mal("Escribí quién respondió.");
  if (!aprueba && !motivo) return mal("Escribí qué pidió cambiar el cliente.");
  const nuevo: EstadoAdicional = aprueba ? "APROBADO" : "RECHAZADO";
  const respondio = await tenantTransaction(async (tx) => {
    const u = await tx.proyectoAdicional.updateMany({ where: { id: ad.id, tenantId, estado: "ENVIADO" }, data: { estado: nuevo, respondidoEl: new Date(), respondidoPor: nombre, motivoRechazo: aprueba ? null : motivo } });
    if (u.count === 0) return false;
    await registrarCambio(tx, { tenantId, proyectoId: ad.proyectoId, entidad: "ProyectoAdicional", entidadId: ad.id, campo: `Adicional ${ad.numero} · respuesta del cliente`, antes: ESTADO_ADICIONAL_LABEL.ENVIADO, despues: aprueba ? `${ESTADO_ADICIONAL_LABEL.APROBADO} (${nombre})` : `${ESTADO_ADICIONAL_LABEL.RECHAZADO} (${nombre}): ${motivo}`, autor: a.nombre });
    return true;
  });
  if (!respondio) return mal("Este adicional no está enviado, o ya se respondió.");
  if (aprueba) await regenerar(tenantId, ad.proyectoId);
  refrescar(ad.proyectoId);
  return { ok: true, listo: aprueba ? `Listo: el adicional ${ad.numero} quedó aprobado y suma sus cuotas.` : "Listo: quedó rechazado." };
}
