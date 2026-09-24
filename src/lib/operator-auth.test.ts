// La consola del operador gobierna a TODOS los negocios. Estos tests ejecutan el ataque real: la
// cookie de sesión de un usuario de un negocio, puesta como cookie del operador; y la identidad con
// nombre: quién entra, cuánto dura la sesión y qué pasa con las sesiones del formato anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSessionToken, getSessionCookieName } from "./auth";
import {
  createOperatorToken,
  getOperatorCookieName,
  leerSesionOperador,
  normalizarNombreOperador,
  operadorDuenio,
  operadoresConfigurados,
  readOperatorToken,
  VIGENCIA_SESION_MS,
  verificarOperador,
} from "./operator-auth";
import { operadorDesdeCookies } from "./operator-session";
import { nombreParaLineaNueva, valorDeClave } from "./operador/clave-operador";
import { proxy } from "@/proxy";

function conEntorno<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) antes[k] = process.env[k];
  const e = process.env as Record<string, string | undefined>;
  const poner = (vals: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  };
  poner(env);
  return fn().finally(() => poner(antes));
}

const DEV = { NODE_ENV: "development", AUTH_SECRET: "a", OPERATOR_SECRET: "b", OPERADORES: undefined, OPERADOR_DUENIO: undefined };

/** Un almacén de cookies como el de Next, con lo que traiga el navegador. */
function cookiesDe(valores: Record<string, string>) {
  return { get: (n: string) => (n in valores ? { value: valores[n] } : undefined) };
}

