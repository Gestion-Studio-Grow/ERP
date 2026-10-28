// ============================================================================
// CONECTOR MERCADO PAGO (suite E3) — una URL por conexión, firma de manifiesto.
// ============================================================================
//
// Mercado Pago firma "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con el secreto de la
// aplicación del NEGOCIO (signature.ts). No firma el cuerpo ni la cuenta (`user_id` va en el
// cuerpo, sin firma), así que el aviso entra por `/api/integraciones/c/{token}`: el negocio sale
// de la ruta (token opaco de la conexión) y la firma se verifica con el `webhook_secret` de ESA
// conexión, guardado cifrado en IntegracionCredencial.
//
// El evento sale SÓLO de lo firmado (`data.id` y `x-request-id`): el handler vuelve a pedir el
// pago a Mercado Pago con el `access_token` de la conexión, que es lo que dice si se acreditó.
//
// Clave de deduplicación: "pago:<id>:<x-request-id>". El mismo aviso reenviado (mismo request id)
// se deduplica; un aviso NUEVO del mismo pago (pendiente → aprobado) entra, porque es el que
// trae el cambio de estado. El cobro del pedido es idempotente por su lado (S1).

import { createHmac, timingSafeEqual } from "node:crypto";
import { mercadopagoModule } from "@/modules/descriptors/mercadopago";
import { codigoPorEstadoHttp } from "@/integraciones/errores";
import {
  dentroDeVentana,
  encabezado,
  type ConectorDescriptor,
  type EntradaCruda,
  type ResultadoFirma,
  type TransporteHttp,
} from "@/integraciones/contrato";
import { buildManifest, parseXSignature } from "./signature";

export const CAMPO_SECRETO_WEBHOOK_MP = "webhook_secret";
export const CAMPO_TOKEN_MP = "access_token";

const URL_USUARIO_MP = "https://api.mercadopago.com/users/me";
/** Ids de pago de MP: dígitos o alfanuméricos, sin espacios ni separadores raros. */
const RE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

const enc = new TextEncoder();

