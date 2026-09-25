// Tests de la redacción y del logger seguro: ningún logger recibe un campo token/secret con
// su valor, y ningún archivo de la suite loguea por fuera del logger redactado. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  CLAVES_EVENTO_CANONICO,
  LARGO_MAXIMO_TEXTO,
  MARCA_DATO_PERSONAL,
  MARCA_SECRETO,
  MARCA_TEXTO,
  crearLoggerSeguro,
  esClaveDatoPersonal,
  esClaveSecreta,
  normalizarClave,
  redactar,
  redactarTexto,
  seTapaEnLosLogs,
  type LoggerBase,
} from "./redaccion";
import { logDelConector, logIntegraciones } from "./log";
import { runInRequestContext, setRequestContext } from "@/lib/request-context";

// Valores con forma de secreto que NO pueden aparecer en ninguna salida.
const SECRETOS = [
  "EAAGm0PX4ZCpsBAKZCZBkZAZBqZAZC0123456789abcdefXYZ",
  "APP_USR-1234567890123456-092412-abcdef0123456789abcdef0123456789-123456789",
  "ck_0123456789abcdef0123456789abcdef01234567",
  "cs_fedcba9876543210fedcba9876543210fedcba98",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "mi-app-secret-super-privado",
  "clave-de-webhook-9876",
  "hunter2-password",
];

function payloadConSecretos(): Record<string, unknown> {
  return {
    token: SECRETOS[5],
    access_token: SECRETOS[0],
    refreshToken: SECRETOS[1],
    "X-Hub-Signature-256": "sha256=abc",
    headers: { Authorization: `Bearer ${SECRETOS[0]}`, cookie: "sesion=1" },
    credenciales: { app_secret: SECRETOS[5], ck: SECRETOS[2], cs: SECRETOS[3], webhook_secret: SECRETOS[6] },
    anidado: [{ nivel: { mas: { client_secret: SECRETOS[6], password: SECRETOS[7] } } }],
    pares: [{ name: "access_token", value: SECRETOS[0] }, { name: "x-otro", value: "visible" }],
    url: `https://graph.facebook.com/v20.0/123?access_token=${SECRETOS[0]}&fields=id`,
    nota: `Se usó ${SECRETOS[4]} y ${SECRETOS[1]} para ${SECRETOS[2]}`,
    id: "pago-123",
  };
}

function claveNormalizadaSecreta(k: string) {
  const n = normalizarClave(k);
  return n.includes("token") || n.includes("secret") || n === "ck" || n === "cs" || n.includes("password");
}

/** Recorre y devuelve [clave, valor] de todo el árbol. */
function pares(v: unknown, out: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (Array.isArray(v)) v.forEach((x) => pares(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push([k, x]);
      pares(x, out);
    }
  }
  return out;
}

// ── Criterio: ningún logger recibe campos token/secret ───────────────────────

test("logger seguro: el logger real no recibe ningún campo token/secret con su valor", () => {
  const llamadas: unknown[][] = [];
  const base: LoggerBase = {
    error: (...a) => void llamadas.push(a),
    warn: (...a) => void llamadas.push(a),
    info: (...a) => void llamadas.push(a),
  };
  const log = crearLoggerSeguro(base);
  const err = new Error(`Meta respondió 401 para ${SECRETOS[0]} (Bearer ${SECRETOS[5]})`);
  log.error(`entrada`, `falló con ${SECRETOS[1]}`, err, payloadConSecretos());
  log.warn("salida", `reintento ?token=${SECRETOS[6]}`, payloadConSecretos());
  log.info("oauth", "ok", { estado: { refresh_token: SECRETOS[1] }, conexionId: "cnx_1" });

  assert.equal(llamadas.length, 3);
  const volcado = JSON.stringify(llamadas, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v));
  for (const s of SECRETOS) assert.ok(!volcado.includes(s), `se filtró ${s.slice(0, 12)}…`);
  for (const [k, v] of pares(llamadas.map((l) => l[l.length - 1]))) {
    if (claveNormalizadaSecreta(k)) assert.equal(v, MARCA_SECRETO, `campo ${k}`);
  }
  // Lo que no es secreto sigue ahí para poder rastrear.
  assert.ok(volcado.includes("cnx_1"));
  assert.ok(volcado.includes("pago-123"));
  assert.ok(volcado.includes("visible"));
});

