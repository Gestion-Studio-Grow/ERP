// Tests del contrato de conector: validación del descriptor y las decisiones puras de la
// entrada (firma fail-closed, agrupado por cuenta, eventos canónicos). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  agruparPorCuenta,
  dentroDeVentana,
  encabezado,
  estadoHttpPorFirma,
  loFirmado,
  normalizarFailClosed,
  parsearCuerpoJson,
  responderDesafioFailClosed,
  validarConector,
  validarEventoCanonico,
  verificarFirmaFailClosed,
  VENTANA_ANTI_REPLAY_MS,
  type EntradaConector,
  type EntradaCruda,
  type EventoCanonico,
} from "./contrato";
import {
  conectorFalso as conectorDePrueba,
  desafioFalso,
  entradaFirmada as entradaDe,
} from "./conector-falso";
import { logIntegraciones } from "./log";
import { redactar } from "./redaccion";

const enc = new TextEncoder();

const errores = (x: unknown) => validarConector(x).filter((p) => p.severidad === "error");

// ── validarConector ──────────────────────────────────────────────────────────

test("un conector que cumple el contrato no tiene errores", () => {
  assert.deepEqual(errores(conectorDePrueba()), []);
});

test("un conector ES un ModuleDescriptor: se le aplica la validación del módulo", () => {
  assert.ok(errores({ ...conectorDePrueba(), id: "Con Espacios" }).some((p) => /id inválido/.test(p.mensaje)));
  assert.ok(errores({ ...conectorDePrueba(), version: "1.0" }).some((p) => /version inválida/.test(p.mensaje)));
  assert.ok(errores({ ...conectorDePrueba(), kind: "capability" }).some((p) => /plugin/.test(p.mensaje)));
});

test("sin simulador no entra", () => {
  const { simulador: _sin, ...resto } = conectorDePrueba();
  void _sin;
  assert.ok(errores(resto).some((p) => /simulador/.test(p.mensaje)));
  assert.ok(errores({ ...conectorDePrueba(), simulador: { escenarios: [] } }).some((p) => /simulador/.test(p.mensaje)));
});

test("errores declarados: sólo del catálogo y sin repetir", () => {
  assert.ok(errores({ ...conectorDePrueba(), errores: ["inventado"] }).some((p) => /catálogo/.test(p.mensaje)));
  assert.ok(
    errores({ ...conectorDePrueba(), errores: ["proveedor_caido", "proveedor_caido"] }).some((p) => /dos veces/.test(p.mensaje)),
  );
  assert.ok(errores({ ...conectorDePrueba(), errores: undefined }).some((p) => /errores/.test(p.mensaje)));
});

test("el origen del secreto de firma tiene que ir con el modo de entrada", () => {
  const c = conectorDePrueba();
  const mezclado = { ...c, entrada: { ...c.entrada!, modo: "url-por-conexion" as const } };
  assert.ok(errores(mezclado).some((p) => /url-de-app/.test(p.mensaje)));
  const porConexion = {
    ...c,
    entrada: { ...c.entrada!, secretoFirma: { origen: "conexion" as const, campo: "webhook_secret" } },
  };
  assert.ok(errores(porConexion).some((p) => /url-por-conexion/.test(p.mensaje)));
  const bien = {
    ...c,
    entrada: { ...c.entrada!, modo: "url-por-conexion" as const, secretoFirma: { origen: "conexion" as const, campo: "webhook_secret" } },
  };
  assert.deepEqual(errores(bien), []);
  const variableMala = { ...c, entrada: { ...c.entrada!, secretoFirma: { origen: "entorno" as const, variable: "minusculas" } } };
  assert.ok(errores(variableMala).some((p) => /variable/.test(p.mensaje)));
});

test("una entrada sin verificarFirma no entra: toda entrada verifica", () => {
  const c = conectorDePrueba();
  const sinFirma = { ...c, entrada: { ...c.entrada!, verificarFirma: undefined } };
  assert.ok(errores(sinFirma).some((p) => /verificarFirma/.test(p.mensaje)));
});