function iguales(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** El `data.id` tal como lo firma MP: alfanumérico → minúsculas (signature.ts). */
const idCanonico = (id: string) => (/[a-zA-Z]/.test(id) ? id.toLowerCase() : id);

function verificarFirmaMp(req: EntradaCruda, secreto: string, ahora: Date): ResultadoFirma {
  const firma = encabezado(req, "x-signature");
  const requestId = encabezado(req, "x-request-id");
  const dataId = req.consulta["data.id"];
  if (!firma || !requestId || typeof dataId !== "string" || !dataId) return { ok: false, motivo: "sin_firma" };
  if (!RE_ID.test(dataId) || !RE_REQUEST_ID.test(requestId)) return { ok: false, motivo: "firma_invalida" };
  const partes = parseXSignature(firma);
  if (!partes || !/^\d{1,12}$/.test(partes.ts) || !/^[0-9a-f]{64}$/.test(partes.v1)) {
    return { ok: false, motivo: "firma_invalida" };
  }
  const esperada = createHmac("sha256", secreto).update(buildManifest(dataId, requestId, partes.ts)).digest("hex");
  if (!iguales(esperada, partes.v1)) return { ok: false, motivo: "firma_invalida" };
  return dentroDeVentana(Number(partes.ts) * 1000, ahora) ? { ok: true } : { ok: false, motivo: "fuera_de_ventana" };
}

/** Un aviso de MP firmado como lo firma MP (lo usan el simulador y los tests). */
export function avisoMpFirmado(
  secreto: string,
  ahora: Date,
  datos: { pagoId?: string; requestId?: string } = {},
): EntradaCruda {
  const pagoId = datos.pagoId ?? "1320001234";
  const requestId = datos.requestId ?? "4f1c2a3b-0d5e-4b8a-9c71-2e6f0a9d1b33";
  const ts = String(Math.floor(ahora.getTime() / 1000));
  const v1 = createHmac("sha256", secreto).update(buildManifest(pagoId, requestId, ts)).digest("hex");
  return {
    metodo: "POST",
    encabezados: {
      "content-type": "application/json",
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    },
    consulta: { "data.id": pagoId, type: "payment" },
    cuerpo: enc.encode(
      JSON.stringify({
        action: "payment.updated",
        api_version: "v1",
        data: { id: pagoId },
        date_created: ahora.toISOString(),
        id: 1234567890,
        live_mode: true,
        type: "payment",
        user_id: "123456789",
      }),
    ),
  };
}

/** Respuestas falsas de la API de MP para `probarConexion` (sin red). */
const transporteFalsoMp: TransporteHttp = async (url, solicitud) => {
  const auth = solicitud.encabezados?.authorization ?? "";
  const ok = url === URL_USUARIO_MP && auth === "Bearer TEST-token-valido-0000";
  return {
    estado: ok ? 200 : 401,
    encabezados: { "content-type": "application/json" },
    cuerpo: enc.encode(JSON.stringify(ok ? { id: 123456789, site_id: "MLA" } : { message: "invalid_token" })),
  };
};

export const conectorMercadoPago: ConectorDescriptor = {
  ...mercadopagoModule,
  kind: "plugin",
  categoria: "cobros",
  auth: { tipo: "clave", campos: [CAMPO_TOKEN_MP, CAMPO_SECRETO_WEBHOOK_MP] },
  entrada: {
    modo: "url-por-conexion",
    secretoFirma: { origen: "conexion", campo: CAMPO_SECRETO_WEBHOOK_MP },
    firmaCubreCuerpo: false,
    encabezadosFirmados: ["x-signature", "x-request-id"],
    consultaFirmada: ["data.id"],
    firmaIncluyeInstante: true,
    verificarFirma: verificarFirmaMp,
    // Sólo lo firmado: data.id (canónico, como lo firma MP) y x-request-id.
    normalizar(_payload, req) {
      const dataId = req.consulta["data.id"];
      const requestId = encabezado(req, "x-request-id");
      if (typeof dataId !== "string" || !RE_ID.test(dataId) || !requestId || !RE_REQUEST_ID.test(requestId)) return [];
      const id = idCanonico(dataId);
      return [
        {
          tipo: "pago.acreditado" as const,
          idExterno: `pago:${id}:${requestId}`,
          cuentaExterna: null,
          ocurridoEn: null,
          datos: { pagoExterno: id, detalle: {} },
        },
      ];
    },
  },
  async probarConexion(ctx) {
    const token = ctx.credenciales[CAMPO_TOKEN_MP];
    if (!token) return { ok: false, codigo: "credencial_vencida" };
    try {
      const r = await ctx.transporte(URL_USUARIO_MP, { metodo: "GET", encabezados: { authorization: `Bearer ${token}` } });
      const codigo = codigoPorEstadoHttp(r.estado);
      return codigo ? { ok: false, codigo } : { ok: true, detalle: "Mercado Pago respondió con la cuenta del negocio." };
    } catch {
      return { ok: false, codigo: "proveedor_caido" };
    }
  },
  // Provisional a confirmar (E2/E3 §2.7).
  limites: { porMinuto: 120, eventosMesPorPlan: { micro: 2000, pyme: null } },
  errores: ["credencial_vencida", "permiso_revocado", "proveedor_caido", "datos_rechazados", "respuesta_invalida"],
  simulador: () => ({
    fuente:
      "https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks (firma x-signature; a verificar contra tráfico real)",
    escenarios: [
      {
        id: "pago-actualizado",
        descripcion: "Aviso payment.updated de un pago, firmado por manifiesto",
        armar: (secreto, ahora) => avisoMpFirmado(secreto, ahora),
        esperado: { tipos: ["pago.acreditado"], cuentaExterna: null },
        // El ts cambiado con la misma v1, y el id del pago cambiado: tienen que fallar.
        alteraciones: (req) => {
          const firma = req.encabezados["x-signature"] ?? "";
          const ts = /ts=(\d+)/.exec(firma)?.[1] ?? "0";
          return [
            { ...req, encabezados: { ...req.encabezados, "x-signature": firma.replace(`ts=${ts}`, `ts=${Number(ts) - 1}`) } },
            { ...req, consulta: { ...req.consulta, "data.id": "1320009999" } },
          ];
        },
      },
    ],
    transporte: transporteFalsoMp,
  }),
};