test("logger de la suite (log.ts) contra la consola real: nada secreto llega a stdout/stderr", () => {
  const originales = { log: console.log, error: console.error };
  const lineas: string[] = [];
  console.log = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  try {
    logIntegraciones.info("integraciones", `conectando con ${SECRETOS[2]}`, payloadConSecretos());
    logIntegraciones.warn("integraciones", "aviso", { credenciales: { cs: SECRETOS[3] } });
    logIntegraciones.error("integraciones", "falló", new Error(`token=${SECRETOS[6]} Bearer ${SECRETOS[5]}`), payloadConSecretos());
  } finally {
    Object.assign(console, originales);
  }
  assert.equal(lineas.length, 3);
  const todo = lineas.join("\n");
  for (const s of SECRETOS) assert.ok(!todo.includes(s), `se filtró ${s.slice(0, 12)}…`);
  for (const linea of lineas) {
    const entrada = JSON.parse(linea) as Record<string, unknown>;
    for (const [k, v] of pares(entrada)) {
      if (claveNormalizadaSecreta(k)) assert.equal(v, MARCA_SECRETO, `campo ${k}`);
    }
  }
});

test("ningún archivo de src/integraciones loguea por fuera del logger redactado", () => {
  const raiz = path.dirname(new URL(import.meta.url).pathname);
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !/\.test\.(ts|tsx|mts)$/.test(e.name)) archivos.push(p);
    }
  };
  recorrer(raiz);
  assert.ok(archivos.length >= 6, "se recorrió la carpeta");
  const violaciones = archivos.flatMap((archivo) => {
    const rel = path.relative(raiz, archivo);
    // log.ts es el único que importa el logger del Core, para envolverlo.
    return violacionesDeLog(fs.readFileSync(archivo, "utf8"), rel === "log.ts").map((v) => `${rel}: ${v}`);
  });
  assert.deepEqual(violaciones, []);
});

/**
 * Heurística estática (no es una garantía: `globalThis["con" + "sole"]` la saltea). Cualquier
 * mención de `console` o de process.stdout/stderr en el código, y cualquier texto que nombre
 * el módulo del logger del Core (import, import(), require, re-export, con o sin extensión).
 */
