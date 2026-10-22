"use server";

// ============================================================================
// EL REPARTO — las acciones de «Armar reparto» y «Rendición del cadete» (Magra, tanda 2 · 2C).
// ============================================================================
//
// Cada export de un archivo "use server" es un endpoint: todos piden `orders:manage` (el
// recordatorio, `orders:read`, como la constancia de siempre), exigen el mostrador boutique prendido
// en un comercio y acotan todo por el `tenantId` de la sesión. Un id de otro negocio no se
// encuentra: rechazo y nada grabado.
//
// LA PLATA NO SE MUEVE ACÁ. Cobrar y entregar lo hacen las acciones de siempre, con sus reglas:
// `cobrarPedido` (medio obligatorio, día cerrado, sólo lo que no estaba cobrado, el total de la
// BASE, idempotente por la clave del cobro) y `entregarPedido` (compare-and-set sobre Listo). Lo
// único que escribe este archivo son las marcas del reparto en la auditoría del pedido
// (reparto-core.ts): salió, volvió, se rindió.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { cobrarPedido, entregarPedido, type OrderActionState } from "@/lib/order-actions";
import { leerPagos } from "@/lib/cobro/leer-pagos";
import { leerMedioDeCobro } from "@/lib/caja/medio-cobro";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { ACCION_REPARTO, idDeReparto, type MarcaDeReparto, type ResultadoDeRendicion } from "./reparto-core";
import { ultimaMarcaDelPedido } from "./datos.server";

const RUTAS = ["/admin/pedidos", "/admin/pedidos/reparto", "/admin/pedidos/reparto/rendicion"];
const MAX_POR_SALIDA = 60;
const MAX_TEXTO = 120;

const APAGADO = "El reparto es parte del mostrador nuevo y no está prendido en este negocio.";

async function mostradorBoutique(): Promise<boolean> {
  const [identidad, interruptores] = await Promise.all([getTenantIdentity(), interruptoresDelNegocio()]);
  return identidad.isRetail && mostradorBoutiquePrendido(interruptores);
}

function revalidar() {
  for (const r of RUTAS) revalidatePath(r);
}

function texto(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  return s || null;
}

async function marcar(orderId: string, marca: MarcaDeReparto) {
  await auditAdmin({ action: ACCION_REPARTO, entity: "Order", entityId: orderId, changes: marca });
}

export type ResultadoDeSalida = { ok: true; mensaje: string; salieron: number[] } | { ok: false; error: string };

/**
 * «Salió el cadete»: marca en la calle los envíos LISTOS de la hoja (`id`, uno por envío). Los que
 * ya salieron no se vuelven a marcar y los que todavía no están listos no salen (se dice cuáles).
 * Si algún id no es un envío de este negocio, no se marca ninguno.
 */
