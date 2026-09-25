// SÓLO PARA TESTS: conectores mínimos que cumplen el contrato, con su simulador. Los usan
// contrato.test.ts y registro.test.ts para probar el contrato y el registro sin depender de un
// conector real. No se registran en `CONECTORES` ni los importa código de producción.
//
//  - `conectorFalso`: firma sobre el cuerpo crudo, estilo Meta.
//    "x-firma: sha256=<hex HMAC-SHA256 del cuerpo>", comparada en tiempo constante. Trae el
//    desafío GET (hub.mode / hub.verify_token / hub.challenge).
//  - `conectorManifiestoFalso`: firma de manifiesto, estilo Mercado Pago (la firma NO cubre el
//    cuerpo). Firma "cuenta:<c>;id:<id>;ts:<ts>;" con la cuenta, el id y el instante en
//    encabezados; el evento sale SÓLO de esos encabezados firmados.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  dentroDeVentana,
  encabezado,
  type ConectorDescriptor,
  type EntradaCruda,
  type ResultadoFirma,
} from "./contrato";

const enc = new TextEncoder();

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function firmaFalsa(secreto: string, cuerpo: Uint8Array): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

/** Una request POST con el cuerpo en JSON, firmada con `secreto`. */
export function entradaFirmada(cuerpo: unknown, secreto: string): EntradaCruda {
  const bytes = enc.encode(JSON.stringify(cuerpo));
  return { metodo: "POST", encabezados: { "x-firma": firmaFalsa(secreto, bytes) }, consulta: {}, cuerpo: bytes };
}

/** El GET de verificación estilo Meta. */
export function desafioFalso(token: string, challenge = "1158201444"): EntradaCruda {
  return {
    metodo: "GET",
    encabezados: {},
    consulta: { "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": challenge },
    cuerpo: new Uint8Array(0),
  };
}

export function conectorFalso(): ConectorDescriptor {
  return {
    id: "prueba",
    version: "1.0.0",
    nombre: "Conector de prueba",
    descripcion: "Sólo para tests.",
    kind: "plugin",
    rubros: "todos",
    consumeEventos: ["mensaje.recibido"],
    categoria: "mensajeria",
    auth: { tipo: "token-sistema" },
    entrada: {
      modo: "url-de-app",
      secretoFirma: { origen: "entorno", variable: "PRUEBA_APP_SECRET" },
      verificarFirma(req, secreto): ResultadoFirma {
        const recibida = encabezado(req, "X-Firma");
        if (!recibida) return { ok: false, motivo: "sin_firma" };
        return igualesEnTiempoConstante(firmaFalsa(secreto, req.cuerpo), recibida)
          ? { ok: true }
          : { ok: false, motivo: "firma_invalida" };
      },
      normalizar(payload) {
        const p = payload as { cuenta: string; mensajes: Array<{ id: string; de: string; texto: string }> };
        return p.mensajes.map((m) => ({
          tipo: "mensaje.recibido" as const,
          idExterno: m.id,
          cuentaExterna: p.cuenta,
          ocurridoEn: null,
          datos: { remitente: m.de, idMensaje: m.id, clase: "texto" as const, texto: m.texto, opcion: null, adjunto: null },
        }));
      },
      desafio: {
        variable: "PRUEBA_VERIFY_TOKEN",
        responder(req, tokenEsperado) {
          if (req.consulta["hub.mode"] !== "subscribe") return null;
          const recibido = req.consulta["hub.verify_token"];
          if (typeof recibido !== "string" || !igualesEnTiempoConstante(recibido, tokenEsperado)) return null;
          return { estado: 200, cuerpo: req.consulta["hub.challenge"] ?? "" };
        },
      },
    },
    async probarConexion() {
      return { ok: true, detalle: "ok" };
    },
    limites: { porMinuto: 60, eventosMesPorPlan: { micro: 500, pyme: null } },
    errores: ["credencial_vencida", "proveedor_caido"],
    simulador: () => ({
      fuente: "fixture de prueba (no es un proveedor real)",
      escenarios: [
        {
          id: "dos-mensajes",
          descripcion: "Dos mensajes de texto de la misma cuenta",
          armar: (secreto) =>
            entradaFirmada(
              {
                cuenta: "cuenta-1",
                mensajes: [
                  { id: "m1", de: "5491100000000", texto: "hola" },
                  { id: "m2", de: "5491100000000", texto: "chau" },
                ],
              },
              secreto,
            ),
          esperado: { tipos: ["mensaje.recibido", "mensaje.recibido"], cuentaExterna: "cuenta-1" },
        },
      ],
      desafio: (token) => desafioFalso(token),
    }),
  };
}