test("categoría, auth, límites, salida y probarConexion", () => {
  const c = conectorDePrueba();
  assert.ok(errores({ ...c, categoria: "otra" }).length > 0);
  assert.ok(errores({ ...c, auth: { tipo: "magia" } }).length > 0);
  assert.ok(errores({ ...c, auth: { tipo: "clave", campos: [] } }).length > 0);
  assert.deepEqual(errores({ ...c, auth: { tipo: "clave", campos: ["ck", "cs"] } }), []);
  assert.ok(errores({ ...c, limites: { porMinuto: 0, eventosMesPorPlan: {} } }).length > 0);
  assert.ok(errores({ ...c, limites: { porMinuto: 10, eventosMesPorPlan: { micro: -1 } } }).length > 0);
  assert.ok(errores({ ...c, salida: { acciones: [] } }).length > 0);
  assert.ok(
    errores({ ...c, salida: { acciones: [{ id: "enviar", descripcion: "a" }, { id: "enviar", descripcion: "b" }] } }).length > 0,
  );
  assert.deepEqual(errores({ ...c, salida: { acciones: [{ id: "enviar-mensaje", descripcion: "Manda un mensaje." }] } }), []);
  assert.ok(errores({ ...c, probarConexion: undefined }).length > 0);
  assert.ok(errores(null).length > 0);
});

// ── Firma fail-closed ────────────────────────────────────────────────────────

test("firma: sin secreto → 503 y el conector ni se llama", () => {
  let llamadas = 0;
  const c = conectorDePrueba();
  const espia = { entrada: { ...c.entrada!, verificarFirma: () => { llamadas++; return { ok: true } as const; } } };
  const req = entradaDe({ cuenta: "x", mensajes: [] }, "s");
  for (const sinSecreto of [undefined, null, "", "   "]) {
    const r = verificarFirmaFailClosed(espia, req, sinSecreto, new Date());
    assert.deepEqual(r, { ok: false, motivo: "sin_secreto" });
    assert.equal(estadoHttpPorFirma(r), 503);
  }
  assert.equal(llamadas, 0);
});

test("firma: buena pasa, mala o con otro secreto → 401", () => {
  const c = conectorDePrueba();
  const req = entradaDe({ cuenta: "x", mensajes: [] }, "secreto-real");
  const ok = verificarFirmaFailClosed(c, req, "secreto-real", new Date());
  assert.deepEqual(ok, { ok: true });
  assert.equal(estadoHttpPorFirma(ok), null);
  const mala = verificarFirmaFailClosed(c, req, "otro", new Date());
  assert.equal(mala.ok, false);
  assert.equal(estadoHttpPorFirma(mala), 401);
  const sinEncabezado = verificarFirmaFailClosed(c, { ...req, encabezados: {} }, "secreto-real", new Date());
  assert.deepEqual(sinEncabezado, { ok: false, motivo: "sin_firma" });
});

test("firma: un conector que lanza o devuelve algo raro es rechazo, nunca paso", () => {
  const req = entradaDe({}, "s");
  const base = conectorDePrueba().entrada!;
  const conVerificador = (f: unknown) => ({ entrada: { ...base, verificarFirma: f as typeof base.verificarFirma } });
  const casos: unknown[] = [
    () => {
      throw new Error("boom");
    },
    () => ({ ok: "true" }),
    () => ({ ok: 1 }),
    () => true,
    () => "ok",
    () => undefined,
    () => ({ ok: false, motivo: "inventado" }),
  ];
  for (const f of casos) {
    const r = verificarFirmaFailClosed(conVerificador(f), req, "s", new Date());
    assert.equal(r.ok, false);
    assert.equal(estadoHttpPorFirma(r), 401);
  }
  // Sin entrada: ese conector no recibe avisos.
  assert.equal(verificarFirmaFailClosed({}, req, "s", new Date()).ok, false);
  // Un motivo válido del conector se respeta.
  assert.deepEqual(
    verificarFirmaFailClosed(conVerificador(() => ({ ok: false, motivo: "fuera_de_ventana" })), req, "s", new Date()),
    { ok: false, motivo: "fuera_de_ventana" },
  );
});

test("ventana anti-replay de 5 minutos, para atrás y para adelante", () => {
  const ahora = new Date("2026-09-24T12:00:00Z");
  const t = ahora.getTime();
  assert.equal(VENTANA_ANTI_REPLAY_MS, 300_000);
  assert.equal(dentroDeVentana(t, ahora), true);
  assert.equal(dentroDeVentana(t - 300_000, ahora), true);
  assert.equal(dentroDeVentana(t - 300_001, ahora), false);
  assert.equal(dentroDeVentana(t + 300_000, ahora), true);
  assert.equal(dentroDeVentana(t + 300_001, ahora), false);
  assert.equal(dentroDeVentana(Number.NaN, ahora), false);
  assert.equal(dentroDeVentana(t, new Date(Number.NaN)), false);
  assert.equal(dentroDeVentana(t, ahora, -1), false);
});

