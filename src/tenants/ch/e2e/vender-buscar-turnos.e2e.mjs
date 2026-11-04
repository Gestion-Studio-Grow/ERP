// QA clic por clic de «Vender · buscar servicio o producto» (interruptor `agenda-interaccion`).
// Contra la app de producción (`next start`) y Postgres LOCAL (entorno-ch.mjs; nunca Neon), a 1366×768
// y a 375×812 (táctil), contando cada toque con `toque()`:
//   F · APAGADO: el mostrador no trae el campo único (el de siempre, idéntico).
//   S · buscar «peeling» → «Turnos libres» por profesional (Marina y Carla) → tocar un hueco → el alta
//       con servicio, profesional y hora cargados → clienta → «Dar turno» → «Listo ✓ Turno dado».
//   P · buscar un producto → se suma a la venta como siempre (renglón con el producto y su cantidad).
//   Chequeos: chips ≥ 44 px, aria-live con «turnos libres con…», sin scroll horizontal, consola limpia.
// Uso: node --import tsx src/tenants/ch/e2e/vender-buscar-turnos.e2e.mjs <carpeta de capturas (fuera del repo)>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "../../../cambios/interruptores.ts";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-vender-buscar-turnos-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const toques = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });

async function pagina(e, [w, h], { etiqueta } = {}) {
  const tactil = w < 800;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: tactil, isMobile: tactil });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (err) => errores.push(`${etiqueta ?? w} ${p.url()}: ${err.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${etiqueta ?? w} ${p.url()}: ${m.text()}`);
  });
  await p.goto(`${e.url}/admin/login`);
  await p.fill('input[name="email"]', e.base.a.duenia.email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  return { ctx, p, tactil, w, h, n: [] };
}
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
async function toque(s, loc, que) {
  s.n.push(que);
  await loc.first().waitFor({ timeout: 15000 });
  if (s.tactil) await loc.first().tap();
  else await loc.first().click();
}
const anotar = (s, V, rec) => toques.push({ v: V, rec, toques: s.n.length, det: s.n.join(" › ") });
const sinDesborde = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

