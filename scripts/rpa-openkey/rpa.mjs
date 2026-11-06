#!/usr/bin/env node
// RPA de BAJAS de vouchers en OpenKey (CH Estética · Tanda 2). Diseño: docs/tenants/ch/VOUCHERS-OPENKEY.md § RPA.
// ============================================================================
// Entrada : el CSV del reporte del ERP (/admin/vouchers → Exportar: BOM, `;`). Columnas por encabezado.
// Toma    : sólo vouchers con Estado ERP = USADO y sin «Baja en OpenKey».
// Por cada uno: busca en OpenKey → si ya está dado de baja, sólo lo anota; si está disponible, da de
// baja y VERIFICA buscándolo de nuevo. Antes de cada clic en «Dar de baja» se vuelve a mirar el estado:
// nunca baja dos veces (correrlo de nuevo no cambia nada). 3 intentos con backoff; relogin si vence la sesión.
// Salida  : CSV `numero;estado;resultado;fechaHora;detalle` (BOM, `;`), que entra tal cual por
// «Importar foto de OpenKey» del ERP (usa numero + estado DISPONIBLE|BAJA|ANULADO) + resumen en consola.
// Exit    : 0 todo bien · 1 hubo fallas o alertas (FALLA, NO_ENCONTRADO, ANULADO) · 2 error de configuración.
// Credenciales SÓLO por env (OPENKEY_URL, OPENKEY_USUARIO, OPENKEY_CLAVE); nunca se imprimen ni se loguean.
// Fuera de localhost se niega a correr salvo RPA_PERMITIR_REAL=1 (lo pone el workflow en modo real).
//
// Uso: node scripts/rpa-openkey/rpa.mjs --entrada vouchers-2026-11-05.csv [--salida rpa-openkey-resultado.csv]

import { existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RUTAS, SEL, estadoDesdeTexto } from "./selectores.mjs";

// ── CSV del reporte del ERP ─────────────────────────────────────────────────

/** Encabezados aceptados (PROVISIONALES: hoy calzan con COLUMNAS_REPORTE de src/lib/vouchers/voucher-core.ts). */
const ALIAS = {
  numero: ["numero", "nro", "voucher", "numerodevoucher", "nrovoucher", "codigo"],
  estado: ["estadoerp", "estado"],
  baja: ["bajaenopenkey", "bajaopenkey", "bajaopenkeyen", "fechabajaopenkey"],
};

