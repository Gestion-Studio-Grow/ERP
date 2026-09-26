// Recorrido post-arreglo (QA vuelta 3): cierre del mes, factura de prueba, paneles nuevos, paquete RI.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const T = JSON.parse(readFileSync(process.argv[2], "utf8"));
const OUT = ".qa/contador-2609/fix-qa3/e2e/";
const LOSANDES = "cmuijlv610004ac7das83hj7j";
const log = [];
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
async function pagina(sub, ancho) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: ancho > 500 ? 900 : 844 } });
  await ctx.addCookies([{ name: T.cookie, value: T[sub], domain: sub + ".localhost", path: "/" }]);
  const p = await ctx.newPage();
  p.errores = [];
  p.on("console", (m) => { if (m.type() === "error") p.errores.push(m.text().slice(0, 160)); });
  return p;
}
async function ir(p, sub, ruta, nombre) {
  await p.goto("http://" + sub + ".localhost:3210" + ruta, { waitUntil: "networkidle", timeout: 120000 });
  const h1 = (await p.locator("h1").first().textContent().catch(() => "")) || "";
  log.push(nombre + " -> " + new URL(p.url()).pathname + " | h1: " + h1.trim() + (p.errores.length ? " | consola: " + p.errores.join(" / ") : " | consola sin errores"));
  await p.screenshot({ path: OUT + nombre + ".png", fullPage: true });
}
async function facturaDePrueba(p, receptor, nombre) {
  await p.selectOption("select", receptor);
  await p.getByRole("button", { name: "Emitir factura de prueba" }).click();
  const r = p.locator('[role="status"], [role="alert"]').filter({ hasText: /Listo:|Factura A|no se|Falta|sólo/ }).first();
  await r.waitFor({ timeout: 60000 });
  log.push(nombre + " -> " + (await r.textContent()).trim());
  await p.waitForTimeout(8000);
  log.push(nombre + " (a los 8 s sigue a la vista) -> " + ((await r.isVisible()) ? "sí" : "no"));
  await p.screenshot({ path: OUT + nombre + ".png", fullPage: true });
}
let p = await pagina("dontito-lab", 1440);
await ir(p, "dontito-lab", "/admin/cierre-mes", "b1-dontito-cierre-mes-1440");
await ir(p, "dontito-lab", "/admin/facturacion", "b3-dontito-facturacion-1440");
await facturaDePrueba(p, "consumidor-final", "b3-dontito-factura-B-1");
await facturaDePrueba(p, "consumidor-final", "b3-dontito-factura-B-2");
await facturaDePrueba(p, "responsable-inscripto", "b3-dontito-factura-A");
p = await pagina("andino-lab", 1440);
await ir(p, "andino-lab", "/admin/cierre-mes", "b1-andino-cierre-mes-1440");
p = await pagina("riobamba-lab", 1440);
await ir(p, "riobamba-lab", "/admin/cierre-mes", "b1-riobamba-cierre-mes-1440");
p = await pagina("losandes-lab", 390);
await ir(p, "losandes-lab", "/admin", "b4-losandes-panel-390");
await ir(p, "losandes-lab", "/admin/cierre-mes", "b1-losandes-cierre-mes-390");
await ir(p, "losandes-lab", "/admin/facturacion", "b3-losandes-facturacion-390");
await facturaDePrueba(p, "consumidor-final", "b3-losandes-factura-B-390");
p = await pagina("martinagomez-lab", 390);
await ir(p, "martinagomez-lab", "/admin", "b4-martina-panel-390");
await ir(p, "martinagomez-lab", "/admin/facturacion", "b3-martina-facturacion-390");
await facturaDePrueba(p, "consumidor-final", "b3-martina-factura-C-390");
p = await pagina("estudio", 1440);
await ir(p, "estudio", "/contador", "b3-contadora-cartera-1440");
const txt = await p.locator("body").innerText();
log.push("cartera, renglón de Los Andes: " + (txt.split("\n").filter((l) => /Los Andes/.test(l)).slice(0, 3).join(" · ") || "(no encontrado)"));
const csv = await p.evaluate(async (id) => (await fetch("/contador/paquete?cliente=" + id + "&mes=2026-08")).text(), LOSANDES);
writeFileSync(OUT + "b2-paquete-losandes-2026-08.csv", csv);
const lineas = csv.split(/\r?\n/);
log.push("paquete Los Andes 2026-08, encabezado de COMPRAS: " + (lineas.find((l) => l.startsWith("Fecha;Proveedor")) || "(sin compras)"));
log.push("paquete Los Andes 2026-08, IVA crédito: " + (lineas.find((l) => l.startsWith("IVA crédito")) || "(no está)"));
log.push("paquete Los Andes 2026-08, nota «no se sabe si…»: " + (/no se sabe si el negocio es responsable inscripto/.test(csv) ? "sigue" : "ya no"));
const s = await b.newContext({ viewport: { width: 390, height: 844 } }).then((c) => c.newPage());
await s.goto("http://sinmapa-lab.localhost:3210/admin", { waitUntil: "networkidle" });
log.push("dirección sin negocio (sinmapa-lab) -> " + new URL(s.url()).pathname + " | " + ((await s.locator("h1").first().textContent()) || "").trim() + " | salidas: " + (await s.locator("a").allTextContents()).join(" · "));
await s.screenshot({ path: OUT + "b4-sinmapa-390.png", fullPage: true });
await b.close();
writeFileSync(OUT + "recorrido.txt", log.join("\n") + "\n");
console.log(log.join("\n"));
