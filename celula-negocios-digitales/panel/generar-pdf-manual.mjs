// Manual de la Célula de Negocios Digitales — PDF con índice (páginas reales), detalle y
// APÉNDICE EXTENDIDO con la ficha completa de cada negocio.
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-manual.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'Manual-Celula-Negocios-Digitales.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const esc=s=>(''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

// ---- cargar panel y extraer agregados + fichas completas ----
const html = fs.readFileSync(path.join(HERE,'panel.html'));
const server = http.createServer((q,r)=>{ r.writeHead(200,{'content-type':'text/html; charset=utf-8'}); r.end(html); });
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: CHROME });
const page0 = await browser.newPage();
await page0.goto(`http://127.0.0.1:${port}/`, { waitUntil:'load' });
const { D, fichas } = await page0.evaluate(()=>{
  const s=(typeof RANKED!=='undefined'&&RANKED.length)?RANKED:DATA;
  const D={ total:s.length, nOk:s.filter(x=>x.prod==='ok').length, nWarn:s.filter(x=>x.prod==='warn').length, nDead:s.filter(x=>x.prod==='dead').length,
    iaFull:s.filter(x=>x.ia==='full').length, iaParc:s.filter(x=>x.ia==='parcial').length, iaNo:s.filter(x=>x.ia==='no').length,
    cSin:s.filter(x=>x.costo==='sincosto').length, cUso:s.filter(x=>x.costo==='uso').length, cReal:s.filter(x=>x.costo==='real').length,
    dev:s.filter(x=>x.cat==='dev').length,
    list:s.map(x=>({n:x.name,idx:x.idx,prod:x.prod,ia:x.ia||'',costo:x.costo||''})) };
  const fichas=[];
  for(const d of s){ try{ open(d.name); fichas.push({ name:document.getElementById('dwn').textContent, tag:document.getElementById('dwt').textContent, verdict:document.getElementById('dwr').innerHTML, body:document.getElementById('dwb').innerHTML, idx:d.idx, prod:d.prod }); }catch(e){ fichas.push({name:d.name,tag:'',verdict:'',body:'<p>(error)</p>',idx:d.idx,prod:d.prod}); } }
  return { D, fichas };
});
await page0.close();

