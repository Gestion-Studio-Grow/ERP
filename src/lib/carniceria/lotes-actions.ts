"use server";

// ============================================================================
// LOTES / envasado al vacío — server actions (SQL crudo sobre `ProductBatch`, la tabla de la
// migración Gate 2, prisma/pending-gate2/CarniceriaRubro.sql).
// ============================================================================
//
// Qué cambió en la ola 3, y por qué:
//   · ERRORES VISIBLES. Antes todo error terminaba en un `catch {}` y el formulario volvía
//     vacío como si se hubiera guardado (un número de lote repetido, una base caída). Ahora la
//     acción devuelve qué pasó y cómo seguir (`motivoDelError`), sin perder lo cargado.
//   · ACTOR REAL. Firmaban `'user'` sin id: no había forma de saber quién cargó o retiró un
//     lote. Ahora `user:<id>`, y cada alta o cambio de estado queda en la auditoría.
//   · FECHA DE CALENDARIO. El vencimiento se guarda al mediodía UTC del día tipeado
//     (`instanteDelDia`, lotes.ts): antes se veía un día antes.
//   · NÚMEROS ES-AR. Peso y costo se leen con las funciones del mostrador ("12,340" kg,
//     "6.543" pesos); antes eran `<input type="number">` que se tragaban la coma.
//   · GUARDIA POR APP. `requireAppAccion` (rol, módulo, rubro y migración, como la página) y
//     `stock:receive`: el encargado del local carga el lote cuando recibe la mercadería.
//
// "use server" publica cada export como endpoint: acá sólo hay acciones, ninguna recibe un
// tenantId. La lectura vive en lotes-loader.ts y la escritura en lotes-registro.ts.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { cantidadDelFormulario, importeDelFormulario } from "@/lib/pos-peso";
import { fmtDia, leerDiaDelFormulario, type BatchStatus } from "./lotes";
import { cambiarEstadoEnTx, crearLoteEnTx, LoteInvalido } from "./lotes-registro";
import { motivoDelError } from "./errores";

const LOTES_PATH = "/admin/lotes";
const CODIGO_MAX = 40;
const NOTA_MAX = 200;
const ESTADOS: readonly BatchStatus[] = ["AVAILABLE", "DEPLETED", "EXPIRED", "WITHDRAWN"];

/** Lo que vuelve a la pantalla (`useEnvio`). */
export type EstadoLote = null | { ok: true; mensaje: string } | { ok: false; error: string };

/** Lee un número del formulario; lo ilegible es un error de carga, con el mensaje de pos-peso. */
function leerNumero(leer: () => number | null): number | null {
  try {
    return leer();
  } catch (err) {
    throw new LoteInvalido(err instanceof Error ? err.message : "Hay un número que no se entiende.");
  }
}

function textoDelError(err: unknown, codigo: string | null): string {
  switch (motivoDelError(err)) {
    case "sin-migracion":
      return "Lotes todavía no está habilitado en este negocio: falta preparar la base. Avisale a GSG.";
    case "duplicado":
      return codigo ? `Ya hay un lote con el número ${codigo}. Usá otro número.` : "Ese lote ya existe.";
    default:
      logger.error("lotes", "no se pudo guardar el lote", err);
      return "No se pudo guardar el lote. Probá de nuevo; si sigue pasando, avisale a GSG.";
  }
}

