// Plata de buscatufoto: reservar el cupón al crear el pedido y marcar pagado (transacciones Serializable) y
// Mercado Pago por `fetch` con el token del FOTÓGRAFO (cobra él; la plataforma no toca la plata).
// Contrato: celula-negocios-digitales/buscatufoto/docs/API.md → «Mercado Pago».
//
// Reglas de plata:
//  - Nunca se confía en lo que manda el webhook ni el comprador: siempre se re-consulta a MP
//    (`/v1/payments/search?external_reference=<pedidoId>`) y sólo un pago `approved`, en ARS, con
//    `transaction_amount === total` (números, no strings) marca pagado.
//  - El cupón se RESERVA al crear el pedido (`crearPedidoReservandoCupon`: exige `activo` y `usos < usosMax`,
//    0 = ilimitado, y hace `usos + 1` en el mismo tx que inserta el pedido). Si el pedido se descarta (MP no
//    armó la preferencia) se LIBERA (`descartarPedido`, `usos − 1`). `marcarPagado` ya no toca `usos`.
//  - `marcarPagado` es idempotente: si ya está pagado no hace nada.
//  - Lección DB-4: chequear-y-escribir no es atómico → Serializable + reintento ante P2034.
//
// DEUDA: el cobro va con el token del fotógrafo; lo correcto es OAuth de marketplace (un `collector_id` por
// fotógrafo, `marketplace_fee` = comisión).

import { timingSafeEqual } from "node:crypto";
import { Prisma, type BtfPedido } from "@/generated/prisma/client";
import { masterKeyDesdeEnv, openSecret, type SealedCredential } from "@/lib/fiscal/cert-crypto";
import { btfDb } from "./db";
import { ErrorBtf } from "./http";
import { motivoCuponInvalido } from "./precios";
import type { Cupon } from "./tipos";
import { esHostDeBuscatufoto } from "@/lib/sitio-buscatufoto";

export const MP_API = "https://api.mercadopago.com";
/** Comisión de la plataforma por plan (celula-negocios-digitales/buscatufoto/src/lib/planes.ts). */
export const COMISION_POR_PLAN: Readonly<Record<string, number>> = { libre: 0.09, pro: 0 };

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

// ---------- Transacciones Serializable ----------

const esSerializacion = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: unknown }).code === "P2034" || /could not serialize|40001/.test(String((e as { message?: unknown }).message)));

type Tx = Prisma.TransactionClient;

/** Corre `fn` en Serializable; ante conflicto de serialización reintenta (con espera corta al azar). */
async function serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await btfDb.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (intento < 8 && esSerializacion(e)) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * (intento + 1)));
        continue;
      }
      throw e;
    }
  }
}

/** Suma `delta` a los usos del cupón `codigo` (sin distinguir mayúsculas). Nunca baja de 0. */
async function moverUsos(tx: Tx, albumId: string, codigo: string, delta: 1 | -1): Promise<Cupon | null> {
  const a = await tx.btfAlbum.findUnique({ where: { id: albumId }, select: { cupones: true } });
  if (!a || !Array.isArray(a.cupones)) return null;
  const cod = codigo.toUpperCase();
  const lista = a.cupones as unknown as Cupon[];
  const c = lista.find((x) => x.codigo.toUpperCase() === cod);
  if (!c) return null;
  const cupones = lista.map((x) => (x === c ? { ...x, usos: Math.max(0, (x.usos || 0) + delta) } : x));
  await tx.btfAlbum.update({ where: { id: albumId }, data: { cupones: cupones as unknown as Prisma.InputJsonValue } });
  return c;
}

// ---------- Crear y descartar pedido (reserva del cupón) ----------

/**
 * Inserta el pedido y, si trae cupón, lo reserva (`usos + 1`) en la MISMA transacción Serializable, releyendo
 * el cupón adentro: `activo` y `usos < usosMax` (0 = ilimitado). Si ya no alcanza → ErrorBtf `cupon` (422).
 */
export async function crearPedidoReservandoCupon(data: Prisma.BtfPedidoUncheckedCreateInput): Promise<BtfPedido> {
  if (!data.cupon) return btfDb.btfPedido.create({ data });
  const codigo = data.cupon;
  return serializable(async (tx) => {
    const a = await tx.btfAlbum.findUnique({ where: { id: data.albumId }, select: { cupones: true } });
    const lista = a && Array.isArray(a.cupones) ? (a.cupones as unknown as Cupon[]) : [];
    const motivo = motivoCuponInvalido(lista.find((x) => x.codigo.toUpperCase() === codigo.toUpperCase()));
    if (motivo) throw new ErrorBtf("cupon", motivo);
    await moverUsos(tx, data.albumId, codigo, 1);
    return tx.btfPedido.create({ data });
  });
}

/** Borra un pedido que no llegó a cobrarse (pendiente) y libera su cupón (`usos − 1`), en una transacción. */
export async function descartarPedido(pedidoId: string): Promise<void> {
  await serializable(async (tx) => {
    const p = await tx.btfPedido.findUnique({ where: { id: pedidoId } });
    if (!p || p.estado !== "pendiente") return;
    const r = await tx.btfPedido.deleteMany({ where: { id: pedidoId, estado: "pendiente" } });
    if (r.count === 1 && p.cupon) await moverUsos(tx, p.albumId, p.cupon, -1);
  });
}

// ---------- Marcar pagado ----------

/**
 * Pasa el pedido a `pagado` en una transacción Serializable. El cupón ya se reservó al crearlo: acá no se toca.
 * Idempotente: si ya estaba pagado devuelve `cambio: false` y no toca nada.
 */
export async function marcarPagado(pedidoId: string, referencia: string): Promise<{ pedido: BtfPedido; cambio: boolean }> {
  return serializable(async (tx) => {
    const p = await tx.btfPedido.findUnique({ where: { id: pedidoId } });
    if (!p) throw new ErrorBtf("no-encontrado", "No encontramos ese pedido.");
    if (p.estado === "pagado") return { pedido: p, cambio: false };
    // Guarda condicional además del Serializable: sólo un escritor pasa de pendiente a pagado.
    const r = await tx.btfPedido.updateMany({
      where: { id: pedidoId, estado: "pendiente" },
      data: { estado: "pagado", referenciaPago: referencia.slice(0, 120), pagadoEn: new Date() },
    });
    return { pedido: await tx.btfPedido.findUniqueOrThrow({ where: { id: pedidoId } }), cambio: r.count === 1 };
  });
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

// ---------- Preferencia ----------

/** Hosts de desarrollo admitidos además de los de buscatufoto. */
const HOST_DESARROLLO = /^(?:buscatufoto\.)?localhost(?::\d{1,5})?$/;

/**
 * `https://<host>` del request (x-forwarded-host en Vercel). Sólo hosts de buscatufoto (`esHostDeBuscatufoto`)
 * o `localhost` / `buscatufoto.localhost` (desarrollo): el host va a la vuelta y al webhook de MP, no se inyecta.
 */
export function origenDe(request: Request): string {
  const h = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).split(",")[0].trim().toLowerCase();
  const formaValida = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(h);
  if (!formaValida || !(esHostDeBuscatufoto(h) || HOST_DESARROLLO.test(h))) {
    throw new ErrorBtf("host", "No pudimos armar el enlace de pago: este pedido no llegó por la dirección de buscatufoto. Entrá por buscatufoto y probá de nuevo.");
  }
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