function violacionesDeLog(fuente: string, puedeImportarLogger: boolean): string[] {
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const v: string[] = [];
  if (/\bconsole\b/.test(codigo)) v.push("usa console");
  if (/\bprocess\s*(?:\.\s*|\[\s*["'])(?:stdout|stderr)\b/.test(codigo)) v.push("escribe a process.stdout/stderr");
  if (!puedeImportarLogger && /["'`](?:@\/lib\/logger|(?:\.\.?\/)+(?:\.\.\/)*lib\/logger)(?:\.[cm]?[tj]s)?["'`]/.test(codigo)) {
    v.push("nombra el logger del Core");
  }
  return v;
}

test("la guardia estática del logger ve las formas indirectas", () => {
  const malos = [
    "console.log(x)",
    "console['log'](x)",
    "const c = console; c.log(x)",
    "globalThis.console.error(x)",
    "process.stdout.write(x)",
    "process['stderr'].write(x)",
    'import { logger } from "@/lib/logger";',
    'import { logger } from "@/lib/logger.ts";',
    'const { logger } = await import("@/lib/logger");',
    'const l = require("../../lib/logger.js");',
    'export { logger } from "../lib/logger";',
  ];
  for (const m of malos) assert.ok(violacionesDeLog(m, false).length > 0, m);
  // Comentarios y el logger redactado no cuentan.
  assert.deepEqual(violacionesDeLog('// console.log(x)\n/* console.error */\nimport { logIntegraciones } from "./log";', false), []);
  assert.deepEqual(violacionesDeLog('import { logger } from "@/lib/logger";', true), []);
});

// ── Redacción de payloads ────────────────────────────────────────────────────

test("payload de WhatsApp: teléfonos, nombre y texto fuera; ids de media y de mensaje quedan", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_1",
        changes: [
          {
            value: {
              metadata: { display_phone_number: "5491155550000", phone_number_id: "PNID_1" },
              contacts: [{ profile: { name: "Juana Pérez" }, wa_id: "5491144443333" }],
              messages: [
                {
                  from: "5491144443333",
                  id: "wamid.HBgN",
                  type: "document",
                  document: { id: "MEDIA_1", mime_type: "application/pdf", sha256: "b".repeat(64), filename: "extracto.pdf" },
                },
                { from: "5491144443333", id: "wamid.HBgO", type: "text", text: { body: "mi mail es juana@correo.com.ar" } },
              ],
            },
          },
        ],
      },
    ],
  };
  const r = redactar(payload, { personales: ["from", "profile"], textos: ["body"] }) as typeof payload;
  const v = r.entry[0].changes[0].value;
  assert.equal(v.metadata.display_phone_number, MARCA_DATO_PERSONAL);
  assert.equal(v.metadata.phone_number_id, "PNID_1");
  assert.equal(v.contacts[0].wa_id, MARCA_DATO_PERSONAL);
  assert.equal(v.contacts[0].profile as unknown, MARCA_DATO_PERSONAL);
  assert.equal(v.messages[0].from, MARCA_DATO_PERSONAL);
  assert.equal(v.messages[0].id, "wamid.HBgN");
  assert.equal(v.messages[0].document!.id, "MEDIA_1");
  assert.equal(v.messages[0].document!.sha256, "b".repeat(64));
  assert.equal(v.messages[1].text!.body, MARCA_TEXTO);
  // La entrada no se tocó.
  assert.equal(payload.entry[0].changes[0].value.messages[0].from, "5491144443333");
});

test("payload de Mercado Pago: email e identificación del pagador fuera; montos e ids quedan", () => {
  const r = redactar({
    id: 123456789,
    transaction_amount: 48200,
    payer: { email: "cliente@gmail.com", identification: { type: "DNI", number: "30111222" }, phone: { number: "1155550000" } },
    additional_info: { payer: { first_name: "Ana", last_name: "Gómez", address: { street_name: "Calle 1" } } },
  }) as Record<string, Record<string, unknown>>;
  assert.equal(r.id as unknown, 123456789);
  assert.equal(r.transaction_amount as unknown, 48200);
  assert.equal(r.payer.email, MARCA_DATO_PERSONAL);
  assert.equal(r.payer.identification, MARCA_DATO_PERSONAL);
  assert.equal(r.payer.phone, MARCA_DATO_PERSONAL);
  const info = r.additional_info.payer as Record<string, unknown>;
  assert.equal(info.first_name, MARCA_DATO_PERSONAL);
  assert.equal(info.last_name, MARCA_DATO_PERSONAL);
  assert.equal(info.address, MARCA_DATO_PERSONAL);
});

test("texto libre: se tapa lo que tiene forma de secreto o de dato personal, y nada más", () => {
  const casos: Array<[string, string]> = [
    ["escribime a ana.gomez+tienda@correo.com.ar", `escribime a ${MARCA_DATO_PERSONAL}`],
    ["Authorization: Bearer abcdef123456", `Authorization: Bearer ${MARCA_SECRETO}`],
    [`GET /v20.0/me?fields=id&access_token=${SECRETOS[0]}`, `GET /v20.0/me?fields=id&access_token=${MARCA_SECRETO}`],
    [`el token ${SECRETOS[0]} venció`, `el token ${MARCA_SECRETO} venció`],
    [`MP: ${SECRETOS[1]}`, `MP: ${MARCA_SECRETO}`],
    [`claves ${SECRETOS[2]} / ${SECRETOS[3]}`, `claves ${MARCA_SECRETO} / ${MARCA_SECRETO}`],
    [`jwt ${SECRETOS[4]}`, `jwt ${MARCA_SECRETO}`],
    ["llamame al +54 9 11 5555-0000", `llamame al ${MARCA_DATO_PERSONAL}`],
    ["CUIT 20-12345678-9 del receptor", `CUIT ${MARCA_DATO_PERSONAL} del receptor`],
  ];
  for (const [entrada, esperado] of casos) assert.equal(redactarTexto(entrada), esperado, entrada);
  // Lo que sirve para rastrear no se toca.
  for (const intacto of [
    "Pedido #1043 por $48.200",
    "pago 123456789 acreditado",
    "sha256 " + "c".repeat(64),
    "2026-09-24T12:00:00.000Z",
    "wamid.HBgNNTQ5MTE",
    "IntegracionConexion cnx_1 del negocio tenant_magra",
  ]) {
    assert.equal(redactarTexto(intacto), intacto, intacto);
  }
});

test("clasificación de nombres de campo", () => {
  for (const k of ["token", "access_token", "refreshToken", "hub.verify_token", "app_secret", "client_secret", "X-Hub-Signature-256", "Authorization", "ck", "cs", "password", "wrappedDek", "consumer_key", "api_key", "apiKey", "Cookie"]) {
    assert.equal(esClaveSecreta(k), true, k);
  }
  for (const k of ["id", "status", "amount", "phone_number_id", "mime_type", "sha256", "document", "type"]) {
    assert.equal(esClaveSecreta(k), false, k);
  }
  for (const k of ["email", "payer_email", "phone", "telefono", "dni", "cuit", "wa_id", "domicilio", "first_name", "identification"]) {
    assert.equal(esClaveDatoPersonal(k), true, k);
  }
  // phone_number_id contiene "phone" pero es la cuenta de Meta del negocio, no una persona.
  for (const k of ["id", "name", "nombre", "document", "status", "phone_number_id"]) {
    assert.equal(esClaveDatoPersonal(k), false, k);
  }
  assert.equal(esClaveDatoPersonal("display_phone_number"), true);
  // Un conector puede marcarlo igual como personal si lo necesita.
  assert.equal(esClaveDatoPersonal("phone_number_id", new Set(["phonenumberid"])), true);
});

test("asignaciones en texto libre: token=, password:, JSON copiado", () => {
  const casos: Array<[string, string]> = [
    ["falló token=abc123 al renovar", `falló token=${MARCA_SECRETO} al renovar`],
    ["password: hunter2", `password: ${MARCA_SECRETO}`],
    ['{"access_token":"EAAxyz","expires_in":3600}', `{"access_token":"${MARCA_SECRETO}","expires_in":3600}`],
    ["hub.verify_token=abc&hub.challenge=123", `hub.verify_token=${MARCA_SECRETO}&hub.challenge=123`],
    ["client_secret = s3cr3t", `client_secret = ${MARCA_SECRETO}`],
    ["https://x.com/cb?token=abc&ok=1", `https://x.com/cb?token=${MARCA_SECRETO}&ok=1`],
  ];
  for (const [entrada, esperado] of casos) assert.equal(redactarTexto(entrada), esperado, entrada);
});

test("estructuras raras: ciclos, profundidad, bytes, fechas, Map, Set, errores, __proto__", () => {
  const ciclo: Record<string, unknown> = { a: 1 };
  ciclo.yo = ciclo;
  assert.deepEqual(redactar(ciclo), { a: 1, yo: "[ciclo]" });

  let profundo: Record<string, unknown> = { fin: true };
  for (let i = 0; i < 40; i++) profundo = { x: profundo };
  assert.ok(JSON.stringify(redactar(profundo)).includes("[demasiado profundo]"));

  const r = redactar({
    archivo: Buffer.from("contenido del extracto"),
    bytes: new Uint8Array([1, 2, 3]),
    cuando: new Date("2026-09-24T12:00:00Z"),
    mapa: new Map<string, unknown>([["token", "x-secreto"], ["ok", 1]]),
    conjunto: new Set(["ana@correo.com"]),
    error: new Error("falló con Bearer abcdefghijk"),
    grande: BigInt(10),
    fn: () => 1,
  }) as Record<string, unknown>;
  assert.equal(r.archivo, "[binario 22 bytes]");
  assert.equal(r.bytes, "[binario 3 bytes]");
  assert.equal(r.cuando, "2026-09-24T12:00:00.000Z");
  assert.deepEqual(r.mapa, { token: MARCA_SECRETO, ok: 1 });
  assert.deepEqual(r.conjunto, [MARCA_DATO_PERSONAL]);
  assert.equal((r.error as { message: string }).message, `falló con Bearer ${MARCA_SECRETO}`);
  assert.equal(r.grande, "10");
  assert.ok(!("fn" in r));

  const conProto = JSON.parse('{"__proto__": {"token": "x"}, "ok": 1}') as unknown;
  const limpio = redactar(conProto) as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(limpio), Object.prototype, "la copia no cambió de prototipo");
  assert.deepEqual(Object.getOwnPropertyDescriptor(limpio, "__proto__")?.value, { token: MARCA_SECRETO });
});

