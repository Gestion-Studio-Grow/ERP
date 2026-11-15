// ============================================================================
// QA CON CAPTURAS · GSG-FACT-011 · el cupo de Factoque Gratis en la emisión AUTOMÁTICA del extracto
// ============================================================================
// Base efímera con RLS (src/test/base-efimera.ts, Postgres LOCAL 5433, nunca Neon) y ARCA simulado
// (stub, nunca ARCA real). Pasos:
//   1) Negocio Factoque Gratis (tope 5) con 4 facturas del mes sembradas (fechas fijas, autorizadas
//      con numeración 1..4). Se importa un extracto por el camino real (`procesarExtractoAction`, con
//      la sesión del titular) con dos cobros iguales el mismo día + un tercero, y se corre
//      `emitirPropuestas` con el reloj inyectado (`{ ahora }`). Esperado: sale exactamente 1 (5/5) y el
//      resto queda bloqueado por el cupo, sin factura.
//   2) `next start` (o `next dev` con QA_MODO=dev) con ARCA simulado y capturas a 390 px, como el
//      titular: a) el cupo en Emitir; b) Mis facturas; c) la fila de la factura automática (no hay
//      pantalla de detalle) y su PDF, que con ARCA simulado se niega a propósito; d) la pantalla
//      de bancos del backoffice (a la que el titular de Factoque no entra: se registra adónde va).
//   3) resumen.json con lo comprobado en cada paso y la ruta de cada captura.
//
// Fechas: desplazamientos FIJOS desde el día de hoy (hora AR), sin azar: facturas en hoy−6, −5, −4 y
// −1; cobros en hoy−2 (dos iguales) y hoy−1; el reloj inyectado, hoy a las 12 h. No pueden ser días fijos
// del calendario: el cupo cuenta por `createdAt` con el reloj real en la pantalla de Emitir, y el
// despacho a ARCA (`procesarEnviosDelNegocio`) prevalida la ventana de ±5 días con el reloj REAL (no
// recibe el inyectado): con una fecha fija vieja la factura sale «Frenada antes de ARCA» y devuelve el
// lugar. Corre del día 7 del mes en adelante (todo tiene que caer en el mes en curso).
//
// Salida: QA_OUT o, por defecto, el scratchpad de la sesión (docs/qa/fact011/ no está en .gitignore).
// Uso: node --import tsx scripts/qa/fact011-cupo-qa.mjs   (PORT=3253 por defecto; QA_MODO=dev sin build)
// ============================================================================

import { chromium } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, prismaComoDuenio, apuntarLaAppA, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";
import { prepararAccionesDeServidor, ejecutarAccion } from "../../src/test/accion-de-servidor.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 3253);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const OUT =
  process.env.QA_OUT ?? "/tmp/claude-0/-home-user-ERP/e4df9210-a238-5602-879e-ad887b0b8ff4/scratchpad/fact011-qa";
