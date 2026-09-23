"use server";

// MERMAS, AJUSTES Y RECUENTOS de stock (F2) — el tercer flujo de inventario junto a la venta
// (order-actions) y la compra (stock-actions). La aritmética vive pura y testeada en
// src/lib/stock/adjustment-core.ts; la persistencia, en adjustment-insert.ts. Acá sólo están
// las guardias, el adaptador FormData → AdjustmentInput y la respuesta a la pantalla.
//
// "use server" publica cada export como endpoint: por eso acá NO hay loaders (viven en
// src/lib/inventario/ajustes-loader.ts) y ningún export recibe un tenantId.
//
// GUARDIAS, en dos capas, las dos en el servidor:
//   1. `requireAppAccion(<app>)`: la misma regla que decide si la app está en el menú y si su
//      página abre (rol × módulo × rubro × edición). Una app escondida no se puede usar por
//      su endpoint.
//   2. La capability fina de la operación: `stock:adjust` para dar de baja (merma, rotura,
//      corrección), `stock:count` para recontar. El encargado (RECEPTION) tiene las dos, con
//      el TOPE de merma por carga (`topeDeMermaPorCarga`), que se controla adentro de la
//      transacción: si la carga lo pasa, no queda nada escrito.
//
// Las acciones DEVUELVEN el error en vez de tirarlo: si se escapa, Next en producción lo
// reemplaza por la pantalla genérica y la persona pierde lo cargado.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { requireAppAccion } from "@/lib/require-app";
import { insertStockAdjustment, TopeDeMermaSuperado } from "@/lib/stock/adjustment-insert";
import {
  leerLineasDeAjuste,
  leerMotivo,
  mensajeDeTope,
  motivoLabel,
  motivoMode,
  topeDeMermaPorCarga,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";
import type { LineaDeRecuento } from "@/lib/inventario/recuento";

/** Lo que vuelve a la pantalla (`useActionState`). */
export type EstadoAjuste =
  | null
  | { ok: true; mensaje: string; recuento?: LineaDeRecuento[] }
  | { ok: false; error: string };

const PATHS = ["/admin/ajustes", "/admin/ajustes/recuento", "/admin/inventario", "/admin/catalogo", "/admin/compras", "/admin/pedidos"];

// La sesión vencida llega como un redirect de Next (una excepción): se deja pasar, porque
// tragarlo dejaría a la persona sin login y con un error que no dice nada.
function comoError(err: unknown): { ok: false; error: string } {
  unstable_rethrow(err);
  const msg = err instanceof Error && err.message ? err.message : "No se pudo registrar. Probá de nuevo.";
  return { ok: false, error: msg };
}

// La hora de cada conteo viaja en el reloj del teléfono (`contadoA`), junto con la hora del
// teléfono al tocar Guardar (`enviadoA`, la pone el formulario al enviar): con las dos el
// servidor sabe hace cuánto se contó, sin depender del reloj del teléfono ni de cuándo se armó
// la página (`horaDelConteo`, adjustment-core.ts).
function lineasDelFormulario(formData: FormData, motivo: AdjustmentMotivo) {
  return leerLineasDeAjuste(
    motivoMode(motivo),
    formData.getAll("productId").map(String),
    formData.getAll("value").map(String),
    {
      horas: formData.getAll("contadoA").map(String),
      enviadoA: formData.get("enviadoA")?.toString() ?? null,
      ahora: new Date(),
    },
  );
}

const pesos = (n: number) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}`;

// --- Registrar una merma / ajuste (pantalla Mermas) ---
//
// Asienta un StockMovement tipo AJUSTE por línea con el costo vigente guardado. Un RECUENTO
// cargado desde esta pantalla también compara contra el stock a la hora del conteo.
export async function createStockAdjustment(_prev: EstadoAjuste, formData: FormData): Promise<EstadoAjuste> {
  try {
    const user = await requireAppAccion("mermas");
    const motivo = leerMotivo(formData.get("motivo"));
    if (!motivo) return { ok: false, error: "Elegí el motivo del ajuste." };
    const cap = motivoMode(motivo) === "COUNT" ? "stock:count" : "stock:adjust";
    if (!roleHasCapability(user.role, cap)) {
      return { ok: false, error: "Tu usuario no puede cargar este ajuste. Pedíselo a la dueña o al dueño." };
    }
    const tenantId = await getCurrentTenantId();
    const note = String(formData.get("note") || "").trim() || null;
    const items = lineasDelFormulario(formData, motivo);

    let result;
    try {
      result = await insertStockAdjustment(tenantId, {
        motivo,
        note,
        createdBy: `user:${user.id}`,
        items,
        topePesos: topeDeMermaPorCarga(user.role),
      });
    } catch (err) {
      if (!(err instanceof TopeDeMermaSuperado)) throw err;
      // El rechazo por tope también queda escrito: no se grabó la merma, pero la dueña ve
      // quién intentó dar de baja cuánto (y si alguien prueba cantidades para adivinar un
      // costo, se nota). El mensaje lleva pesos sólo para quien ve costos.
      await auditAdmin({
        action: "adjust-rechazado",
        entity: "StockMovement",
        entityId: `ajuste:${motivo}`,
        changes: { motivo, note, lineas: items.length, pesosDeBaja: err.pesos, tope: err.tope, rol: user.role },
      });
      return { ok: false, error: mensajeDeTope(err, roleHasCapability(user.role, "costs:read"), pesos) };
    }

    await auditAdmin({
      action: "adjust",
      entity: "StockMovement",
      entityId: `ajuste:${motivo}`,
      changes: { motivo, note, lines: result.applied, pesosDeBaja: result.pesosDeBaja, rol: user.role },
    });
    for (const p of PATHS) revalidatePath(p);
    const n = result.applied;
    return {
      ok: true,
      mensaje:
        n === 0
          ? "No hubo nada que ajustar: lo cargado coincide con el sistema."
          : `Listo: ${motivoLabel(motivo).toLowerCase()} en ${n === 1 ? "1 producto" : `${n} productos`}. El stock ya quedó actualizado.`,
    };
  } catch (err) {
    return comoError(err);
  }
}

// --- Registrar un recuento (pantalla Recuento) ---
//
// Cada línea trae el contado y la hora del conteo; la diferencia se calcula contra el stock
// teórico de esa hora. Devuelve el resultado línea por línea (en pesos sólo con costs:read).
export async function registrarRecuento(_prev: EstadoAjuste, formData: FormData): Promise<EstadoAjuste> {
  try {
    const user = await requireAppAccion("recuento");
    if (!roleHasCapability(user.role, "stock:count")) {
      return { ok: false, error: "Tu usuario no puede cargar recuentos. Pedíselo a la dueña o al dueño." };
    }
    const tenantId = await getCurrentTenantId();
    const note = String(formData.get("note") || "").trim() || null;
    const items = lineasDelFormulario(formData, "RECUENTO");
    if (items.length === 0) return { ok: false, error: "Cargá lo contado de al menos un producto." };

    const result = await insertStockAdjustment(tenantId, {
      motivo: "RECUENTO",
      note,
      createdBy: `user:${user.id}`,
      items,
    });

    const conCostos = roleHasCapability(user.role, "costs:read");
    const contado = new Map(items.map((i) => [i.productId, i.value]));
    const recuento: LineaDeRecuento[] = result.lineas.map((l) => ({
      nombre: l.nombre,
      unidad: l.unidad,
      teorico: l.teorico,
      contado: contado.get(l.productId) ?? l.teorico + l.delta,
      diferencia: l.delta,
      pesos: conCostos && l.costo !== null ? Math.round(l.delta * l.costo * 100) / 100 : null,
    }));

    await auditAdmin({
      action: "adjust",
      entity: "StockMovement",
      entityId: "recuento",
      changes: {
        note,
        contados: result.lineas.length,
        conDiferencia: result.applied,
        horaDelConteo: items.some((i) => i.contadoA) ? "por línea" : "al guardar",
      },
    });
    for (const p of PATHS) revalidatePath(p);
    return {
      ok: true,
      mensaje: `Recuento guardado: ${result.lineas.length === 1 ? "1 producto contado" : `${result.lineas.length} productos contados`}, ${
        result.applied === 0 ? "todos coinciden con el sistema." : `${result.applied} con diferencia.`
      }`,
      recuento,
    };
  } catch (err) {
    return comoError(err);
  }
}
