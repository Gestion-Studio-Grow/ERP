"use server";

// ============================================================================
// DESPIECE — la acción que lo registra (SQL crudo para ProcessingRun/Output, las tablas de la
// migración Gate 2, y el registro de stock para la pieza y los cortes).
// ============================================================================
//
// Qué cambió en la ola 3, y por qué:
//   · LA PIEZA DE ENTRADA SALE DEL STOCK. Antes sólo se sumaban los cortes: la media res que
//     se cortó quedaba en el stock para siempre y el stock valorizado contaba dos veces la
//     misma carne. Ahora sale con un AJUSTE negativo a su costo por kilo, en la misma
//     transacción que los cortes (el registro no tiene todavía un tipo "transformación": pide
//     migración). Los dos llevan el motivo "Despiece #N".
//   · COSTO POR VALOR RELATIVO DE VENTA (despiece.ts). Antes parejo por kilo: el lomo y el
//     osobuco al mismo costo. Cambia los márgenes de MAGRA: se le avisa antes de desplegarlo.
//   · ACTOR REAL Y AUDITORÍA. Firmaba `'user'` sin id; ahora `user:<id>` en la corrida y en
//     cada movimiento, y queda en la auditoría con la pieza, los cortes y cómo se costeó.
//   · ERRORES VISIBLES. Antes un `catch {}` tragaba todo y el formulario volvía como si se
//     hubiera guardado. Ahora dice qué pasó y cómo seguir, sin perder lo cargado.
//   · CORRELATIVO SIN CARRERA. El número es max+1: dos despieces a la vez chocaban contra el
//     índice único. Un candado por negocio (pg_advisory_xact_lock) los pone en fila.
//
// "use server" publica cada export como endpoint: una sola acción, sin tenantId. La lectura
// vive en despiece-loader.ts y la escritura en despiece-registro.ts.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { cantidadDelFormulario, importeDelFormulario } from "@/lib/pos-peso";
import { DespieceInvalido, registrarDespieceEnTx } from "./despiece-registro";
import { motivoDelError } from "./errores";

const PATHS = ["/admin/despiece", "/admin/catalogo", "/admin/inventario", "/admin/inventario/movimientos", "/admin/compras/sugerido"];
const NOMBRE_MAX = 80;

/** Lo que vuelve a la pantalla (`useEnvio`). */
export type EstadoDespiece = null | { ok: true; mensaje: string } | { ok: false; error: string };

/** Lee un número del formulario; lo ilegible es un error de carga, con el mensaje de pos-peso. */
function leerNumero(leer: () => number | null): number | null {
  try {
    return leer();
  } catch (err) {
    throw new DespieceInvalido(err instanceof Error ? err.message : "Hay un número que no se entiende.");
  }
}

const kgFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

export async function registrarDespiece(_prev: EstadoDespiece, formData: FormData): Promise<EstadoDespiece> {
  try {
    const user = await requireAppAccion("despiece");
    // La pieza sale del stock y los cortes entran con costo: es un ajuste de stock y fija costos.
    if (!roleHasCapability(user.role, "stock:adjust") || !roleHasCapability(user.role, "costs:read")) {
      return { ok: false, error: "Tu usuario no puede registrar despieces. Pedíselo a la dueña o al dueño." };
    }
    const piezaId = String(formData.get("inputProductId") ?? "").trim();
    const kilos = leerNumero(() => cantidadDelFormulario(String(formData.get("inputWeightKg") ?? ""), "Peso de la pieza"));
    const costoTipeado = leerNumero(() => importeDelFormulario(String(formData.get("inputCost") ?? ""), "Costo de la pieza"));
    const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

    const nombres = formData.getAll("outputName").map((v) => String(v).trim().slice(0, NOMBRE_MAX));
    const pesos = formData.getAll("outputWeight").map(String);
    const productos = formData.getAll("outputProductId").map((v) => String(v).trim());
    if (nombres.length !== pesos.length || nombres.length !== productos.length) {
      throw new DespieceInvalido("Los cortes llegaron incompletos. Recargá la pantalla y volvé a cargarlos.");
    }
    // Una fila vacía (sin nombre ni kilos) no es un corte; una a medias es un error de carga.
    const lineas = nombres
      .map((name, i) => ({
        n: i + 1,
        name,
        weightKg: leerNumero(() => cantidadDelFormulario(pesos[i], `Corte ${i + 1}, kilos`)) ?? 0,
        productId: productos[i] || null,
      }))
      .filter((l) => l.name || l.weightKg > 0);
    const aMedias = lineas.find((l) => !l.name || !(l.weightKg > 0));
    if (aMedias) {
      throw new DespieceInvalido(aMedias.name ? `Al corte ${aMedias.n} (${aMedias.name}) le faltan los kilos.` : `El corte ${aMedias.n} tiene kilos pero no nombre.`);
    }

    const tenantId = await getCurrentTenantId();
    const hecho = await tenantTransaction(
      (tx) =>
        registrarDespieceEnTx(tx, tenantId, {
          piezaId,
          kilos: kilos ?? 0,
          costoTipeado,
          note,
          lineas: lineas.map(({ name, weightKg, productId }) => ({ name, weightKg, productId })),
          actor: `user:${user.id}`,
        }),
      { tenantId },
    );

    const a = hecho.plan.analisis;
    await auditAdmin({
      action: "create",
      entity: "ProcessingRun",
      entityId: hecho.runId,
      changes: {
        code: hecho.numero,
        pieza: hecho.plan.salida.nombre,
        kilos: a.inputWeightKg,
        costoPieza: hecho.plan.costoPieza,
        costeo: a.metodoDeCosteo,
        mermaKg: a.mermaKg,
        cortes: a.outputs.map((o) => ({ nombre: o.name, kg: o.weightKg, costoPorKg: o.costPerKg })),
      },
    });
    for (const path of PATHS) revalidatePath(path);
    return {
      ok: true,
      mensaje:
        `Despiece #${hecho.numero} registrado: salieron ${kgFmt.format(a.inputWeightKg)} kg de ${hecho.plan.salida.nombre} del stock ` +
        `y ${hecho.plan.entradas.length === 1 ? "entró 1 corte" : `entraron ${hecho.plan.entradas.length} cortes`}.`,
    };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DespieceInvalido || err instanceof AppNoDisponibleError) return { ok: false, error: err.message };
    if (motivoDelError(err) === "sin-migracion") {
      return { ok: false, error: "Despiece todavía no está habilitado en este negocio: falta preparar la base. Avisale a GSG." };
    }
    // La guarda de stock del registro (una venta entre la vista previa y el guardado).
    if (err instanceof Error && err.message.startsWith("Sin stock suficiente")) {
      return { ok: false, error: `${err.message} Recargá la pantalla para ver el stock de ahora.` };
    }
    logger.error("despiece", "no se pudo registrar el despiece", err);
    return { ok: false, error: "No se pudo registrar el despiece. Probá de nuevo; si sigue pasando, avisale a GSG." };
  }
}
