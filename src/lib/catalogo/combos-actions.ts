"use server";

// ============================================================================
// CATÁLOGO → COMBOS (camino A, D8) — el combo frecuente como un servicio más. ABM propio (ADR-055).
// ============================================================================
//
// Reingeniería CH, Tanda 3 · 3-B (CH-034). La dueña arma «Piernas + axilas + cavado · 60′ ·
// $26.000» UNA vez y desde ahí se da en un toque, sin migración: es un `Service` nuevo, en la
// categoría «Combos», asignado a las profesionales que hacen TODAS sus zonas.
//
// LO QUE NO HACE, a propósito (ch-DISENO.md §0.4): no toca ningún servicio existente. Los que
// componen el combo se LEEN (nombre, duración, quién los hace) y nada más: mismo id, precio,
// duración y `updatedAt` antes y después (lo prueba combos-postgres.test.ts). La categoría «Combos»
// se crea si no está (alta). La asignación a las profesionales es una fila nueva en la relación
// servicio↔profesional del combo; la ficha de la profesional no se reescribe.
//
// Baja: sólo de un servicio de la categoría «Combos» (un combo hecho acá), con `tenantId` en el
// where. Los turnos ya dados con ese combo quedan como están. La modificación (precio, nombre) es
// la del servicio, en Catálogo → Servicios.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { tenantTransaction } from "@/lib/rls";
import { importeONaN } from "@/lib/dinero/leer";
import { isDemoSandbox } from "@/lib/demo-flag";
import { RechazoDeDominio, motivoMostrable } from "@/lib/rechazo-de-dominio";
import { CATEGORIA_COMBOS, validarComboDelCatalogo } from "@/lib/turnos/combos";

export type ResultadoCombo = { ok: true; id: string | null } | { ok: false; error: string };

const RUTA = "/admin/catalogo";

/** Alta de un combo. Campos: `nombre`, `serviceIds` (repetido, en orden), `precio`, `duracion`, `senia`, `profesionales` (repetido). */
export async function crearCombo(fd: FormData): Promise<ResultadoCombo> {
  await requireCapability("catalog:manage");
  if (isDemoSandbox()) return { ok: true, id: null }; // modo demo: no persiste
  const tenantId = await getCurrentTenantId();
  const ids = fd.getAll("serviceIds").map(String);
  const pedido = {
    nombre: String(fd.get("nombre") ?? ""),
    ids,
    precio: importeONaN(fd.get("precio")),
    duracion: Number(String(fd.get("duracion") ?? "").trim() || NaN),
    senia: importeONaN(fd.get("senia")),
    profesionales: fd.getAll("profesionales").map(String),
  };

  try {
    const id = await tenantTransaction(
      async (tx) => {
        // Lectura de los componentes y de los nombres en uso, adentro de la transacción del alta.
        const [componentes, vivos] = await Promise.all([
          tx.service.findMany({
            where: { id: { in: ids.slice(0, 20) }, tenantId, active: true, deletedAt: null },
            select: { id: true, name: true, durationMin: true, professionals: { where: { tenantId, active: true, deletedAt: null }, select: { id: true } } },
          }),
          tx.service.findMany({ where: { tenantId, deletedAt: null }, select: { name: true } }),
        ]);
        const v = validarComboDelCatalogo(
          pedido,
          componentes.map((c) => ({ id: c.id, name: c.name, durationMin: c.durationMin, profesionales: c.professionals.map((p) => p.id) })),
          vivos.map((s) => s.name),
        );
        if (!v.ok) throw new RechazoDeDominio(v.error);

        const categoria =
          (await tx.serviceCategory.findFirst({ where: { tenantId, name: { equals: CATEGORIA_COMBOS, mode: "insensitive" } }, select: { id: true } })) ??
          (await tx.serviceCategory.create({
            data: { tenantId, name: CATEGORIA_COMBOS, order: ((await tx.serviceCategory.aggregate({ where: { tenantId }, _max: { order: true } }))._max.order ?? 0) + 1 },
            select: { id: true },
          }));

        const creado = await tx.service.create({
          data: {
            tenantId,
            name: v.combo.nombre,
            description: v.combo.descripcion,
            durationMin: v.combo.durationMin,
            price: v.combo.precio,
            depositAmount: v.combo.depositAmount,
            categoryId: categoria.id,
            professionals: { connect: v.combo.profesionales.map((pid) => ({ id: pid })) },
          },
          select: { id: true },
        });
        return { id: creado.id, combo: v.combo };
      },
      { tenantId },
    );
    await auditAdmin({
      action: "create_combo",
      entity: "Service",
      entityId: id.id,
      changes: { nombre: id.combo.nombre, componentes: ids, precio: id.combo.precio, durationMin: id.combo.durationMin, profesionales: id.combo.profesionales },
    });
    revalidatePath(RUTA);
    revalidatePath("/admin/turnos/lista");
    return { ok: true, id: id.id };
  } catch (e) {
    const motivo = motivoMostrable(e);
    if (motivo !== null) return { ok: false, error: motivo };
    throw e;
  }
}

/** Baja de un combo (sólo de la categoría «Combos»). Campo: `id`. */
export async function darDeBajaCombo(fd: FormData): Promise<ResultadoCombo> {
  await requireCapability("catalog:manage");
  if (isDemoSandbox()) return { ok: true, id: null };
  const tenantId = await getCurrentTenantId();
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, error: "Falta el combo." };
  const combo = await prisma.service.findFirst({
    where: { id, tenantId, deletedAt: null, category: { name: { equals: CATEGORIA_COMBOS, mode: "insensitive" } } },
    select: { id: true, name: true },
  });
  if (!combo) return { ok: false, error: "Ese combo ya no está (o no es un combo): recargá la página." };
  await prisma.service.update({ where: { id: combo.id, tenantId }, data: { active: false, deletedAt: new Date() } });
  await auditAdmin({ action: "delete_combo", entity: "Service", entityId: combo.id, changes: { nombre: combo.name } });
  revalidatePath(RUTA);
  revalidatePath("/admin/turnos/lista");
  return { ok: true, id: combo.id };
}
