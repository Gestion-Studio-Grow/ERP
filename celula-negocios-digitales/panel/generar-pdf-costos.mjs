// PDF "Costo real de la cartera" — desglose exacto por negocio (análisis de 6 agentes de costos).
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-costos.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'Costo-real-de-la-cartera.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const html = fs.readFileSync(path.join(HERE,'panel.html'));
const server = http.createServer((q,r)=>{ r.writeHead(200,{'content-type':'text/html; charset=utf-8'}); r.end(html); });
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:'load' });
const rows = await page.evaluate(()=>{
  const s=(typeof RANKED!=='undefined'&&RANKED.length)?RANKED:DATA;
  return s.map(d=>({name:d.name, idx:d.idx, prod:d.prod, costo:d.costo, arr:d.costoArr||'', mes:d.costoMes||'', drv:d.costoDrv||'', wa:!!d.costoWa, voz:!!d.costoVoz}));
});
await browser.close(); server.close();

const casi=rows.filter(r=>r.costo==='sincosto').sort((a,b)=>b.idx-a.idx);
const bajo=rows.filter(r=>r.costo==='uso').sort((a,b)=>b.idx-a.idx);
const real=rows.filter(r=>r.costo==='real').sort((a,b)=>b.idx-a.idx);
const esc=s=>(''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const trow=r=>`<tr><td class="nm">${esc(r.name)}</td><td class="c n">${r.idx}</td><td class="n">${esc(r.arr)||'—'}</td><td class="n">${esc(r.mes)||'—'}</td><td class="dv">${esc(r.drv)}${r.wa?' <span class="tg">WhatsApp</span>':''}${r.voz?' <span class="tg vz">voz</span>':''}</td></tr>`;
const tbl=(arr)=>`<table><thead><tr><th>Negocio</th><th class="c">Índice</th><th>Arranque (bolsillo)</th><th>Mensual fijo</th><th>Driver de costo</th></tr></thead><tbody>${arr.map(trow).join('')}</tbody></table>`;

const CSS=`*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;margin:0;background:#fff;font-size:12px}
.pg{max-width:820px;margin:0 auto;padding:30px 30px 16px}
.brk{page-break-after:always}
.kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a07d00;font-weight:700}
h1{font-size:30px;font-style:italic;margin:8px 0 6px}
.lede{font-size:14px;color:#333;max-width:640px}
.head{background:#101216;color:#f4f4f4;border-radius:14px;padding:18px 20px;margin:18px 0 6px}
.head .t{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#f5d20c;font-weight:700;margin-bottom:8px}
.head .big{font-size:16px;font-weight:700;color:#fff;margin-bottom:8px}
.head p{margin:0;font-size:12.5px;color:#e0e0e0}
.cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:14px 0 4px}
.card{border:1px solid #e2e2e2;border-radius:11px;padding:13px 15px}
.card.casi{border-left:4px solid #1e9e56}.card.bajo{border-left:4px solid #d8b400}.card.real{border-left:4px solid #d0432f}
.card .big{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:30px}
.card.casi .big{color:#1e9e56}.card.bajo .big{color:#b08900}.card.real .big{color:#c0392b}
.card .lb{font-weight:700;font-size:12.5px;margin-top:2px}
.card .ds{font-size:11px;color:#666;margin-top:3px}
h2{font-size:16px;font-style:italic;font-weight:800;margin:8px 0 3px}
.h2sub{color:#666;font-size:11.5px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:700;border-bottom:1.5px solid #ccc}
td.nm{font-weight:650}
td.c,th.c{text-align:center}
td.n{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
td.dv{color:#555;font-size:10.5px}
.tg{font-family:ui-monospace,monospace;font-size:8.5px;background:#eef;border:1px solid #cce;border-radius:4px;padding:0 4px;color:#446}
.tg.vz{background:#fee;border-color:#ecc;color:#a44}
.note{font-size:11px;color:#666;margin-top:8px}
tr{break-inside:avoid}
.legend{font-size:11px;color:#555;margin:2px 0 10px}
.legend b{color:#111}`;

const HTML=`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<section class="pg brk">
  <div class="kick">Célula de Negocios Digitales · Análisis de costos · 6 agentes sobre las 95 fichas</div>
  <h1>Costo real de la cartera</h1>
  <div class="lede">La respuesta exacta a "¿son sin costo?" — con el criterio correcto: <b>el desarrollo y el diseño los hace la IA del estudio, así que cuestan US$0 y no se cuentan.</b> Solo costeamos lo que la IA NO puede cubrir.</div>
  <div class="head">
    <div class="t">El veredicto, con dev y diseño ya cubiertos</div>
    <div class="big">${casi.length} no cuestan nada real para arrancar.</div>
    <p>Sacando dev y diseño (gratis, los hace la IA), la mayoría se lanza con ≈US$0 de bolsillo — solo el dominio. El costo real aparece solo cuando el negocio necesita algo que la IA no reemplaza: <b>WhatsApp/servicios por uso</b> (24) o una <b>inversión de verdad</b> (14): voz, dataset, matrícula o socio.</p>
  </div>
  <div class="cards">
    <div class="card casi"><div class="big">${casi.length}</div><div class="lb">🟢 Sin costo real</div><div class="ds">Lanzar cuesta ≈US$0 (solo dominio). Opera con nuestra IA/infra, sin servicio externo pago relevante.</div></div>
    <div class="card bajo"><div class="big">${bajo.length}</div><div class="lb">🟡 Costo por uso</div><div class="ds">Sin desembolso de arranque, pero paga un servicio externo por uso (WhatsApp, imagen, scraping) con lo que factura.</div></div>
    <div class="card real"><div class="big">${real.length}</div><div class="lb">🔴 Costo real</div><div class="ds">Necesita plata que la IA no evita: voz/telefonía, dataset pago, matrícula/socio/certificador, reportes pagos.</div></div>
  </div>
  <div class="note"><b>Cómo leer las columnas:</b> "Arranque" = plata de bolsillo para lanzar, <b>excluyendo dev y diseño</b> (que son gratis). "Operativo mensual" = costo externo por mes. "Driver" = el mayor costo que la IA no cubre. Las etiquetas <span class="tg">WhatsApp</span> (pago por conversación) y <span class="tg vz">voz</span> (caro por minuto) marcan los que más pesan.</div>
</section>

<section class="pg brk">
  <div class="kick">Grupo 1 de 3</div>
  <h2>🟢 Sin costo real — ${casi.length} negocios</h2>
  <div class="h2sub">Sacando dev y diseño (los cubre la IA), lanzarlos cuesta ≈US$0: solo dominio. Operan con nuestra IA/infra. Ordenados por índice.</div>
  ${tbl(casi)}
</section>

<section class="pg brk">
  <div class="kick">Grupo 2 de 3</div>
  <h2>🟡 Costo por uso — ${bajo.length} negocios</h2>
  <div class="h2sub">Sin desembolso de arranque, pero operan con un servicio externo pago por uso (WhatsApp, generación de imagen, scraping, transcripción) que se cubre con lo facturado. Ordenados por índice.</div>
  ${tbl(bajo)}
</section>

<section class="pg">
  <div class="kick">Grupo 3 de 3</div>
  <h2>🔴 Costo real — ${real.length} negocios</h2>
  <div class="h2sub">Necesitan plata que la IA no reemplaza: voz/telefonía, dataset pago, matrícula/socio/certificador o reportes pagos. Los que requieren inversión de verdad. Ordenados por índice.</div>
  ${tbl(real)}
  <div class="note" style="margin-top:14px">Re-costeo con dev y diseño = US$0 (los cubre la IA del estudio) · análisis de 6 agentes sobre las 95 fichas · pesos al dólar oficial BNA $1.488,50 · Célula de Negocios Digitales · todo local.</div>
</section>
</body></html>`;

const b2 = await chromium.launch({ executablePath: CHROME });
const p = await b2.newPage();
await p.setContent(HTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'0', bottom:'0', left:'0', right:'0' } });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB', '·', rows.length, 'negocios');
await b2.close();