// ── Eventos canónicos ────────────────────────────────────────────────────────

function mensaje(id: string, cuenta: string | null): EventoCanonico<"mensaje.recibido"> {
  return {
    tipo: "mensaje.recibido",
    idExterno: id,
    cuentaExterna: cuenta,
    ocurridoEn: "2026-09-24T12:00:00Z",
    datos: { remitente: "5491100000000", idMensaje: id, clase: "texto", texto: "hola", opcion: null, adjunto: null },
  };
}

test("un lote que mezcla cuentas se parte: cada evento va a SU negocio", () => {
  const { porCuenta, sinCuenta } = agruparPorCuenta([
    mensaje("a1", "cuenta-A"),
    mensaje("b1", "cuenta-B"),
    mensaje("a2", "cuenta-A"),
    mensaje("x", null),
    mensaje("y", ""),
  ]);
  assert.deepEqual([...porCuenta.keys()], ["cuenta-A", "cuenta-B"]);
  assert.deepEqual(porCuenta.get("cuenta-A")!.map((e) => e.idExterno), ["a1", "a2"]);
  assert.deepEqual(porCuenta.get("cuenta-B")!.map((e) => e.idExterno), ["b1"]);
  assert.deepEqual(sinCuenta.map((e) => e.idExterno), ["x", "y"]);
});

test("validarEventoCanonico: lo que devuelve un conector no se cree a ciegas", () => {
  assert.deepEqual(validarEventoCanonico(mensaje("m1", "c")), []);
  assert.ok(validarEventoCanonico({ ...mensaje("m1", "c"), tipo: "pedido.borrado" }).length > 0);
  assert.ok(validarEventoCanonico({ ...mensaje("", "c") }).length > 0);
  assert.ok(validarEventoCanonico({ ...mensaje("a\nb", "c") }).length > 0);
  assert.ok(validarEventoCanonico({ ...mensaje("x".repeat(256), "c") }).length > 0);
  // " pago-1" y "pago-1" serían dos claves del mismo pago; un invisible, igual.
  for (const raro of [" m1", "m1 ", "\tm1", "m\u200b1", "\ufeffm1", "m1\u00a0", "m\u00ad1"]) {
    assert.ok(validarEventoCanonico(mensaje(raro, "c")).length > 0, JSON.stringify(raro));
    assert.ok(validarEventoCanonico(mensaje("m1", raro)).length > 0, `cuenta ${JSON.stringify(raro)}`);
  }
  assert.deepEqual(agruparPorCuenta([mensaje("m1", " cuenta-A")]).sinCuenta.length, 1);
  assert.deepEqual(validarEventoCanonico(mensaje("wamid.HBgN-_=:1", "c")), []);
  assert.ok(validarEventoCanonico({ ...mensaje("m1", "c"), ocurridoEn: "ayer" }).length > 0);
  assert.ok(validarEventoCanonico({ ...mensaje("m1", "c"), datos: null }).length > 0);
  assert.ok(validarEventoCanonico({ ...mensaje("m1", "c"), datos: { clase: "texto" } }).length > 0);
  assert.ok(validarEventoCanonico(null).length > 0);
  assert.ok(validarEventoCanonico([]).length > 0);
  // El tenantId no es parte del evento: si un conector lo agrega, igual no se usa (la entrada
  // pone el negocio de la conexión). El validador no lo exige ni lo lee.
  assert.deepEqual(validarEventoCanonico({ ...mensaje("m1", "c"), tenantId: "otro-negocio" }), []);

  const archivo: EventoCanonico<"archivo.recibido"> = {
    tipo: "archivo.recibido",
    idExterno: "wamid.1",
    cuentaExterna: "c",
    ocurridoEn: null,
    datos: { remitente: "5491100000000", idMensaje: "wamid.1", nombre: "extracto.pdf", mime: "application/pdf", tamanio: 1234, sha256: "a".repeat(64) },
  };
  assert.deepEqual(validarEventoCanonico(archivo), []);
  assert.ok(validarEventoCanonico({ ...archivo, datos: { ...archivo.datos, sha256: "A".repeat(64) } }).length > 0);
  assert.ok(validarEventoCanonico({ ...archivo, datos: { ...archivo.datos, sha256: "abc" } }).length > 0);
  assert.ok(validarEventoCanonico({ ...archivo, datos: { ...archivo.datos, tamanio: -1 } }).length > 0);
  assert.ok(validarEventoCanonico({ ...archivo, datos: { ...archivo.datos, tamanio: 1.5 } }).length > 0);
});

