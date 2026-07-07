// ============================================================================
// Generador de PDF de la cartera — Célula de Negocios Digitales
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE: el panel se publica como Artifact de claude.ai, que corre en
// un iframe con sandbox SIN `allow-downloads` ni `allow-modals`. Por diseño de
// seguridad, el navegador bloquea EN SILENCIO toda descarga (<a download>,
// Blob, data-URI, jsPDF.save) y todo window.print() lanzado desde adentro del
// iframe; el click real del usuario NO lo desbloquea (es a nivel de frame).
// Verificado con Playwright + investigación (ver commits del 06/07/2026).
// Conclusión: NINGÚN botón dentro del HTML puede descargar/imprimir. Por eso el
// PDF se genera acá, fuera del sandbox, con el motor de impresión de Chromium
// (que sí respeta el diseño), renderizando cada ficha con la MISMA función
// open() del panel para fidelidad total.
//
// USO (requiere Chromium de Playwright; en este entorno ya está):
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   node celula-negocios-digitales/panel/generar-pdf-cartera.mjs
// Salida: ./Cartera-Celula-Negocios-Digitales.pdf (junto al panel)
// ============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http'; import fs from 'fs';
import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.join(HERE, 'panel.html');
const OUT = path.join(HERE, 'Cartera-Celula-Negocios-Digitales.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const html = fs.readFileSync(PANEL);
const server = http.createServer((req,res)=>{ res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(html); });
await new Promise(r=>server.listen(0,r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:'load' });

// Renderiza cada ficha con la propia open() del panel (RANKED = orden del leaderboard)
const data = await page.evaluate(()=>{
  const src = (typeof RANKED!=='undefined' && RANKED && RANKED.length) ? RANKED : (typeof DATA!=='undefined' ? DATA : []);
  const out = [];
  for (const d of src){
    try{
      open(d.name);
      out.push({
        name: document.getElementById('dwn').textContent,
        tag: document.getElementById('dwt').textContent,
        verdict: document.getElementById('dwr').innerHTML,
        body: document.getElementById('dwb').innerHTML,
        costo: d.costo||''
      });
    }catch(e){ out.push({ name:d.name, tag:'', verdict:'', body:'<p>(error al renderizar)</p>', costo:d.costo||'' }); }
  }
  return out;
});
console.log('fichas:', data.length);

const CSS = `*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;background:#fff;margin:0}
.ficha{max-width:720px;margin:0 auto;padding:26px 24px 10px;page-break-after:always}
.ficha:last-child{page-break-after:auto}
header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
header h1{font-size:23px;margin:0 0 4px;font-style:italic}
header .tg{color:#555;font-size:12.5px}
header .rw{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap}
.brand{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#999;margin-bottom:10px}
.db>*{margin-bottom:13px}
.idxbig{background:#f3f4f6;border:1px solid #bbb;border-radius:12px;padding:14px 16px}
.idxbig .ib-top{display:flex;justify-content:space-between;align-items:baseline}
.idxbig .ib-n{font-size:40px;font-weight:900;font-style:italic;line-height:.9}
.idxbig .ib-l{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;text-align:right}
.idxbig .ib-bar{height:9px;background:#ddd;border-radius:5px;margin:11px 0 9px;overflow:hidden}
.idxbig .ib-bar i{display:block;height:100%;background:#111}
.idxbig .ib-why{font-size:12.5px;color:#333}
.ds .dl,.hero-box .dl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin-bottom:5px;font-weight:700}
.ds p,.hero-box p{margin:0;font-size:13px;color:#1a1a1a}
.hero-box{background:#fbf6d8;border:1px solid #d8c766;border-radius:10px;padding:12px 14px}
.hero-box .dl{color:#8a7400}
.dstats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#ccc;border:1px solid #ccc;border-radius:10px;overflow:hidden}
.dstats .s{background:#fff;padding:9px 12px}
.dstats .s .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#666}
.dstats .s .v{font-size:13px;font-weight:700;margin-top:2px}
.dstats .s .v.good{color:#0a7a3c}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:6px;border:1px solid #bbb;white-space:nowrap}
.pill .pd{width:7px;height:7px;border-radius:50%;background:currentColor}
.pill.ok{color:#0a7a3c}.pill.warn{color:#a85800}.pill.dead{color:#b02a1f}
.vrow{display:flex;gap:7px;flex-wrap:wrap}
.path{display:flex;flex-direction:column;gap:6px}
.path .pi{display:grid;grid-template-columns:20px 1fr;gap:9px;font-size:12.5px}
.path .pi .pn{font-weight:700;color:#111;font-size:12px}
.idxbig,.ds,.hero-box,.dstats,.pill,.path .pi{break-inside:avoid}`;

function buildDoc(list){
  const sections = list.map((f,i)=>`<section class="ficha">
  <div class="brand">Célula de Negocios Digitales · Ficha ${i+1} de ${list.length}</div>
  <header><h1>${f.name}</h1><div class="tg">${f.tag}</div><div class="rw">${f.verdict}</div></header>
  <main class="db">${f.body}</main>
</section>`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${sections}</body></html>`;
}

// 3 salidas: cartera completa + segmentadas por costo de arranque
const SEGMENTS = [
  { file: OUT,                                                    list: data },
  { file: path.join(HERE, 'Cartera-SIN-costo.pdf'),              list: data.filter(f=>f.costo==='sin') },
  { file: path.join(HERE, 'Cartera-CON-costo.pdf'),              list: data.filter(f=>f.costo==='con') },
];
for (const seg of SEGMENTS){
  if (!seg.list.length){ console.log('(vacío, salteo)', seg.file); continue; }
  const p = await browser.newPage();
  await p.setContent(buildDoc(seg.list), { waitUntil:'load' });
  await p.pdf({ path: seg.file, format:'A4', printBackground:true, margin:{ top:'12mm', bottom:'12mm', left:'10mm', right:'10mm' } });
  await p.close();
  console.log('PDF:', path.basename(seg.file), '·', seg.list.length, 'fichas ·', (fs.statSync(seg.file).size/1024).toFixed(0), 'KB');
}

await browser.close(); server.close();