async function prender(db, e, id) {
  await db.auditLog.create({
    data: { tenantId: e.base.a.id, entity: ENTIDAD_INTERRUPTOR, entityId: id, action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" },
  });
}

/** Pedidos → «Cobrar una venta» (1 toque): el mostrador en su cajón, en «Productos». */
async function abrirVender(s, e) {
  await s.p.goto(`${e.url}/admin/pedidos`);
  await s.p.waitForLoadState("networkidle").catch(() => {});
  await toque(s, s.p.getByRole("button", { name: "Cobrar una venta" }), "Cobrar una venta");
  const cajon = s.p.getByRole("dialog").filter({ visible: true }).first();
  await cajon.waitFor({ timeout: 20000 });
  return cajon;
}

for (const [w, h] of [[1366, 768], [375, 812]]) {
  const V = `${w}`;
  const e = await levantarEntornoCH({ log: () => {} });
  try {
    const db = await prismaComoDuenio(e.base);
    const tenantId = e.base.a.id;
    await db.product.create({ data: { tenantId, name: "Crema hidratante facial", price: 12500, stock: 20, trackStock: false } });
    // Peeling lo hacen dos: Marina (semilla) y Carla (sumada acá), para ver los huecos agrupados.
    await db.professional.update({ where: { id: e.semilla.profesionales.carla }, data: { services: { connect: [{ id: e.semilla.servicios.peeling }] } } });
    const clienta = await db.client.create({ data: { tenantId, name: `Paula Peeling ${V}`, phone: `11 4200 ${V.padStart(4, "0")}` } });

    // ───────── F · APAGADO ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `F-${V}` });
      const cajon = await abrirVender(s, e);
      await s.p.waitForTimeout(600);
      const n = await cajon.locator('[data-vender="buscador-unico"]').count();
      ok(`F1.${V}`, n === 0, `apagado: Vender sin el campo único (${n})`);
      await s.p.screenshot({ path: `${OUT}/${V}-0-apagado.png` });
      await s.ctx.close();
    }

    await prender(db, e, "agenda-practica");
    await prender(db, e, "agenda-interaccion");

    // ───────── S · servicio → turnos libres → dar turno ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `S-${V}` });
      const cajon = await abrirVender(s, e);
      const buscar = cajon.locator('[data-vender="buscador-unico"] input[role="combobox"]');
      ok(`S0.${V}`, await espera(buscar), "prendido: el campo único está");
      await toque(s, buscar, "buscar");
      await buscar.pressSequentially("peeling", { delay: 40 });
      const panel = cajon.locator('[data-vender="turnos-libres"]');
      const anuncio = panel.getByRole("status");
      await espera(anuncio.filter({ hasText: /turnos? libres? con/ }), 20000);
      const texto = (await anuncio.first().textContent()) ?? "";
      ok(`S1.${V}`, /Peeling químico: \d+ turnos? libres? con (Carla|Marina)/.test(texto), `aria-live: «${texto}»`);
      const grupos = await panel.getByRole("group", { name: /^Turnos libres con / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      ok(`S2.${V}`, grupos.length === 2 && grupos.some((g) => /Marina/.test(g)) && grupos.some((g) => /Carla/.test(g)), `agrupados por profesional: ${grupos.join(" | ")}`);
      const chips = await panel.locator('[data-vender="hueco"]').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      ok(`S3.${V}`, chips.length > 0 && chips.every((x) => x >= 44), `chips de hora ≥ 44 px (${chips.length} chips, mín ${Math.min(...chips)})`);
      const d = await sinDesborde(s.p);
      ok(`S4.${V}`, d.sw <= d.iw, `sin scroll horizontal (${d.sw} ≤ ${d.iw})`);
      await panel.scrollIntoViewIfNeeded();
      await s.p.screenshot({ path: `${OUT}/${V}-1-turnos-libres.png` });

      const hueco = panel.getByRole("group", { name: /Marina/ }).locator('[data-vender="hueco"]').first();
      const href = await hueco.getAttribute("href");
      const hora = ((await hueco.textContent()) ?? "").trim();
      await toque(s, hueco, `hueco ${hora}`);
      await s.p.waitForURL(/\/admin\/turnos\/lista\?nuevo=1/, { timeout: 20000 });
      const alta = s.p.getByRole("dialog").filter({ visible: true }).first();
      await alta.waitFor({ timeout: 20000 });
      const servicioElegido = alta.getByRole("group", { name: "Servicio" }).getByRole("button", { name: /Peeling/, pressed: true });
      const servicioOk = await espera(servicioElegido, 15000);
      const horaOk = await espera(alta.getByRole("button", { name: new RegExp(`^${hora}`), pressed: true }), 15000).catch(() => false);
      ok(`S5.${V}`, servicioOk && /servicio=/.test(href ?? ""), `el alta abre con Peeling elegido (${href})`);
      await s.p.screenshot({ path: `${OUT}/${V}-2-alta-cargada.png` });
      const buscarClienta = alta.getByPlaceholder("Nombre o teléfono…");
      await toque(s, buscarClienta, "buscar clienta");
      await buscarClienta.fill("Paula");
      await toque(s, alta.getByRole("list", { name: "Fichas que coinciden" }).getByRole("button", { name: /Paula Peeling/ }), "elegir ficha");
      const dar = alta.getByRole("button", { name: /^Dar turno · / });
      const etiquetaDar = (await dar.first().textContent().catch(() => "")) ?? "";
      await toque(s, dar, "Dar turno");
      const listo = await espera(s.p.getByText("Listo ✓ Turno dado"), 20000);
      const turno = await db.appointment.findFirst({ where: { clientId: clienta.id }, include: { professional: true, service: true } });
      const horaBase = turno ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(turno.startsAt) : "";
      ok(
        `S6.${V}`,
        listo && turno?.service.name === "Peeling químico" && /Marina/.test(turno?.professional.name ?? "") && horaBase === hora,
        `«Dar turno» → Listo ✓ (base: ${turno?.service.name} con ${turno?.professional.name} a las ${horaBase}; tecla «${etiquetaDar.trim()}»; hora marcada: ${horaOk})`,
      );
      await s.p.screenshot({ path: `${OUT}/${V}-3-listo.png` });
      anotar(s, V, "servicio → hueco → dar turno");
      await s.ctx.close();
    }

    // ───────── P · producto → se suma como hoy ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `P-${V}` });
      const cajon = await abrirVender(s, e);
      const buscar = cajon.locator('[data-vender="buscador-unico"] input[role="combobox"]');
      await toque(s, buscar, "buscar");
      await buscar.fill("crema");
      const lista = s.p.locator(`#${await buscar.getAttribute("aria-controls")}`);
      await toque(s, lista.getByRole("option", { name: /Crema hidratante/ }), "elegir producto");
      await s.p.waitForTimeout(400);
      const renglon = await cajon.locator('input[role="combobox"][id^="prod-"]').evaluateAll((els) => els.map((el) => el.value));
      const panel = await cajon.locator('[data-vender="turnos-libres"]').count();
      ok(`P1.${V}`, renglon.some((v) => /Crema hidratante/.test(v)) && panel === 0, `producto sumado al ticket como siempre (renglones: ${renglon.join(" | ")}; sin panel de turnos)`);
      await s.p.screenshot({ path: `${OUT}/${V}-4-producto.png` });
      anotar(s, V, "producto → renglón");
      await s.ctx.close();
    }
  } catch (err) {
    console.log(String(err?.stack ?? err).split("\n").slice(0, 6).join("\n"));
    ok(`recorrido.${V}`, false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
  }
  await e.cerrar();
}

ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 4).join(" | ")}` : ""}`);
await b.close();
console.log("\nTOQUES:\n" + toques.map((t) => JSON.stringify(t)).join("\n"));
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify({ filas, toques }, null, 1));
process.exit(fallas.length ? 1 : 0);