test("campos extra del conector: secretos propios", () => {
  const r = redactar({ hash_de_ruta: "abc", otro: "x" }, { secretas: ["hash_de_ruta"] }) as Record<string, unknown>;
  assert.equal(r.hash_de_ruta, MARCA_SECRETO);
  assert.equal(r.otro, "x");
});

test("un evento canónico redactado: remitente y texto fuera, ids y cuenta quedan", () => {
  const evento = {
    tipo: "mensaje.recibido",
    idExterno: "wamid.1",
    cuentaExterna: "PNID_1",
    ocurridoEn: null,
    datos: { remitente: "5491144443333", idMensaje: "wamid.1", clase: "texto", texto: "soy Ana, DNI 30111222", opcion: null, adjunto: null },
  };
  const r = redactar(evento, CLAVES_EVENTO_CANONICO) as typeof evento;
  assert.equal(r.datos.remitente, MARCA_DATO_PERSONAL);
  assert.equal(r.datos.texto, MARCA_TEXTO);
  assert.equal(r.idExterno, "wamid.1");
  assert.equal(r.cuentaExterna, "PNID_1");
  assert.equal(r.datos.idMensaje, "wamid.1");
  const estado = redactar({ datos: { destinatario: "5491144443333", idMensaje: "wamid.2" } }) as { datos: Record<string, unknown> };
  assert.equal(estado.datos.destinatario, MARCA_DATO_PERSONAL);
  assert.equal((redactar({ recipient_id: "5491144443333" }) as Record<string, unknown>).recipient_id, MARCA_DATO_PERSONAL);
});

