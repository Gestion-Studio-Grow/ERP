import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http'; import fs from 'fs';
const html = fs.readFileSync('/home/user/ERP/celula-negocios-digitales/panel/panel.html');
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);});
await new Promise(r=>server.listen(0,r));const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load'});

// CORTE CRUZADO: sin costo + 100% IA + no descartado, ordenado por índice
const data = await page.evaluate(()=>{
  const src=(typeof RANKED!=='undefined'&&RANKED.length)?RANKED:DATA;
  const sel=src.filter(d=>d.costo==='sin'&&d.ia==='full'&&d.prod!=='dead');
  return sel.map(d=>({name:document.getElementById('dwn')&&null, _n:d.name, idx:d.idx, prod:d.prod}))
    .map(x=>{ open(x._n); return {
      name:document.getElementById('dwn').textContent,
      tag:document.getElementById('dwt').textContent,
      verdict:document.getElementById('dwr').innerHTML,
      body:document.getElementById('dwb').innerHTML,
      idx:x.idx, prod:x.prod }; });
});
console.log('seleccionadas:', data.length);

const CSS=`*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;background:#fff;margin:0}
.cover{max-width:720px;margin:0 auto;padding:40px 26px;page-break-after:always}
.cover .kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a7400;font-weight:700}
.cover h1{font-size:30px;font-style:italic;margin:6px 0 4px}
.cover .sub{color:#444;font-size:14px;margin-bottom:2px}
.cover .crit{background:#fbf6d8;border:1px solid #d8c766;border-radius:10px;padding:12px 14px;margin:16px 0;font-size:12.5px;color:#5c4d00}
.cover ol{padding-left:0;list-style:none;margin:14px 0 0;column-count:2;column-gap:26px;font-size:12px}
.cover ol li{margin-bottom:5px;break-inside:avoid;color:#222}
.cover .b{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;color:#111}
.cover .dot{display:inline-block;width:8px;text-align:center}
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

const listHtml = data.map((f,i)=>`<li><span class="dot">${f.prod==='ok'?'🟢':'🟡'}</span> <span class="b">${String(f.idx).padStart(2)}</span> · ${f.name}</li>`).join('');
const cover = `<section class="cover">
  <div class="kick">Célula de Negocios Digitales · Corte cruzado</div>
  <h1>Oportunidades accionables y baratas</h1>
  <div class="sub">Las ${data.length} que cruzan los tres filtros que más importan para arrancar ya.</div>
  <div class="crit"><b>Criterio del corte:</b> 🆓 arranque <b>sin costo</b> (plata de bolsillo) &nbsp;+&nbsp; 🤖 ejecutable <b>100% por IA</b> (sin humano fijo) &nbsp;+&nbsp; <b>no descartadas</b> por el red-team (🟢 a producción o 🟡 en pista). Ordenadas por Índice de Factibilidad.</div>
  <ol>${listHtml}</ol>
</section>`;

const sections = data.map((f,i)=>`<section class="ficha">
  <div class="brand">Oportunidad accionable y barata · ${i+1} de ${data.length}</div>
  <header><h1>${f.name}</h1><div class="tg">${f.tag}</div><div class="rw">${f.verdict}</div></header>
  <main class="db">${f.body}</main>
</section>`).join('\n');

const doc=`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cover}${sections}</body></html>`;
const p2=await browser.newPage();
await p2.setContent(doc,{waitUntil:'load'});
import path from 'path'; import { fileURLToPath } from 'url';
const OUT=path.join(path.dirname(fileURLToPath(import.meta.url)),'Oportunidades-accionables-baratas.pdf');
await p2.pdf({path:OUT,format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'10mm',right:'10mm'}});
console.log('PDF:',OUT,'·',(fs.statSync(OUT).size/1024).toFixed(0),'KB');
await browser.close();server.close();
