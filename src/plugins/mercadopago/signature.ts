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