// ── Lo que encontró el refutador (ronda 1) ───────────────────────────────────

const S = "SECRETO_RAW_zz9";

function volcadoDelLogger(ctx: Record<string, unknown> | Error): string {
  const out: unknown[][] = [];
  const base: LoggerBase = { error: (...a) => void out.push(a), warn: (...a) => void out.push(a), info: (...a) => void out.push(a) };
  const log = crearLoggerSeguro(base);
  if (ctx instanceof Error) log.error("s", "m", ctx);
  else log.info("s", "m", ctx);
  return JSON.stringify(out, (_k, x) => (x instanceof Error ? { name: x.name, message: x.message, stack: x.stack } : x));
}

test("credenciales en castellano, PEM, X-Auth, pares y listas de encabezados: nada llega al logger", () => {
  const casos: Record<string, Record<string, unknown> | Error> = {
    credencial: { credencial: S },
    credenciales: { credenciales: S },
    credentials: { credentials: S },
    claveFiscal: { claveFiscal: S },
    clave_api: { clave_api: S },
    llave: { llave: S },
    llave_privada: { llave_privada: S },
    firma_webhook: { firma_webhook: S },
    keyPem: { keyPem: `-----BEGIN PRIVATE KEY-----\nMIIEv${S}\n-----END PRIVATE KEY-----` },
    cert_pem: { cert_pem: S },
    pemEnTexto: { detalle: `falló con -----BEGIN RSA PRIVATE KEY-----\nMIIE${S}\n-----END RSA PRIVATE KEY----- y siguió` },
    pemCortado: { detalle: `-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIE${S}` },
    xAuth: { "X-Auth": S },
    codeOAuth: { code: S },
    codeOAuthLargo: { code: `TG-5f1b2c3d4e5f6a7b8c9d0e1f-123456789` },
    nombreValor: { nombre: "access_token", valor: S },
    claveValor: { clave: "x-api-key", val: S },
    entradasHeaders: { headers: [["authorization", `Bearer-less ${S}`], ["x-api-key", S]] },
    rawHeaders: { rawHeaders: ["Host", "graph.facebook.com", "Authorization", S, "X-Api-Key", S] },
    mapaClaveObjeto: { mapa: new Map<unknown, unknown>([[{ a: 1 }, S]]) },
    bearerMinuscula: { detalle: `authorization: bearer ${S}abcdef` },
    tokenScheme: { detalle: `Authorization: Token ${S}` },
    sinEsquema: { detalle: `authorization: ${S} falló` },
    proxy: { detalle: `Proxy-Authorization: Basic ${S}` },
    jsonEscapado: { detalle: JSON.stringify(JSON.stringify({ access_token: S })) },
    jsonDobleEscapado: { detalle: JSON.stringify(JSON.stringify(JSON.stringify({ client_secret: S }))) },
    errorConNombre: Object.assign(new Error("x"), { name: `Err ${S}` }),
  };
  for (const [nombre, ctx] of Object.entries(casos)) {
    const volcado = volcadoDelLogger(ctx);
    assert.ok(!volcado.includes(S) && !volcado.includes("TG-5f1b"), `${nombre}: ${volcado.slice(0, 300)}`);
  }
  // El nombre de un error normal se conserva.
  assert.ok(volcadoDelLogger(new TypeError("x")).includes('"name":"TypeError"'));
  // Los códigos de error cortos o sin dígitos siguen visibles para diagnosticar.
  const r = redactar({ error: { code: 190, error_subcode: 460 }, cause: [{ code: "2034" }], estado: { code: "INVALID_ARGUMENT" } });
  assert.deepEqual(r, { error: { code: 190, error_subcode: 460 }, cause: [{ code: "2034" }], estado: { code: "INVALID_ARGUMENT" } });
  // Un par que no es secreto queda como está.
  assert.deepEqual(redactar({ rawHeaders: ["Host", "graph.facebook.com", "Accept", "json"] }), {
    rawHeaders: ["Host", "graph.facebook.com", "Accept", "json"],
  });
});

