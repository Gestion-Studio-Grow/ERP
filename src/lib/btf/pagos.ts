// Plata de buscatufoto: marcar pagado (transacción Serializable, cupón consumido en el mismo tx) y
// Mercado Pago por `fetch` con el token del FOTÓGRAFO (cobra él; la plataforma no toca la plata).
// Contrato: celula-negocios-digitales/buscatufoto/docs/API.md → «Mercado Pago».
//
// Reglas de plata:
//  - Nunca se confía en lo que manda el webhook ni el comprador: siempre se re-consulta a MP
//    (`/v1/payments/search?external_reference=<pedidoId>`) y sólo un pago `approved`, en ARS, con
//    `transaction_amount === total` (números, no strings) marca pagado.
//  - `marcarPagado` es idempotente: si ya está pagado no hace nada (ni vuelve a consumir el cupón).
//  - Lección DB-4: chequear-y-escribir no es atómico → Serializable + reintento ante P2034.
//
// DEUDA: el webhook de `payment` sin `?pedido=` prueba con el token de cada fotógrafo con credencial (≤ 20).
// Lo correcto es OAuth de marketplace (un `collector_id` por fotógrafo, `marketplace_fee` = comisión).

import { timingSafeEqual } from "node:crypto";
import { Prisma, type BtfPedido } from "@/generated/prisma/client";
import { masterKeyDesdeEnv, openSecret, type SealedCredential } from "@/lib/fiscal/cert-crypto";
import { btfDb } from "./db";
import { ErrorBtf } from "./http";
import type { Cupon } from "./tipos";

export const MP_API = "https://api.mercadopago.com";
/** Comisión de la plataforma por plan (celula-negocios-digitales/buscatufoto/src/lib/planes.ts). */
export const COMISION_POR_PLAN: Readonly<Record<string, number>> = { libre: 0.09, pro: 0 };
/** Tope de fotógrafos a los que se les prueba el token en el webhook sin pedido (ver DEUDA). */
export const TOPE_FOTOGRAFOS_WEBHOOK = 20;

type Fetch = typeof fetch;

export function comisionDe(plan: string, total: number): number {
  return Math.round(total * (COMISION_POR_PLAN[plan] ?? COMISION_POR_PLAN.libre));
}

/** Clave del pedido en tiempo constante. */
export function claveCoincide(dada: string | null | undefined, guardada: string): boolean {
  if (!dada || !guardada) return false;
  const bytes = new TextEncoder();
  const a = bytes.encode(dada);
  const b = bytes.encode(guardada);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Marcar pagado ----------

const esSerializacion = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: unknown }).code === "P2034" || /could not serialize|40001/.test(String((e as { message?: unknown }).message)));

/**
 * Pasa el pedido a `pagado` y consume su cupón (`usos + 1`) en la MISMA transacción Serializable.
 * Idempotente: si ya estaba pagado devuelve `cambio: false` y no toca nada.
 */