const CSS=`*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1c;line-height:1.6;margin:0;background:#fff;font-size:12.5px}
.pg{padding:34px 40px}
.sec{page-break-before:always}
.kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a07d00;font-weight:700}
h1{font-size:34px;font-style:italic;margin:8px 0 6px;line-height:1.05}
h2{font-size:21px;font-style:italic;font-weight:800;margin:0 0 3px}
h3{font-size:14px;font-weight:750;margin:16px 0 5px;color:#111}
.snum{font-family:Georgia,serif;font-style:italic;font-weight:800;color:#c79a00}
p{margin:0 0 10px}b{color:#111}
ul{margin:0 0 10px;padding-left:18px}li{margin-bottom:5px}
.lead{font-size:13.5px;color:#333;margin-bottom:14px}
.cover{height:1010px;display:flex;flex-direction:column;justify-content:center}
.cover .sub{font-size:15px;color:#444;max-width:620px}
.cover .meta{margin-top:26px;font-family:ui-monospace,monospace;font-size:11px;color:#888;line-height:1.9}
.badge{display:inline-block;background:#101216;color:#f5d20c;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;border-radius:20px;font-weight:700}
.toc h2{margin-bottom:14px}
.toc .row{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
.toc .row .n{font-family:ui-monospace,monospace;font-weight:700;color:#c79a00;width:26px}
.toc .row .t{font-size:13.5px}
.toc .row .t.sub{font-size:12px;color:#555;padding-left:16px}
.toc .row .dots{flex:1;border-bottom:1px dotted #ccc;margin:0 4px;transform:translateY(-3px)}
.toc .row .p{font-family:ui-monospace,monospace;font-weight:700;color:#333}
.box{border:1px solid #e2e2e2;border-left:3px solid #d8b400;border-radius:10px;padding:13px 16px;margin:10px 0;background:#fcfcfc}
.tesis{border-left:4px solid #d8b400;background:#fbf6d8;border-radius:0 10px 10px 0;padding:13px 17px;margin:10px 0}
.tesis p{margin:0;color:#4a3d00;font-size:13px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:8px 0}
.card{border:1px solid #e2e2e2;border-radius:10px;padding:12px 14px}
.card .big{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:26px}
.card .lb{font-weight:700;font-size:12px;margin-top:2px}.card .ds{font-size:10.5px;color:#666;margin-top:3px}
.card.g{border-left:4px solid #1e9e56}.card.g .big{color:#1e9e56}
.card.y{border-left:4px solid #d8b400}.card.y .big{color:#b08900}
.card.r{border-left:4px solid #d0432f}.card.r .big{color:#c0392b}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin:6px 0}
th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #eee;vertical-align:top}
th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:700;border-bottom:1.5px solid #ccc}
td.n,th.n{font-family:ui-monospace,monospace}
td.c,th.c{text-align:center}
.ph{display:grid;grid-template-columns:32px 1fr;gap:11px;margin-bottom:8px}
.ph-n{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:20px;color:#fff;background:#1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;height:30px}
.ph-b{border:1px solid #e2e2e2;border-radius:9px;padding:8px 12px}
.ph-b b{font-size:12.5px}.ph-b .g{color:#8a5200;font-family:ui-monospace,monospace;font-size:10px}
.gl dt{font-weight:750;color:#111;font-size:12.5px}.gl dd{margin:0 0 8px;color:#444;font-size:12px}
.appt td.nm{font-weight:650}
.spill{font-family:ui-monospace,monospace;font-size:9.5px;padding:1px 6px;border-radius:10px;white-space:nowrap}
.spill.ok{background:#e8f5ee;color:#0a7a3c}.spill.warn{background:#fdf3e6;color:#a85800}.spill.dead{background:#fbeceb;color:#b02a1f}
.cc{font-size:10px}.cc.sin{color:#1e9e56}.cc.uso{color:#b08900}.cc.real{color:#c0392b}
.note{font-size:11px;color:#666}
/* ===== FICHAS (apéndice extendido), namespaced ===== */
.ficha{page-break-before:always;padding:28px 40px}
.ficha .fbrand{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#999;margin-bottom:8px}
.ficha .fhead{border-bottom:2px solid #111;padding-bottom:11px;margin-bottom:14px}
.ficha .fn{font-size:22px;font-style:italic;font-weight:800;margin:0 0 4px}
.ficha .ftag{color:#555;font-size:12.5px}
.ficha .frw{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap}
.ficha .db>*{margin-bottom:12px}
.ficha .idxbig{background:#f3f4f6;border:1px solid #bbb;border-radius:12px;padding:13px 16px}
.ficha .idxbig .ib-top{display:flex;justify-content:space-between;align-items:baseline}
.ficha .idxbig .ib-n{font-size:38px;font-weight:900;font-style:italic;line-height:.9}
.ficha .idxbig .ib-l{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;text-align:right}
.ficha .idxbig .ib-bar{height:9px;background:#ddd;border-radius:5px;margin:10px 0 8px;overflow:hidden}
.ficha .idxbig .ib-bar i{display:block;height:100%;background:#111}
.ficha .idxbig .ib-why{font-size:12px;color:#333}
.ficha .ds .dl,.ficha .hero-box .dl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin-bottom:5px;font-weight:700}
.ficha .ds p,.ficha .hero-box p{margin:0;font-size:12.5px;color:#1a1a1a}
.ficha .hero-box{background:#fbf6d8;border:1px solid #d8c766;border-radius:10px;padding:11px 14px}
.ficha .hero-box .dl{color:#8a7400}
.ficha .dstats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#ccc;border:1px solid #ccc;border-radius:10px;overflow:hidden}
.ficha .dstats .s{background:#fff;padding:8px 11px}
.ficha .dstats .s .k{font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:#666}
.ficha .dstats .s .v{font-size:12.5px;font-weight:700;margin-top:2px;font-family:ui-monospace,monospace}
.ficha .dstats .s .v.good{color:#0a7a3c}
.ficha .pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:6px;border:1px solid #bbb;white-space:nowrap}
.ficha .pill .pd{width:7px;height:7px;border-radius:50%;background:currentColor}
.ficha .pill.ok{color:#0a7a3c}.ficha .pill.warn{color:#a85800}.ficha .pill.dead{color:#b02a1f}
.ficha .vrow{display:flex;gap:7px;flex-wrap:wrap}
.ficha .path{display:flex;flex-direction:column;gap:6px}
.ficha .path .pi{display:grid;grid-template-columns:20px 1fr;gap:9px;font-size:12px}
.ficha .path .pi .pn{font-weight:700;color:#111;font-size:11px}
.ficha .idxbig,.ficha .ds,.ficha .hero-box,.ficha .dstats,.ficha .pill,.ficha .path .pi{break-inside:avoid}`;