test("cuerpo: JSON estricto; vacío es null; UTF-8 inválido o JSON roto lanzan", () => {
  const req = (bytes: Uint8Array): EntradaCruda => ({ metodo: "POST", encabezados: {}, consulta: {}, cuerpo: bytes });
  assert.equal(parsearCuerpoJson(req(new Uint8Array())), null);
  assert.deepEqual(parsearCuerpoJson(req(enc.encode('{"a":1}'))), { a: 1 });
  assert.throws(() => parsearCuerpoJson(req(enc.encode("{a:1}"))));
  assert.throws(() => parsearCuerpoJson(req(new Uint8Array([0x7b, 0xff, 0x7d]))));
});

test("encabezado sin importar mayúsculas", () => {
  const req: EntradaCruda = { metodo: "GET", encabezados: { "X-Hub-Signature-256": "v" }, consulta: {}, cuerpo: new Uint8Array() };
  assert.equal(encabezado(req, "x-hub-signature-256"), "v");
  assert.equal(encabezado(req, "otro"), null);
});

// ── Sólo lo firmado llega a normalizar ───────────────────────────────────────

const reqCompleta = (): EntradaCruda => ({
  metodo: "POST",
  encabezados: { "x-firma": "f", "x-id": "p1", "x-cuenta-sin-firma": "VICTIMA" },
  consulta: { "data.id": "p1", user_id: "VICTIMA" },
  cuerpo: enc.encode('{"cuenta":"VICTIMA"}'),
});

test("loFirmado: sin firma sobre el cuerpo, el cuerpo no pasa; de encabezados y consulta, sólo lo declarado", () => {
  const manifiesto: Pick<EntradaConector, "firmaCubreCuerpo" | "encabezadosFirmados" | "consultaFirmada"> = {
    firmaCubreCuerpo: false,
    encabezadosFirmados: ["x-firma", "x-id"],
    consultaFirmada: ["data.id"],
  };
  const r = loFirmado(manifiesto, reqCompleta());
  assert.deepEqual(r.encabezados, { "x-firma": "f", "x-id": "p1" });
  assert.deepEqual(r.consulta, { "data.id": "p1" });
  assert.equal(r.cuerpo.byteLength, 0);
  // Por defecto la firma cubre el cuerpo: el cuerpo pasa, encabezados y consulta no.
  const porDefecto = loFirmado({}, reqCompleta());
  assert.equal(new TextDecoder().decode(porDefecto.cuerpo), '{"cuenta":"VICTIMA"}');
  assert.deepEqual(porDefecto.encabezados, {});
  assert.deepEqual(porDefecto.consulta, {});
  // Un parámetro "__proto__" no le cambia el prototipo a la copia.
  const conProto: EntradaCruda = { ...reqCompleta(), consulta: JSON.parse('{"__proto__":"x"}') as Record<string, string> };
  const limpio = loFirmado({ consultaFirmada: ["__proto__"] }, conProto);
  assert.equal(Object.getPrototypeOf(limpio.consulta), Object.prototype);
});

test("normalizarFailClosed: normalizar recibe payload null y sólo lo firmado cuando la firma no cubre el cuerpo", () => {
  const vistos: Array<{ payload: unknown; req: EntradaCruda }> = [];
  const c = conectorDePrueba();
  const espia = {
    entrada: {
      ...c.entrada!,
      firmaCubreCuerpo: false,
      encabezadosFirmados: ["x-id"],
      normalizar: (payload: unknown, req: EntradaCruda) => {
        vistos.push({ payload, req });
        return [];
      },
    },
  };
  const r = normalizarFailClosed(espia, reqCompleta());
  assert.deepEqual(r, { ok: true, eventos: [], descartados: [] });
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].payload, null);
  assert.equal(vistos[0].req.cuerpo.byteLength, 0);
  assert.deepEqual(vistos[0].req.encabezados, { "x-id": "p1" });
  assert.deepEqual(vistos[0].req.consulta, {});
});

