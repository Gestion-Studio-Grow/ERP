// Verificación de la firma `x-signature` de los webhooks de Mercado Pago (v2).
// Cierra el riesgo de un POST forjado que marque un pago como acreditado y dispare
// una auto-factura falsa (ADR-024). PURA y testeable: no lee env ni toca la red.
//
// MP firma un "manifest" con HMAC-SHA256 y el `webhookSecret` de la aplicación:
//   header `x-signature`:  "ts=<unix>,v1=<hmac_hex>"
//   header `x-request-id`: id de la request (va en el manifest)
//   manifest:              "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// Reglas de MP:
//   - `data.id`: si es alfanumérico, se compara en minúsculas.
//   - un segmento cuyo valor falta se OMITE del manifest.
// Se recomputa el HMAC y se compara contra `v1` en tiempo constante.

import { createHmac, timingSafeEqual } from "node:crypto";

export type MpSignatureParts = { ts: string; v1: string };

/** Parsea el header `x-signature` ("ts=...,v1=...") → {ts, v1} o null si falta algo. */
export function parseXSignature(header: string | null | undefined): MpSignatureParts | null {
  if (!header) return null;
  let ts = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (k === "ts") ts = val;
    else if (k === "v1") v1 = val;
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

/** Arma el manifest que MP firma. `data.id` alfanumérico → minúsculas; vacíos omitidos. */
export function buildManifest(
  dataId: string,
  requestId: string | null | undefined,
  ts: string,
): string {
  const id = /[a-zA-Z]/.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

/**
 * ¿La firma del webhook es válida para este secreto? `false` ante cualquier dato
 * faltante o firma que no matchea (fail-closed). No lanza.
 */
export function verifyMercadoPagoSignature(input: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string;
  secret: string;
}): boolean {
  const parts = parseXSignature(input.xSignature);
  if (!parts || !input.secret || !input.dataId) return false;

  const manifest = buildManifest(input.dataId, input.xRequestId, parts.ts);
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");

  // Comparación en tiempo constante; largos distintos → false sin comparar bytes.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Ventana de tiempo y varios secretos (S1, webhooks por negocio) ───────────

/** Tolerancia del `ts` firmado contra el reloj del servidor: ±5 minutos. */
export const TOLERANCIA_TS_MS = 5 * 60 * 1000;

/**
 * ¿El `ts` firmado está dentro de la ventana? PURA. MP manda segundos unix; si viniera en
 * milisegundos (más de 11 cifras) se lo toma como tal. Ilegible → false (fail-closed). Sin
 * ventana, una notificación firmada capturada se podría reenviar para siempre.
 */
export function tsDentroDeVentana(ts: string, ahoraMs: number, toleranciaMs: number = TOLERANCIA_TS_MS): boolean {
  if (!/^\d{1,16}$/.test(ts)) return false;
  const n = Number(ts);
  const ms = n > 1e11 ? n : n * 1000;
  return Math.abs(ahoraMs - ms) <= toleranciaMs;
}

export type ResultadoFirma =
  | { ok: true; firmantes: string[] }
  | { ok: false; motivo: "sin-firma" | "ts-fuera-de-ventana" | "firma-invalida" };

/**
 * Verifica la firma contra VARIOS secretos candidatos (uno por negocio + el global) y devuelve
 * qué claves la validan. PURA. Primero el `ts` (fuera de ±5 min → rechazo, aunque la firma sea
 * buena), después el HMAC de cada candidato en tiempo constante. Cuál de los firmantes es el
 * dueño de la notificación lo decide quien conoce el negocio (src/lib/webhooks/resolver-negocio.ts).
 */
export function verificarFirmaMP(input: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string;
  candidatos: ReadonlyArray<{ clave: string; secreto: string }>;
  ahoraMs: number;
  toleranciaMs?: number;
}): ResultadoFirma {
  const parts = parseXSignature(input.xSignature);
  if (!parts || !input.dataId) return { ok: false, motivo: "sin-firma" };
  if (!tsDentroDeVentana(parts.ts, input.ahoraMs, input.toleranciaMs)) return { ok: false, motivo: "ts-fuera-de-ventana" };
  const firmantes = input.candidatos
    .filter(
      (c) =>
        c.secreto &&
        verifyMercadoPagoSignature({ xSignature: input.xSignature, xRequestId: input.xRequestId, dataId: input.dataId, secret: c.secreto }),
    )
    .map((c) => c.clave);
  return firmantes.length > 0 ? { ok: true, firmantes } : { ok: false, motivo: "firma-invalida" };
}