// ====== SECCIONES 1-9 ======
const secciones = [
{ n:'1', t:'Qué es la Célula', subs:[],
  html:`<p class="lead">La Célula de Negocios Digitales es una <b>consultora interna de agentes de IA</b>, aislada del resto del estudio, que inventa negocios digitales para el mercado argentino, los analiza con datos reales, los desafía sin piedad y le trae al dueño solo los que sobreviven, con un plan para ejecutarlos.</p>
  <h3>Principios</h3><ul>
   <li><b>Aislada:</b> no se mezcla con las demás áreas del estudio.</li>
   <li><b>Local y sin publicar:</b> todo queda local hasta el OK del dueño.</li>
   <li><b>Mercado argentino primero:</b> capacidad real de pago, WhatsApp, informalidad, integraciones con entes públicos como moat.</li>
   <li><b>El dueño en la cúspide:</b> aporta visión y gatea lo irreversible (publicar / cobrar).</li></ul>
  <div class="tesis"><p><b>La tesis de fondo:</b> construir el software ya está resuelto — la IA lo hace rápido y casi gratis. El proyecto se gana o se pierde en lo lento y humano: prender los servicios, poder cobrar, y conseguir quién venda.</p></div>` },
{ n:'2', t:'El motor de trabajo', subs:[['2.1','El pipeline de generación'],['2.2','Los equipos (roster)']],
  html:`<p class="lead">Un sprint cíclico que corre hasta que el dueño lo frena. Cada resultado queda en el repo, no en el chat.</p>
  <h3><span class="snum">2.1</span> El pipeline de generación</h3>
  <div class="box"><p style="margin:0"><b>① Inteligencia + boletines</b> → <b>② Creativos</b> → <b>③ Analíticos + Ing. de datos</b> → <b>④ Marketing</b> (canal/CAC) → <b>⑤ Red-team + Desafiador</b> → <b>⑥ Reportero</b> → <b>⑦ Dueño</b> (gatea).</p></div>
  <p>El patrón que se repite: la mayoría de los negocios nacen de <b>leer una norma nueva</b> el mismo día que sale. Cuando el Estado crea una obligación, crea un mercado — y ahí entramos primero.</p>
  <h3><span class="snum">2.2</span> Los equipos</h3>
  <table><tr><th>Célula / rol</th><th>Función</th></tr>
   <tr><td>🎯 Dueño</td><td>Visión, prioridad y gates.</td></tr>
   <tr><td>🎯 PMO</td><td>Orquesta, integra y reporta.</td></tr>
   <tr><td>🛰️ Inteligencia de Señales</td><td>Noticias confiables → oportunidades.</td></tr>
   <tr><td>🎨 Banca creativa</td><td>Genera negocios sobre señales frescas.</td></tr>
   <tr><td>📊 Analíticos + Ing. de Datos</td><td>Dimensionan y costean con fuentes duras.</td></tr>
   <tr><td>⚔️ Red-team + Desafiador</td><td>Deciden aptitud a producción.</td></tr>
   <tr><td>🚀 Equipo de ejecución</td><td>Con el GO: construye, marca, cobro, growth, ops.</td></tr></table>` },
{ n:'3', t:'Cómo leer el panel', subs:[],
  html:`<p class="lead">El panel interactivo es la vista viva de la cartera. Estos son sus componentes.</p>
  <h3>Índice de Factibilidad (0–100)</h3><p>Qué tan cerca estamos de ejecutarlo: <b>validación + producto + camino a cobrar + riesgo</b>. Ordena el leaderboard.</p>
  <h3>Semáforo de estado</h3><ul><li>🟢 <b>A producción</b> · validado.</li><li>🟡 <b>En pista</b> · viable con una condición.</li><li>🔴 <b>Descartado</b> · se mató antes de escribir código.</li></ul>
  <h3>Ejecución por IA</h3><p>🤖 <b>100% IA</b> · ⚙️ <b>Parcial</b> · 🧑 <b>Requiere humano</b>.</p>
  <h3>Costo real</h3><p>🟢 <b>Sin costo real</b> · 🟡 <b>Costo por uso</b> · 🔴 <b>Costo real</b>. Dev y diseño no cuentan (los cubre la IA). Ver Sección 5.</p>` },
{ n:'4', t:'La cartera en números', subs:[],
  html:`<p class="lead">${D.total} negocios evaluados, cada uno con investigación real, costeo en pesos y veredicto honesto.</p>
  <h3>Por cuán cerca estamos de cobrar</h3><div class="grid3">
   <div class="card g"><div class="big">${D.nOk}</div><div class="lb">🟢 A producción</div></div>
   <div class="card y"><div class="big">${D.nWarn}</div><div class="lb">🟡 En pista</div></div>
   <div class="card r"><div class="big">${D.nDead}</div><div class="lb">🔴 Descartados</div><div class="ds">Plata que NO gastamos.</div></div></div>
  <h3>Por cuánto hace la IA sola</h3><div class="grid3">
   <div class="card g"><div class="big">${D.iaFull}</div><div class="lb">🤖 100% IA</div></div>
   <div class="card y"><div class="big">${D.iaParc}</div><div class="lb">⚙️ Parcial</div></div>
   <div class="card r"><div class="big">${D.iaNo}</div><div class="lb">🧑 Requiere humano</div></div></div>
  <h3>Por costo real de arranque</h3><div class="grid3">
   <div class="card g"><div class="big">${D.cSin}</div><div class="lb">🟢 Sin costo real</div></div>
   <div class="card y"><div class="big">${D.cUso}</div><div class="lb">🟡 Costo por uso</div></div>
   <div class="card r"><div class="big">${D.cReal}</div><div class="lb">🔴 Costo real</div></div></div>
  <p class="note">De los ${D.total}, <b>${D.dev}</b> ya tienen código funcionando. El resto es research validado.</p>` },
{ n:'5', t:'Costos — con dev y diseño ya cubiertos', subs:[],
  html:`<p class="lead">El desarrollo y el diseño los hace la IA del estudio: cuestan US$0 y no se cuentan. Solo costeamos lo que la IA NO puede cubrir.</p>
  <div class="grid3">
   <div class="card g"><div class="big">${D.cSin}</div><div class="lb">🟢 Sin costo real</div><div class="ds">Lanzar ≈US$0 (solo dominio).</div></div>
   <div class="card y"><div class="big">${D.cUso}</div><div class="lb">🟡 Costo por uso</div><div class="ds">Servicio externo por uso (WhatsApp, imagen, scraping).</div></div>
   <div class="card r"><div class="big">${D.cReal}</div><div class="lb">🔴 Costo real</div><div class="ds">Inversión que la IA no evita.</div></div></div>
  <h3>Los ${D.cReal} que sí requieren inversión</h3>
  <table><tr><th>Tipo</th><th>Negocios</th></tr>
   <tr><td><b>Voz / telefonía</b></td><td>Recepcionista IA, Carga al Día, Confesionario</td></tr>
   <tr><td><b>Dataset pago</b></td><td>Trazabovina, Licita, Dominio Limpio, Directorio B2B, Arancel Libre</td></tr>
   <tr><td><b>Humano / legal</b></td><td>Back-office AFIP, PrevenIA, Quien Firma, Compliance UIF, Aduana OEA</td></tr>
   <tr><td><b>Reportes pagos</b></td><td>Puente Concursal</td></tr></table>
  <div class="box"><p style="margin:0"><b>Ojo con lo variable:</b> aunque el arranque sea ≈US$0, operar consume IA por token y WhatsApp por conversación. Se cubre con el pricing, no se ignora.</p></div>` },
{ n:'6', t:'Cómo ejecuta la IA (de tu GO al primer peso)', subs:[],
  html:`<p class="lead">El mismo camino de 6 fases para cualquier negocio. La IA hace casi todo; el dueño aparece en el GO, en 2 gates y en el canal.</p>
  <div class="ph"><div class="ph-n">0</div><div class="ph-b"><b>GO del dueño.</b> Elegís el negocio y el objetivo.</div></div>
  <div class="ph"><div class="ph-n">1</div><div class="ph-b"><b>Producto funcionando.</b> La IA construye y prueba. <span class="g">Gate: publicar = OK.</span></div></div>
  <div class="ph"><div class="ph-n">2</div><div class="ph-b"><b>Marca + página de venta.</b></div></div>
  <div class="ph"><div class="ph-n">3</div><div class="ph-b"><b>Poder cobrar.</b> Alta fiscal + pasarela + pago real. <span class="g">Gate: cobrar = OK.</span></div></div>
  <div class="ph"><div class="ph-n">4</div><div class="ph-b"><b>Lanzamiento y primer cliente.</b> El canal — lo único del dueño.</div></div>
  <div class="ph"><div class="ph-n">5</div><div class="ph-b"><b>Operar y sostener.</b></div></div>
  <p class="note">Se dispara diciendo <b>"GO [negocio]"</b>. Nada irreversible se hace sin tu OK.</p>` },
{ n:'7', t:'Roadmap por olas', subs:[],
  html:`<p class="lead">El ritmo lo marca cuántos canales firmamos y cuántos productos podemos sostener vivos, no el código.</p>
  <table><tr><th>Fase</th><th>Cuándo</th><th>Qué</th></tr>
   <tr><td><b>0 · Motor interno</b></td><td>una vez</td><td>Base común que abarata cada lanzamiento.</td></tr>
   <tr><td><b>Ola 1</b></td><td>mes 1–2</td><td>Los 4 con código: Kudos, Testigo, Fantasma, Plantillería.</td></tr>
   <tr><td><b>Ola 2</b></td><td>mes 3–4</td><td>Los 7 más firmes (índice ≥ 48).</td></tr>
   <tr><td><b>Ola 3</b></td><td>mes 5+</td><td>El resto, en tandas ancladas a canal.</td></tr></table>
  <p>Cada ola avanza solo si la anterior consiguió tracción, con criterios de éxito y de corte.</p>` },
{ n:'8', t:'Aprendizajes clave', subs:[],
  html:`<p class="lead">La memoria de la célula — errores pagados con análisis reales.</p><ul>
   <li><b>Validar competencia local antes de entusiasmarse.</b></li>
   <li><b>El costo real no es construir, es distribuir.</b></li>
   <li><b>El Estado como competidor:</b> si la norma digitaliza, el organismo suele darlo gratis.</li>
   <li><b>Lo conversacional/voz se cobra por uso, nunca plano.</b></li>
   <li><b>La integración con un ente público es el mejor moat.</b></li>
   <li><b>Riesgo de cartera:</b> monocultivo regulatorio en un gobierno desregulador.</li></ul>` },
{ n:'9', t:'Glosario', subs:[],
  html:`<dl class="gl">
   <dt>Canal</dt><dd>La vía concreta por la que llegan clientes que pagan.</dd>
   <dt>Motor interno</dt><dd>Base de software común que se construye una vez.</dd>
   <dt>Gate</dt><dd>Punto donde el trabajo espera el OK del dueño (publicar / cobrar).</dd>
   <dt>Índice de factibilidad</dt><dd>0–100: qué tan listo está un negocio.</dd>
   <dt>White-label</dt><dd>El producto sale con la marca del socio; lo operamos por detrás.</dd>
   <dt>Revshare</dt><dd>El socio se lleva un % por traer los clientes.</dd>
   <dt>TAM / SAM / SOM</dt><dd>Mercado total / servible / alcanzable.</dd>
   <dt>Churn</dt><dd>La tasa de bajas mensual de clientes.</dd></dl>` },
];

