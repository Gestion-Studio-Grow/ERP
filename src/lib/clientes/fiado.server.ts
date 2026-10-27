// ============================================================================
// UN SOLO FIADO — las lecturas con base y sesión (Magra, tanda 2 · 2D). Ver fiado.ts.
// ============================================================================
//
// Sin "use server": nada de esto es un endpoint. Lo llaman la acción de la entrega
// (`entregarPedido`, order-actions.ts), la ficha del cliente y Vender, que ya resolvieron la
// sesión. El negocio sale SIEMPRE de la sesión (`getCurrentTenantId`) o lo pasa quien ya lo
// resolvió; cada consulta lleva el `tenantId` y corre en `tenantTransaction` (GUC de RLS).

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { cuentasCorrientesDe } from "@/lib/settlement/cuentas-corrientes.server";
import { traerClienteDeLaVenta, type ClienteElegido } from "./buscar-para-venta";
import {
  deudaDelClienteEnTx,
  fiadoAlEntregar,
  leerPedidoDeVenta,
  repetirPedidoEnTx,
  type DecisionFiado,
  type DeudaDelCliente,
  type RepetirPedido,
} from "./fiado";

/** ¿El mostrador boutique está prendido en este negocio (y es un comercio)? */
export async function mostradorBoutiqueDelNegocio(): Promise<boolean> {
  const [identidad, interruptores] = await Promise.all([getTenantIdentity(), interruptoresDelNegocio()]);
  return identidad.isRetail && mostradorBoutiquePrendido(interruptores);
}

/**
 * ¿«Queda a cobrar» de ESTE pedido deja la deuda en la cuenta del cliente? Decide por el NEGOCIO,
 * no por quien entrega: la app de Fiado se mira con el rol del dueño (la recepción entrega aunque
 * no pueda abrir la cuenta; el dueño la cobra).
 *
 * O-2 (CERT-magra-t2): con `cuentas-corrientes` prendido y `inicio-por-apps` apagado (sin motor de
 * perfiles), la app de Fiado no se abre y el cobro de la cuenta (`requireAppAccion("cuentas-a-cobrar")`)
 * tampoco: dejar la deuda ahí sería plata que nadie puede cobrar. Por eso NO se registra, pero la
 * decisión `sin-app` no es silenciosa: `entregarPedido` lo dice con `mensajeEntregaSinAppDeFiado` y
 * el pedido queda en la bandeja «Entregado · a cobrar». El alta de Magra prende los tres
 * interruptores juntos (docs/tenants/magra/provisioning-magra.md).
 */
export async function decidirFiadoDeLaEntrega(tenantId: string, orderId: string): Promise<DecisionFiado> {
  const boutique = await mostradorBoutiqueDelNegocio();
  if (!boutique) return { va: false, motivo: "apagado" };
  const cuentasCorrientes = await cuentasCorrientesDe(tenantId);
  if (!cuentasCorrientes) return { va: false, motivo: "apagado" };
  const [negocio, pedido] = await Promise.all([
    getNegocioApps("OWNER"),
    tenantTransaction((tx) => tx.order.findFirst({ where: { id: orderId, tenantId }, select: { clientId: true } }), { tenantId }),
  ]);
  return fiadoAlEntregar({
    boutique,
    cuentasCorrientes,
    appCuentas: appPermitida(appPorId("cuentas-a-cobrar"), negocio),
    clientId: pedido?.clientId ?? null,
  });
}

/**
 * ¿La bandeja puede mandar a «Fiado y cuentas»? Sólo si las cuentas corrientes están prendidas Y la app abre
 * (la misma regla que `decidirFiadoDeLaEntrega`): sin «inicio por apps», el enlace terminaba en «no está disponible».
 */
export async function fiadoAbreEnLaBandeja(tenantId: string): Promise<boolean> {
  if (!(await cuentasCorrientesDe(tenantId))) return false;
  return appPermitida(appPorId("cuentas-a-cobrar"), await getNegocioApps("OWNER"));
}

export interface PedidoParaRepetir {
  code: number;
  fecha: Date;
  total: number;
}

/** Lo que la ficha muestra del lado del mostrador: lo que debe y sus últimos pedidos. */
export async function cargarMostradorDeLaFicha(
  clientId: string,
): Promise<{ deuda: DeudaDelCliente; ultimos: PedidoParaRepetir[] } | null> {
  const tenantId = await getCurrentTenantId();
  return tenantTransaction(
    async (tx) => {
      const deuda = await deudaDelClienteEnTx(tx, tenantId, clientId);
      if (!deuda) return null;
      const ultimos = await tx.order.findMany({
        where: { tenantId, clientId, status: { not: "CANCELLED" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
        select: { code: true, createdAt: true, total: true },
      });
      return { deuda, ultimos: ultimos.map((o) => ({ code: o.code, fecha: o.createdAt, total: o.total })) };
    },
    { tenantId },
  );
}

/**
 * Lo que Vender carga al llegar desde la ficha («Venderle» / «Repetir»): el cliente elegido (con
 * su saldo, igual que si lo hubieran buscado) y, con `repetir`, los renglones de ese pedido SUYO.
 * `null` si no hay cliente en la dirección o no es de este negocio. Pide `orders:manage` (lo que
 * pide vender). CONTRATO para la integración: `vender/page.tsx` lo llama con sus `searchParams` y
 * se lo pasa a `VenderForm` (2A) para arrancar con `clienteVenta` y `lines` cargados.
 */
export async function pedidoDeVentaDesdeLaFicha(params: {
  cliente?: string | string[];
  repetir?: string | string[];
}): Promise<{ cliente: ClienteElegido; repetir: RepetirPedido | null } | null> {
  await requireCapability("orders:manage");
  const pedido = leerPedidoDeVenta(params);
  if (!pedido.clienteId) return null;
  const cliente = await traerClienteDeLaVenta(pedido.clienteId);
  if (!cliente) return null;
  if (pedido.repetir === null) return { cliente, repetir: null };
  const tenantId = await getCurrentTenantId();
  const repetir = await tenantTransaction((tx) => repetirPedidoEnTx(tx, tenantId, cliente.id, pedido.repetir!), { tenantId });
  return { cliente, repetir };
}
