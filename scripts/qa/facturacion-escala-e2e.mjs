// ============================================================================
// QA DE PUNTA A PUNTA · Facturación, links de cobro y Clientes a escala (ESC-04)
// ============================================================================
// Un comercio con mucho volumen, en un navegador real, con los DOS diseños (el de siempre, que
// ve hoy el negocio «Comerciante», y el nuevo «Renglón»), a 1440 y 390 px:
//   · crea una base efímera (src/test/base-efimera.ts: migraciones + RLS + rol app_rls, como
//     producción) y siembra en el negocio A 10.000 fichas, 20.000 pedidos, 50.000 comprobantes
//     y 6.000 links de cobro; en el B, un receptor, un CUIT, un importe y links que A no tiene;
//   · levanta `next start` (el build tiene que estar hecho) en PORT (3237; nunca 3210/3211);
//   · entra con usuario y clave por la pantalla de ingreso y recorre: Facturación (lista del mes
//     con los totales contra un conteo directo en la base, rechazados, pendientes, buscador por
//     nombre, número, CUIT e importe, lo de B que no aparece, «Sacar los filtros», página
//     siguiente, detalle del comprobante, CSV del filtro), la pestaña «Cobrar con link»
//     (generar un link y verlo en la lista sin recargar, buscador, sin resultados) y Clientes
//     (buscar sin tildes, página siguiente);
//   · en cada pantalla falla ante errores de consola, scroll horizontal, toques de menos de
//     44 px o contraste AA (el mismo criterio de gate:visual:aa), o un paso que no da lo esperado.
// Capturas, CSV y resumen en .qa/facturacion-escala/e2e/. Al terminar baja el servidor y borra
// la base (aunque falle).
//
// Uso: node --import tsx scripts/qa/facturacion-escala-e2e.mjs      (PORT=3237 por defecto)
// ============================================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, createWriteStream, existsSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";
import { auditInPage } from "./visual-audit.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 3237);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const OUT = path.join(RAIZ, ".qa/facturacion-escala/e2e");
const AUTH_SECRET = "qa-escala-auth-secret-0123456789abcdef";
const VIEWPORTS = [
  { nombre: "1440", width: 1440, height: 900 },
  { nombre: "390", width: 390, height: 844 },
];
const TOQUE_MIN = 44;

const pasos = []; // { disenio, vp, paso, ok, nota, captura }
const log = (m) => process.stdout.write(`[qa-escala] ${m}\n`);
const miles = (n) => Number(String(n).replace(/\./g, ""));