function secHTML(s){ return `<section class="sec"><div class="pg"><div class="kick">Sección ${s.n}</div><h2><span class="snum">${s.n}.</span> ${esc(s.t)}</h2>${s.html}</div></section>`; }
const seccionesHTML = secciones.map(secHTML).join('\n');

// ---- Apéndice B: fichas completas ----
const fichaHTML = (f,i,page)=>`<section class="ficha"><div class="fbrand">Apéndice B · Ficha ${i+1} de ${fichas.length}${page?' · pág. '+page:''}</div><div class="fhead"><div class="fn">${esc(f.name)}</div><div class="ftag">${esc(f.tag)}</div><div class="frw">${f.verdict}</div></div><div class="db">${f.body}</div></section>`;
const fichasHTMLplain = fichas.map((f,i)=>fichaHTML(f,i,0)).join('\n');

// ---- Apéndice A: índice de negocios (con columna de página, se completa luego) ----
function appAHTML(pagesByName){
  const rows = D.list.map((r,i)=>{
    const est=r.prod==='ok'?'<span class="spill ok">Producción</span>':r.prod==='warn'?'<span class="spill warn">En pista</span>':'<span class="spill dead">Descartado</span>';
    const ia=r.ia==='full'?'🤖':r.ia==='parcial'?'⚙️':r.ia==='no'?'🧑':'';
    const co=r.costo==='sincosto'?'<span class="cc sin">🟢</span>':r.costo==='uso'?'<span class="cc uso">🟡</span>':r.costo==='real'?'<span class="cc real">🔴</span>':'';
    const pg=pagesByName?(pagesByName[r.n]||''):'000';
    return `<tr><td class="n">${i+1}</td><td class="nm">${esc(r.n)}</td><td class="c n">${r.idx}</td><td>${est}</td><td class="c">${ia}</td><td class="c">${co}</td><td class="c n">${pg}</td></tr>`;
  }).join('');
  return `<section class="sec"><div class="pg"><div class="kick">Apéndice A</div><h2><span class="snum">A.</span> Índice de negocios</h2><p class="lead">Los ${D.total} negocios ordenados por índice. La última columna es la página de su ficha completa (Apéndice B).</p><table class="appt"><tr><th>#</th><th>Negocio</th><th class="c n">Índ.</th><th>Estado</th><th class="c">IA</th><th class="c">Costo</th><th class="c">Pág.</th></tr>${rows}</table></div></section>`;
}
const appBIntro = `<section class="sec"><div class="pg"><div class="kick">Apéndice B</div><h2><span class="snum">B.</span> Fichas completas</h2><p class="lead">La ficha detallada de cada uno de los ${D.total} negocios: índice, ejecución por IA, qué es, ejemplo de operación, números en pesos, costo real, retorno estimado, riesgos y camino de ejecución. Ordenadas por índice de factibilidad.</p></div></section>`;