const AUTH_SECRET = "qa-fact011-cupo-auth-secret-0123456789abcdef";
const VP = { width: 390, height: 844 };
const DEV = process.env.QA_MODO === "dev";
const COMO_EN_AR = { timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR", deviceScaleFactor: 1 };
const LLAVE_QA = randomBytes(32).toString("base64");
const log = (m) => process.stdout.write(`[qa-fact011] ${m}\n`);
const resumen = { generado: null, mes: null, ahora: null, pasos: [] };

// ── Fechas fijas del mes en curso (hora de Argentina) ─────────────────────────
const hoyAR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const [Y, M, DIA_REAL] = hoyAR.split("-");
const D = Number(DIA_REAL);
if (D < 7) throw new Error(`Hoy es ${hoyAR}: las fechas van de hoy−6 a hoy y tienen que caer en el mes en curso; correlo del 7 en adelante.`);
const dd = (d) => String(d).padStart(2, "0");
const fecha = (d) => `${Y}${M}${dd(d)}`;
const alMediodia = (d) => new Date(`${Y}-${M}-${dd(d)}T12:00:00-03:00`);
const AHORA = alMediodia(D);
const FACTURAS_SEMBRADAS = [
  { dia: D - 6, total: 3000, descripcion: "Clase de yoga · grupo mañana" },
  { dia: D - 5, total: 3000, descripcion: "Clase de yoga · grupo tarde" },
  { dia: D - 4, total: 4500, descripcion: "Clase individual" },
  { dia: D - 1, total: 3000, descripcion: "Clase de yoga · grupo mañana" },
];
const ULTIMA_FECHA = fecha(D - 1);
const CSV = [
  "Fecha;Descripción;Débito;Crédito;Saldo",
  `${dd(D - 2)}/${M}/${Y};Transferencia recibida CBU 285;;5.000,00;5.000,00`,
  `${dd(D - 2)}/${M}/${Y};Transferencia recibida CBU 285;;5.000,00;10.000,00`,
  `${dd(D - 1)}/${M}/${Y};Transferencia recibida CBU 007;;7.000,00;17.000,00`,
];

function pedir(host, ruta) {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: ruta, headers: { host: `${host}:${PORT}` } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", () => ok(null));
    req.setTimeout(DEV ? 120_000 : 4000, () => {
      req.destroy();
      ok(null);
    });
  });
}

async function levantar(base) {
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    FISCAL_MASTER_KEY: LLAVE_QA,
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    ARCA_INVOICING_ENABLED: "true",
    NODE_ENV: DEV ? "development" : "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_MODO", "OPERADORES", "OPERADOR_DUENIO"]) delete env[v];
  const salida = createWriteStream(path.join(OUT, "servidor.txt"));
  const app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), DEV ? "dev" : "start", "-p", String(PORT)], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(salida);
  app.stderr.pipe(salida);
  const hasta = Date.now() + (DEV ? 240_000 : 60_000);
  while (Date.now() < hasta) {
    if ((await pedir(base.b.subdominio + ".localhost", "/admin/login")) === 200) return app;
    await new Promise((r) => setTimeout(r, 500));
  }
  app.kill("SIGTERM");
  throw new Error(`next ${DEV ? "dev" : "start"} no respondió a tiempo (ver ${path.join(OUT, "servidor.txt")})`);
}

async function bajar(app) {
  if (!app) return;
  app.kill("SIGTERM");
  await new Promise((r) => app.once("exit", r));
}

function rutaDeChromium() {
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const n of existsSync(dir) ? readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : []) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = path.join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

/** Corre un paso, anota lo comprobado (o la falla) y su captura. `fn` devuelve { comprobado, captura? }. */
async function paso(id, nombre, fn) {
  let ok = true;
  let comprobado;
  let captura = null;
  try {
    const r = await fn();
    comprobado = r.comprobado;
    captura = r.captura ?? null;
  } catch (e) {
    ok = false;
    comprobado = { error: String(e?.message ?? e).slice(0, 600) };
    captura = e?.captura ?? null;
  }
  resumen.pasos.push({ id, nombre, ok, comprobado, captura });
  log(`${ok ? "OK " : "MAL"} ${id} ${nombre}${ok ? "" : ` — ${comprobado.error}`}`);
  return ok;
}

const textoVisible = async (loc) => ((await loc.innerText()) ?? "").replace(/\s+/g, " ").trim();
const scrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);

async function capturar(page, nombre) {
  const ruta = path.join(OUT, nombre);
  await page.screenshot({ path: ruta, fullPage: true });
  return ruta;
}