test("normalizarFailClosed: sin entrada, cuerpo roto, normalizar que lanza o no da lista, y eventos inválidos", () => {
  const c = conectorDePrueba();
  const req = entradaDe({ cuenta: "cuenta-1", mensajes: [{ id: "m1", de: "1", texto: "a" }] }, "s");
  assert.deepEqual(normalizarFailClosed({}, req), { ok: false, motivo: "sin_entrada", detalle: "el conector no recibe avisos" });
  assert.equal((normalizarFailClosed(c, { ...req, cuerpo: enc.encode("{roto") }) as { motivo: string }).motivo, "cuerpo_invalido");
  const con = (normalizar: unknown) => ({ entrada: { ...c.entrada!, normalizar: normalizar as EntradaConector["normalizar"] } });
  assert.equal((normalizarFailClosed(con(() => { throw new Error("boom"); }), req) as { motivo: string }).motivo, "normalizar_fallo");
  assert.equal((normalizarFailClosed(con(() => ({ no: "lista" })), req) as { motivo: string }).motivo, "normalizar_fallo");
  const mezcla = normalizarFailClosed(con(() => [mensaje("m1", "c"), { ...mensaje("", "c") }, null]), req);
  assert.ok(mezcla.ok);
  assert.deepEqual(mezcla.eventos.map((e) => e.idExterno), ["m1"]);
  assert.deepEqual(mezcla.descartados.map((d) => d.indice), [1, 2]);
  // El conector de prueba normaliza su propio aviso.
  const ok = normalizarFailClosed(c, req);
  assert.ok(ok.ok);
  assert.deepEqual(ok.eventos.map((e) => [e.cuentaExterna, e.idExterno]), [["cuenta-1", "m1"]]);
});

test("encabezados con mayúsculas: ni la firma ni la normalización llaman al conector", () => {
  let llamadas = 0;
  const c = conectorDePrueba();
  const espia = {
    entrada: {
      ...c.entrada!,
      verificarFirma: () => { llamadas++; return { ok: true } as const; },
      normalizar: () => { llamadas++; return []; },
    },
  };
  // Dos nombres que difieren en mayúsculas: el verificador podría leer uno y normalizar el otro.
  const req: EntradaCruda = { metodo: "POST", encabezados: { "X-Id": "forjado", "x-id": "legitimo" }, consulta: {}, cuerpo: enc.encode("{}") };
  assert.deepEqual(verificarFirmaFailClosed(espia, req, "s", new Date()), { ok: false, motivo: "firma_invalida" });
  assert.equal(normalizarFailClosed(espia, req).ok, false);
  assert.equal(llamadas, 0);
});

// ── Desafío fail-closed ──────────────────────────────────────────────────────

test("desafío: sin token esperado → 503 sin llamar al conector; lo raro → 403; lo bueno → 200 con el eco", () => {
  const c = conectorDePrueba();
  let llamadas = 0;
  const ingenuo = {
    entrada: {
      ...c.entrada!,
      // Compara el token recibido con el esperado: con el esperado vacío aceptaría un token vacío.
      desafio: {
        variable: "X",
        responder: (req: EntradaCruda, esperado: string) => {
          llamadas++;
          return (req.consulta["hub.verify_token"] ?? "") === esperado ? { estado: 200, cuerpo: "eco" } : null;
        },
      },
    },
  };
  const sinToken = desafioFalso("");
  for (const vacio of [undefined, null, "", "  "]) {
    assert.deepEqual(responderDesafioFailClosed(ingenuo, sinToken, vacio), { estado: 503, cuerpo: "" });
  }
  assert.equal(llamadas, 0);

  assert.deepEqual(responderDesafioFailClosed(c, desafioFalso("t-1", "987"), "t-1"), { estado: 200, cuerpo: "987" });
  assert.equal(responderDesafioFailClosed(c, desafioFalso("t-1", "a".repeat(256)), "t-1").estado, 200);
  assert.equal(responderDesafioFailClosed(c, desafioFalso("t-1", "<b>"), "t-1").estado, 403);
  assert.equal(responderDesafioFailClosed(c, desafioFalso("t-2"), "t-1").estado, 403);
  assert.equal(responderDesafioFailClosed({}, desafioFalso("t-1"), "t-1").estado, 404);
  const con = (responder: unknown) => ({ entrada: { ...c.entrada!, desafio: { variable: "X", responder: responder as () => null } } });
  for (const raro of [
    () => { throw new Error("boom"); },
    () => ({ estado: "200", cuerpo: "x" }),
    () => ({ estado: 200, cuerpo: 5 }),
    () => ({ estado: 204, cuerpo: "" }),
    () => ({ estado: 200, cuerpo: "x".repeat(257) }),
    // El eco vuelve tal cual al que llamó: ni marcado, ni saltos de línea, ni vacío.
    () => ({ estado: 200, cuerpo: "<script>alert(1)</script>" }),
    () => ({ estado: 200, cuerpo: "123\r\nSet-Cookie: x=1" }),
    () => ({ estado: 200, cuerpo: "" }),
    () => true,
  ]) {
    assert.deepEqual(responderDesafioFailClosed(con(raro), desafioFalso("t-1"), "t-1"), { estado: 403, cuerpo: "" });
  }
});