test("texto largo: se recorta antes de mirarlo y no deja media clave al final", () => {
  const token = "EAA" + "Z".repeat(200);
  // El token cruza el corte: sin el ajuste quedarían ~20 caracteres del token en claro.
  const texto = "x ".repeat((LARGO_MAXIMO_TEXTO - 20) / 2) + token + " fin";
  const r = redactarTexto(texto);
  assert.ok(r.length < LARGO_MAXIMO_TEXTO + 64, `largo ${r.length}`);
  assert.ok(!r.includes("EAAZZZ"), "no queda un pedazo del token");
  assert.match(r, /…\[recortado: \d+ caracteres\]$/);
  // Lo corto no se toca.
  assert.equal(redactarTexto("pago 123 acreditado"), "pago 123 acreditado");
});

test("tiempo acotado: 256 KB adversariales por campo se redactan en menos de 1 s (antes: 6,4 s con 64 KB)", () => {
  const n = 256 * 1024;
  const adversariales = [
    "a.".repeat(n / 2),
    "a".repeat(n),
    "a@" + "b.".repeat(n / 2),
    "token".repeat(n / 5),
    "eyJ-".repeat(n / 4),
    "TEST-".repeat(n / 5),
    "authorization" + " ".repeat(n),
    "-----BEGIN PRIVATE KEY-----".repeat(n / 27),
    // Las asignaciones por nombre (ronda 2): nombres, separadores, comillas, barras y llaves.
    "a=".repeat(n / 2),
    "x:".repeat(n / 2),
    "token=".repeat(n / 6),
    '"token":"'.repeat(n / 9),
    "token: {".repeat(n / 8),
    "token:" + "[".repeat(n),
    "a".repeat(n) + "=",
    "token=" + "\\".repeat(n),
    "cookie: " + "x".repeat(n),
    "Authorization: Bearer ".repeat(n / 22),
    "//a:".repeat(n / 4),
    "é=".repeat(n / 2),
  ];
  for (const s of adversariales) {
    const t0 = process.hrtime.bigint();
    redactarTexto(s);
    redactar({ campo: s, lista: [s, s] });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 1000, `${s.slice(0, 12)}… tardó ${ms.toFixed(0)} ms`);
  }
});

test("el contexto del request que agrega el logger del Core también sale redactado", async () => {
  const originales = { log: console.log, error: console.error };
  const lineas: string[] = [];
  console.log = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  try {
    await runInRequestContext({ requestId: "req-1" }, async () => {
      // Alguien mete una clave en el contexto del request (setRequestContext acepta cualquiera).
      setRequestContext({ tenantId: "t-magra", access_token: SECRETOS[0], payer_email: "ana@correo.com", nota: `Bearer ${SECRETOS[5]}` });
      logIntegraciones.info("integraciones", "entrada", { conexionId: "cnx_1" });
      logIntegraciones.error("integraciones", "falló", new Error("x"));
      logIntegraciones.warn("integraciones", "sin ctx");
    });
  } finally {
    Object.assign(console, originales);
  }
  assert.equal(lineas.length, 3);
  const todo = lineas.join("\n");
  for (const s of [...SECRETOS, "ana@correo.com"]) assert.ok(!todo.includes(s), `se filtró ${s.slice(0, 12)}…`);
  for (const linea of lineas) {
    const e = JSON.parse(linea) as Record<string, unknown>;
    assert.equal(e.requestId, "req-1");
    assert.equal(e.tenantId, "t-magra");
    assert.equal(e.access_token, MARCA_SECRETO);
    assert.equal(e.payer_email, MARCA_DATO_PERSONAL);
  }
  assert.equal((JSON.parse(lineas[0]) as Record<string, unknown>).conexionId, "cnx_1");
});

// ── Lo que encontró el refutador (ronda 2) ───────────────────────────────────

