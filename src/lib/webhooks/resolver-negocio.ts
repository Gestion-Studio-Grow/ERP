// ============================================================================
// WEBHOOKS POR NEGOCIO (Tanda S1) — el negocio sale de la CONEXIÓN, nunca del host.
// ============================================================================
//
// Un aviso de Mercado Pago o un mensaje de WhatsApp llega a una URL pública que comparten todos
// los negocios del despliegue. Resolver el negocio por el host (`getCurrentTenantId()`) con dos o
// más negocios o tira, o —peor— cae en el negocio equivocado. Acá se resuelve desde el dato que
// trae la propia conexión:
//
//  · Mercado Pago: la `external_reference` del pago (que se lee de MP con el `data.id` FIRMADO),
//    con formato `gsg:<slug>:<tipo>:<id>` (transitorio hasta P5, la conexión por negocio del Hub).
//  · WhatsApp: el `phone_number_id` del cuerpo (firmado por Meta) → slug, por el mapa
//    `WHATSAPP_PHONE_NUMBERS` (JSON `{ "<phone_number_id>": "<slug>" }`).
//
// Formato de las variables y ejemplo: docs/runbooks/webhooks-por-negocio.md.
//
// La parte de decisión es PURA (se testea sin base); las lecturas de `Tenant` entran por `deps`.

import { createRateLimiter, clientIpFromRequest, type RateLimitRule, type RateLimiter } from "@/lib/rate-limit";

// ── La referencia del cobro ──────────────────────────────────────────────────

export type TipoReferencia = "pedido" | "turno";
export type ReferenciaDeNegocio = { slug: string; tipo: TipoReferencia; id: string };

const REFERENCIA_GSG = /^gsg:([a-z0-9][a-z0-9-]{0,62}):(pedido|turno):([A-Za-z0-9_-]{1,64})$/;

/** La `external_reference` de un cobro con su negocio: `gsg:<slug>:<tipo>:<id>`. PURA. */
export function referenciaDeNegocio(slug: string, tipo: TipoReferencia, id: string): string {
  return `gsg:${slug}:${tipo}:${id}`;
}

/** Lee `gsg:<slug>:<tipo>:<id>`; cualquier otra cosa → null. PURA. */
export function leerReferenciaDeNegocio(ref: string | null | undefined): ReferenciaDeNegocio | null {
  const m = REFERENCIA_GSG.exec(String(ref ?? "").trim());
  return m ? { slug: m[1], tipo: m[2] as TipoReferencia, id: m[3] } : null;
}

const ID_DE_REFERENCIA = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * La `external_reference` del link de pago de un PEDIDO (bandeja de Pedidos, cobros-actions.ts):
 * `gsg:<slug>:pedido:<id>`, con el slug del negocio que genera el link. Es lo que el aviso lee para
 * saber de quién es el pago, con uno o con varios negocios en la base. PURA.
 */
export function referenciaDelLinkDePedido(slug: string, orderId: string): string {
  return referenciaDeNegocio(slug, "pedido", orderId);
}

export type ReferenciaDelLinkManual = { ok: true; referencia: string | undefined } | { ok: false; error: string };

/**
 * La `external_reference` de un link de cobro escrito a mano (Facturación → «Cobrar con link»),
 * siempre con el slug del negocio que lo genera. PURA.
 *  - vacía → sin referencia (venta suelta; con dos o más negocios el aviso no la puede atribuir:
 *    la conexión por negocio de P5 lo resuelve);
 *  - `pedido:<id>` → `gsg:<slug>:pedido:<id>`;
 *  - un id (letras, números, `-`, `_`; el de un turno) → `gsg:<slug>:turno:<id>`;
 *  - empieza con `gsg:` → RECHAZO: es la marca que dice de qué negocio es el pago; escrita a mano,
 *    un negocio podría hacer que el aviso cobre un pedido de OTRO;
 *  - cualquier otro texto → tal cual (como antes: no nombra un pedido ni un turno, y con dos o
 *    más negocios el aviso lo rechaza sin efecto).
 */
export function referenciaDelLinkManual(slug: string, escrita: string | null | undefined): ReferenciaDelLinkManual {
  const r = String(escrita ?? "").trim();
  if (!r) return { ok: true, referencia: undefined };
  if (/^gsg:/i.test(r)) {
    return { ok: false, error: "La referencia no puede empezar con «gsg:»: esa marca la pone el sistema. Escribí sólo el número de turno o de pedido." };
  }
  if (r.startsWith("pedido:")) {
    const id = r.slice("pedido:".length).trim();
    if (ID_DE_REFERENCIA.test(id)) return { ok: true, referencia: referenciaDeNegocio(slug, "pedido", id) };
    return { ok: true, referencia: r };
  }
  if (ID_DE_REFERENCIA.test(r)) return { ok: true, referencia: referenciaDeNegocio(slug, "turno", r) };
  return { ok: true, referencia: r };
}