// ── Credenciales: todo campo tiene que taparse en los logs ───────────────────

/** Lo que el logger de la suite (log.ts) escribe en la consola REAL al loguear `campo` de todas las formas. */
function consolaAlLoguear(campo: string, valor: string): string {
  const originales = { log: console.log, error: console.error };
  const lineas: string[] = [];
  console.log = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void lineas.push(a.map(String).join(" "));
  try {
    logIntegraciones.info("integraciones", "probar conexión", { conector: "x", [campo]: valor });
    logIntegraciones.warn("integraciones", `falló con ${campo}=${valor}`, { credenciales: { [campo]: valor } });
    logIntegraciones.error("integraciones", "falló", new Error(`${campo}: ${valor}`), { detalle: JSON.stringify({ [campo]: valor }) });
  } finally {
    Object.assign(console, originales);
  }
  return lineas.join("\n");
}

test("REFUTADOR r2: un campo de credencial que logIntegraciones no tapa no entra, aunque esté en redaccion.secretas", () => {
  const c = conectorDePrueba();
  const valor = "valor-de-credencial-9Zq";
  // La reproducción exacta: auth por clave con campos sin nombre de secreto, declarados en
  // redaccion.secretas. El payload guardado los tapa…
  const refutado = { ...c, auth: { tipo: "clave" as const, campos: ["usuario", "hash"] }, redaccion: { secretas: ["usuario", "hash"] } };
  assert.deepEqual(redactar({ usuario: valor, hash: valor }, refutado.redaccion), { usuario: "[secreto]", hash: "[secreto]" });
  // …pero el logger de la suite no conoce esa lista: saldrían en claro. Por eso no entra.
  assert.ok(consolaAlLoguear("hash", valor).includes(valor), "logIntegraciones no tapa 'hash' (por eso se rechaza)");
  const problemas = errores(refutado).map((p) => p.mensaje);
  assert.ok(problemas.some((m) => /"usuario" sale en claro/.test(m)), problemas.join("\n"));
  assert.ok(problemas.some((m) => /"hash" sale en claro/.test(m)), problemas.join("\n"));
  // El secreto de firma por conexión, igual.
  const porConexion = (campo: string, secretas?: string[]) => ({
    ...c,
    redaccion: secretas ? { secretas } : undefined,
    entrada: { ...c.entrada!, modo: "url-por-conexion" as const, secretoFirma: { origen: "conexion" as const, campo } },
  });
  assert.ok(errores(porConexion("hash_de_ruta", ["hash_de_ruta"])).some((p) => /secretoFirma/.test(p.mensaje)));
  assert.deepEqual(errores(porConexion("firma_webhook")), []);
});

test("validarConector acepta un campo de credencial SI Y SÓLO SI el logger de la suite lo tapa contra la consola real", () => {
  const c = conectorDePrueba();
  const valor = "valor-de-credencial-9Zq";
  const candidatos = [
    // Sin nombre de secreto: salen en claro.
    "usuario", "hash", "numero_de_cuenta", "hash_de_ruta", "cuenta", "id_cliente", "codigo",
    // Con nombre de secreto: se tapan.
    "clave_api", "clave_fiscal", "llave_privada", "cert_pem", "ck", "cs", "consumer_key", "consumer_secret",
    "access_token", "refresh_token", "webhook_secret", "firma_webhook", "password", "api_key", "pin", "contrasena",
  ];
  const aceptados: string[] = [];
  const rechazados: string[] = [];
  for (const campo of candidatos) {
    const acepta = errores({ ...c, auth: { tipo: "clave" as const, campos: [campo] } }).length === 0;
    const tapado = !consolaAlLoguear(campo, valor).includes(valor);
    assert.equal(acepta, tapado, `${campo}: validarConector ${acepta ? "acepta" : "rechaza"} y el logger ${tapado ? "tapa" : "NO tapa"}`);
    (acepta ? aceptados : rechazados).push(campo);
  }
  // La prueba muerde de los dos lados.
  assert.ok(aceptados.length >= 10 && rechazados.length >= 5, `aceptados ${aceptados} / rechazados ${rechazados}`);
  assert.deepEqual(errores({ ...c, auth: { tipo: "clave" as const, campos: ["ck", "cs"] } }), []);
});