// ====== PASO 1: medir alturas (secciones + appA + appBintro + fichas) ======
const usable = 1123 - 40 - 55;
const measureHTML = seccionesHTML + appAHTML(null) + appBIntro + fichasHTMLplain;
const mp = await browser.newPage({ viewport:{ width:794, height:1123 } });
await mp.emulateMedia({ media:'print' });
await mp.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${measureHTML}`, { waitUntil:'load' });
const heights = await mp.$$eval('.sec, .ficha', els=>els.map(e=>e.getBoundingClientRect().height));
await mp.close();
const pagesPer = heights.map(h=>Math.max(1, Math.ceil(h/usable)));
// orden de bloques medidos: [9 secciones][appA][appBintro][95 fichas]
const nSec=secciones.length;
const TOCPAGES=1;
let cursor = 1 /*cover*/ + TOCPAGES + 1; // primera sección empieza acá
const startPages=[];
pagesPer.forEach((p,i)=>{ startPages[i]=cursor; cursor+=p; });
const secStart = startPages.slice(0,nSec);
const appAStart = startPages[nSec];
const appBIntroStart = startPages[nSec+1];
const fichaStarts = startPages.slice(nSec+2);
const pagesByName={}; fichas.forEach((f,i)=>{ pagesByName[f.name]=fichaStarts[i]; });

// ====== PASO 2: TOC ======
const tocEntries = [
  ...secciones.map((s,i)=>({n:s.n,t:s.t,p:secStart[i],subs:s.subs})),
  {n:'A',t:'Apéndice — Índice de negocios',p:appAStart,subs:[]},
  {n:'B',t:'Apéndice — Fichas completas',p:appBIntroStart,subs:[]},
];
const tocRows = tocEntries.map(e=>{
  let rows=`<div class="row"><span class="n">${e.n}</span><span class="t">${esc(e.t)}</span><span class="dots"></span><span class="p">${e.p}</span></div>`;
  (e.subs||[]).forEach(([sn,st])=>{ rows+=`<div class="row"><span class="n"></span><span class="t sub">${sn} · ${esc(st)}</span><span class="dots"></span><span class="p">${e.p}</span></div>`; });
  return rows;
}).join('');

const coverHTML=`<section style="page-break-after:always"><div class="pg cover">
  <span class="badge">Manual operativo · v2</span>
  <h1>Célula de<br>Negocios Digitales</h1>
  <div class="sub">Cómo funciona la consultora interna de agentes que inventa, analiza y ejecuta negocios digitales para Argentina — con la ficha completa de cada uno.</div>
  <div class="meta">${D.total} negocios evaluados · ${D.nOk} a producción · ${D.dev} en desarrollo<br>Dev y diseño cubiertos por IA · pesos al dólar oficial BNA $1.488,50<br>Todo local · sin publicar hasta el OK del dueño · 2026</div>
</div></section>`;
const tocHTML=`<section class="sec toc"><div class="pg"><div class="kick">Contenido</div><h2>Índice</h2>${tocRows}</div></section>`;
const fichasHTMLfinal = fichas.map((f,i)=>fichaHTML(f,i,fichaStarts[i])).join('\n');

const finalHTML=`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${coverHTML}${tocHTML}${seccionesHTML}${appAHTML(pagesByName)}${appBIntro}${fichasHTMLfinal}</body></html>`;

const p = await browser.newPage();
await p.setContent(finalHTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'10mm', bottom:'14mm', left:'0', right:'0' },
  displayHeaderFooter:true, headerTemplate:'<div></div>',
  footerTemplate:'<div style="width:100%;font-family:ui-monospace,monospace;font-size:8px;color:#999;padding:0 14mm;display:flex;justify-content:space-between"><span>Manual · Célula de Negocios Digitales</span><span>Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB · fichas:', fichas.length);
await browser.close(); server.close();