/**
 * La referencia en el formato que entiende el handler del plugin (`duenoDelCobro`):
 * pedido → `pedido:<id>`, turno → el id pelado. PURA.
 */
export function referenciaParaElHandler(r: ReferenciaDeNegocio): string {
  return r.tipo === "pedido" ? `pedido:${r.id}` : r.id;
}

// ── Los secretos de Mercado Pago ─────────────────────────────────────────────

export type SecretosMP =
  | { tipo: "ninguno" }
  | { tipo: "ilegible" }
  | { tipo: "ok"; porNegocio: Map<string, string>; global: string | null };

/**
 * `MP_WEBHOOK_SECRETS` (JSON `{ "<slug>": "<secreto>" }`) + `MP_WEBHOOK_SECRET` (global). PURA.
 * Un JSON roto es `ilegible` (fail-closed: 503), no «sin secretos por negocio».
 */
export function leerSecretosMP(env: Record<string, string | undefined>): SecretosMP {
  const global = env.MP_WEBHOOK_SECRET?.trim() || null;
  const crudo = env.MP_WEBHOOK_SECRETS?.trim();
  const porNegocio = new Map<string, string>();
  if (crudo) {
    let obj: unknown;
    try {
      obj = JSON.parse(crudo);
    } catch {
      return { tipo: "ilegible" };
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { tipo: "ilegible" };
    for (const [slug, secreto] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof secreto !== "string" || !secreto.trim()) return { tipo: "ilegible" };
      porNegocio.set(slug.trim().toLowerCase(), secreto.trim());
    }
  }
  if (porNegocio.size === 0 && !global) return { tipo: "ninguno" };
  return { tipo: "ok", porNegocio, global };
}

/** Los candidatos para verificar la firma: uno por negocio y el global (clave `*global`). PURA. */
export const CLAVE_GLOBAL = "*global";
export function candidatosDeFirma(s: Extract<SecretosMP, { tipo: "ok" }>): { clave: string; secreto: string }[] {
  const c = [...s.porNegocio].map(([clave, secreto]) => ({ clave, secreto }));
  if (s.global) c.push({ clave: CLAVE_GLOBAL, secreto: s.global });
  return c;
}

/**
 * ¿La firma es del negocio resuelto? PURA.
 *  - el negocio tiene secreto propio → sólo vale ese (firmado con el de otro → rechazo);
 *  - no tiene → vale el global, con aviso al monitor (todavía no se le cargó el suyo);
 *  - ninguno de los dos firmó → rechazo.
 */
export function firmaDelNegocio(
  firmantes: readonly string[],
  slug: string,
  s: Extract<SecretosMP, { tipo: "ok" }>,
): "propio" | "global-con-aviso" | "firma-de-otro-negocio" {
  if (s.porNegocio.has(slug)) return firmantes.includes(slug) ? "propio" : "firma-de-otro-negocio";
  return firmantes.includes(CLAVE_GLOBAL) ? "global-con-aviso" : "firma-de-otro-negocio";
}

// ── Quién es el negocio de un pago ───────────────────────────────────────────

export type NegocioDelWebhook = { id: string; slug: string; subdomain: string | null; status: string; modules: string[] };

export interface DepsResolverNegocio {
  porSlug(slug: string): Promise<NegocioDelWebhook | null>;
  porSubdominio(subdominio: string): Promise<NegocioDelWebhook | null>;
  /** Hasta dos negocios de la base: alcanza para saber si hay uno solo. */
  primerosDos(): Promise<NegocioDelWebhook[]>;
}

export type MotivoRechazo =
  | "referencia-ausente"
  | "referencia-ilegible"
  | "negocio-inexistente"
  | "negocio-sin-mercadopago"
  | "host-de-otro-negocio";

export type NegocioResuelto =
  | { ok: true; negocio: NegocioDelWebhook; referencia: string | null }
  | { ok: false; motivo: MotivoRechazo; auditarEn: NegocioDelWebhook | null };