// ── Nadie saltea los envoltorios fail-closed ─────────────────────────────────

test("sólo contrato.ts llama a verificarFirma, normalizar y responder del conector (heurística estática)", () => {
  // Llamar a `entrada.normalizar` directo le daría al conector el cuerpo sin firma; llamar a
  // `verificarFirma` o a `responder` directo saltea el 503 sin secreto. Se miran los archivos
  // que tocan el contrato: los de src/integraciones y los que importan de ahí.
  const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const contrato = path.join(src, "integraciones", "contrato.ts");
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && !e.name.startsWith(".")) recorrer(p);
      } else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.test\.(ts|tsx|mts)$/.test(e.name)) archivos.push(p);
    }
  };
  recorrer(src);
  assert.ok(archivos.includes(contrato), "se recorrió src/");
  // Cualquier acceso a esos métodos (no sólo la llamada: `?.()`, `.call()`, un alias) y la
  // desestructuración. Un conector los DEFINE como claves de un objeto, eso no cuenta.
  const acceso = /(?:\.\s*|\[\s*["'`])(?:normalizar|verificarFirma|responder)\b/;
  const desestructura = /\{[^{}]*\b(?:normalizar|verificarFirma|responder)\b[^{}]*\}\s*=[^=>]/;
  const llamadaDirecta = { test: (codigo: string) => acceso.test(codigo) || desestructura.test(codigo) };
  const violaciones: string[] = [];
  for (const archivo of archivos) {
    if (archivo === contrato) continue;
    const fuente = fs.readFileSync(archivo, "utf8");
    const tocaElContrato = archivo.startsWith(path.join(src, "integraciones") + path.sep) || importaIntegraciones(fuente);
    if (!tocaElContrato) continue;
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    if (llamadaDirecta.test(codigo)) violaciones.push(path.relative(src, archivo));
  }
  assert.deepEqual(violaciones, [], "usá verificarFirmaFailClosed, normalizarFailClosed y responderDesafioFailClosed");
  // La heurística ve las formas directas.
  for (const malo of [
    "c.entrada.normalizar(p, r)",
    "c.entrada!.normalizar?.(p, r)",
    "entrada['verificarFirma'](r, s, a)",
    "entrada.verificarFirma.call(null, r, s, a)",
    "const f = d.responder; f(req, t)",
    "const { normalizar } = conector.entrada;",
  ]) {
    assert.ok(llamadaDirecta.test(malo), malo);
  }
  // Toca el contrato quien IMPORTA de src/integraciones, no quien nombra una ruta con esa palabra.
  for (const importa of [
    'import { registro } from "@/integraciones/registro";',
    'import type { ConectorDescriptor } from "../../integraciones/contrato";',
    'const m = await import("@/integraciones/registro");',
    'const m = require("../integraciones/registro.ts");',
    'export { registro } from "@/integraciones/registro";',
  ]) {
    assert.ok(importaIntegraciones(importa), importa);
  }
  for (const noImporta of [
    'redirect("/admin/integraciones/whatsapp"); x.responder(req);',
    '<Link href="/operador/integraciones/">Integraciones</Link>',
    'import { x } from "@/lib/integraciones-viejas";',
  ]) {
    assert.ok(!importaIntegraciones(noImporta), noImporta);
  }
  for (const bueno of [
    "normalizarFailClosed(c, req)",
    "entrada: { verificarFirma(req, secreto) { return x; }, normalizar: (p) => [] }",
    "const r = responderDesafioFailClosed(c, req, token);",
  ]) {
    assert.ok(!llamadaDirecta.test(bueno), bueno);
  }
});

/** ¿El código importa algo de src/integraciones? (import, import(), require, re-export) */
function importaIntegraciones(fuente: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'`](?:@\/|(?:\.\.?\/)+)(?:[^"'`]*\/)?integraciones\/[^"'`]*["'`]/.test(
    fuente,
  );
}