function claveColumna(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizarNumero(raw) {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Parte una línea CSV respetando comillas dobles (`""` = comilla literal). */
export function partirLinea(linea, sep) {
  const out = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') enComillas = false;
      else actual += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out;
}

/** El ERP neutraliza fórmulas anteponiendo `'` (celdaCsv): se lo saca para leer el valor. */
function limpiarCelda(v) {
  const s = String(v ?? "").trim();
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/**
 * Lee el CSV exportado por el ERP. Devuelve los números a dar de baja (sin repetidos) y lo ignorado.
 * `error` = el archivo no sirve (faltan columnas): no se corre nada.
 */
export function leerReporte(texto) {
  const lineas = String(texto ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const iEnc = lineas.findIndex((l) => l.trim() !== "");
  if (iEnc < 0) return { pendientes: [], ignorados: [], error: "El archivo está vacío." };
  const enc = lineas[iEnc];
  const sep = (enc.match(/;/g)?.length ?? 0) >= (enc.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cols = partirLinea(enc, sep).map(claveColumna);
  const idx = (k) => {
    for (const alias of ALIAS[k]) {
      const i = cols.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iNum = idx("numero");
  const iEst = idx("estado");
  const iBaja = idx("baja");
  if (iNum < 0 || iEst < 0 || iBaja < 0) {
    return { pendientes: [], ignorados: [], error: "Faltan columnas en el encabezado: se necesitan «Número», «Estado ERP» y «Baja en OpenKey»." };
  }
  const pendientes = [];
  const ignorados = [];
  const vistos = new Set();
  for (let i = iEnc + 1; i < lineas.length; i++) {
    if (lineas[i].trim() === "") continue;
    const c = partirLinea(lineas[i], sep).map(limpiarCelda);
    const numero = normalizarNumero(c[iNum]);
    if (!numero) {
      ignorados.push({ numero: "", motivo: `Línea ${i + 1} sin número` });
      continue;
    }
    if (claveColumna(c[iEst]) !== "usado") {
      ignorados.push({ numero, motivo: "No está USADO en el ERP" });
      continue;
    }
    if (c[iBaja]) {
      ignorados.push({ numero, motivo: "Ya tiene baja en OpenKey en el ERP" });
      continue;
    }
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    pendientes.push(numero);
  }
  return { pendientes, ignorados, error: null };
}

// ── CSV de resultado y resumen ──────────────────────────────────────────────

/** Resultados que NO son éxito: disparan exit 1 y el aviso. */
export const RESULTADOS_CON_FALLA = new Set(["FALLA", "NO_ENCONTRADO", "ANULADO"]);

function celda(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV con BOM y `;`; `numero` + `estado` son lo que lee «Importar foto de OpenKey». */
export function csvResultado(filas) {
  const lineas = ["numero;estado;resultado;fechaHora;detalle"];
  for (const f of filas) lineas.push([f.numero, f.estado, f.resultado, f.fechaHora, f.detalle].map(celda).join(";"));
  return `\uFEFF${lineas.join("\r\n")}\r\n`;
}

export function resumir(filas) {
  const cuenta = {};
  for (const f of filas) cuenta[f.resultado] = (cuenta[f.resultado] ?? 0) + 1;
  const fallas = filas.filter((f) => RESULTADOS_CON_FALLA.has(f.resultado));
  return { total: filas.length, cuenta, fallas };
}

/** Fecha y hora de Argentina (UTC−3, sin horario de verano vigente) en ISO. */
function fechaHoraAr(d = new Date()) {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

// ── Navegador ───────────────────────────────────────────────────────────────

class ErrorFatal extends Error {}

function rutaDeChromium(chromium) {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dir)) return undefined;
  const nombres = readdirSync(dir).sort().reverse();
  for (const n of nombres.filter((x) => /^chromium_headless_shell-\d+$/.test(x))) {
    const p = path.join(dir, n, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(p)) return p;
  }
  for (const n of nombres.filter((x) => /^chromium-\d+$/.test(x))) {
    const p = path.join(dir, n, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
  return undefined;
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Saca las credenciales de cualquier texto que vaya a la consola o al CSV. */
function sanear(texto, secretos) {
  let s = String(texto ?? "").split("\n")[0].slice(0, 240);
  for (const x of secretos) if (x) s = s.split(x).join("***");
  return s;
}

/** Ejecuta una acción que provoca una navegación y espera el documento final (no los 302). ≥ 500 → error. */
async function navegar(page, hacer) {
  const esperada = page.waitForResponse(
    (r) => r.request().isNavigationRequest() && r.frame() === page.mainFrame() && (r.status() < 300 || r.status() >= 400),
  );
  esperada.catch(() => {});
  await hacer();
  const r = await esperada;
  await page.waitForLoadState("domcontentloaded");
  if (r.status() >= 500) throw new Error(`OpenKey respondió ${r.status()}`);
  return r;
}

const enLogin = async (page) => (await page.locator(SEL.formLogin).count()) > 0;

async function login(page, ctx) {
  if (!(await enLogin(page))) await navegar(page, () => page.goto(ctx.base + RUTAS.login));
  await page.fill(SEL.usuario, ctx.usuario);
  await page.fill(SEL.clave, ctx.clave);
  await navegar(page, () => page.click(SEL.ingresar));
  if ((await page.locator(SEL.errorLogin).count()) > 0 || (await enLogin(page))) {
    throw new ErrorFatal("OpenKey rechazó el usuario o la clave");
  }
  ctx.logins += 1;
}

/** Busca el número (logueándose si hace falta). → DISPONIBLE | BAJA | ANULADO | DESCONOCIDO | NO_ENCONTRADO */
async function buscar(page, ctx, numero) {
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    await navegar(page, () => page.goto(ctx.base + RUTAS.listado));
    if (await enLogin(page)) {
      await login(page, ctx);
      continue;
    }
    await page.fill(SEL.campoBuscar, numero);
    await navegar(page, () => page.click(SEL.botonBuscar));
    if (await enLogin(page)) {
      await login(page, ctx);
      continue;
    }
    await page.locator(SEL.resultadosDe(numero)).waitFor();
    const fila = page.locator(SEL.filaDe(numero));
    if ((await fila.count()) === 0) return "NO_ENCONTRADO";
    return estadoDesdeTexto(await fila.locator(SEL.estadoEnFila).innerText());
  }
  throw new Error("La sesión vence apenas se ingresa");
}

/** Con la fila del número a la vista: «Dar de baja» → confirmar. false = la sesión venció en el medio. */
async function darDeBaja(page, ctx, numero) {
  await navegar(page, () => page.locator(SEL.filaDe(numero)).locator(SEL.botonBaja).click());
  if (await enLogin(page)) return false;
  await page.locator(SEL.confirmarBaja).waitFor();
  ctx.bajaIntentada.add(numero); // desde acá, ver BAJA después = la baja fue nuestra
  await navegar(page, () => page.click(SEL.confirmarBaja));
  return !(await enLogin(page));
}

async function procesar(page, ctx, numero) {
  let ultimoEstado = "";
  let ultimoError = "";
  for (let intento = 1; intento <= ctx.intentos; intento++) {
    try {
      const estado = await buscar(page, ctx, numero);
      if (estado === "DISPONIBLE" || estado === "BAJA" || estado === "ANULADO") ultimoEstado = estado;
      if (estado === "NO_ENCONTRADO") return { resultado: "NO_ENCONTRADO", estado: "", detalle: "No aparece en OpenKey: revisar el número" };
      if (estado === "ANULADO") return { resultado: "ANULADO", estado, detalle: "Anulado en OpenKey y usado en el ERP: revisar el turno" };
      if (estado === "DESCONOCIDO") return { resultado: "FALLA", estado: "", detalle: "Estado de OpenKey no reconocido: calibrar selectores.mjs" };
      if (estado === "BAJA") {
        return ctx.bajaIntentada.has(numero)
          ? { resultado: "BAJA_OK", estado, detalle: `Baja verificada (confirmada en el intento ${intento})` }
          : { resultado: "YA_BAJA", estado, detalle: "Ya estaba dado de baja: sólo se anota" };
      }
      // DISPONIBLE: recién mirado, se da de baja y se verifica.
      if (!(await darDeBaja(page, ctx, numero))) throw new Error("La sesión venció durante la baja");
      const verificado = await buscar(page, ctx, numero);
      if (verificado === "BAJA") return { resultado: "BAJA_OK", estado: "BAJA", detalle: intento > 1 ? `Baja verificada (intento ${intento})` : "Baja verificada" };
      throw new Error(`Después de la baja OpenKey muestra ${verificado}`);
    } catch (e) {
      if (e instanceof ErrorFatal) throw e;
      ultimoError = sanear(e?.message, [ctx.usuario, ctx.clave]);
      ctx.log(`  ${numero}: intento ${intento}/${ctx.intentos} falló (${ultimoError})`);
      if (intento < ctx.intentos) await esperar(ctx.backoffMs * 2 ** (intento - 1));
    }
  }
  return { resultado: "FALLA", estado: ultimoEstado, detalle: `${ctx.intentos} intentos sin éxito: ${ultimoError}` };
}

/** Corre el RPA sobre la lista de números. Devuelve las filas del resultado. */
export async function correrRpa({ pendientes, base, usuario, clave, intentos = 3, backoffMs = 2000, timeoutMs = 20000, log = console.log }) {
  if (pendientes.length === 0) return [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: rutaDeChromium(chromium), headless: process.env.RPA_HEADED !== "1" });
  const ctx = { base: base.replace(/\/+$/, ""), usuario, clave, intentos, backoffMs, log, logins: 0, bajaIntentada: new Set() };
  const filas = [];
  try {
    const page = await (await browser.newContext()).newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    for (const numero of pendientes) {
      let r;
      try {
        r = await procesar(page, ctx, numero);
      } catch (e) {
        // Fatal (credenciales rechazadas): no se sigue intentando con nada.
        const detalle = sanear(e?.message, [usuario, clave]);
        for (const n of pendientes.slice(filas.length)) filas.push({ numero: n, resultado: "FALLA", estado: "", detalle, fechaHora: fechaHoraAr() });
        log(`Corrida cortada: ${detalle}`);
        break;
      }
      filas.push({ numero, ...r, fechaHora: fechaHoraAr() });
      log(`  ${numero}: ${r.resultado}`);
    }
  } finally {
    await browser.close();
  }
  return filas;
}

// ── Línea de comandos ───────────────────────────────────────────────────────

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function esLocal(url) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function main() {
  const entrada = argumento("entrada");
  const salida = argumento("salida") ?? "rpa-openkey-resultado.csv";
  const { OPENKEY_URL: base, OPENKEY_USUARIO: usuario, OPENKEY_CLAVE: clave } = process.env;
  const faltan = ["OPENKEY_URL", "OPENKEY_USUARIO", "OPENKEY_CLAVE"].filter((k) => !process.env[k]);
  if (!entrada) return fin(2, "Falta --entrada <CSV exportado de /admin/vouchers>.");
  if (faltan.length) return fin(2, `Faltan variables de entorno: ${faltan.join(", ")}.`);
  if (!esLocal(base) && process.env.RPA_PERMITIR_REAL !== "1") {
    return fin(2, "OPENKEY_URL no es local: contra el OpenKey real sólo corre con RPA_PERMITIR_REAL=1 (autorización escrita de CH).");
  }
  let texto;
  try {
    texto = readFileSync(entrada, "utf8");
  } catch {
    return fin(2, `No se pudo leer el archivo de entrada ${entrada}.`);
  }
  const { pendientes, ignorados, error } = leerReporte(texto);
  if (error) return fin(2, error);
  console.log(`RPA OpenKey · ${pendientes.length} para dar de baja · ${ignorados.length} ignorados del reporte`);

  const filas = await correrRpa({
    pendientes,
    base,
    usuario,
    clave,
    intentos: Number(process.env.RPA_INTENTOS ?? 3),
    backoffMs: Number(process.env.RPA_BACKOFF_MS ?? 2000),
    timeoutMs: Number(process.env.RPA_TIMEOUT_MS ?? 20000),
  });
  writeFileSync(salida, csvResultado(filas));
  const { total, cuenta, fallas } = resumir(filas);
  const linea = Object.entries(cuenta).map(([k, v]) => `${k}=${v}`).join(" · ") || "nada para hacer";
  console.log(`Resumen: ${total} procesados · ${linea}`);
  for (const f of fallas) console.log(`  [${f.resultado}] ${f.numero}: ${f.detalle}`);
  console.log(`Resultado: ${salida}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### RPA OpenKey\n\n${total} procesados · ${linea}\n\n${fallas.map((f) => `- **${f.resultado}** ${f.numero}: ${f.detalle}`).join("\n")}\n`,
    );
  }
  process.exitCode = fallas.length ? 1 : 0;
}

function fin(codigo, mensaje) {
  console.error(mensaje);
  process.exitCode = codigo;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const s = [process.env.OPENKEY_USUARIO, process.env.OPENKEY_CLAVE];
    console.error(`Error inesperado: ${sanear(e?.message, s)}`);
    process.exitCode = 1;
  });
}