async function proxyA(ruta: string, cookies: Record<string, string>) {
  const req = new NextRequest(`https://app.test${ruta}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return proxy(req);
}

// ── El caso medido por el arquitecto (scratchpad/token-confusion.mts) ─────────────────────────

test("ATAQUE MEDIDO: la cookie admin_session de una recepcionista no abre /operador (proxy ni requireOperator)", async () => {
  // Lo peor posible: los dos secretos iguales (la configuración que abría la consola antes de 5f7314e).
  await conEntorno({ ...DEV, AUTH_SECRET: "mismo", OPERATOR_SECRET: "mismo" }, async () => {
    const recepcion = await createSessionToken("cmf1recepcionista000001");
    // 1) Tal cual, como admin_session: el portón del operador no la mira.
    const r1 = await proxyA("/operador", { [getSessionCookieName()]: recepcion });
    assert.equal(r1.status, 307);
    assert.equal(new URL(r1.headers.get("location")!).pathname, "/operador/login");
    // 2) Copiada a operator_session (el ataque de verdad): tampoco.
    const r2 = await proxyA("/operador/tenants/x", { [getOperatorCookieName()]: recepcion });
    assert.equal(r2.status, 307);
    assert.equal(new URL(r2.headers.get("location")!).pathname, "/operador/login");
    // 3) Lo que decide requireOperator (la segunda red, en cada página y action).
    assert.equal(await operadorDesdeCookies(cookiesDe({ [getSessionCookieName()]: recepcion })), null);
    assert.equal(await operadorDesdeCookies(cookiesDe({ [getOperatorCookieName()]: recepcion })), null);
    assert.equal(await readOperatorToken(recepcion), null);
  });
});

test("ATAQUE: sin OPERATOR_SECRET (cae a AUTH_SECRET en dev), la sesión de un negocio tampoco", async () => {
  await conEntorno({ ...DEV, AUTH_SECRET: "s", OPERATOR_SECRET: undefined }, async () => {
    assert.equal(await readOperatorToken(await createSessionToken("user_x")), null);
  });
});

test("ATAQUE: un id de usuario con forma de operador no sirve (la firma es de otro dominio)", async () => {
  await conEntorno({ ...DEV, AUTH_SECRET: "mismo", OPERATOR_SECRET: "mismo" }, async () => {
    const forjado = await createSessionToken(`op|duenio|${Date.now()}`);
    assert.equal(await readOperatorToken(forjado), null);
  });
});

test("el token del operador vale, abre el proxy y devuelve el NOMBRE", async () => {
  await conEntorno({ ...DEV, OPERADOR_DUENIO: "Tomás" }, async () => {
    const tok = await createOperatorToken();
    assert.equal(await readOperatorToken(tok), "tomas");
    assert.equal(await operadorDesdeCookies(cookiesDe({ [getOperatorCookieName()]: tok })), "tomas");
    const r = await proxyA("/operador", { [getOperatorCookieName()]: tok });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("location"), null);
  });
});

test("cambiar el nombre o la hora dentro del token rompe la firma", async () => {
  await conEntorno(DEV, async () => {
    const tok = await createOperatorToken("duenio", 1_800_000_000_000);
    const firma = tok.slice(tok.lastIndexOf(".") + 1);
    assert.equal(await readOperatorToken(tok, 1_800_000_000_000), "duenio");
    assert.equal(await readOperatorToken(`op|otro|1800000000000.${firma}`, 1_800_000_000_000), null);
    assert.equal(await readOperatorToken(`op|duenio|1800000000001.${firma}`, 1_800_000_000_000), null);
  });
});

// ── Vencimiento en el servidor ────────────────────────────────────────────────────────────────

test("un token de 9 h se rechaza; uno de 7 h 59 m vale; uno emitido en el futuro, no", async () => {
  await conEntorno(DEV, async () => {
    const ahora = 1_800_000_000_000;
    const hora = 60 * 60 * 1000;
    assert.equal(await readOperatorToken(await createOperatorToken("duenio", ahora - 9 * hora), ahora), null);
    assert.equal(await readOperatorToken(await createOperatorToken("duenio", ahora - VIGENCIA_SESION_MS - 1), ahora), null);
    assert.equal(await readOperatorToken(await createOperatorToken("duenio", ahora - 8 * hora + 60_000), ahora), "duenio");
    assert.equal(await readOperatorToken(await createOperatorToken("duenio", ahora + 10 * 60_000), ahora), null);
  });
});

test("una sesión del formato anterior ('operator.<firma>', aun con firma válida) ya no vale", async () => {
  await conEntorno(DEV, async () => {
    // La firma exacta que emitía 5f7314e: HMAC(OPERATOR_SECRET, "gsg-operador-v1|operator").
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("b"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("gsg-operador-v1|operator"));
    const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
    assert.equal(await readOperatorToken(`operator.${hex}`), null);
  });
});

// ── Quién es operador ─────────────────────────────────────────────────────────────────────────

test("OPERADORES: entra con su clave, no con otra; y al sacarlo de la lista su sesión deja de valer", async () => {
  const linea = `facu=${await valorDeClave("clave de facu larga", new Uint8Array(16).fill(7))}`;
  await conEntorno({ ...DEV, OPERADORES: `${linea};roto=pbkdf2$xx$yy` }, async () => {
    assert.equal(await verificarOperador("Facu", "clave de facu larga"), "facu");
    assert.equal(await verificarOperador("facu", "otra"), null);
    // La entrada mal formada no habilita a nadie.
    assert.equal(await verificarOperador("roto", "cualquiera"), null);
    const tok = await createOperatorToken("facu");
    assert.equal(await readOperatorToken(tok), "facu");
    await conEntorno({ OPERADORES: undefined }, async () => {
      assert.equal(await readOperatorToken(tok), null, "Facu ya no está en OPERADORES");
    });
  });
});

test("el dueño entra con OPERATOR_PASSWORD, con su nombre o con el nombre vacío (el login de siempre)", async () => {
  await conEntorno({ ...DEV, OPERATOR_PASSWORD: "la-de-siempre", OPERADOR_DUENIO: "tomas" }, async () => {
    assert.equal(await verificarOperador("", "la-de-siempre"), "tomas");
    assert.equal(await verificarOperador("Tomás", "la-de-siempre"), "tomas");
    assert.equal(await verificarOperador("tomas", "otra"), null);
    // Otro nombre con la clave del dueño: no.
    assert.equal(await verificarOperador("facu", "la-de-siempre"), null);
  });
});

test("producción: sin OPERATOR_PASSWORD no hay clave por defecto para el dueño", async () => {
  await conEntorno({ NODE_ENV: "production", OPERATOR_PASSWORD: undefined, OPERADORES: undefined }, async () => {
    assert.equal(await verificarOperador("", "operador"), null);
  });
});

test("no se puede emitir un token para un nombre no habilitado", async () => {
  await conEntorno(DEV, async () => {
    await assert.rejects(createOperatorToken("facu"), /no es un operador habilitado/);
    await assert.rejects(createOperatorToken("a|b"), /no es un operador habilitado/);
  });
});

test("nombres: se normalizan y los que romperían el token se rechazan", () => {
  assert.equal(normalizarNombreOperador(" Tomás Pérez "), "tomas-perez");
  assert.equal(normalizarNombreOperador("a|b"), null);
  assert.equal(normalizarNombreOperador("a.b"), null);
  assert.equal(normalizarNombreOperador(""), null);
  assert.equal(operadorDuenio({}), "duenio");
  assert.equal(operadorDuenio({ OPERADOR_DUENIO: "|||" }), "duenio");
});

test("producción: sin OPERATOR_SECRET, o igual a AUTH_SECRET, falla cerrado", async () => {
  await conEntorno({ NODE_ENV: "production", AUTH_SECRET: "a", OPERATOR_SECRET: undefined }, async () => {
    await assert.rejects(createOperatorToken(), /OPERATOR_SECRET no está configurado/);
  });
  await conEntorno({ NODE_ENV: "production", AUTH_SECRET: "igual", OPERATOR_SECRET: "igual" }, async () => {
    await assert.rejects(createOperatorToken(), /no puede ser igual a AUTH_SECRET/);
    await assert.rejects(readOperatorToken(`op|d|duenio|${Date.now()}.abc`), /no puede ser igual a AUTH_SECRET/);
  });
});

test("/operador/clave es pública (arma la línea en el navegador); el resto de /operador no", async () => {
  await conEntorno(DEV, async () => {
    assert.equal((await proxyA("/operador/clave", {})).status, 200);
    assert.equal((await proxyA("/operador/clave/x", {})).status, 307);
    assert.equal((await proxyA("/operador/alta", {})).status, 307);
  });
});

// ── Refutación de la 2b: clave vacía y el nombre del dueño en OPERADORES ────────────────────────

test("R1: una clave vacía nunca entra, ni con OPERATOR_PASSWORD vacía ni por PBKDF2", async () => {
  // El repro del refutador: antes daba "duenio".
  assert.equal(await verificarOperador("", "", { NODE_ENV: "production", OPERATOR_PASSWORD: "" }), null);
  assert.equal(await verificarOperador("duenio", "", { NODE_ENV: "production", OPERATOR_PASSWORD: "" }), null);
  // Vacía tampoco cae al "operador" de desarrollo: una variable puesta vacía no es "sin configurar".
  assert.equal(await verificarOperador("", "operador", { NODE_ENV: "development", OPERATOR_PASSWORD: "" }), null);
  assert.equal(await verificarOperador("", "", { NODE_ENV: "development", OPERATOR_PASSWORD: "" }), null);
  // Ausente en producción: nadie entra como dueño.
  assert.equal(await verificarOperador("", "", { NODE_ENV: "production" }), null);
  // Con clave del dueño cargada, la vacía no coincide.
  assert.equal(await verificarOperador("", "", { NODE_ENV: "production", OPERATOR_PASSWORD: "la-buena" }), null);
  // Una línea de OPERADORES armada con la clave vacía tampoco abre.
  const vacia = `facu=${await valorDeClave("", new Uint8Array(16).fill(1))}`;
  assert.equal(await verificarOperador("facu", "", { NODE_ENV: "production", OPERADORES: vacia }), null);
});

test("R2: una línea de OPERADORES con el nombre del dueño se ignora; el dueño entra sólo con OPERATOR_PASSWORD", async () => {
  const intruso = await valorDeClave("clave-del-intruso", new Uint8Array(16).fill(3));
  // Con el nombre por defecto y con OPERADOR_DUENIO (comparado normalizado: "TOMÁS" = "tomas").
  for (const [duenio, linea] of [
    [undefined, `duenio=${intruso}`],
    ["Tomás", `TOMAS=${intruso}`],
    ["tomas", ` Tomás =${intruso}`],
  ] as const) {
    const env = { NODE_ENV: "production", OPERATOR_PASSWORD: "la-del-duenio", OPERADOR_DUENIO: duenio, OPERADORES: linea };
    const nombre = operadorDuenio(env);
    // El repro del refutador: antes el intruso entraba como dueño y el dueño real quedaba afuera.
    assert.equal(await verificarOperador(nombre, "clave-del-intruso", env), null, linea);
    assert.equal(await verificarOperador("", "clave-del-intruso", env), null, linea);
    assert.equal(await verificarOperador("", "la-del-duenio", env), nombre, linea);
    assert.equal(operadoresConfigurados(env).has(nombre), false, linea);
  }
});

test("R2: un nombre repetido en OPERADORES no entra con ninguna de sus líneas", async () => {
  const a = await valorDeClave("clave-a", new Uint8Array(16).fill(4));
  const b = await valorDeClave("clave-b", new Uint8Array(16).fill(5));
  const env = { NODE_ENV: "production", OPERADORES: `facu=${a};otro=${a};Facu=${b}` };
  assert.equal(await verificarOperador("facu", "clave-a", env), null);
  assert.equal(await verificarOperador("facu", "clave-b", env), null);
  assert.equal(await verificarOperador("otro", "clave-a", env), "otro");
  assert.deepEqual([...operadoresConfigurados(env).keys()], ["otro"]);
});

test("R2: /operador/clave no arma una línea con el nombre del dueño", () => {
  assert.deepEqual(nombreParaLineaNueva("Facu", "tomas"), { ok: true, nombre: "facu" });
  const r = nombreParaLineaNueva(" Tomás ", "tomas");
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /reservado/);
  assert.equal(nombreParaLineaNueva("duenio", "duenio").ok, false);
  assert.equal(nombreParaLineaNueva("a|b", "duenio").ok, false);
});

// ── Segunda refutación: el rol firmado, la clave de espacios y la clave de desarrollo ──────────

test("REPRO esc.ts: una sesión de OPERADORES no se vuelve dueña si OPERADOR_DUENIO pasa a tener su nombre", async () => {
  const linea = await valorDeClave("clave-de-ana", new Uint8Array(16).fill(6));
  await conEntorno(
    { NODE_ENV: "production", AUTH_SECRET: "a".repeat(40), OPERATOR_SECRET: "s".repeat(40), OPERATOR_PASSWORD: "clave-larga-del-duenio", OPERADOR_DUENIO: "tomas", OPERADORES: `ana=${linea}` },
    async () => {
      const ana = await verificarOperador("ana", "clave-de-ana");
      const tok = await createOperatorToken(ana!);
      assert.deepEqual(await leerSesionOperador(tok), { nombre: "ana", rol: "o", esDuenio: false });
      // Antes: el mismo token pasaba a leerse como el dueño.
      await conEntorno({ OPERADOR_DUENIO: "Ana" }, async () => {
        assert.equal(await leerSesionOperador(tok), null);
      });
      // Escenario 2: un operador llamado "duenio" y después se borra OPERADOR_DUENIO.
      await conEntorno({ OPERADORES: `duenio=${linea}` }, async () => {
        const tok2 = await createOperatorToken((await verificarOperador("duenio", "clave-de-ana"))!);
        assert.equal((await leerSesionOperador(tok2))?.esDuenio, false);
        await conEntorno({ OPERADOR_DUENIO: undefined }, async () => {
          assert.equal(await leerSesionOperador(tok2), null);
        });
      });
      // Y la sesión del dueño deja de valer si su nombre ya no es el del dueño.
      const d = await createOperatorToken("tomas");
      assert.deepEqual(await leerSesionOperador(d), { nombre: "tomas", rol: "d", esDuenio: true });
      await conEntorno({ OPERADOR_DUENIO: "otro" }, async () => {
        assert.equal(await leerSesionOperador(d), null);
      });
    },
  );
});

test("un token con el rol cambiado a mano no vale (el rol va firmado)", async () => {
  await conEntorno({ ...DEV, OPERADOR_DUENIO: "tomas", OPERADORES: `tomas2=${await valorDeClave("x-clave-larga", new Uint8Array(16).fill(2))}` }, async () => {
    const tok = await createOperatorToken("tomas2", 1_800_000_000_000);
    const firma = tok.slice(tok.lastIndexOf(".") + 1);
    assert.equal(await readOperatorToken(`op|d|tomas2|1800000000000.${firma}`, 1_800_000_000_000), null);
  });
});

test("REPRO r12.ts: OPERATOR_PASSWORD de puros espacios no autentica; la clave 'operador' sólo con NODE_ENV=development", async () => {
  for (const pw of [" ", "\t", "\n", "   "]) {
    assert.equal(await verificarOperador("", pw, { NODE_ENV: "production", OPERATOR_PASSWORD: pw }), null, JSON.stringify(pw));
  }
  for (const nodeEnv of [undefined, "test", "Production", "production", "dev"]) {
    assert.equal(await verificarOperador("", "operador", { NODE_ENV: nodeEnv }), null, String(nodeEnv));
  }
  assert.equal(await verificarOperador("", "operador", { NODE_ENV: "development" }), "duenio");
  // Una clave real con espacios adentro o alrededor sigue valiendo tal cual.
  assert.equal(await verificarOperador("", " con espacios ", { NODE_ENV: "production", OPERATOR_PASSWORD: " con espacios " }), "duenio");
});
