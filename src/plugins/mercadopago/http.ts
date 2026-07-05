/**
 * ADAPTER real: implementa `MercadoPagoClient` contra la API REST de Mercado Pago
 * (`/v1/payments`). Es el equivalente MP del adapter SOAP de ARCA (afip/soap.ts):
 * mismo patrón hexagonal y misma disciplina de testabilidad SIN red ni credenciales.
 *
 * Diseño (idéntico en espíritu al de ARCA):
 *  - Las funciones de armado de URL y de normalización/parseo de JSON son PURAS y
 *    exportadas (sin I/O), así se testean con fixtures representativos de MP.
 *  - El transporte HTTP vive detrás del puerto `HttpTransport` (inyectable): en
 *    producción hace `fetch` GET; en tests se mockea.
 *  - El access token (dato sensible por tenant, OAuth — ADR-025 §9) vive detrás
 *    del seam `ProveedorAccessToken` (inyectable). El default lanza "credencial
 *    requerida (acción humana)": enchufar el token es trivial y NO hay secretos
 *    en el repo. "El día de las credenciales es encender, no construir."
 *
 * NOTA: este adapter NO clasifica ni factura — solo NORMALIZA lo que devuelve MP
 * al modelo `PagoMP` del port. La decisión de qué se factura es del clasificador
 * (classifier.ts) y la ingesta (ingest.ts). Ver ADR-024 §2.d / ADR-025 §2/§12.
 */

import {
  CredencialesPort,
  CriterioBusqueda,
  EstadoPagoMP,
  MercadoPagoClient,
  MercadoPagoConfig,
  PaginaPagos,
  PagoMP,
  TipoOperacionMP,
} from "./port";

// ────────────────────────────────────────────────────────────────────────────
// Forma cruda de la API de MP (lo que nos importa; MP devuelve mucho más)
// ────────────────────────────────────────────────────────────────────────────