/** ¿El negocio tiene Mercado Pago activo? Módulo contratado y no suspendido. PURA. */
export function conMercadoPagoActivo(n: Pick<NegocioDelWebhook, "status" | "modules">): boolean {
  return n.status !== "SUSPENDED" && Array.isArray(n.modules) && n.modules.includes("mercadopago");
}

/**
 * El negocio de un pago de Mercado Pago, por su `external_reference`.
 *
 * `referencia` (si ok) es la que se le pasa al handler (`pedido:<id>`, el id del turno, o null en
 * una venta suelta). Compatibilidad: en una base con UN solo negocio (el caso de hoy en un
 * despliegue de un solo cliente) la referencia vieja (`pedido:<id>`, id de turno pelado o ninguna)
 * sigue yendo a ese negocio, como resolvía `getCurrentTenantId()`. Con dos o más, sin
 * `gsg:<slug>:…` no hay negocio y se rechaza.
 *
 * `subdominioDelHost`: si la URL del aviso es la de un negocio, tiene que ser el MISMO de la
 * referencia (una referencia de B que llega por la URL de A se rechaza y se audita).
 */
export async function resolverNegocioDelPago(
  input: { externalReference: string | null | undefined; subdominioDelHost: string | null },
  deps: DepsResolverNegocio,
): Promise<NegocioResuelto> {
  const delHost = input.subdominioDelHost ? await deps.porSubdominio(input.subdominioDelHost) : null;
  const crudo = String(input.externalReference ?? "").trim();
  const ref = leerReferenciaDeNegocio(crudo);

  if (!ref) {
    const todos = await deps.primerosDos();
    if (todos.length === 1 && !crudo.startsWith("gsg:")) {
      const unico = todos[0];
      if (!conMercadoPagoActivo(unico)) return { ok: false, motivo: "negocio-sin-mercadopago", auditarEn: unico };
      return { ok: true, negocio: unico, referencia: crudo || null };
    }
    return { ok: false, motivo: crudo ? "referencia-ilegible" : "referencia-ausente", auditarEn: delHost };
  }

  const negocio = await deps.porSlug(ref.slug);
  if (!negocio) return { ok: false, motivo: "negocio-inexistente", auditarEn: delHost };
  if (!conMercadoPagoActivo(negocio)) return { ok: false, motivo: "negocio-sin-mercadopago", auditarEn: negocio };
  if (delHost && delHost.id !== negocio.id) return { ok: false, motivo: "host-de-otro-negocio", auditarEn: negocio };
  return { ok: true, negocio, referencia: referenciaParaElHandler(ref) };
}

// ── WhatsApp: phone_number_id → slug ─────────────────────────────────────────

export type MapaTelefonosWA =
  | { tipo: "sin-cargar" }
  | { tipo: "ilegible" }
  | { tipo: "ok"; mapa: Map<string, string> };

/**
 * `WHATSAPP_PHONE_NUMBERS` (JSON `{ "<phone_number_id>": "<slug>" }`). PURA.
 * Vacía o `{}` → `sin-cargar`; JSON roto, no-objeto o una entrada que no es texto → `ilegible`
 * (el dueño quiso cargar un mapa y quedó mal: no es lo mismo que no cargarlo).
 */
export function leerMapaTelefonosWA(raw: string | null | undefined): MapaTelefonosWA {
  if (!raw?.trim()) return { tipo: "sin-cargar" };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { tipo: "ilegible" };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { tipo: "ilegible" };
  const mapa = new Map<string, string>();
  for (const [id, slug] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof slug !== "string" || !slug.trim() || !id.trim()) return { tipo: "ilegible" };
    mapa.set(id.trim(), slug.trim().toLowerCase());
  }
  return mapa.size ? { tipo: "ok", mapa } : { tipo: "sin-cargar" };
}

/** El mapa de `WHATSAPP_PHONE_NUMBERS`; sin cargar o ilegible → vacío. PURA. */
export function leerTelefonosWA(raw: string | null | undefined): Map<string, string> {
  const m = leerMapaTelefonosWA(raw);
  return m.tipo === "ok" ? m.mapa : new Map();
}

/** El `phone_number_id` del primer cambio del cuerpo de Meta (`entry[].changes[].value.metadata`). PURA. */
export function phoneNumberIdDe(payload: unknown): string | null {
  const entry = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entry)) return null;
  for (const e of entry) {
    const changes = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const id = (c as { value?: { metadata?: { phone_number_id?: unknown } } })?.value?.metadata?.phone_number_id;
      if (typeof id === "string" && id.trim()) return id.trim();
      if (typeof id === "number") return String(id);
    }
  }
  return null;
}

