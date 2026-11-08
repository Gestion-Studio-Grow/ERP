import fs from "node:fs"; import path from "node:path";
const S = process.argv[2];
const md = fs.readFileSync(path.join(S, "recorrido/resultado.md"), "utf8");
const pasos = {};
for (const l of md.split("\n")) {
  const m = l.match(/^\| (\d\d) ?(★)? \| ([^|]+)\| ([^|]+)\| (OK|FALLA|CALLEJÓN) \| (.*?) \| (.*?) \|$/);
  if (m) pasos[m[1]] = { clave: !!m[2], hora: m[3].trim(), quien: m[4].trim(), estado: m[5], que: m[6], arch: m[7] };
}
const vis = JSON.parse(fs.readFileSync(path.join(S, "recorrido/visual.json"), "utf8"));
const visDe = (p, a) => vis.find((v) => v.paso === p && v.ancho === a);
const fotos = fs.readdirSync(path.join(S, "capturas/ch")).filter((f) => f.endsWith(".png")).sort();
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/`/g, "");
const cuenta = { OK: 0, FALLA: 0, "CALLEJÓN": 0 }; Object.values(pasos).forEach((p) => cuenta[p.estado]++);
const tarjetas = fotos.map((f) => {
  const [, id, ancho] = f.match(/^(\d\d[a-z]?)-paso-(\d+)\.png$/);
  const p = pasos[id.slice(0, 2)] || {}; const v = visDe(id, +ancho) || {};
  const auto = [];
  if (v.desborde) auto.push("desborde horizontal");
  if (v.totalTapados) auto.push(`${v.totalTapados} tapado(s): ${esc((v.tapados || []).slice(0, 2).map((t) => t.texto).join(" · "))}`);
  if (v.contraste?.nodos) auto.push(`contraste: ${v.contraste.nodos} nodo(s)`);
  if (v.imgRotas?.length) auto.push(`${v.imgRotas.length} imagen(es) rota(s)`);
  if (v.consola?.length) auto.push(`${v.consola.length} error(es) de consola`);
  const cort = (v.cortados || []).filter((c) => !/sr-only/.test(c.selector)).length;
  if (cort) auto.push(`${cort} texto(s) cortado(s)`);
  return `<figure class="t ${(p.estado || "").replace("Ó", "O").toLowerCase()}">
<a href="capturas/ch/${f}"><img src="capturas/ch/${f}" alt="Paso ${id} a ${ancho} px" loading="lazy" style="aspect-ratio:${+ancho === 390 ? "390/844" : "1440/900"}"></a>
<figcaption><div class="cab"><b>${id}${p.clave ? " ★" : ""}</b> · ${esc(p.hora)} · ${esc(p.quien)} · ${ancho} px <span class="e">${p.estado || "—"}</span></div>
<p>${esc(p.que)}</p>${p.arch ? `<p class="a">${esc(p.arch)}</p>` : ""}
${auto.length ? `<ul class="auto">${auto.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p class="limpio">Chequeos automáticos sin hallazgos</p>`}</figcaption></figure>`;
}).join("\n");
const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sábado de CH</title><meta name="generator" content="Gestión Studio Grow"><style>
:root{--bg:#faf8f5;--fg:#1f1d1a;--mut:#6b655c;--card:#fff;--line:#e6e1d8;--ok:#1d6b3a;--fa:#a3261b;--ca:#8a5a00;--faB:#fdecea;--caB:#fff4dc}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171513;--fg:#f1ede6;--mut:#a59e93;--card:#22201d;--line:#37332e;--ok:#6fcf8f;--fa:#ff8a7d;--ca:#f2c063;--faB:#3a1d1a;--caB:#3a2e14}}
:root[data-theme=dark]{--bg:#171513;--fg:#f1ede6;--mut:#a59e93;--card:#22201d;--line:#37332e;--ok:#6fcf8f;--fa:#ff8a7d;--ca:#f2c063;--faB:#3a1d1a;--caB:#3a2e14}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:24px 16px}
h1{font-size:1.5rem;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 16px}.res{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}.res span{padding:4px 10px;border-radius:999px;border:1px solid var(--line)}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
figure.falla{border-color:var(--fa);background:var(--faB)}figure.callejon{border-color:var(--ca);background:var(--caB)}
img{width:100%;height:auto;max-height:420px;object-fit:cover;object-position:top;display:block;border-bottom:1px solid var(--line);background:var(--line)}
figcaption{padding:10px 12px}.cab{font-size:.9rem}.e{float:right;font-weight:700}.ok .e{color:var(--ok)}.falla .e{color:var(--fa)}.callejon .e{color:var(--ca)}
p{margin:6px 0;overflow-wrap:anywhere}.a{font-family:ui-monospace,monospace;font-size:.8rem;color:var(--mut)}.auto{margin:6px 0 0;padding-left:18px;color:var(--fa);font-size:.85rem}.limpio{color:var(--mut);font-size:.85rem}
footer{color:var(--mut);font-size:.85rem;margin-top:24px}</style></head><body><main>
<h1>Un sábado de CH Estética, paso a paso</h1>
<p class="sub">Sábado 14/11/2026 simulado, de 08:50 a 20:25, más el cierre de octubre. Base local con RLS y <code>next dev</code> (el build de producción no compila en este entorno). Las capturas no las miró ningún modelo: las valida el dueño. Los chequeos automáticos marcan desbordes, textos cortados, botones tapados, contraste, imágenes rotas y errores de consola.</p>
<div class="res"><span>OK: ${cuenta.OK}</span><span>FALLA: ${cuenta.FALLA}</span><span>CALLEJÓN: ${cuenta["CALLEJÓN"]}</span><span>${fotos.length} capturas</span></div>
<div class="g">${tarjetas}</div><footer>Gestión Studio Grow · prueba de operación real · 08/11/2026</footer></main></body></html>`;
fs.writeFileSync(path.join(S, "galeria-ch.html"), html);
console.log("pasos", Object.keys(pasos).length, cuenta, "fotos", fotos.length);