export async function marcarPagado(pedidoId: string, referencia: string): Promise<{ pedido: BtfPedido; cambio: boolean }> {
  for (let intento = 0; ; intento++) {
    try {
      return await btfDb.$transaction(
        async (tx) => {
          const p = await tx.btfPedido.findUnique({ where: { id: pedidoId } });
          if (!p) throw new ErrorBtf("no-encontrado", "No encontramos ese pedido.");
          if (p.estado === "pagado") return { pedido: p, cambio: false };
          // Guarda condicional además del Serializable: sólo un escritor pasa de pendiente a pagado.
          const r = await tx.btfPedido.updateMany({
            where: { id: pedidoId, estado: "pendiente" },
            data: { estado: "pagado", referenciaPago: referencia.slice(0, 120), pagadoEn: new Date() },
          });
          if (r.count === 0) return { pedido: await tx.btfPedido.findUniqueOrThrow({ where: { id: pedidoId } }), cambio: false };
          if (p.cupon) {
            const a = await tx.btfAlbum.findUnique({ where: { id: p.albumId }, select: { cupones: true } });
            if (a && Array.isArray(a.cupones)) {
              const codigo = p.cupon.toUpperCase();
              const cupones = (a.cupones as unknown as Cupon[]).map((c) => (c.codigo.toUpperCase() === codigo ? { ...c, usos: (c.usos || 0) + 1 } : c));
              await tx.btfAlbum.update({ where: { id: p.albumId }, data: { cupones: cupones as unknown as Prisma.InputJsonValue } });
            }
          }
          return { pedido: await tx.btfPedido.findUniqueOrThrow({ where: { id: pedidoId } }), cambio: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (intento < 3 && esSerializacion(e)) continue;
      throw e;
    }
  }
}

// ---------- Token del fotógrafo ----------

/** Access token de MP del fotógrafo (descifrado) o null si no cargó uno. Nunca se loguea. */
export async function tokenDelFotografo(fotografoId: string): Promise<string | null> {
  const f = await btfDb.btfFotografo.findUnique({ where: { id: fotografoId }, select: { mpCredencial: true } });
  return f?.mpCredencial ? abrirToken(f.mpCredencial) : null;
}

function abrirToken(sobre: unknown): string {
  try {
    return openSecret(sobre as SealedCredential, masterKeyDesdeEnv());
  } catch {
    throw new ErrorBtf("no-configurado", "No pudimos leer la credencial de Mercado Pago. Volvé a cargar el Access Token.");
  }
}

// ---------- Verificación contra MP ----------

interface PagoMp {
  id?: unknown;
  status?: unknown;
  transaction_amount?: unknown;
  currency_id?: unknown;
  external_reference?: unknown;
}

/** El primer pago que paga ESTE pedido: approved, ARS, de este pedido y por el total exacto. PURA. */
export function pagoQuePaga(pagos: unknown, pedido: Pick<BtfPedido, "id" | "total">): PagoMp | null {
  if (!Array.isArray(pagos)) return null;
  for (const p of pagos as PagoMp[]) {
    if (!p || typeof p !== "object") continue;
    if (p.status !== "approved") continue;
    if (typeof p.transaction_amount !== "number" || p.transaction_amount !== pedido.total) continue;
    if (p.currency_id !== "ARS") continue;
    if (String(p.external_reference ?? "") !== pedido.id) continue;
    return p;
  }
  return null;
}

export interface DepsMp {
  fetch?: Fetch;
  /** token ya descifrado; si no viene se lee del fotógrafo del pedido */
  token?: string | null;
  marcar?: typeof marcarPagado;
}

/**
 * Re-consulta MP por el pedido y lo marca pagado si corresponde. Devuelve true si quedó pagado.
 * Ante MP caído o token ausente devuelve false (el pedido sigue pendiente; nunca se marca a ciegas).
 */
export async function verificarEnMp(
  pedido: Pick<BtfPedido, "id" | "total" | "estado" | "metodo" | "fotografoId">,
  deps: DepsMp = {},
): Promise<boolean> {
  if (pedido.estado === "pagado") return true;
  if (pedido.metodo !== "mercadopago") return false;
  const token = deps.token !== undefined ? deps.token : await tokenDelFotografo(pedido.fotografoId);
  if (!token) return false;
  const f = deps.fetch ?? fetch;
  let r: Response;
  try {
    r = await f(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(pedido.id)}&sort=date_created&criteria=desc`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return false;
  }
  if (!r.ok) return false;
  const cuerpo = (await r.json().catch(() => null)) as { results?: unknown } | null;
  const pago = pagoQuePaga(cuerpo?.results, pedido);
  if (!pago) return false;
  await (deps.marcar ?? marcarPagado)(pedido.id, `MP-${String(pago.id ?? "")}`);
  return true;
}

/**
 * Webhook de `payment` sin pedido conocido: busca el pago con el token de cada fotógrafo con credencial
 * (≤ TOPE) hasta encontrar al dueño, y re-verifica el pedido de su `external_reference`. Ver DEUDA.
 */
export async function verificarPagoSinPedido(pagoId: string, deps: { fetch?: Fetch } = {}): Promise<boolean> {
  if (!/^\d{1,20}$/.test(pagoId)) return false;
  const f = deps.fetch ?? fetch;
  const fotografos = await btfDb.btfFotografo.findMany({
    where: { mpCredencial: { not: Prisma.DbNull } },
    select: { id: true, mpCredencial: true },
    take: TOPE_FOTOGRAFOS_WEBHOOK + 1,
  });
  if (fotografos.length > TOPE_FOTOGRAFOS_WEBHOOK) {
    console.error("[btf] webhook MP: más fotógrafos con credencial que el tope; falta OAuth de marketplace");
    return false;
  }
  for (const fot of fotografos) {
    let token: string;
    try {
      token = abrirToken(fot.mpCredencial);
    } catch {
      continue;
    }
    let r: Response;
    try {
      r = await f(`${MP_API}/v1/payments/${pagoId}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const pago = (await r.json().catch(() => null)) as PagoMp | null;
    const pedidoId = String(pago?.external_reference ?? "");
    if (!pedidoId) return false;
    const pedido = await btfDb.btfPedido.findUnique({ where: { id: pedidoId } });
    if (!pedido || pedido.fotografoId !== fot.id) return false;
    return verificarEnMp(pedido, { fetch: f, token });
  }
  return false;
}

// ---------- Preferencia ----------

/** `https://<host>` del request (x-forwarded-host en Vercel). Host validado: nada de inyectar URLs. */
export function origenDe(request: Request): string {
  const h = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(h)) throw new ErrorBtf("invalido", "No pudimos armar el enlace de pago.");
  return `https://${h}`;
}

export interface DatosPreferencia {
  pedidoId: string;
  clave: string;
  slug: string;
  albumNombre: string;
  cantidad: number;
  total: number;
  comprador: { nombre: string; email: string };
  origen: string;
}

/** Cuerpo de la preferencia según API.md. PURA. */
export function cuerpoPreferencia(d: DatosPreferencia): Record<string, unknown> {
  const vuelta = `${d.origen}/a/${encodeURIComponent(d.slug)}/pedido/${encodeURIComponent(d.pedidoId)}?clave=${encodeURIComponent(d.clave)}`;
  return {
    items: [
      {
        id: d.pedidoId,
        title: `${d.cantidad} ${d.cantidad === 1 ? "foto" : "fotos"} de ${d.albumNombre}`.slice(0, 250),
        quantity: 1,
        unit_price: d.total,
        currency_id: "ARS",
      },
    ],
    payer: { name: d.comprador.nombre, email: d.comprador.email },
    external_reference: d.pedidoId,
    metadata: { pedido_id: d.pedidoId },
    notification_url: `${d.origen}/api/btf/mp/webhook?pedido=${encodeURIComponent(d.pedidoId)}`,
    back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
    auto_return: "approved",
  };
}

/** Crea la preferencia con el token del fotógrafo. Devuelve `{ id, initPoint }` o tira 503. */
export async function crearPreferencia(d: DatosPreferencia, token: string, f: Fetch = fetch): Promise<{ id: string; initPoint: string }> {
  let r: Response;
  try {
    r = await f(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-idempotency-key": d.pedidoId },
      body: JSON.stringify(cuerpoPreferencia(d)),
      cache: "no-store",
    });
  } catch {
    throw new ErrorBtf("no-configurado", "Mercado Pago no respondió. Probá de nuevo en un rato.");
  }
  const cuerpo = (await r.json().catch(() => null)) as { id?: unknown; init_point?: unknown } | null;
  if (!r.ok || typeof cuerpo?.id !== "string" || typeof cuerpo.init_point !== "string") {
    throw new ErrorBtf("no-configurado", "Mercado Pago rechazó el cobro. El fotógrafo tiene que revisar su Access Token.");
  }
  return { id: cuerpo.id, initPoint: cuerpo.init_point };
}
