// ============================================================================
// O12 · los datos de la Previsión de pagos de Finanzas (anticipo y saldo a proveedor por línea). MIA-251: son cuotas de
// PAGO, deuda con proveedores: sólo salen con `vista.deudas` (Dirección y Administración). El productor comercial ve todo
// lo de su proyecto salvo pagos y deuda con proveedores (dueño, 20/11): no le llegan desde el servidor.
// ============================================================================
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./gestion.server";
import type { Cabecera, Vista } from "./ficha.server";
import { parametrosDelNegocio } from "./parametros/leer.server";
import { adicionalesDelProyecto, detallesDeLineas, estadosDePrevision, hayM2 } from "./presupuesto-m2.server";

export async function datosPrevision(a: Actor, vista: Vista, cab: Cabecera) {
  const lineas = cab.base?.estado === "APROBADO" ? cab.base.items : [];
  if (!vista.deudas || lineas.length === 0 || !(await hayM2())) return null;
  const proyectoId = cab.proyecto.id;
  const [detalles, cuotas, adicionales, par] = await Promise.all([
    detallesDeLineas(prisma, a.tenantId, lineas.map((l) => l.id)),
    prisma.proyectoCuota.findMany({ where: { tenantId: a.tenantId, proyectoId, tipo: "PAGO", anuladoEl: null, clave: { startsWith: `${proyectoId}:` } }, orderBy: { venceEl: "asc" }, select: { id: true, clave: true, concepto: true, monto: true, moneda: true, venceEl: true, pagadoEl: true } }),
    adicionalesDelProyecto(prisma, a.tenantId, proyectoId),
    parametrosDelNegocio(a.tenantId),
  ]);
  // Las líneas de los adicionales aprobados también tienen su anticipo y su saldo (claves `P:adic:<línea>:…`).
  const deAdicionales = adicionales.filter((ad) => ad.estado === "APROBADO").flatMap((ad) => ad.lineas.map((l) => ({ ...l, adicional: `Adicional ${ad.numero} · ${ad.nombre}` })));
  const proveedores = [...lineas.map((l) => l.supplierId), ...deAdicionales.map((l) => l.supplierId)].flatMap((s) => (s ? [s] : []));
  const fichas = await prisma.proyectoProveedorFicha.findMany({ where: { tenantId: a.tenantId, supplierId: { in: proveedores } }, select: { supplierId: true, anticipoPct: true } });
  const estados = await estadosDePrevision(prisma, a.tenantId, cuotas.map((c) => c.id));
  return { proyectoId, lineas, detalles, cuotas, deAdicionales, delProveedor: new Map(fichas.map((f) => [f.supplierId, f.anticipoPct])), estados, palabras: par["prevision.palabras"] };
}