// ── Firma de manifiesto (estilo Mercado Pago) ────────────────────────────────

export function firmaManifiesto(secreto: string, cuenta: string, id: string, ts: string): string {
  return createHmac("sha256", secreto).update(`cuenta:${cuenta};id:${id};ts:${ts};`).digest("hex");
}

/**
 * Un aviso firmado por manifiesto: cuenta, id e instante van en encabezados y la firma los
 * cubre. El cuerpo, el x-request-id y la consulta van SIN firma.
 */
export function avisoDeManifiesto(
  secreto: string,
  ahora: Date,
  datos: { cuenta?: string; id?: string; cuerpo?: unknown } = {},
): EntradaCruda {
  const cuenta = datos.cuenta ?? "cuenta-1";
  const id = datos.id ?? "pago-1";
  const ts = String(Math.floor(ahora.getTime() / 1000));
  return {
    metodo: "POST",
    encabezados: {
      "x-cuenta": cuenta,
      "x-id": id,
      "x-ts": ts,
      "x-firma": firmaManifiesto(secreto, cuenta, id, ts),
      "x-request-id": "req-sin-firma-1",
    },
    consulta: { type: "payment" },
    cuerpo: enc.encode(JSON.stringify(datos.cuerpo ?? { cuenta, data: { id }, action: "payment.created" })),
  };
}

export function conectorManifiestoFalso(): ConectorDescriptor {
  const base = conectorFalso();
  return {
    ...base,
    id: "prueba-manifiesto",
    consumeEventos: ["pago.acreditado"],
    categoria: "cobros",
    entrada: {
      modo: "url-de-app",
      secretoFirma: { origen: "entorno", variable: "PRUEBA_MANIFIESTO_SECRET" },
      firmaCubreCuerpo: false,
      encabezadosFirmados: ["x-cuenta", "x-id", "x-ts", "x-firma"],
      firmaIncluyeInstante: true,
      verificarFirma(req, secreto, ahora): ResultadoFirma {
        const cuenta = encabezado(req, "x-cuenta");
        const id = encabezado(req, "x-id");
        const ts = encabezado(req, "x-ts");
        const recibida = encabezado(req, "x-firma");
        if (!cuenta || !id || !ts || !recibida) return { ok: false, motivo: "sin_firma" };
        if (!/^\d{1,12}$/.test(ts)) return { ok: false, motivo: "firma_invalida" };
        if (!igualesEnTiempoConstante(firmaManifiesto(secreto, cuenta, id, ts), recibida)) {
          return { ok: false, motivo: "firma_invalida" };
        }
        return dentroDeVentana(Number(ts) * 1000, ahora) ? { ok: true } : { ok: false, motivo: "fuera_de_ventana" };
      },
      // Sólo lo firmado: la cuenta y el id salen de los encabezados, nunca del cuerpo. El
      // handler vuelve a pedir el pago con la credencial del negocio.
      normalizar(_payload, req) {
        const cuenta = encabezado(req, "x-cuenta");
        const id = encabezado(req, "x-id");
        if (!cuenta || !id) return [];
        return [
          {
            tipo: "pago.acreditado" as const,
            idExterno: `pago:${id}`,
            cuentaExterna: cuenta,
            ocurridoEn: null,
            datos: { pagoExterno: id, detalle: {} },
          },
        ];
      },
    },
    simulador: () => ({
      fuente: "fixture de prueba con la forma de los avisos de Mercado Pago (no es el proveedor real)",
      escenarios: [
        {
          id: "pago",
          descripcion: "Aviso de un pago, firmado por manifiesto",
          armar: (secreto, ahora) => avisoDeManifiesto(secreto, ahora),
          esperado: { tipos: ["pago.acreditado"], cuentaExterna: "cuenta-1" },
          // El instante cambiado con la misma firma: una alteración genérica no la arma así.
          alteraciones: (req) => [
            { ...req, encabezados: { ...req.encabezados, "x-ts": String(Number(req.encabezados["x-ts"]) - 1) } },
          ],
        },
      ],
    }),
  };
}