/** El slug del negocio de un mensaje entrante, o null si el número no está en el mapa. PURA. */
export function slugDelMensajeWA(payload: unknown, env: Record<string, string | undefined>): string | null {
  const id = phoneNumberIdDe(payload);
  return id ? (leerTelefonosWA(env.WHATSAPP_PHONE_NUMBERS).get(id) ?? null) : null;
}

type NegocioWA = Pick<NegocioDelWebhook, "id" | "slug" | "status">;
export interface DepsNegocioWA {
  porSlug(slug: string): Promise<NegocioWA | null>;
  primerosDos(): Promise<NegocioWA[]>;
}

export type MotivoSinNegocioWA = "numero-sin-negocio" | "mapa-ilegible" | "negocio-suspendido";

export type NegocioDelMensajeWA =
  | { ok: true; negocio: NegocioWA; via: "mapa" | "negocio-unico" }
  | { ok: false; slug: string | null; motivo: MotivoSinNegocioWA };

/**
 * El negocio de un mensaje entrante de WhatsApp.
 *  - número en `WHATSAPP_PHONE_NUMBERS` → ese negocio;
 *  - variable SIN cargar y base con UN solo negocio → ese negocio (compatibilidad de despliegue de
 *    un solo cliente, como Mercado Pago); el llamador avisa al monitor;
 *  - variable ILEGIBLE → sin negocio (`mapa-ilegible`), aun con un solo negocio: el llamador
 *    contesta 503 para que Meta reintente cuando se corrija;
 *  - negocio suspendido → sin negocio (`negocio-suspendido`), como Mercado Pago;
 *  - cualquier otro caso (número fuera de un mapa cargado, o dos o más negocios) → sin negocio.
 */
export async function negocioDelMensajeWA(
  payload: unknown,
  env: Record<string, string | undefined>,
  deps: DepsNegocioWA,
): Promise<NegocioDelMensajeWA> {
  const m = leerMapaTelefonosWA(env.WHATSAPP_PHONE_NUMBERS);
  if (m.tipo === "ilegible") return { ok: false, slug: null, motivo: "mapa-ilegible" };
  const id = phoneNumberIdDe(payload);
  const activo = (n: NegocioWA, via: "mapa" | "negocio-unico"): NegocioDelMensajeWA =>
    n.status === "SUSPENDED" ? { ok: false, slug: n.slug, motivo: "negocio-suspendido" } : { ok: true, negocio: n, via };
  if (m.tipo === "ok") {
    const slug = id ? (m.mapa.get(id) ?? null) : null;
    if (!slug) return { ok: false, slug: null, motivo: "numero-sin-negocio" };
    const n = await deps.porSlug(slug);
    return n ? activo(n, "mapa") : { ok: false, slug, motivo: "numero-sin-negocio" };
  }
  const todos = await deps.primerosDos();
  return todos.length === 1 ? activo(todos[0], "negocio-unico") : { ok: false, slug: null, motivo: "numero-sin-negocio" };
}

// ── Rate limit de los webhooks ───────────────────────────────────────────────

/**
 * 60 POST por minuto por IP y por webhook, ANTES de verificar nada: un flood de POST forjados no
 * llega a calcular HMAC ni a tocar la base. En memoria por proceso (rate-limit.ts, mismos límites
 * conocidos). Mercado Pago y Meta mandan bastante menos que eso por negocio.
 */
export const WEBHOOK_RULE: RateLimitRule = { max: 60, windowMs: 60 * 1000 };
const limitadores = new Map<string, RateLimiter>();

/** Registra el hit; devuelve los segundos de espera si la IP superó el límite, o null. */
export function limitarWebhook(canal: "mercadopago" | "whatsapp", request: Request, limiter?: RateLimiter): number | null {
  let l = limiter ?? limitadores.get(canal);
  if (!l) {
    l = createRateLimiter(WEBHOOK_RULE);
    limitadores.set(canal, l);
  }
  const key = `webhook-${canal}:${clientIpFromRequest(request)}`;
  if (l.blocked(key)) return Math.max(1, Math.ceil(l.retryAfterMs(key) / 1000));
  l.fail(key);
  return null;
}

/** Respuesta 429 con `Retry-After`. */
export function respuestaDemasiados(segundos: number): Response {
  return Response.json({ ok: false, error: "demasiados-avisos" }, { status: 429, headers: { "Retry-After": String(segundos) } });
}