/** Un pago tal como lo devuelve `/v1/payments/{id}` (campos usados). */
export interface RawPagoMP {
  id?: number | string;
  status?: string;
  operation_type?: string;
  transaction_amount?: number;
  external_reference?: string | null;
  description?: string | null;
  /** Fecha de acreditación (ISO-8601 con offset). Fallback: `date_created`. */
  date_approved?: string | null;
  date_created?: string | null;
  fee_details?: Array<{ amount?: number }> | null;
  payer?: {
    id?: number | string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

/** Respuesta de `/v1/payments/search` (paginada). */
export interface RawBusquedaMP {
  paging?: { total?: number; limit?: number; offset?: number };
  results?: RawPagoMP[];
}

/** Cuerpo de error de MP (4xx/5xx). */
export interface RawErrorMP {
  message?: string;
  error?: string;
  status?: number;
  cause?: Array<{ code?: number | string; description?: string }>;
}

// ────────────────────────────────────────────────────────────────────────────
// Error tipado
// ────────────────────────────────────────────────────────────────────────────

/** La API de MP devolvió un status no-2xx (auth inválida, no encontrado, etc.). */
export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Código simbólico de MP (`error`), si vino. */
    readonly codigo?: string,
  ) {
    super(message);
    this.name = "MercadoPagoApiError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoint base + transporte (fetch en prod, mockeable en tests)
// ────────────────────────────────────────────────────────────────────────────

/** Base de la API de MP (única para homologación y producción; el token decide). */
export const MP_API_BASE = "https://api.mercadopago.com";

/** Respuesta HTTP cruda (status + cuerpo como texto, para parsear en las puras). */
export interface RespuestaHttp {
  status: number;
  body: string;
}

/** Transporte HTTP. En producción: `fetch` GET. En tests: mock. */
export interface HttpTransport {
  get(url: string, headers: Record<string, string>): Promise<RespuestaHttp>;
}

/** Transporte real: GET con el token en `Authorization`. No lanza en no-2xx: el
 * status viaja al parser puro (`lanzarSiErrorHttp`) que decide y tipa el error. */
export class FetchHttpTransport implements HttpTransport {
  async get(url: string, headers: Record<string, string>): Promise<RespuestaHttp> {
    const res = await fetch(url, { method: "GET", headers });
    const body = await res.text();
    return { status: res.status, body };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Seam del access token (credencial por tenant — NUNCA en el repo)
// ────────────────────────────────────────────────────────────────────────────

/** Provee un access token vigente por llamada (permite refresh transparente). */
export type ProveedorAccessToken = () => Promise<string>;

/**
 * Proveedor por defecto: NO tiene token. Lanza indicando que falta una acción
 * humana (vincular la cuenta por OAuth). Sustituilo por `tokenFijo` o
 * `tokenDesdeCredenciales` el día que haya credenciales. Ver ADR-025 §9.
 */
export const tokenNoConfigurado: ProveedorAccessToken = async () => {
  throw new Error(
    "Mercado Pago: access token no configurado — credencial requerida (acción " +
      "humana / OAuth). Inyectá un ProveedorAccessToken (tokenFijo o " +
      "tokenDesdeCredenciales). Ver ADR-025 §9.",
  );
};

/** Token fijo desde una config ya resuelta (p.ej. la del manifiesto del tenant). */
export function tokenFijo(config: MercadoPagoConfig): ProveedorAccessToken {
  return async () => {
    if (!config.accessToken) {
      throw new Error("Mercado Pago: MercadoPagoConfig sin accessToken.");
    }
    return config.accessToken;
  };
}

/**
 * Token desde el `CredencialesPort` del tenant (refresca solo si vence, ADR-025
 * §9). Es la forma de producción: cada llamada pide el token vigente.
 */
export function tokenDesdeCredenciales(
  credenciales: CredencialesPort,
  tenantId: string,
): ProveedorAccessToken {
  return async () => (await credenciales.credencialesDe(tenantId)).accessToken;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapeos puros MP → dominio (PagoMP)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Mapea el `status` de MP a `EstadoPagoMP`. Los estados desconocidos caen en
 * `pending` (conservador: el clasificador NO factura lo que no está `approved`).
 */
export function mapearEstado(status: string | undefined): EstadoPagoMP {
  switch (status) {
    case "approved":
      return "approved";
    case "pending":
      return "pending";
    case "in_process":
    case "authorized":
    case "in_mediation":
      return "in_process";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

/**
 * Mapea el `operation_type` de MP a `TipoOperacionMP` (insumo del clasificador,
 * ADR-025 §12.1). Lo desconocido → "otro" (el clasificador lo manda a REVISAR:
 * no se factura a ciegas). Las devoluciones/contracargos viajan por el ESTADO
 * (`refunded`), que ya frena la facturación, así que no dependen de este mapeo.
 */
export function mapearOperacion(operationType: string | undefined): TipoOperacionMP {
  switch (operationType) {
    case "regular_payment":
    case "pos_payment":
    case "recurring_payment":
      return "pago";
    case "money_transfer":
    case "account_fund":
      return "transferencia";
    default:
      return "otro";
  }
}

/** Convierte una fecha ISO-8601 de MP a `AAAAMMDD` (fecha del comprobante). */
export function fechaArca(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const fecha = iso.slice(0, 10); // "AAAA-MM-DD" (respeta el offset que mandó MP)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha.replace(/-/g, "") : undefined;
}

/** Suma las comisiones de `fee_details` (informativa). `undefined` si no hay. */
export function sumarComisiones(
  feeDetails: Array<{ amount?: number }> | null | undefined,
): number | undefined {
  if (!Array.isArray(feeDetails) || feeDetails.length === 0) return undefined;
  const total = feeDetails.reduce((s, f) => s + (Number(f?.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

/** Nombre legible de la contraparte (para panel/aprendizaje). */
export function nombreContraparte(payer: RawPagoMP["payer"]): string | undefined {
  if (!payer) return undefined;
  const nombre = [payer.first_name, payer.last_name].filter(Boolean).join(" ").trim();
  return nombre || payer.email || undefined;
}

/**
 * Normaliza un pago crudo de MP a `PagoMP` (lo que le importa al dominio).
 * Lanza si falta el `id` (respuesta inutilizable).
 */
export function normalizarPago(raw: RawPagoMP): PagoMP {
  if (raw.id === undefined || raw.id === null || raw.id === "") {
    throw new Error("Mercado Pago: respuesta de pago sin id.");
  }
  const pago: PagoMP = {
    id: String(raw.id),
    estado: mapearEstado(raw.status),
    monto: Number(raw.transaction_amount) || 0,
    externalReference: raw.external_reference ?? "",
    operacion: mapearOperacion(raw.operation_type),
  };
  const fecha = fechaArca(raw.date_approved ?? raw.date_created);
  if (fecha) pago.fechaAcreditacion = fecha;
  const comision = sumarComisiones(raw.fee_details);
  if (comision !== undefined) pago.comision = comision;
  if (raw.description) pago.descripcion = raw.description;
  const contraparteId = raw.payer?.id;
  if (contraparteId !== undefined && contraparteId !== null && contraparteId !== "") {
    pago.contraparteId = String(contraparteId);
  }
  const nombre = nombreContraparte(raw.payer);
  if (nombre) pago.contraparteNombre = nombre;
  return pago;
}

// ────────────────────────────────────────────────────────────────────────────
// Armado de URLs (PURO)
// ────────────────────────────────────────────────────────────────────────────

/** URL de `GET /v1/payments/{id}`. */
export function construirUrlPago(baseUrl: string, paymentId: string): string {
  return `${baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`;
}

/** Inicio del día ISO desde `AAAAMMDD` (UTC), para `begin_date`. */
function isoInicioDia(aaaammdd: string): string {
  const d = `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
  return `${d}T00:00:00.000Z`;
}

/** Fin del día ISO desde `AAAAMMDD` (UTC), para `end_date` (inclusive). */
function isoFinDia(aaaammdd: string): string {
  const d = `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
  return `${d}T23:59:59.999Z`;
}

/**
 * URL de `GET /v1/payments/search` desde un `CriterioBusqueda`. Paginación por
 * `offset` (el `cursor` opaco del port ES el offset). El filtro de fechas usa
 * `range=date_created` + `begin_date`/`end_date`; si falta un extremo se usa el
 * relativo de MP (`NOW-3650DAYS` / `NOW`).
 */
export function construirUrlBusqueda(baseUrl: string, criterio: CriterioBusqueda): string {
  const limit = criterio.limit ?? 50;
  const offset = criterio.cursor ? Number(criterio.cursor) : 0;
  const params = new URLSearchParams({
    sort: "date_created",
    criteria: "asc",
    limit: String(limit),
    offset: String(Number.isFinite(offset) ? offset : 0),
  });
  if (criterio.desde || criterio.hasta) {
    params.set("range", "date_created");
    params.set("begin_date", criterio.desde ? isoInicioDia(criterio.desde) : "NOW-3650DAYS");
    params.set("end_date", criterio.hasta ? isoFinDia(criterio.hasta) : "NOW");
  }
  return `${baseUrl}/v1/payments/search?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Parseo de respuestas (PURO)
// ────────────────────────────────────────────────────────────────────────────

/** Si la respuesta HTTP no es 2xx, lanza `MercadoPagoApiError` (mapea el cuerpo). */
export function lanzarSiErrorHttp(resp: RespuestaHttp): void {
  if (resp.status >= 200 && resp.status < 300) return;
  let detalle = resp.body.slice(0, 300);
  let codigo: string | undefined;
  try {
    const err = JSON.parse(resp.body) as RawErrorMP;
    detalle = err.message || err.error || detalle;
    codigo = err.error;
  } catch {
    // cuerpo no-JSON: usamos el texto crudo recortado
  }
  throw new MercadoPagoApiError(`Mercado Pago HTTP ${resp.status}: ${detalle}`, resp.status, codigo);
}

/** Parsea el cuerpo de `GET /v1/payments/{id}` → `PagoMP`. */
export function parsearPago(body: string): PagoMP {
  return normalizarPago(JSON.parse(body) as RawPagoMP);
}

/**
 * Parsea el cuerpo de `GET /v1/payments/search` → `PaginaPagos`. Calcula el
 * `nextCursor` (offset + limit) mientras `offset + limit < paging.total`; si MP
 * no informa `total`, avanza mientras la página venga llena.
 */
export function parsearPagina(body: string, criterio: CriterioBusqueda): PaginaPagos {
  const data = JSON.parse(body) as RawBusquedaMP;
  const results = Array.isArray(data.results) ? data.results : [];
  const pagos = results.map(normalizarPago);

  const offset = data.paging?.offset ?? (criterio.cursor ? Number(criterio.cursor) : 0);
  const limit = data.paging?.limit ?? criterio.limit ?? 50;
  const total = data.paging?.total;

  const nextOffset = offset + limit;
  const hayMas = total !== undefined ? nextOffset < total : results.length >= limit;

  return {
    pagos,
    nextCursor: hayMas ? String(nextOffset) : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente
// ────────────────────────────────────────────────────────────────────────────

/** Dependencias inyectables del cliente (todas con default de producción). */
export interface HttpMercadoPagoClientDeps {
  transport?: HttpTransport;
  baseUrl?: string;
}

/**
 * Adapter real de Mercado Pago. Implementa `MercadoPagoClient` sobre la API REST.
 *
 * Sin credenciales, el `token` por defecto (`tokenNoConfigurado`) hace que
 * cualquier operación falle con un mensaje claro de "acción humana requerida".
 * Con un `ProveedorAccessToken` real (tokenFijo / tokenDesdeCredenciales), funciona.
 */
export class HttpMercadoPagoClient implements MercadoPagoClient {
  private readonly transport: HttpTransport;
  private readonly baseUrl: string;
  private readonly token: ProveedorAccessToken;

  constructor(
    token: ProveedorAccessToken = tokenNoConfigurado,
    deps: HttpMercadoPagoClientDeps = {},
  ) {
    this.token = token;
    this.transport = deps.transport ?? new FetchHttpTransport();
    this.baseUrl = deps.baseUrl ?? MP_API_BASE;
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.token()}`,
      Accept: "application/json",
    };
  }

  async getPayment(paymentId: string): Promise<PagoMP> {
    const resp = await this.transport.get(
      construirUrlPago(this.baseUrl, paymentId),
      await this.headers(),
    );
    lanzarSiErrorHttp(resp);
    return parsearPago(resp.body);
  }

  async listPayments(criterio: CriterioBusqueda): Promise<PaginaPagos> {
    const resp = await this.transport.get(
      construirUrlBusqueda(this.baseUrl, criterio),
      await this.headers(),
    );
    lanzarSiErrorHttp(resp);
    return parsearPagina(resp.body, criterio);
  }
}