function falla(mensaje, captura) {
  const e = new Error(mensaje);
  e.captura = captura;
  return e;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  resumen.mes = `${Y}-${M}`;
  resumen.ahora = AHORA.toISOString();
  log(`salida: ${OUT} · mes ${Y}-${M} · reloj inyectado ${AHORA.toISOString()}`);
  log("creando la base efímera (Postgres local)…");
  const base = await crearBaseEfimera();
  let app = null;
  let browser = null;
  const duenio = await prismaComoDuenio(base);
  const T = base.b.id;
  const origin = `http://${base.b.subdominio}.localhost:${PORT}`;
  const cupoUsado = () => duenio.invoice.count({ where: { tenantId: T, status: { not: "REJECTED" }, comprobanteAsociadoId: null } });
  let facturaAuto = null;
  try {
    // ── 1) Negocio Factoque Gratis con 4 facturas del mes ────────────────────
    await duenio.tenant.update({
      where: { id: T },
      data: {
        name: "Yoga Ana",
        blueprintId: "facturita",
        plan: null,
        arcaCuit: "20222222223",
        arcaPuntoVenta: 2,
        arcaHomologacion: true,
        arcaCondicionIva: "MONOTRIBUTO",
        arcaRazonSocial: "Ana Pérez",
        arcaDomicilioFiscal: "Av. Corrientes 1234, CABA",
        arcaInicioActividades: "20200301",
        arcaIibb: "Exento",
      },
    });
    for (const [i, f] of FACTURAS_SEMBRADAS.entries()) {
      await duenio.invoice.create({
        data: {
          tenantId: T,
          puntoVenta: 2,
          tipoComprobante: 11,
          numero: i + 1,
          concepto: 1,
          docTipo: 99,
          docNro: "0",
          fecha: fecha(f.dia),
          neto: f.total,
          iva: 0,
          total: f.total,
          status: "AUTHORIZED",
          cae: `7445000000000${i + 1}`,
          caeVencimiento: fecha(f.dia + 10 > 28 ? 28 : f.dia + 10),
          authorizedAt: alMediodia(f.dia),
          createdAt: alMediodia(f.dia),
          descripcion: f.descripcion,
        },
      });
    }

    // La app en ESTE proceso (para la acción y el lote): mismo entorno que el servidor, ARCA simulado.
    apuntarLaAppA(base);
    Object.assign(process.env, {
      AUTH_SECRET,
      FISCAL_MASTER_KEY: LLAVE_QA,
      ARCA_INVOICING_ENABLED: "true",
      INTEGRACIONES_MASTER_KEY: process.env.INTEGRACIONES_MASTER_KEY ?? randomBytes(32).toString("base64"),
    });
    for (const v of ["ARCA_MODO", "MP_MODO", "MP_ACCESS_TOKEN", "MP_MODO_LEGADO"]) delete process.env[v];
    prepararAccionesDeServidor();
    const acciones = await import("../../src/lib/bancos-actions.ts");
    const glue = await import("../../src/lib/bancos-glue.ts");

    const ok1 = await paso("1a", "Factoque Gratis con 4 facturas del mes", async () => {
      const usadas = await cupoUsado();
      if (usadas !== 4) throw new Error(`cupo usado ${usadas}, se esperaban 4`);
      const tope = await glue.contarFacturasDelMes(T);
      return { comprobado: { plan: "Gratis (Tenant.plan=null, blueprint facturita)", facturasDelMes: usadas, contarFacturasDelMes: tope, ultimaFecha: ULTIMA_FECHA } };
    });

    let movs = [];
    const ok2 =
      ok1 &&
      (await paso("1b", "importar el extracto por procesarExtractoAction (sesión del titular)", async () => {
        const fd = new FormData();
        fd.set("archivo", new File([CSV.join("\r\n")], `extracto-${Y}${M}.csv`, { type: "text/csv" }));
        const r = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => acciones.procesarExtractoAction(fd));
        if (r.tipo !== "respuesta") throw new Error(`la acción cortó: ${JSON.stringify(r)}`);
        if (!r.valor.ok) throw new Error(`la acción respondió error: ${r.valor.error}`);
        movs = await duenio.movimientoImportado.findMany({
          where: { tenantId: T },
          orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
          select: { id: true, fecha: true, monto: true, descripcion: true, estadoPropuesta: true, motivoRevision: true },
        });
        const auto = movs.filter((m) => m.estadoPropuesta === "auto");
        if (movs.length !== 3) throw new Error(`filas ${movs.length}, se esperaban 3 (dos cobros iguales = dos ventas)`);
        if (auto.length !== 3) throw new Error(`propuestas auto ${auto.length}/3: ${JSON.stringify(movs.map((m) => [m.fecha, m.estadoPropuesta, m.motivoRevision]))}`);
        return {
          comprobado: {
            importacionId: r.valor.importacionId,
            resumen: r.valor.resumen,
            requiereConfirmacionMapeo: r.valor.requiereConfirmacionMapeo,
            movimientos: movs.map((m) => ({ fecha: m.fecha, monto: String(m.monto), descripcion: m.descripcion, estado: m.estadoPropuesta })),
          },
        };
      }));

    const ok3 =
      ok2 &&
      (await paso("1c", "emitirPropuestas con el reloj inyectado: sale 1 (5/5), el resto bloqueado", async () => {
        const r = await glue.emitirPropuestas(T, "auto", { ahora: AHORA });
        const despues = await duenio.movimientoImportado.findMany({
          where: { tenantId: T },
          orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
          select: { id: true, fecha: true, monto: true, estadoPropuesta: true, invoiceId: true, motivoRevision: true },
        });
        const usadas = await cupoUsado();
        const conFactura = despues.filter((m) => m.invoiceId);
        const sinFactura = despues.filter((m) => !m.invoiceId);
        const errores = [];
        if (r.emitidas !== 1) errores.push(`emitidas ${r.emitidas}`);
        if (r.bloqueadasPorCap !== 2) errores.push(`bloqueadasPorCap ${r.bloqueadasPorCap}`);
        if (!r.capAlcanzado) errores.push("capAlcanzado=false");
        if (usadas !== 5) errores.push(`cupo usado ${usadas}`);
        if (conFactura.length !== 1) errores.push(`movimientos con factura ${conFactura.length}`);
        if (sinFactura.some((m) => m.estadoPropuesta !== "auto")) errores.push(`bloqueados no quedaron en auto: ${sinFactura.map((m) => m.estadoPropuesta)}`);
        if (r.errores.length) errores.push(`errores ${JSON.stringify(r.errores)}`);
        if (conFactura[0]) {
          facturaAuto = await duenio.invoice.findUnique({
            where: { id: conFactura[0].invoiceId },
            select: { id: true, fecha: true, total: true, concepto: true, descripcion: true, status: true, rechazoMotivo: true, numero: true, tipoComprobante: true, cae: true, createdAt: true },
          });
          facturaAuto.movimiento = { fecha: conFactura[0].fecha, monto: String(conFactura[0].monto) };
          if (facturaAuto.status !== "AUTHORIZED") errores.push(`la factura quedó ${facturaAuto.status} (ARCA simulado)`);
          if (facturaAuto.fecha < ULTIMA_FECHA) errores.push(`fecha ${facturaAuto.fecha} < última ${ULTIMA_FECHA}`);
          if (Number(facturaAuto.total) !== Math.abs(Number(conFactura[0].monto))) errores.push(`total ${facturaAuto.total} ≠ movimiento ${conFactura[0].monto}`);
        }
        if (errores.length) throw new Error(`${errores.join(" · ")} · factura ${JSON.stringify({ status: facturaAuto?.status, fecha: facturaAuto?.fecha, rechazoMotivo: facturaAuto?.rechazoMotivo })} · resultado ${JSON.stringify(r)}`);
        return {
          comprobado: {
            resultado: { emitidas: r.emitidas, bloqueadasPorCap: r.bloqueadasPorCap, capAlcanzado: r.capAlcanzado, mensaje: r.mensaje, despachoArca: r.despachoArca ?? null },
            cupoUsado: `${usadas} de 5`,
            facturaAutomatica: { ...facturaAuto, total: String(facturaAuto.total), createdAt: facturaAuto.createdAt.toISOString() },
            bloqueados: sinFactura.map((m) => ({ fecha: m.fecha, monto: String(m.monto), estado: m.estadoPropuesta, motivoRevision: m.motivoRevision })),
          },
        };
      }));

    // ── 2) Capturas como el titular ──────────────────────────────────────────
    if (ok3) {
      app = await levantar(base);
      browser = await chromium.launch({ executablePath: rutaDeChromium() });
      const ctx = await browser.newContext({ viewport: VP, ...COMO_EN_AR });
      const page = await ctx.newPage();
      const consola = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !/favicon|Failed to load resource.*404|\[HMR\]|webpack-hmr|_next\/webpack|font|DeprecationWarning/i.test(m.text())) consola.push(m.text().slice(0, 300));
      });
      page.on("pageerror", (e) => consola.push(String(e).slice(0, 300)));
      await page.goto(`${origin}/admin/login`);
      await page.fill('input[name="email"]', base.b.duenia.email);
      await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
      const fechaLegible = `${facturaAuto.fecha.slice(6, 8)}/${facturaAuto.fecha.slice(4, 6)}/${facturaAuto.fecha.slice(0, 4)}`;
      const totalLegible = Number(facturaAuto.total).toLocaleString("es-AR");

      await paso("2a", "el cupo del plan en Emitir", async () => {
        await page.goto(`${origin}/facturita/app`);
        await page.getByText(/usaste \d+ de \d+|Llegaste al tope/).first().waitFor({ timeout: 60_000 });
        const main = await textoVisible(page.locator("main"));
        const captura = await capturar(page, "a-cupo-emitir.png");
        const m = main.match(/usaste (\d+) de (\d+)[^.]*/);
        const tope = /Llegaste al tope[^.]*/.exec(main)?.[0] ?? null;
        const boton = page.getByTestId("emitir-boton");
        const emitirHabilitado = (await boton.count()) ? await boton.isEnabled() : null;
        if (!m || m[1] !== "5" || m[2] !== "5") throw falla(`no dice 5 de 5: «${m?.[0] ?? main.slice(0, 200)}»`, captura);
        if (emitirHabilitado) throw falla("con 5/5 deja tocar Emitir", captura);
        const sh = await scrollHorizontal(page);
        return { comprobado: { texto: m[0], aviso: tope, emitirHabilitado, scrollHorizontalPx: sh }, captura };
      });

      await paso("2b", "Mis facturas: la automática con su fecha", async () => {
        await page.goto(`${origin}/facturita/app/facturas`);
        await page.getByRole("table").waitFor({ timeout: 60_000 });
        const filas = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, " ").trim()));
        const captura = await capturar(page, "b-mis-facturas.png");
        const fila = filas.find((f) => f.includes(fechaLegible) && f.includes(totalLegible));
        if (filas.length !== 5) throw falla(`filas ${filas.length}, se esperaban 5`, captura);
        if (!fila) throw falla(`no está la fila ${fechaLegible} $${totalLegible}: ${JSON.stringify(filas)}`, captura);
        return { comprobado: { filas, filaAutomatica: fila, scrollHorizontalPx: await scrollHorizontal(page) }, captura };
      });

      await paso("2c", "detalle de la factura automática (su fila; el PDF, si sale)", async () => {
        // Mis facturas no tiene pantalla de detalle: el detalle es la fila (fecha, número, concepto,
        // total) y el PDF que baja su enlace. Con ARCA simulado el PDF se niega a propósito (no hay
        // CAE real): se captura esa pantalla y se anota.
        const fila = page.locator("tbody tr", { hasText: fechaLegible }).filter({ hasText: totalLegible }).first();
        // A 390 px la tabla (min. 560 px) se desplaza dentro de su caja y la fila sale cortada: la
        // captura de la fila se saca a 640 px de ancho y se vuelve a 390.
        const captura = path.join(OUT, "c-detalle-fila-factura-automatica.png");
        await page.setViewportSize({ width: 640, height: VP.height });
        await fila.screenshot({ path: captura });
        await page.setViewportSize(VP);
        const textoFila = await textoVisible(fila);
        const numero = facturaAuto.numero != null ? String(facturaAuto.numero) : null;
        const comprobado = {
          textoFila,
          anchoDeLaCaptura: 640,
          fechaEnPantalla: fechaLegible,
          fechaDelComprobante: facturaAuto.fecha,
          fechaUltimaFacturaSembrada: ULTIMA_FECHA,
          fechaMayorOIgualALaUltima: facturaAuto.fecha >= ULTIMA_FECHA,
          fechaDelCobro: facturaAuto.movimiento.fecha,
          concepto: { 1: "Productos", 2: "Servicios", 3: "Productos y servicios" }[facturaAuto.concepto] ?? String(facturaAuto.concepto),
          descripcion: facturaAuto.descripcion,
          totalEnPantalla: totalLegible,
          importeDelMovimiento: facturaAuto.movimiento.monto,
          numero,
          cae: facturaAuto.cae,
        };
        if (!comprobado.fechaMayorOIgualALaUltima) throw falla(`fecha ${facturaAuto.fecha} < ${ULTIMA_FECHA}`, captura);
        if (numero && !textoFila.includes(numero)) throw falla(`la fila no muestra el número ${numero}: «${textoFila}»`, captura);
        const href = await fila.getByRole("link", { name: /PDF/ }).getAttribute("href");
        // Se baja desde la página (con su sesión): el cliente HTTP de Playwright no resuelve *.localhost.
        const res = await page.evaluate(async (url) => {
          const r = await fetch(url, { credentials: "include" });
          const bytes = new Uint8Array(await r.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return { status: r.status, tipo: r.headers.get("content-type") ?? "", b64: btoa(bin) };
        }, href);
        const cuerpo = Buffer.from(res.b64, "base64");
        if (res.status === 200 && res.tipo.includes("pdf")) {
          const pdf = path.join(OUT, "c2-factura-automatica.pdf");
          writeFileSync(pdf, cuerpo);
          execFileSync("pdftoppm", ["-r", "72", "-png", "-singlefile", "-f", "1", "-l", "1", pdf, path.join(OUT, "c2-pdf-factura-automatica")]);
          const texto = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString().replace(/[ \t]+/g, " ");
          comprobado.pdf = { captura: path.join(OUT, "c2-pdf-factura-automatica.png"), fecha: texto.includes(fechaLegible), total: texto.includes(totalLegible) };
        } else {
          await page.goto(`${origin}${href}`);
          const capturaPdf = await capturar(page, "c2-pdf-negado-con-simulador.png");
          comprobado.pdf = { http: res.status, captura: capturaPdf, texto: (await textoVisible(page.locator("body"))).slice(0, 240) };
          await page.goto(`${origin}/facturita/app/facturas`);
        }
        return { comprobado, captura };
      });

      await paso("2d", "pantalla de bancos con los cobros bloqueados", async () => {
        await page.goto(`${origin}/admin/facturacion/bancos`);
        await page.waitForLoadState("networkidle");
        const destino = new URL(page.url()).pathname;
        const captura = await capturar(page, "d-bancos-o-destino.png");
        const texto = await textoVisible(page.locator("main").first().or(page.locator("body")).first());
        return {
          comprobado: {
            pedido: "/admin/facturacion/bancos",
            destino,
            existeParaElTitularDeFactoque: destino.startsWith("/admin/facturacion/bancos"),
            nota:
              destino.startsWith("/admin/facturacion/bancos")
                ? "la pantalla de bancos se ve"
                : "el titular de Factoque no tiene pantalla de bancos: el layout de /admin lo manda a /facturita/app; los 2 cobros bloqueados quedan en `auto` sin motivo visible para él",
            textoInicio: texto.slice(0, 240),
          },
          captura,
        };
      });
      resumen.consola = consola;
      await ctx.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    await bajar(app).catch(() => {});
    await base.borrar();
  }
  resumen.generado = new Date().toISOString();
  const ok = resumen.pasos.filter((p) => p.ok).length;
  resumen.total = `${ok}/${resumen.pasos.length}`;
  writeFileSync(path.join(OUT, "resumen.json"), JSON.stringify(resumen, null, 2) + "\n");
  log(`${ok}/${resumen.pasos.length} pasos OK · ${path.join(OUT, "resumen.json")}`);
  process.exit(ok === resumen.pasos.length && resumen.pasos.length === 7 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
