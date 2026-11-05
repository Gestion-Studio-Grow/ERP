"use server";

// Pantalla del catálogo: «Abre sólo los días que elijo» + calendario del mes (NAIL-ARTIST.md §2).
// Sólo OWNER, detrás del interruptor `nail-artist`, auditado. Migración sin aplicar → aviso, no 500.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import { nailArtistDelNegocio } from "@/cambios/interruptores.server";
import { isColumnMissing, isPrismaError } from "@/lib/prisma-errors";
import { esFechaValida, fechaComoDate } from "./box-dias";

export type ResultadoDiasDelBox = { ok: true; mensaje: string } | { ok: false; error: string };

const CATALOG_PATH = "/admin/catalogo";
const AVISO_APAGADO = "Los días del box todavía no están activos en tu negocio. Avisale a GSG.";

async function permitido(): Promise<{ ok: true; tenantId: string; actor: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { ok: false, error: "Sólo la dueña puede abrir o cerrar días del box." };
  if (isDemoSandbox()) return { ok: false, error: "En la demo no se guardan cambios." };
  if (!(await nailArtistDelNegocio())) return { ok: false, error: AVISO_APAGADO };
  return { ok: true, tenantId: await getCurrentTenantId(), actor: `user:${user.id}` };
}

function migracionAusente(err: unknown): boolean {
  return isColumnMissing(err) || isPrismaError(err, "P2021");
}

/** Casilla «Abre sólo los días que elijo». */
export async function fijarSoloDiasAbiertos(formData: FormData): Promise<ResultadoDiasDelBox> {
  const p = await permitido();
  if (!p.ok) return p;
  const boxId = String(formData.get("boxId") ?? "").trim();
  const valor = String(formData.get("soloDiasAbiertos") ?? "") === "true";
  if (!boxId) return { ok: false, error: "Falta el box." };
  try {
    const r = await prisma.box.updateMany({ where: { id: boxId, tenantId: p.tenantId, deletedAt: null }, data: { soloDiasAbiertos: valor } });
    if (r.count === 0) return { ok: false, error: "Ese box ya no existe. Recargá la página." };
  } catch (err) {
    if (migracionAusente(err)) return { ok: false, error: AVISO_APAGADO };
    throw err;
  }
  await auditAdmin({ action: "box_solo_dias_abiertos", entity: "Box", entityId: boxId, changes: { soloDiasAbiertos: valor } });
  revalidatePath(CATALOG_PATH);
  return { ok: true, mensaje: valor ? "Listo: el box abre sólo los días que marques." : "Listo: el box abre todos los días, como siempre." };
}

/** Tocar un día del calendario: abierto ↔ cerrado. */
export async function alternarDiaAbierto(formData: FormData): Promise<ResultadoDiasDelBox> {
  const p = await permitido();
  if (!p.ok) return p;
  const boxId = String(formData.get("boxId") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!boxId) return { ok: false, error: "Falta el box." };
  if (!esFechaValida(fecha)) return { ok: false, error: "Esa fecha no se pudo leer." };
  let abierto: boolean;
  try {
    const box = await prisma.box.findFirst({ where: { id: boxId, tenantId: p.tenantId, deletedAt: null }, select: { id: true } });
    if (!box) return { ok: false, error: "Ese box ya no existe. Recargá la página." };
    const borrados = await prisma.boxDiaAbierto.deleteMany({ where: { tenantId: p.tenantId, boxId, fecha: fechaComoDate(fecha) } });
    if (borrados.count > 0) {
      abierto = false;
    } else {
      // Doble toque simultáneo: el único (boxId, fecha) evita la fila repetida; la segunda queda en «abierto».
      await prisma.boxDiaAbierto
        .create({ data: { tenantId: p.tenantId, boxId, fecha: fechaComoDate(fecha), createdBy: p.actor } })
        .catch((err: unknown) => {
          if (isPrismaError(err, "P2002")) return null;
          throw err;
        });
      abierto = true;
    }
  } catch (err) {
    if (migracionAusente(err)) return { ok: false, error: AVISO_APAGADO };
    throw err;
  }
  await auditAdmin({ action: abierto ? "box_dia_abierto" : "box_dia_cerrado", entity: "Box", entityId: boxId, changes: { fecha } });
  revalidatePath(CATALOG_PATH);
  return { ok: true, mensaje: abierto ? `Abierto el ${fecha.split("-").reverse().join("/")}.` : `Cerrado el ${fecha.split("-").reverse().join("/")}.` };
}
