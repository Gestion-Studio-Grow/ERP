// Render hidratado de cada negocio (no Shine): DOM a los 4 s, JS que bajó (con el sha de su contenido)
// y errores de consola. Uso: node dom.mjs <puerto> <salida.json>
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const [puerto, salida] = process.argv.slice(2);
const RUTAS = [
  ["chestetica", "/"],
  ["chestetica", "/tienda"],
  ["magra", "/tienda"],
  ["adosmanos", "/tienda"],
  ["quebienoles", "/tienda"],
  ["wpe", "/"],
];
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});
const out = {};
for (const [host, ruta] of RUTAS) {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const js = [];
    const errores = [];
    ctx.on("response", async (r) => {
      if (!/\.js(\?|$)/.test(r.url())) return;
      try {
        const cuerpo = await r.body();
        js.push({ sha: sha(cuerpo), bytes: cuerpo.length });
      } catch {}
    });
    p.on("console", (m) => m.type() === "error" && errores.push(m.text().slice(0, 160)));
    p.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
    await p.goto(`http://${host}.localhost:${puerto}${ruta}`, { waitUntil: "load" });
    await p.waitForTimeout(4000);
    let dom = await p.evaluate(() => document.documentElement.outerHTML);
    dom = dom
      .replace(/<script>self\.__next_f\.push\([\s\S]*?<\/script>/g, "<RSC/>")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "UUID")
      .replace(/\/_next\/static\/[A-Za-z0-9_\-./~%]+/g, "/_next/static/X");
    const png = await p.screenshot({ fullPage: false });
    out[`${host}${ruta}@${w}`] = {
      dom: sha(dom),
      pixeles: sha(png),
      js: js.map((x) => x.sha).sort(),
      jsBytes: js.reduce((a, x) => a + x.bytes, 0),
      errores,
      domTexto: dom,
    };
    await ctx.close();
  }
}
await b.close();
writeFileSync(salida, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), v.dom, v.pixeles, String(v.jsBytes).padStart(8), v.js.length, v.errores.length);