async function comoDuenio(base, sql, params = []) {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

// ── Siembra (la misma forma que los tests de rendimiento, con fechas relativas a hoy) ─────────
async function sembrar(base) {
  const a = base.a.id;
  const b = base.b.id;
  await comoDuenio(
    base,
    `INSERT INTO "Client" (id, "tenantId", name, phone, "docTipo", "docNro", "updatedAt")
     SELECT 'cli_esc_' || g, $1, 'Cliente Escala ' || g, '11' || lpad(g::text, 8, '0'), 80, (20000000000 + g)::text, now()
     FROM generate_series(1, 10000) g
     UNION ALL SELECT 'cli_tilde', $1, 'Mónica Pérez', '1155550000', NULL, NULL, now()`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt")
     SELECT 'ord_esc_' || g, $1, 100000 + g, 'Mostrador', '', 'cli_esc_' || (1 + g % 10000), now()
     FROM generate_series(1, 20000) g`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "rechazoMotivo", "orderId", "createdAt", "updatedAt")
     SELECT 'fac_esc_' || g, $1, 1 + g % 3,
            CASE WHEN s = 'PENDING' THEN NULL ELSE (ARRAY[1, 6, 6, 6, 11, 3, 8])[1 + g % 7] END,
            1, CASE WHEN g % 4 = 0 THEN 99 ELSE 80 END,
            CASE WHEN g % 4 = 0 THEN '0' ELSE (20000000000 + (1 + g % 10000))::text END,
            to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - (g % 365), 'YYYYMMDD'),
            round((1000 + g % 9000)::numeric, 2), round((1000 + g % 9000)::numeric * 0.21, 2),
            round((1000 + g % 9000)::numeric * 1.21, 2),
            s::"InvoiceStatus",
            CASE WHEN s = 'AUTHORIZED' THEN '86390000' || lpad(g::text, 6, '0') END,
            CASE WHEN s = 'PENDING' THEN NULL ELSE g END,
            CASE WHEN s = 'REJECTED' THEN '10015: el CUIT del receptor no es válido' END,
            CASE WHEN g <= 20000 THEN 'ord_esc_' || g END,
            now() - make_interval(secs => g), now()
     FROM (SELECT g, CASE WHEN g % 15 = 0 THEN 'PENDING' WHEN g % 33 = 0 THEN 'REJECTED' ELSE 'AUTHORIZED' END AS s
           FROM generate_series(1, 50000) g) x`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     SELECT 'lnk_ped_' || g, $1, 'admin', 'link-de-pago', 'Order', 'ord_esc_' || g,
            jsonb_build_object('code', 100000 + g, 'monto', round((1000 + g % 9000)::numeric * 1.5, 2), 'preferenceId', 'pref_' || g,
                               'modo', 'stub', 'url', 'https://mp.test/checkout/' || g),
            now() - make_interval(secs => g * 7000)
     FROM generate_series(1, 4000) g
     UNION ALL
     SELECT 'lnk_lib_' || g, $1, 'admin', 'create', 'PaymentLink', 'pref_libre_' || g,
            jsonb_build_object('concepto', 'Seña número ' || g, 'monto', 2000 + g, 'referenciaExterna', 'Ref ' || g),
            now() - make_interval(secs => g * 13000)
     FROM generate_series(1, 2000) g`,
    [a],
  );
  // B: lo que A no tiene que ver ni inferir.
  await comoDuenio(
    base,
    `INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ('cli_bravo', $1, 'Cliente Bravo Exclusivo', '1199990001', now())`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt")
     VALUES ('ord_bravo', $1, 900000, 'Receptor Bravo Exclusivo', '', 'cli_bravo', now())`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "orderId", "createdAt", "updatedAt")
     SELECT 'fac_bravo_' || g, $1, 1, 6, 1, 80, '27999999990',
            to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - (g % 20), 'YYYYMMDD'),
            642.79, 134.98, 777.77, 'AUTHORIZED', '86399999' || lpad(g::text, 6, '0'), g,
            CASE WHEN g = 1 THEN 'ord_bravo' END, now(), now()
     FROM generate_series(1, 500) g`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     SELECT 'lnk_bravo_' || g, $1, 'admin', 'create', 'PaymentLink', 'pref_bravo_' || g,
            jsonb_build_object('concepto', 'Seña Bravo Exclusiva', 'monto', 777.77), now()
     FROM generate_series(1, 50) g`,
    [b],
  );
  // El banco (Facturación automática): 60.000 movimientos en A; los comprobantes sin pedido
  // (20.001 a 50.000) salieron cada uno de uno, y su receptor se lee del movimiento.
  await comoDuenio(
    base,
    `INSERT INTO "ImportacionBancaria" (id, "tenantId", "nombreArchivo", origen, archivo, "mapeoJson", "updatedAt")
     VALUES ('imp_esc', $1, 'extracto.csv', 'banco', ''::bytea, '{}', now())`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "MovimientoImportado" (id, "tenantId", "importacionId", hash, fecha, monto, descripcion, clasificacion,
                                        "estadoPropuesta", "nombreReceptor", "invoiceId", "updatedAt")
     SELECT 'mov_esc_' || g, $1, 'imp_esc', 'hash_' || g, to_char(now()::date, 'YYYYMMDD'), 1000, 'Transferencia recibida ' || g,
            'venta'::"ClasificacionMovimientoBancario",
            (CASE WHEN g BETWEEN 20001 AND 50000 THEN 'emitida' ELSE 'revision' END)::"EstadoPropuestaMovimiento",
            'Receptor Banco ' || g, CASE WHEN g BETWEEN 20001 AND 50000 THEN 'fac_esc_' || g END, now()
     FROM generate_series(1, 60000) g`,
    [a],
  );
  await comoDuenio(base, `ANALYZE "Invoice"; ANALYZE "Client"; ANALYZE "Order"; ANALYZE "AuditLog"; ANALYZE "MovimientoImportado";`);
}

async function esperados(base) {
  const { rows } = await comoDuenio(
    base,
    `WITH m AS (SELECT to_char(date_trunc('month', h), 'YYYYMMDD') AS d, to_char(date_trunc('month', h) + interval '1 month - 1 day', 'YYYYMMDD') AS h
                FROM (SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS h) x)
     SELECT count(*)::int AS mes,
            count(*) FILTER (WHERE status = 'REJECTED')::int AS rechazados,
            count(*) FILTER (WHERE status = 'PENDING')::int AS pendientes
     FROM "Invoice", m WHERE "tenantId" = $1 AND fecha BETWEEN m.d AND m.h`,
    [base.a.id],
  );
  return rows[0];
}

async function interruptor(base, id, encendido) {
  await comoDuenio(base, `DELETE FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'Interruptor' AND "entityId" = $2`, [base.a.id, id]);
  if (!encendido) return;
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", channel, changes, "createdAt")
     VALUES ('qa_int_' || $2, $1, 'operator:qa', 'interruptor.encender', 'Interruptor', $2, 'operador', '{}'::jsonb, now())`,
    [base.a.id, id],
  );
}

