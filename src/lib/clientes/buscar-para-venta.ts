"use server";

// ============================================================================
// CLIENTE DE LA VENTA — las acciones del bloque «Cliente» de Vender (Magra, tanda 1 · 1D).
// ============================================================================
//
// Cada acción resuelve la sesión y el negocio ACÁ (nunca los recibe del navegador) y corre el
// cuerpo de `buscar-para-venta-core.ts` dentro de `tenantTransaction` (GUC de RLS puesto, y el
// `tenantId` también en cada consulta). Buscar y traer piden `orders:manage` (lo que pide vender);
// guardar pide además `clients:manage` (lo que pide editar una ficha). Lo fiscal se audita campo
// por campo con su valor anterior, como `guardarFichaFiscal`.

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import {
  buscarClientesParaVentaEnTx,
  consultarPadron,
  detalleDelClienteEnTx,
  guardarClienteDeLaVentaEnTx,
  revisarCuit,
  saldoDelClienteEnTx,
  textoParaBuscar,
  validarClienteDeLaVenta,
  type CampoDelCliente,
  type ClienteDeLaVentaDetalle,
  type ClienteEncontrado,
  type DatosDelClienteDeLaVenta,
  type DatosDelPadron,
} from "./buscar-para-venta-core";

/** El cliente elegido, con lo que debe (`null` si en esta base no está la tabla del fiado). */
export type ClienteElegido = ClienteDeLaVentaDetalle & { saldo: number | null };

export type ResultadoGuardarCliente =
  | { ok: true; cliente: ClienteElegido; creado: boolean }
  | { ok: false; campo?: CampoDelCliente; error: string; existenteId?: string };

// Donde la tabla del fiado no está (P2021) o le falta una columna (P2022): saldo desconocido.
function faltaLaTabla(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === "P2021" || code === "P2022";
}

/** Lo que debe: en su PROPIA transacción, porque una tabla ausente aborta la transacción entera. */
async function saldoDe(tenantId: string, clientId: string): Promise<number | null> {
  try {
    return await tenantTransaction((tx) => saldoDelClienteEnTx(tx, tenantId, clientId), { tenantId });
  } catch (e) {
    if (faltaLaTabla(e)) return null;
    throw e;
  }
}

/** Busca fichas del negocio por nombre, teléfono o CUIT/DNI (desde 3 caracteres, hasta 8). */
export async function buscarClientesParaVenta(texto: string): Promise<ClienteEncontrado[]> {
  await requireCapability("orders:manage");
  if (!textoParaBuscar(texto).ok) return [];
  const tenantId = await getCurrentTenantId();
  return tenantTransaction((tx) => buscarClientesParaVentaEnTx(tx, tenantId, String(texto ?? "")), { tenantId });
}

/** Lo que el mostrador ve al elegir: datos para facturar, última dirección, saldo, últimos pedidos. */
export async function traerClienteDeLaVenta(clientId: string): Promise<ClienteElegido | null> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(clientId ?? "").trim().slice(0, 64);
  if (!id) return null;
  const detalle = await tenantTransaction((tx) => detalleDelClienteEnTx(tx, tenantId, id), { tenantId });
  if (!detalle) return null;
  return { ...detalle, saldo: await saldoDe(tenantId, detalle.id) };
}

/** Alta (sin `id`) o edición de los datos para facturar (con `id`) desde Vender. */
export async function guardarClienteDeLaVenta(datos: DatosDelClienteDeLaVenta): Promise<ResultadoGuardarCliente> {
  await requireCapability("orders:manage");
  await requireCapability("clients:manage");
  const tenantId = await getCurrentTenantId();

  const v = validarClienteDeLaVenta(datos ?? {});
  if (!v.ok) return { ok: false, campo: v.campo, error: v.error };

  const r = await tenantTransaction(
    async (tx) => {
      const g = await guardarClienteDeLaVentaEnTx(tx, tenantId, v.cliente);
      if (!g.ok) return { g, detalle: null };
      return { g, detalle: await detalleDelClienteEnTx(tx, tenantId, g.id) };
    },
    { tenantId },
  );
  if (!r.g.ok) return r.g;
  if (!r.detalle) return { ok: false, error: "No se pudo leer la ficha recién guardada. Probá de nuevo." };

  if (Object.keys(r.g.cambios).length > 0) {
    await auditAdmin({
      action: r.g.creado ? "create" : "update",
      entity: "Client",
      entityId: r.g.id,
      changes: { ...r.g.cambios, desde: "vender" },
    });
    revalidatePath(`/admin/clientes/${r.g.id}`);
    revalidatePath("/admin/clientes");
  }
  return { ok: true, creado: r.g.creado, cliente: { ...r.detalle, saldo: await saldoDe(tenantId, r.g.id) } };
}

/**
 * Gancho del padrón de ARCA para el bloque Cliente: con un CUIT válido, lo que diga el padrón.
 * Hoy siempre `null` (ver `consultarPadron` en el core): se completa a mano.
 */
export async function consultarPadronParaVenta(cuit: string): Promise<DatosDelPadron | null> {
  await requireCapability("orders:manage");
  const c = revisarCuit(cuit);
  if (!c.ok) return null;
  return consultarPadron(c.cuit);
}
