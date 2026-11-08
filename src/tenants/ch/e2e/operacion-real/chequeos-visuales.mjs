// Chequeos visuales sin modelo, para importar desde recorrido-sabado.mjs.
// Uso: const vigia = vigilarConsola(page); ... await chequearPaso(page, {paso:"05", ancho:390}, vigia);
//      al final: guardarVisual(rutaJson) y tablaVisualMd() para resultado.md.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] });

export const registros = [];

export function vigilarConsola(page) {
  const buf = [];
  page.on("console", (m) => { if (m.type() === "error") buf.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => buf.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  return { tomar: () => buf.splice(0, buf.length) };
}

export async function chequearPaso(page, { paso, ancho }, vigia) {
  const dom = await page.evaluate(() => {
    const sel = (el) => {
      if (el.id) return `#${el.id}`;
      const t = el.getAttribute("data-testid"); if (t) return `[data-testid="${t}"]`;
      const c = [...el.classList].slice(0, 2).join(".");
      return el.tagName.toLowerCase() + (c ? "." + c : "");
    };
    const txt = (el) => (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const de = document.documentElement;
    const desborde = de.scrollWidth > de.clientWidth ? { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth } : null;
    const cortados = [];
    for (const el of document.querySelectorAll("body *")) {
      if (cortados.length >= 10) break;
      if (!visible(el) || !txt(el)) continue;
      const s = getComputedStyle(el);
      const oculta = ["hidden", "clip"].includes(s.overflowX) || ["hidden", "clip"].includes(s.overflowY) || s.textOverflow === "ellipsis";
      if (oculta && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
        cortados.push({ selector: sel(el), texto: txt(el) });
    }
    const tapados = [];
    const vw = de.clientWidth, vh = window.innerHeight;
    // Con un cajón/modal abierto, lo de atrás está tapado a propósito: se mira sólo lo de adentro.
    const dialogos = [...document.querySelectorAll('[role="dialog"], dialog[open]')].filter(visible);
    const raiz = dialogos.length ? dialogos[dialogos.length - 1] : document;
    for (const el of raiz.querySelectorAll("a[href], button, [role=button]")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) { tapados.push({ selector: sel(el), texto: txt(el), motivo: "fuera del viewport horizontal" }); continue; }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cy < 0 || cy > vh) continue; // fuera de la vista vertical: no se puede evaluar
      const arriba = document.elementFromPoint(cx, cy);
      if (arriba && arriba !== el && !el.contains(arriba))
        tapados.push({ selector: sel(el), texto: txt(el), motivo: `tapado por ${sel(arriba)}` });
    }
    const imgRotas = [...document.images].filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => ({ selector: sel(i), texto: (i.getAttribute("src") || "").slice(0, 80) }));
    return { desborde, cortados, tapados: tapados.slice(0, 10), totalTapados: tapados.length, imgRotas };
  });
  let contraste = { nodos: 0, ejemplos: [] };
  try {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } }));
    const nodos = r.violations.flatMap((v) => v.nodes);
    contraste = { nodos: nodos.length, sinDeterminar: r.incomplete.flatMap((v) => v.nodes).length, ejemplos: nodos.slice(0, 3).map((n) => ({ selector: n.target.join(" "), texto: (n.failureSummary || "").split("\n").pop().slice(0, 100) })) };
  } catch (e) { contraste = { nodos: -1, ejemplos: [], error: String(e.message).slice(0, 120) }; }
  const consola = vigia ? vigia.tomar() : [];
  const reg = { paso, ancho, url: page.url(), ...dom, contraste, consola };
  registros.push(reg);
  return reg;
}

export function guardarVisual(ruta) { writeFileSync(ruta, JSON.stringify(registros, null, 2)); }

export function tablaVisualMd() {
  const f = ["| paso | ancho | desborde | cortados | tapados | contraste | img rotas | consola |", "|---|---|---|---|---|---|---|---|"];
  for (const r of registros)
    f.push(`| ${r.paso} | ${r.ancho} | ${r.desborde ? `sí (${r.desborde.scrollWidth}>${r.desborde.clientWidth})` : "no"} | ${r.cortados.length} | ${r.totalTapados} | ${r.contraste.nodos} | ${r.imgRotas.length} | ${r.consola.length} |`);
  return f.join("\n");
}