export async function salioElReparto(formData: FormData): Promise<ResultadoDeSalida> {
  await requireCapability("orders:manage");
  if (!(await mostradorBoutique())) return { ok: false, error: APAGADO };
  const tenantId = await getCurrentTenantId();
  const ids = [...new Set(formData.getAll("id").map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "No hay envíos listos en esta hoja: no salió nada." };
  if (ids.length > MAX_POR_SALIDA) return { ok: false, error: `Son muchos envíos para una salida (hasta ${MAX_POR_SALIDA}).` };

  const ordenes = await prisma.order.findMany({
    where: { tenantId, id: { in: ids }, fulfillment: "DELIVERY" },
    select: { id: true, code: true, status: true },
  });
  if (ordenes.length !== ids.length) {
    return { ok: false, error: "Algún envío de la hoja ya no está (o no es de este negocio). Recargá la hoja: no salió nada." };
  }
  const reparto = idDeReparto(new Date(), Math.random());
  const franja = texto(formData.get("franja"));
  const cadete = texto(formData.get("cadete"));
  const salieron: number[] = [];
  const sinListo: number[] = [];
  for (const o of ordenes.sort((a, b) => a.code - b.code)) {
    if (o.status !== "READY") {
      sinListo.push(o.code);
      continue;
    }
    // Ya en la calle (otra pantalla, o el doble toque): no se marca de nuevo.
    if ((await ultimaMarcaDelPedido(tenantId, o.id))?.tipo === "salio") continue;
    await marcar(o.id, { tipo: "salio", reparto, franja, cadete });
    salieron.push(o.code);
  }
  revalidar();
  const partes = [
    salieron.length === 0
      ? "No salió ninguno nuevo: los listos ya estaban en la calle."
      : `${salieron.length === 1 ? "Salió 1 envío" : `Salieron ${salieron.length} envíos`} con el cadete (${salieron.map((c) => `#${c}`).join(", ")}).`,
  ];
  if (sinListo.length) partes.push(`No salieron porque no están listos: ${sinListo.map((c) => `#${c}`).join(", ")}.`);
  return { ok: true, mensaje: partes.join(" "), salieron };
}

const RESULTADOS = new Set(["cobrado", "ya-pago", "a-cobrar", "volvio"]);

function formularioDe(pares: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of pares) fd.append(k, v);
  return fd;
}

/**
 * Rendir UN envío que volvió con el cadete (MG-056). `resultado`:
 *   · `cobrado`  — lo cobró: con los campos del PieDeCobro (`paymentMethod`, `pago.*`, `recibido`),
 *                  se cobra con `cobrarPedido` y se entrega con `entregarPedido`;
 *   · `ya-pago`  — ya estaba pago: se entrega;
 *   · `a-cobrar` — lo dejó sin cobrar: se entrega «Queda a cobrar» (pasa a la columna A cobrar);
 *   · `volvio`   — no lo entregó (`motivo`): vuelve a Listos, nada de plata.
 * Rendir dos veces el mismo envío contesta «ya estaba rendido» sin tocar nada.
 */
export async function rendirPedido(formData: FormData): Promise<OrderActionState> {
  await requireCapability("orders:manage");
  if (!(await mostradorBoutique())) return { ok: false, error: APAGADO };
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  const resultado = String(formData.get("resultado") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el envío a rendir." };
  if (!RESULTADOS.has(resultado)) return { ok: false, error: "Elegí qué pasó con el envío: cobrado, ya pagado, sin cobrar o volvió." };

  const o = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, code: true, status: true, paid: true, total: true, fulfillment: true, customerName: true },
  });
  if (!o || o.fulfillment !== "DELIVERY") return { ok: false, error: "No se encontró ese envío. Recargá la rendición." };
  const ultima = await ultimaMarcaDelPedido(tenantId, id);
  if (ultima?.tipo === "rendido") {
    revalidar();
    return { ok: true, mensaje: `El pedido #${o.code} ya estaba rendido.`, yaEstaba: true };
  }
  if (ultima?.tipo !== "salio") return { ok: false, error: `El pedido #${o.code} no figura en la calle con el cadete. Recargá la rendición.` };
  if (o.status === "CANCELLED") return { ok: false, error: `El pedido #${o.code} está anulado: no se rinde.` };
  if (o.status !== "READY") {
    return { ok: false, error: `El pedido #${o.code} ya no está Listo (alguien lo movió desde la bandeja). Recargá la rendición.` };
  }
  const reparto = ultima.reparto;
  const total = Number(o.total);
  const soloId = formularioDe([["id", id]]);
  const rendido = (r: ResultadoDeRendicion, pagos: { medio: "EFECTIVO" | "MERCADOPAGO" | "TRANSFERENCIA"; monto: number }[]) =>
    marcar(id, { tipo: "rendido", reparto, resultado: r, code: o.code, cliente: o.customerName, total, pagos });

  if (resultado === "volvio") {
    const motivo = texto(formData.get("motivo")) ?? "Volvió sin entregar";
    await marcar(id, { tipo: "volvio", reparto, motivo });
    revalidar();
    return { ok: true, mensaje: `El pedido #${o.code} volvió (${motivo}): queda en Listos para el próximo reparto.` };
  }

  if (resultado === "ya-pago") {
    if (!o.paid) return { ok: false, error: `El pedido #${o.code} no figura cobrado: rendilo con el medio con que pagó o «Lo dejó sin cobrar».` };
    const r = await entregarPedido(null, soloId);
    if (!r?.ok) return r;
    await rendido("ya-pago", []);
    revalidar();
    return { ok: true, mensaje: `Pedido #${o.code} entregado (ya estaba pago).` };
  }

  if (resultado === "a-cobrar") {
    if (o.paid) return { ok: false, error: `El pedido #${o.code} ya está cobrado: rendilo como «Ya pagó».` };
    const r = await entregarPedido(null, formularioDe([["id", id], ["quedaACobrar", "on"]]));
    if (!r?.ok) return r;
    await rendido("a-cobrar", []);
    revalidar();
    return { ok: true, mensaje: `Pedido #${o.code} entregado sin cobrar: queda en «A cobrar» por ${textoPlata(total)}.` };
  }

  // COBRADO: primero el cobro (la acción de siempre: si se rechaza, no se entrega ni se marca),
  // después la entrega. Cobrado y Listo es un estado verdadero: si la entrega no llega a correr,
  // el reintento contesta «ya estaba cobrado» con el mismo medio y entrega.
  const pagos = leerPagos((campo) => formData.getAll(campo).map(String));
  if (!pagos.ok) return { ok: false, error: pagos.error };
  const yaPago = o.paid;
  const cobro = await cobrarPedido(null, formData);
  if (!cobro?.ok) return cobro;
  const entrega = await entregarPedido(null, soloId);
  if (!entrega?.ok) {
    revalidar();
    return {
      ok: false,
      error: `El pedido #${o.code} quedó cobrado, pero no se pudo marcar entregado: ${entrega?.error ?? "volvé a intentar"}. Al reintentar no se cobra dos veces.`,
    };
  }
  const medio = leerMedioDeCobro(pagos.medio);
  await rendido(
    yaPago ? "ya-pago" : "cobrado",
    yaPago ? [] : pagos.asientos ? pagos.asientos.map((a) => ({ medio: a.medio, monto: a.monto })) : medio ? [{ medio, monto: total }] : [],
  );
  revalidar();
  return {
    ok: true,
    mensaje: yaPago ? `El pedido #${o.code} ya estaba cobrado: quedó entregado.` : `Pedido #${o.code} cobrado y entregado: ${textoPlata(total)}.`,
    ...(cobro.vuelto !== undefined ? { vuelto: cobro.vuelto } : {}),
    ...(cobro.venta ? { venta: cobro.venta } : {}),
  };
}

/**
 * Constancia del «Recordarle» el pago de un pedido entregado sin cobrar (el WhatsApp lo abre una
 * persona; esto sólo deja escrito que se le recordó). Nunca lanza hacia la pantalla.
 */
export async function registrarRecordatorioDeCobro(orderId: string): Promise<void> {
  await requireCapability("orders:read");
  const tenantId = await getCurrentTenantId();
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: { code: true } });
  if (!o) return;
  await auditAdmin({ action: "whatsapp", entity: "Order", entityId: id, changes: { tipo: "recordatorio-cobro", code: o.code } });
}