test("REFUTADOR r2: el mismo nombre decide en un texto — encabezados, JSON copiado, cookies, comas y espacios", () => {
  const V = "SeCrEtVaLuE9x7Q";
  const casos: Array<[string, string]> = [
    [`x-api-key: ${V}`, `x-api-key: ${MARCA_SECRETO}`],
    [`X-Api-Key=${V}`, `X-Api-Key=${MARCA_SECRETO}`],
    [`{"password": "abc ${V}"}`, `{"password": "${MARCA_SECRETO}"}`],
    [`password=ab,${V}`, `password=${MARCA_SECRETO}`],
    [`Cookie: a=1; session=${V}`, `Cookie: ${MARCA_SECRETO}`],
    [`set-cookie: sid=${V}; Path=/`, `set-cookie: ${MARCA_SECRETO}`],
    [JSON.stringify({ credenciales: { usuario: "u", clave_fiscal: V } }), `{"credenciales":${MARCA_SECRETO}}`],
    [JSON.stringify({ clave: V, key: V, ck: V, cs: V, private_key_id: V }), `{"clave":"${MARCA_SECRETO}","key":"${MARCA_SECRETO}","ck":"${MARCA_SECRETO}","cs":"${MARCA_SECRETO}","private_key_id":"${MARCA_SECRETO}"}`],
    [`clave_fiscal: ${V}`, `clave_fiscal: ${MARCA_SECRETO}`],
    [`contraseña: ${V}`, `contraseña: ${MARCA_SECRETO}`],
    [`https://graph.facebook.com/me?appsecret_proof=${V}&fields=id`, `https://graph.facebook.com/me?appsecret_proof=${MARCA_SECRETO}&fields=id`],
    [`signature=${V}&x=1`, `signature=${MARCA_SECRETO}&x=1`],
    [`x-hub-signature-256: sha256=${V}`, `x-hub-signature-256: ${MARCA_SECRETO}`],
    [`Authorization: Digest username="u", response="${V}"`, `Authorization: Digest ${MARCA_SECRETO}`],
    [`token: Bearer ${V}`, `token: Bearer ${MARCA_SECRETO}`],
    [`postgres://usuario:${V}@host:5432/db`, `postgres://usuario:${MARCA_SECRETO}@host:5432/db`],
    [`detalle="token=${V}"`, `detalle="token=${MARCA_SECRETO}"`],
  ];
  for (const [entrada, esperado] of casos) assert.equal(redactarTexto(entrada), esperado, entrada);
  // Lo que no es un secreto sigue a la vista: una coma seguida de espacio corta el valor, un
  // literal vacío queda, y los nombres que no son de secreto no tocan su valor.
  for (const [entrada, esperado] of [
    ["token=abc, siguiente", `token=${MARCA_SECRETO}, siguiente`],
    ['{"ok":true,"token":null,"expires_in":3600}', '{"ok":true,"token":null,"expires_in":3600}'],
    ["motivo=firma_invalida estado=401 code: 190", "motivo=firma_invalida estado=401 code: 190"],
    ["code: TG-5f1b2c3d4e5f6a7b", `code: ${MARCA_SECRETO}`],
    ["firma inválida: reintento a las 12:30:05", "firma inválida: reintento a las 12:30:05"],
  ] as const) {
    assert.equal(redactarTexto(entrada), esperado, entrada);
  }
});

test("REFUTADOR r2: estructuras — Name/Value en cualquier caja, listas de tres, contraseña con ñ", () => {
  const V = "SeCrEtVaLuE9x7Q";
  assert.deepEqual(redactar({ Name: "Authorization", Value: V }), { Name: "Authorization", Value: MARCA_SECRETO });
  assert.deepEqual(redactar({ NAME: "x-api-key", VALUE: V }), { NAME: "x-api-key", VALUE: MARCA_SECRETO });
  assert.deepEqual(redactar([["access_token", V, "extra"]]), [["access_token", MARCA_SECRETO, "extra"]]);
  assert.deepEqual(redactar(["Host", "x", "Authorization", V, "sobra"]), ["Host", "x", "Authorization", MARCA_SECRETO, "sobra"]);
  assert.deepEqual(redactar({ contraseña: V, "Contraseña del usuario": V }), { contraseña: MARCA_SECRETO, "Contraseña del usuario": MARCA_SECRETO });
  assert.equal(normalizarClave("Contraseña"), "contrasena");
  assert.equal(esClaveSecreta("contraseña"), true);
});

