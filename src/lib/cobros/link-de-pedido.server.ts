// EL LINK DE MERCADO PAGO DE UN PEDIDO — el núcleo compartido entre la bandeja del backoffice
// (`generarLinkDePagoDePedido`, cobros-actions.ts) y la página de Gracias de la tienda
// (`pagarPedidoDeLaTienda`, Magra T6a). Quien llama ya decidió que se puede cobrar y con qué monto
// (SIEMPRE el de la base); acá se arma la preferencia con la referencia `gsg:<slug>:pedido:<id>`
// (el aviso de pago saca el negocio de ahí, nunca del host: Tanda S1) y se audita con
// `ACCION_LINK_DE_PAGO`, que es de donde se lee el último link de cada pedido (`ultimosLinks`).
//
// No es "use server": no se expone como action. La auditoría la pone quien llama (admin o público).

import "server-only";
import { crearPasarelaCobrosPara, CobrosSinConexionError, type ModoCobros } from "@/lib/mercadopago-cobros-dispatch";
import { SolicitudCobroInvalidaError, type SolicitudCobro } from "@/plugins/mercadopago/cobros";
import { MercadoPagoApiError } from "@/plugins/mercadopago/http";
import { referenciaDelLinkDePedido } from "@/lib/webhooks/resolver-negocio";
import { ACCION_LINK_DE_PAGO } from "@/app/admin/(dashboard)/pedidos/link-de-pago";

export type AuditarLink = (entry: { action: string; entity: string; entityId: string; changes: unknown }) => Promise<unknown>;

export type LinkArmado =
  | { ok: true; url: string; preferenceId: string }
  | { ok: false; tipo: "invalida"; detalle: string }
  | { ok: false; tipo: "sin-conexion" }
  | { ok: false; tipo: "api"; status: number }
  | { ok: false; tipo: "otro" };

export async function armarLinkDePagoDePedido(input: {
  tenantId: string;
  slug: string;
  pedido: { id: string; code: number };
  monto: number;
  negocio: string;
  modo: ModoCobros;
  auditar: AuditarLink;
  /** Datos de más para la auditoría (por ejemplo, `origen: "tienda"`). */
  extra?: Record<string, unknown>;
}): Promise<LinkArmado> {
  const { pedido, monto, modo } = input;
  const referenciaMP = referenciaDelLinkDePedido(input.slug, pedido.id);
  const solicitud: SolicitudCobro = {
    concepto: `Pedido #${pedido.code} · ${input.negocio}`,
    monto,
    referenciaExterna: referenciaMP,
  };
  try {
    const link = await (await crearPasarelaCobrosPara(input.tenantId)).crearLinkDePago(solicitud);
    // Con credenciales de prueba se paga en el sandbox de Mercado Pago; con las reales, el link real.
    const url = modo === "real" ? link.initPoint : (link.sandboxInitPoint ?? link.initPoint);
    await input.auditar({
      action: ACCION_LINK_DE_PAGO,
      entity: "Order",
      entityId: pedido.id,
      changes: { code: pedido.code, monto, preferenceId: link.preferenceId, modo, url, referenciaMP, ...input.extra },
    });
    return { ok: true, url, preferenceId: link.preferenceId };
  } catch (e) {
    if (e instanceof SolicitudCobroInvalidaError) return { ok: false, tipo: "invalida", detalle: e.errores.map((x) => x.mensaje).join(" ") };
    if (e instanceof CobrosSinConexionError) return { ok: false, tipo: "sin-conexion" };
    if (e instanceof MercadoPagoApiError) return { ok: false, tipo: "api", status: e.status };
    return { ok: false, tipo: "otro" };
  }
}