/** Alta de un lote de envasado al vacío. Devuelve qué pasó; nunca se traga un error. */
export async function crearLote(_prev: EstadoLote, formData: FormData): Promise<EstadoLote> {
  let codigo: string | null = null;
  try {
    const user = await requireAppAccion("lotes-y-vencimientos");
    if (!roleHasCapability(user.role, "stock:receive")) {
      return { ok: false, error: "Tu usuario no puede cargar lotes. Pedíselo a la dueña o al dueño." };
    }
    const conCostos = roleHasCapability(user.role, "costs:read");

    codigo = String(formData.get("code") ?? "").trim().slice(0, CODIGO_MAX) || null;
    const productId = String(formData.get("productId") ?? "").trim();
    const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
    const envasado = leerDiaDelFormulario(formData.get("packedAt"));
    const vence = leerDiaDelFormulario(formData.get("expiresAt"));
    if (!codigo) throw new LoteInvalido("Falta el número de lote (el de la etiqueta o uno propio).");
    if (!productId) throw new LoteInvalido("Elegí el corte del lote.");
    if (vence === "invalido" || envasado === "invalido") throw new LoteInvalido("Una de las fechas no es válida. Elegila en el calendario.");
    if (!vence) throw new LoteInvalido("Cargá el vencimiento que dice la etiqueta: es para lo que sirve el lote.");
    if (envasado && envasado > vence) throw new LoteInvalido("La fecha de envasado es posterior al vencimiento. Revisá las dos.");
    const netWeightKg = leerNumero(() => cantidadDelFormulario(String(formData.get("netWeightKg") ?? ""), "Peso neto"));
    const paquetes = leerNumero(() => cantidadDelFormulario(String(formData.get("packages") ?? ""), "Paquetes"));
    if (paquetes !== null && !Number.isInteger(paquetes)) throw new LoteInvalido("Los paquetes son enteros (1, 2, 3…).");
    const packages = paquetes && paquetes > 0 ? paquetes : 1;
    // El costo sólo lo carga quien lo ve; el del encargado se ignora aunque llegue.
    const unitCost = conCostos ? leerNumero(() => importeDelFormulario(String(formData.get("unitCost") ?? ""), "Costo por kilo")) : null;
    const note = String(formData.get("note") ?? "").trim().slice(0, NOTA_MAX) || null;

    const tenantId = await getCurrentTenantId();
    const id = randomUUID();
    const lote = { id, codigo, productId, supplierId, envasado, vence, netWeightKg, packages, unitCost, note, actor: `user:${user.id}` };
    await tenantTransaction((tx) => crearLoteEnTx(tx, tenantId, lote), { tenantId });
    await auditAdmin({
      action: "create",
      entity: "ProductBatch",
      entityId: id,
      changes: { codigo, productId, supplierId, envasado, vence, netWeightKg, packages, conCosto: !!unitCost },
    });
    revalidatePath(LOTES_PATH);
    return { ok: true, mensaje: `Lote ${codigo} cargado: vence el ${fmtDia(vence)}.` };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof LoteInvalido || err instanceof AppNoDisponibleError) return { ok: false, error: err.message };
    return { ok: false, error: textoDelError(err, codigo) };
  }
}

/** Cambia el estado de un lote (agotado / retirado / otra vez disponible). */
export async function cambiarEstadoDelLote(_prev: EstadoLote, formData: FormData): Promise<EstadoLote> {
  try {
    const user = await requireAppAccion("lotes-y-vencimientos");
    if (!roleHasCapability(user.role, "stock:receive")) {
      return { ok: false, error: "Tu usuario no puede cambiar lotes. Pedíselo a la dueña o al dueño." };
    }
    const id = String(formData.get("id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as BatchStatus;
    if (!id || !ESTADOS.includes(status)) return { ok: false, error: "No se entendió qué cambio pedir. Recargá la pantalla." };

    const tenantId = await getCurrentTenantId();
    const cambio = await tenantTransaction((tx) => cambiarEstadoEnTx(tx, tenantId, id, status), { tenantId });
    if (!cambio.igual) {
      await auditAdmin({ action: "update", entity: "ProductBatch", entityId: id, changes: { codigo: cambio.code, desde: cambio.desde, hacia: status } });
    }
    revalidatePath(LOTES_PATH);
    const que: Record<BatchStatus, string> = {
      AVAILABLE: "otra vez disponible",
      DEPLETED: "agotado",
      EXPIRED: "vencido",
      WITHDRAWN: "retirado",
    };
    return { ok: true, mensaje: `Lote ${cambio.code}: ${que[status]}.` };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof LoteInvalido || err instanceof AppNoDisponibleError) return { ok: false, error: err.message };
    return { ok: false, error: textoDelError(err, null) };
  }
}