test("REFUTADOR r2: los casos de la refutación con nombre o forma no llegan al logger (queda, a propósito, la prosa sin \"=\" ni \":\")", () => {
  const V = "SeCrEtVaLuE9x7Q";
  const casos: Record<string, Record<string, unknown>> = {
    xApiKeyTexto: { detalle: `x-api-key: ${V}` },
    xApiKeyTexto2: { detalle: `X-Api-Key=${V}` },
    jsonClave: { detalle: JSON.stringify({ clave: V }) },
    jsonCredencial: { detalle: JSON.stringify({ credenciales: { usuario: "u", clave_fiscal: V } }) },
    jsonCk: { detalle: JSON.stringify({ ck: V, cs: V }) },
    jsonKey: { detalle: JSON.stringify({ key: V }) },
    cookie: { detalle: `Cookie: session=${V}` },
    setCookie: { detalle: `set-cookie: sid=${V}; Path=/` },
    appsecretProof: { detalle: `https://graph.facebook.com/me?appsecret_proof=${V}` },
    passwordConEspacio: { detalle: `{"password": "abc ${V}"}` },
    passwordConComa: { detalle: `password=ab,${V}` },
    privateKeyJson: { detalle: JSON.stringify({ private_key_id: V }) },
    arrayNombreValor: { lista: [["access_token", V, "extra"]] },
    headersObjAnidado: { h: [{ key: "Authorization", value: V }] },
    nameConMayus: { h: { Name: "Authorization", Value: V } },
    claseToString: { c: new (class Foo { toString() { return `token=${V}`; } })() },
    claseGetter: { c: new (class Bar { get token() { return V; } })() },
    errorConCause: { e: Object.assign(new Error("x"), { cause: { token: V } }) },
    errorConProps: { e: Object.assign(new Error("x"), { config: { headers: { Authorization: V } } }) },
    headersInstance: { h: new Headers({ authorization: V }) },
    urlSearch: { u: new URLSearchParams({ client_secret: V }) },
    urlSearchSig: { u: new URLSearchParams({ signature: V }) },
    urlSearchKey: { u: new URLSearchParams({ key: V }) },
    xHubSig: { detalle: `x-hub-signature-256: sha256=${V}` },
    refreshEnCuerpo: { detalle: `POST /oauth/token grant=refresh&refresh_token=${V}` },
  };
  for (const [nombre, ctx] of Object.entries(casos)) {
    const volcado = volcadoDelLogger(ctx);
    assert.ok(!volcado.includes(V), `${nombre}: ${volcado.slice(0, 300)}`);
  }
  assert.ok(!volcadoDelLogger(new Error(`clave_fiscal: ${V}`)).includes(V), "mensaje de un error");
  const out: unknown[][] = [];
  const log = crearLoggerSeguro({ error: (...a) => void out.push(a), warn: (...a) => void out.push(a), info: (...a) => void out.push(a) });
  log.error("s", `scope con x-api-key: ${V}`);
  assert.ok(!JSON.stringify(out).includes(V), "mensaje del log");
  // Lo que queda en claro, declarado: una clave sin forma conocida en prosa, sin "=" ni ":".
  assert.ok(volcadoDelLogger({ detalle: `el token ${V} venció` }).includes(V));
});

test("seTapaEnLosLogs ejecuta la redacción del logger general: sin listas de conector", () => {
  for (const campo of ["clave_api", "access_token", "consumer_secret", "llave_privada", "ck", "pin", "contrasena", "webhook_secret"]) {
    assert.equal(seTapaEnLosLogs(campo), true, campo);
  }
  for (const campo of ["usuario", "hash", "cuenta", "code", "codigo", "", "id"]) {
    assert.equal(seTapaEnLosLogs(campo), false, campo);
  }
});

test("logDelConector: con las claves del conector, sus campos personales tampoco llegan a la consola real", () => {
  const originales = { log: console.log, error: console.error };
  const lineas: string[] = [];
  console.log = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  const ctx = { from: "5491144443333", body: "hola, soy Ana", hash_de_ruta: "ruta-secreta-77", wamid: "wamid.1" };
  try {
    logIntegraciones.info("whatsapp", "entrada", ctx);
    logDelConector({ personales: ["from"], textos: ["body"], secretas: ["hash_de_ruta"] }).info("whatsapp", "entrada hash_de_ruta=ruta-secreta-77", ctx);
  } finally {
    Object.assign(console, originales);
  }
  assert.equal(lineas.length, 2);
  // El logger general no conoce la lista del conector…
  assert.ok(lineas[0].includes("5491144443333") && lineas[0].includes("ruta-secreta-77"));
  // …el del conector sí, en el contexto y en el mensaje.
  const e = JSON.parse(lineas[1]) as Record<string, unknown>;
  assert.equal(e.from, MARCA_DATO_PERSONAL);
  assert.equal(e.body, MARCA_TEXTO);
  assert.equal(e.hash_de_ruta, MARCA_SECRETO);
  assert.equal(e.wamid, "wamid.1");
  assert.ok(!lineas[1].includes("ruta-secreta-77") && !lineas[1].includes("5491144443333"), lineas[1]);
});