// ── Servidor ──────────────────────────────────────────────────────────────────────────────
function pedir(host, ruta) {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: ruta, headers: { host: `${host}:${PORT}` } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", () => ok(null));
    req.setTimeout(4000, () => {
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
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO"]) delete env[v];
  const salida = createWriteStream(path.join(OUT, "servidor.txt"));
  const app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(salida);
  app.stderr.pipe(salida);
  const hasta = Date.now() + 60_000;
  while (Date.now() < hasta) {
    if ((await pedir(base.a.subdominio + ".localhost", "/admin/login")) === 200) return app;
    await new Promise((r) => setTimeout(r, 500));
  }
  app.kill("SIGTERM");
  throw new Error(`next start no respondió en 60 s (ver ${path.join(OUT, "servidor.txt")})`);
}

/** El Chromium de Playwright; si no está el de esta versión, el que haya en PLAYWRIGHT_BROWSERS_PATH
 *  (lo mismo que hacen los tests de navegador, caja-teclado.test.ts). */
function rutaDeChromium() {
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
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

// ── Recorrido ─────────────────────────────────────────────────────────────────────────────
async function entrar(browser, origin, email, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
  return ctx;
}

function nuevaPagina(ctx) {
  return ctx.newPage().then((page) => {
    const errores = [];
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => errores.push(String(e).slice(0, 300)));
    return { page, errores };
  });
}

/** Revisa la pantalla como está: consola, desborde, toques, contraste; saca la captura. */
async function revisar({ page, errores }, contexto, paso, esperado) {
  const { disenio, vp } = contexto;
  await page.waitForLoadState("networkidle").catch(() => {});
  // Se mide en reposo, como gate:visual:aa: el puntero sobre la tecla recién tocada deja el color
  // de «hover» (color-mix), que la medición de contraste no sabe leer.
  await page.mouse.move(0, 0);
  const captura = `${disenio}-${vp.nombre}-${paso}.png`;
  await page.screenshot({ path: path.join(OUT, captura), fullPage: true });
  const r = await page.evaluate(auditInPage, TOQUE_MIN);
  const fallas = [];
  if (errores.length) fallas.push(`consola: ${errores.splice(0).join(" | ")}`);
  if (r.overflow.scrollWidth > r.overflow.innerWidth + 2) {
    fallas.push(`scroll horizontal ${r.overflow.scrollWidth}>${r.overflow.innerWidth}: ${JSON.stringify(r.overflow.offenders.slice(0, 3))}`);
  }
  if (vp.width < 500 && r.touchFails.length) fallas.push(`toques < ${TOQUE_MIN} px: ${JSON.stringify(r.touchFails.slice(0, 4))}`);
  if (r.contrastFails.length) fallas.push(`contraste AA: ${JSON.stringify(r.contrastFails.slice(0, 3))}`);
  let nota = "";
  try {
    nota = (await esperado()) ?? "";
  } catch (e) {
    fallas.push(`esperado: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ok = fallas.length === 0;
  pasos.push({ disenio, vp: vp.nombre, paso, ok, nota, fallas, captura, url: page.url().replace(/^https?:\/\/[^/]+/, "") });
  log(`${ok ? "OK " : "MAL"} ${disenio} ${vp.nombre} ${paso}${nota ? ` · ${nota}` : ""}${ok ? "" : ` · ${fallas.join(" · ")}`}`);
}

function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

const filas = (page) => page.locator('section[aria-label="Comprobantes"] [data-ui="tabla-densa"] tbody tr[data-enlace]');
const cantidadMostrada = async (page) =>
  miles(await page.locator('section[aria-label="Comprobantes"] [aria-live="polite"] strong').first().innerText());

async function buscar(page, q, form = 'form[role="search"]') {
  await page.fill(`${form} input[name="q"]`, q);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("q") === q, { timeout: 15_000 }), page.press(`${form} input[name="q"]`, "Enter")]);
}

async function recorrerFacturacion(ctx, origin, contexto, esp) {
  const v = await nuevaPagina(ctx);
  const { page } = v;
  const base = `${origin}/admin/facturacion`;

  await page.goto(base);
  await revisar(v, contexto, "01-lista-del-mes", async () => {
    const n = await cantidadMostrada(page);
    afirmar(n === esp.mes, `muestra ${n} comprobantes del mes, la base tiene ${esp.mes}`);
    const f = await filas(page).count();
    afirmar(f === Math.min(50, esp.mes), `${f} renglones en la página (esperaba ${Math.min(50, esp.mes)})`);
    const textos = await filas(page).allInnerTexts();
    afirmar(textos.every((t) => /Autorizado|Rechazado|Pendiente de autorizar/.test(t)), "hay renglones sin el estado ante ARCA a la vista");
    afirmar(await page.getByRole("button", { name: /Autorizar los .* pendientes|Autorizar el pendiente/ }).isVisible(), "no está «Autorizar los pendientes»");
    return `${n} del mes (base: ${esp.mes}), ${f} renglones`;
  });

  await Promise.all([page.waitForURL(/estado=rechazada/), page.locator('a[href*="estado=rechazada"]').first().click()]);
  await revisar(v, contexto, "02-rechazados", async () => {
    const n = await cantidadMostrada(page);
    afirmar(n === esp.rechazados, `muestra ${n} rechazados, la base tiene ${esp.rechazados}`);
    const textos = await filas(page).allInnerTexts();
    afirmar(textos.length > 0 && textos.every((t) => t.includes("Rechazado")), "hay renglones que no están rechazados");
    return `${n} rechazados (base: ${esp.rechazados})`;
  });

  await page.goto(base);
  await Promise.all([page.waitForURL(/estado=pendiente/), page.locator('a[href*="estado=pendiente"]').first().click()]);
  await revisar(v, contexto, "03-pendientes", async () => {
    const n = await cantidadMostrada(page);
    afirmar(n === esp.pendientes, `muestra ${n} pendientes, la base tiene ${esp.pendientes}`);
    return `${n} pendientes (base: ${esp.pendientes})`;
  });

  const busquedas = [
    ["04-buscar-nombre", "Cliente Escala 1234", (t) => t.includes("Cliente Escala 1234")],
    ["04b-buscar-nombre-del-banco", "Receptor Banco 30001", (t) => t.includes("Receptor Banco 30001")],
    ["05-buscar-numero", "0002-00000124", (t) => t.includes("0002-00000124")],
    ["06-buscar-cuit", "20000001234", () => true],
    ["07-buscar-importe", "1.452,00", (t) => t.includes("1.452")],
  ];
  for (const [paso, q, cumple] of busquedas) {
    await page.goto(base);
    await buscar(page, q);
    await revisar(v, contexto, paso, async () => {
      const textos = await filas(page).allInnerTexts();
      afirmar(textos.length > 0, `«${q}» no trajo nada`);
      afirmar(textos.every(cumple), `«${q}» trajo renglones que no coinciden`);
      return `«${q}»: ${await cantidadMostrada(page)} en todos los meses`;
    });
  }

  await page.goto(base);
  await buscar(page, "Receptor Bravo Exclusivo");
  await revisar(v, contexto, "08-lo-de-otro-negocio-no-aparece", async () => {
    afirmar((await filas(page).count()) === 0, "aparecen comprobantes del negocio B");
    afirmar(await page.getByText("No hay comprobantes para este filtro").isVisible(), "falta el estado «sin resultados»");
    for (const q of ["27999999990", "777,77"]) {
      await page.goto(`${base}?q=${encodeURIComponent(q)}`);
      afirmar((await filas(page).count()) === 0, `«${q}» (de B) trae renglones en A`);
    }
    await page.goto(`${base}?q=${encodeURIComponent("Receptor Bravo Exclusivo")}`);
    await Promise.all([page.waitForURL((u) => !u.searchParams.get("q")), page.getByRole("link", { name: "Sacar los filtros" }).click()]);
    afirmar((await filas(page).count()) > 0, "«Sacar los filtros» no vuelve a la lista");
    return "nombre, CUIT e importe de B: 0 renglones; «Sacar los filtros» vuelve a la lista";
  });

  await page.goto(base);
  const primeraDeLaUno = await filas(page).first().innerText();
  await Promise.all([page.waitForURL(/pagina=2/), page.locator('nav[aria-label="Páginas de comprobantes"] a[rel="next"]').click()]);
  await revisar(v, contexto, "09-pagina-2", async () => {
    const primera = await filas(page).first().innerText();
    afirmar(primera !== primeraDeLaUno, "la página 2 muestra lo mismo que la 1");
    const rango = await page.locator('nav[aria-label="Páginas de comprobantes"] span.tabular-nums').innerText();
    afirmar(rango.startsWith("51–100"), `el paginador dice «${rango}»`);
    return rango;
  });

  await Promise.all([page.waitForURL(/\/admin\/facturacion\/comprobante\//, { timeout: 20_000 }), filas(page).first().click()]);
  await revisar(v, contexto, "10-detalle-del-comprobante", async () => {
    afirmar(await page.locator("h1").first().isVisible(), "el detalle no tiene título");
    return (await page.locator("h1").first().innerText()).slice(0, 60);
  });

  if (contexto.vp.width > 500) {
    await page.goto(`${base}?estado=rechazada`);
    const [bajada] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Bajar este filtro en CSV" }).click()]);
    const archivo = path.join(OUT, `${contexto.disenio}-rechazados-del-mes.csv`);
    await bajada.saveAs(archivo);
    await revisar(v, contexto, "11-csv-del-filtro", async () => {
      const lineas = readFileSync(archivo, "utf8").trim().split(/\r?\n/);
      const datos = lineas.filter((l) => /Rechazad/i.test(l));
      afirmar(datos.length === esp.rechazados, `el CSV trae ${datos.length} rechazados, la base tiene ${esp.rechazados}`);
      afirmar(!lineas.some((l) => l.includes("27999999990") || l.includes("Bravo")), "el CSV trae datos del negocio B");
      return `${lineas.length} líneas, ${datos.length} rechazados (base: ${esp.rechazados})`;
    });
  }
  await page.close();
}

async function recorrerLinks(ctx, origin, contexto) {
  const v = await nuevaPagina(ctx);
  const { page } = v;
  await page.goto(`${origin}/admin/facturacion`);
  await Promise.all([page.waitForURL(/vista=cobrar-con-link/), page.getByRole("link", { name: "Cobrar con link" }).click()]);
  const concepto = `Seña QA ${contexto.disenio} ${contexto.vp.nombre}`;
  if (contexto.disenio === "nuevo") {
    await page.fill("#link-concepto", concepto);
    await page.fill("#link-monto", "12.500,50");
  } else {
    await page.fill('input[name="concepto"]', concepto);
    await page.fill('input[name="monto"]', "12500.50");
  }
  await page.getByRole("button", { name: /^Generar (el )?link/ }).click();
  await revisar(v, contexto, "12-links-generar-y-ver-en-la-lista", async () => {
    await page.getByText(concepto).first().waitFor({ timeout: 15_000 });
    const enLaLista = await page.locator('form[aria-label="Buscar links de cobro"] ~ *').getByText(concepto).count();
    afirmar(enLaLista > 0, "el link nuevo no aparece en la lista sin recargar");
    return "el link nuevo aparece arriba en la lista, sin recargar";
  });

  await buscar(page, "Seña número 17", 'form[aria-label="Buscar links de cobro"]');
  await revisar(v, contexto, "13-links-buscar", async () => {
    afirmar(await page.getByText("Seña número 17", { exact: false }).first().isVisible(), "la búsqueda por concepto no trae nada");
    const renglones = await page.locator('[data-ui="tabla-densa"] tbody tr:not([data-parte="vacio"])').allInnerTexts();
    afirmar(renglones.length > 0 && renglones.every((t) => /Ver en Mercado Pago|Pagado|Sin pagar|anulado/i.test(t)), "hay links sin el estado a la vista");
    return `«Seña número 17»: ${renglones.length} links, con su estado a la vista`;
  });

  await buscar(page, "Seña Bravo Exclusiva", 'form[aria-label="Buscar links de cobro"]');
  await revisar(v, contexto, "14-links-de-otro-negocio-no-aparecen", async () => {
    afirmar(await page.getByText(/No hay links/).first().isVisible(), "falta el estado «sin resultados» (o aparecen links de B)");
    return "los links de B no aparecen; «No hay links que coincidan»";
  });
  await page.close();
}

async function recorrerClientes(ctx, origin, contexto) {
  const v = await nuevaPagina(ctx);
  const { page } = v;
  await page.goto(`${origin}/admin/clientes`);
  await revisar(v, contexto, "15-clientes", async () => {
    afirmar(await page.getByText(/Cliente Escala/).first().isVisible(), "la lista de clientes no muestra fichas");
    return "primera página";
  });
  await buscar(page, "monica perez");
  await revisar(v, contexto, "16-clientes-buscar-sin-tildes", async () => {
    afirmar(await page.getByText("Mónica Pérez").first().isVisible(), "«monica perez» no encuentra a «Mónica Pérez»");
    return "«monica perez» → Mónica Pérez";
  });
  await buscar(page, "Cliente Bravo Exclusivo");
  await revisar(v, contexto, "17-clientes-de-otro-negocio-no-aparecen", async () => {
    afirmar((await page.getByText("Cliente Bravo Exclusivo", { exact: true }).count()) === 0, "aparece la ficha del negocio B");
    return "la ficha de B no aparece";
  });
  await page.goto(`${origin}/admin/clientes`);
  await Promise.all([page.waitForURL(/cursor=2|pagina=2/), page.locator('a[rel="next"], a[href*="cursor=2"]').first().click()]);
  await revisar(v, contexto, "18-clientes-pagina-2", async () => {
    afirmar(await page.getByText(/Cliente Escala/).first().isVisible(), "la página 2 de clientes está vacía");
    return "página 2";
  });
  await page.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  log("creando la base efímera y sembrando (10.000 fichas, 20.000 pedidos, 50.000 comprobantes, 6.000 links)…");
  const base = await crearBaseEfimera();
  let app = null;
  let browser = null;
  try {
    await sembrar(base);
    const esp = await esperados(base);
    log(`mes en curso en A: ${esp.mes} comprobantes, ${esp.rechazados} rechazados, ${esp.pendientes} pendientes`);
    app = await levantar(base);
    browser = await chromium.launch({ executablePath: rutaDeChromium() });
    const origin = `http://${base.a.subdominio}.localhost:${PORT}`;
    for (const disenio of ["siempre", "nuevo"]) {
      await interruptor(base, "diseno-nuevo", disenio === "nuevo");
      for (const vp of VIEWPORTS) {
        const ctx = await entrar(browser, origin, base.a.duenia.email, vp);
        const contexto = { disenio, vp };
        for (const recorrido of [recorrerFacturacion, recorrerLinks, recorrerClientes]) {
          try {
            await recorrido(ctx, origin, contexto, esp);
          } catch (e) {
            const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
            pasos.push({ disenio, vp: vp.nombre, paso: recorrido.name, ok: false, nota: "", fallas: [`se cortó: ${msg}`] });
            log(`MAL ${disenio} ${vp.nombre} ${recorrido.name} se cortó: ${msg}`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser?.close().catch(() => {});
    app?.kill("SIGTERM");
    await base.borrar();
  }
  const malos = pasos.filter((p) => !p.ok);
  const resumen = [
    `QA de punta a punta · Facturación, links y Clientes a escala (ESC-04) · ${new Date().toISOString()}`,
    `Base efímera con RLS (app_rls). Negocio A: 10.001 fichas, 20.000 pedidos, 50.000 comprobantes, 6.000 links. Negocio B aparte.`,
    `Diseños: siempre (el que ve hoy «Comerciante») y nuevo. Anchos: 1440 y 390 px. Toque mínimo ${TOQUE_MIN} px.`,
    `Pasos: ${pasos.length} · bien: ${pasos.length - malos.length} · mal: ${malos.length}`,
    "",
    ...pasos.map((p) => `${p.ok ? "OK " : "MAL"} ${p.disenio.padEnd(7)} ${p.vp.padEnd(4)} ${p.paso}${p.nota ? ` · ${p.nota}` : ""}${p.ok ? "" : ` · ${p.fallas.join(" · ")}`}`),
  ].join("\n");
  writeFileSync(path.join(OUT, "resumen.txt"), resumen + "\n");
  writeFileSync(path.join(OUT, "pasos.json"), JSON.stringify(pasos, null, 2));
  log(`resumen en ${path.join(OUT, "resumen.txt")}`);
  process.exitCode = malos.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
