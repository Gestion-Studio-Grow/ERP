// Tests del RPA de bajas en OpenKey contra el OpenKey SIMULADO (nunca el real).
// Correr: node --test scripts/rpa-openkey/rpa.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearOpenKeySimulado, leerSemilla, parsearFallas } from "./openkey-simulado.mjs";
import { leerReporte, csvResultado, partirLinea } from "./rpa.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const RPA = path.join(AQUI, "rpa.mjs");
const REPORTE = path.join(AQUI, "reporte-ejemplo.csv");
const SEMILLA = leerSemilla(path.join(AQUI, "semilla-simulado.json"));
const USUARIO = "usuario-sim-ch";
const CLAVE = "Clave-Secreta-9137";
const tmp = mkdtempSync(path.join(tmpdir(), "rpa-openkey-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

async function conSimulado(opciones, fn) {
  const sim = crearOpenKeySimulado({ vouchers: SEMILLA, usuario: USUARIO, clave: CLAVE, ...opciones });
  const url = await sim.escuchar(0);
  try {
    return await fn(sim, url);
  } finally {
    await sim.cerrar();
  }
}

let corrida = 0;
/** Corre el RPA como proceso aparte (como en Actions). Devuelve código, consola y filas del CSV de salida. */
function correr(url, { entrada = REPORTE, env = {} } = {}) {
  const salida = path.join(tmp, `resultado-${++corrida}.csv`);
  return new Promise((ok) => {
    const p = spawn(process.execPath, [RPA, "--entrada", entrada, "--salida", salida], {
      env: {
        ...process.env,
        OPENKEY_URL: url,
        OPENKEY_USUARIO: USUARIO,
        OPENKEY_CLAVE: CLAVE,
        RPA_BACKOFF_MS: "20",
        RPA_TIMEOUT_MS: "2000",
        ...env,
      },
    });
    let consola = "";
    p.stdout.on("data", (d) => (consola += d));
    p.stderr.on("data", (d) => (consola += d));
    p.on("close", (codigo) => {
      let csv = "";
      try {
        csv = readFileSync(salida, "utf8");
      } catch {
        // sin salida (error de configuración)
      }
      const [enc, ...resto] = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
      const cols = enc ? enc.split(";") : [];
      const filas = Object.fromEntries(
        resto.map((l) => {
          const c = partirLinea(l, ";");
          const f = Object.fromEntries(cols.map((k, i) => [k, c[i]]));
          return [f.numero, f];
        }),
      );
      // Las credenciales nunca salen ni por consola ni en el CSV.
      assert.ok(!consola.includes(CLAVE) && !csv.includes(CLAVE), "la clave apareció en la salida");
      assert.ok(!consola.includes(USUARIO) && !csv.includes(USUARIO), "el usuario apareció en la salida");
      ok({ codigo, consola, csv, cols, filas });
    });
  });
}

const estadoSim = (sim) => Object.fromEntries(sim.estado().vouchers.map((v) => [v.numero, v.estado]));

test("leerReporte: toma sólo USADO sin baja en OpenKey, con BOM, `;`, comillas y fórmulas neutralizadas", () => {
  const r = leerReporte(readFileSync(REPORTE, "utf8"));
  assert.equal(r.error, null);
  assert.deepEqual(r.pendientes, ["AL-0001", "AL-0002", "AL-0003"]);
  assert.equal(r.ignorados.length, 2);
  const raro = '\uFEFFLote;"Número";Estado ERP;Baja en OpenKey\r\nL1;\'-X1;usado;\r\nL2;"a;b";USADO;\r\nL3;-X1;USADO;\r\nL4;Z9;USADO;01/11/2026\r\n';
  assert.deepEqual(leerReporte(raro).pendientes, ["-X1", "A;B"]);
  assert.match(leerReporte("Número;Lote\r\nA;B").error, /Faltan columnas/);
  assert.match(leerReporte("").error, /vacío/);
});

test("csvResultado: encabezado importable (numero + estado) y celdas seguras", () => {
  const csv = csvResultado([{ numero: "=X", estado: "BAJA", resultado: "BAJA_OK", fechaHora: "f", detalle: "a;b" }]);
  assert.ok(csv.startsWith("\uFEFFnumero;estado;resultado;fechaHora;detalle\r\n"));
  assert.ok(csv.includes(`'=X;BAJA;BAJA_OK;f;"a;b"`));
});

test("parsearFallas: lee tipo:ruta:veces[:numero] e ignora las mal escritas", () => {
  const r = parsearFallas("500:listado:2, timeout-tras-aplicar:baja:siempre:al-2, nada:baja:1");
  assert.deepEqual(r, [
    { tipo: "500", ruta: "listado", veces: 2, numero: null },
    { tipo: "timeout-tras-aplicar", ruta: "baja", veces: Infinity, numero: "AL-2" },
  ]);
});

test("baja los pendientes, ignora los ya dados de baja y la 2.ª corrida no cambia nada", async () => {
  await conSimulado({}, async (sim, url) => {
    const r1 = await correr(url);
    assert.equal(r1.codigo, 0, r1.consola);
    assert.equal(r1.filas["AL-0001"].resultado, "BAJA_OK");
    assert.equal(r1.filas["AL-0002"].resultado, "BAJA_OK");
    assert.equal(r1.filas["AL-0003"].resultado, "YA_BAJA");
    assert.equal(r1.filas["AL-0001"].estado, "BAJA");
    assert.equal(r1.filas["AL-0004"], undefined, "DISPONIBLE en el ERP: no se toca");
    assert.equal(r1.filas["AL-0005"], undefined, "ya tenía baja en el ERP: no se toca");
    assert.deepEqual(estadoSim(sim), { "AL-0001": "Usado", "AL-0002": "Usado", "AL-0003": "Usado", "AL-0004": "Disponible", "AL-0005": "Disponible" });
    assert.match(r1.consola, /BAJA_OK=2 · YA_BAJA=1/);

    const r2 = await correr(url);
    assert.equal(r2.codigo, 0, r2.consola);
    for (const n of ["AL-0001", "AL-0002", "AL-0003"]) assert.equal(r2.filas[n].resultado, "YA_BAJA");
    const { stats } = sim.estado();
    assert.deepEqual(stats.bajasAplicadas, { "AL-0001": 1, "AL-0002": 1 });
    assert.equal(stats.bajasRepetidas, 0);
  });
});

test("reintenta tras 500 y timeouts, y nunca baja dos veces aunque la respuesta se pierda", async () => {
  const fallas = parsearFallas("500:listado:1,timeout:confirmar:1:AL-0001,timeout-tras-aplicar:baja:1:AL-0002");
  await conSimulado({ fallas }, async (sim, url) => {
    const r = await correr(url);
    assert.equal(r.codigo, 0, r.consola);
    assert.equal(r.filas["AL-0001"].resultado, "BAJA_OK");
    assert.equal(r.filas["AL-0002"].resultado, "BAJA_OK");
    assert.match(r.filas["AL-0002"].detalle, /confirmada en el intento 2/);
    const { stats } = sim.estado();
    assert.equal(stats.fallasInyectadas, 3);
    assert.deepEqual(stats.bajasAplicadas, { "AL-0001": 1, "AL-0002": 1 });
    assert.equal(stats.bajasRepetidas, 0);
  });
});

test("si vence la sesión (inyectada por query) vuelve a ingresar y sigue", async () => {
  await conSimulado({}, async (sim, url) => {
    assert.equal((await fetch(`${url}/__sim/fallar?tipo=sesion&ruta=confirmar&numero=AL-0002`)).status, 200);
    assert.equal((await fetch(`${url}/__sim/fallar?tipo=sesion&ruta=listado&veces=1&numero=AL-0003`)).status, 200);
    const r = await correr(url);
    assert.equal(r.codigo, 0, r.consola);
    assert.equal(r.filas["AL-0002"].resultado, "BAJA_OK");
    assert.equal(r.filas["AL-0003"].resultado, "YA_BAJA");
    const { stats } = sim.estado();
    assert.ok(stats.logins >= 3, `logins=${stats.logins}`);
    assert.equal(stats.bajasRepetidas, 0);
  });
});

test("falla persistente: la informa en el CSV y en el resumen, con exit ≠ 0, y sigue con los demás", async () => {
  await conSimulado({ fallas: parsearFallas("500:baja:siempre:AL-0002") }, async (sim, url) => {
    const r = await correr(url);
    assert.notEqual(r.codigo, 0);
    assert.equal(r.filas["AL-0001"].resultado, "BAJA_OK");
    assert.equal(r.filas["AL-0002"].resultado, "FALLA");
    assert.equal(r.filas["AL-0002"].estado, "DISPONIBLE");
    assert.match(r.filas["AL-0002"].detalle, /3 intentos sin éxito: OpenKey respondió 500/);
    assert.equal(r.filas["AL-0003"].resultado, "YA_BAJA");
    assert.match(r.consola, /\[FALLA\] AL-0002/);
    assert.equal(estadoSim(sim)["AL-0002"], "Disponible");
  });
});

test("clave rechazada: corta la corrida sin reintentar a ciegas y sale con exit ≠ 0", async () => {
  await conSimulado({ clave: "otra-clave" }, async (sim, url) => {
    const r = await correr(url);
    assert.notEqual(r.codigo, 0);
    for (const n of ["AL-0001", "AL-0002", "AL-0003"]) assert.equal(r.filas[n].resultado, "FALLA");
    assert.equal(sim.estado().stats.loginsFallidos, 1);
  });
});

test("configuración: sin credenciales o contra un OpenKey no local sin permiso, exit 2 y no corre", async () => {
  const sinClave = await correr("http://127.0.0.1:9", { env: { OPENKEY_CLAVE: "" } });
  assert.equal(sinClave.codigo, 2);
  assert.match(sinClave.consola, /Faltan variables de entorno: OPENKEY_CLAVE/);
  const real = await correr("https://openkey.example.com", { env: { RPA_PERMITIR_REAL: "" } });
  assert.equal(real.codigo, 2);
  assert.match(real.consola, /RPA_PERMITIR_REAL=1/);
});

test("el CSV de salida lo lee «Importar foto de OpenKey» del ERP (leerCsvOpenKey)", async () => {
  const csv = csvResultado([
    { numero: "AL-0001", estado: "BAJA", resultado: "BAJA_OK", fechaHora: "2026-11-05T23:30:00-03:00", detalle: "Baja verificada" },
    { numero: "AL-0004", estado: "DISPONIBLE", resultado: "FALLA", fechaHora: "2026-11-05T23:31:00-03:00", detalle: "x" },
  ]);
  const archivo = path.join(tmp, "importable.csv");
  writeFileSync(archivo, csv);
  const lector = path.join(tmp, "leer.mts");
  const core = path.join(RAIZ, "src/lib/vouchers/voucher-core.ts");
  writeFileSync(
    lector,
    `import { readFileSync } from "node:fs";\nimport { leerCsvOpenKey } from ${JSON.stringify(core)};\nconsole.log(JSON.stringify(leerCsvOpenKey(readFileSync(process.argv[2], "utf8"))));\n`,
  );
  const p = spawnSync(process.execPath, ["--import", "tsx", lector, archivo], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr.slice(0, 300));
  const lectura = JSON.parse(p.stdout.trim().split("\n").pop());
  assert.deepEqual(lectura.errores, []);
  assert.deepEqual(
    lectura.filas.map((f) => [f.numero, f.estado]),
    [
      ["AL-0001", "USADO"],
      ["AL-0004", "DISPONIBLE"],
    ],
  );
});
