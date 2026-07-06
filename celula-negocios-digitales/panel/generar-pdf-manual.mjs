// Manual de la Célula de Negocios Digitales — PDF con índice (páginas reales) y detalle.
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-manual.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'Manual-Celula-Negocios-Digitales.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const D = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-ERP/4d94623a-7a97-5d75-a1ba-0f12eb1ab9b7/scratchpad/listado.json','utf8'));
const esc=s=>(''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

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
/* portada */
.cover{height:1010px;display:flex;flex-direction:column;justify-content:center}
.cover .sub{font-size:15px;color:#444;max-width:620px}
.cover .meta{margin-top:26px;font-family:ui-monospace,monospace;font-size:11px;color:#888;line-height:1.9}
.badge{display:inline-block;background:#101216;color:#f5d20c;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;border-radius:20px;font-weight:700}
/* índice */
.toc h2{margin-bottom:14px}
.toc .row{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
.toc .row .n{font-family:ui-monospace,monospace;font-weight:700;color:#c79a00;width:26px}
.toc .row .t{flex:1;font-size:13.5px}
.toc .row .t.sub{font-size:12px;color:#555;padding-left:16px}
.toc .row .dots{flex:1;border-bottom:1px dotted #ccc;margin:0 4px;transform:translateY(-3px)}
.toc .row .p{font-family:ui-monospace,monospace;font-weight:700;color:#333}
/* bloques */
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
.pill{font-family:ui-monospace,monospace;font-size:9.5px;padding:1px 6px;border-radius:10px;white-space:nowrap}
.pill.ok{background:#e8f5ee;color:#0a7a3c}.pill.warn{background:#fdf3e6;color:#a85800}.pill.dead{background:#fbeceb;color:#b02a1f}
.cc{font-size:10px}.cc.sin{color:#1e9e56}.cc.uso{color:#b08900}.cc.real{color:#c0392b}
.note{font-size:11px;color:#666}`;

// ====== SECCIONES (numeradas). subs = entradas de subsección para el índice ======
const secciones = [
{ n:'1', t:'Qué es la Célula', subs:[],
  html:`<p class="lead">La Célula de Negocios Digitales es una <b>consultora interna de agentes de IA</b>, aislada del resto del estudio, que inventa negocios digitales para el mercado argentino, los analiza con datos reales, los desafía sin piedad y le trae al dueño solo los que sobreviven, con un plan para ejecutarlos.</p>
  <h3>Principios</h3>
  <ul>
   <li><b>Aislada:</b> no se mezcla con las demás áreas del estudio. Es una unidad experimental propia.</li>
   <li><b>Local y sin publicar:</b> todo el trabajo queda local hasta el OK explícito del dueño. Nada se publica ni cobra solo.</li>
   <li><b>Mercado argentino primero:</b> capacidad real de pago, WhatsApp, informalidad, estacionalidad, y las integraciones con entes públicos como moat.</li>
   <li><b>El dueño en la cúspide:</b> aporta visión y gatea los pasos irreversibles (publicar / cobrar dinero real).</li>
  </ul>
  <div class="tesis"><p><b>La tesis de fondo:</b> construir el software ya está resuelto — la IA lo hace rápido y casi gratis. El proyecto se gana o se pierde en lo lento y humano: prender los servicios, poder cobrar, y conseguir quién venda.</p></div>` },

{ n:'2', t:'El motor de trabajo', subs:[['2.1','El pipeline de generación'],['2.2','Los equipos (roster)']],
  html:`<p class="lead">Un sprint cíclico que corre hasta que el dueño lo frena. Cada resultado queda en el repo, no en el chat.</p>
  <h3 id="s2.1"><span class="snum">2.1</span> El pipeline de generación</h3>
  <div class="box"><p style="margin:0"><b>① Inteligencia + boletines</b> (noticias/legislación) → <b>② Creativos</b> (ángulos sin sesgo) → <b>③ Analíticos + Ingeniería de datos</b> (dimensionan y costean con fuentes) → <b>④ Marketing</b> (canal / CAC) → <b>⑤ Red-team + Desafiador</b> (matan lo que no sirve) → <b>⑥ Reportero</b> (actualiza el panel) → <b>⑦ Dueño</b> (gatea).</p></div>
  <p>El patrón que se repite: la mayoría de los negocios nacen de <b>leer una norma nueva</b> el mismo día que sale. Cuando el Estado crea una obligación, crea un mercado — y ahí entramos primero.</p>
  <h3 id="s2.2"><span class="snum">2.2</span> Los equipos</h3>
  <table><tr><th>Célula / rol</th><th>Función</th></tr>
   <tr><td>🎯 Dueño</td><td>Visión, prioridad y gates (dev / publicar / cobrar).</td></tr>
   <tr><td>🎯 PMO</td><td>Orquesta, integra y reporta; único que consolida.</td></tr>
   <tr><td>🛰️ Inteligencia de Señales</td><td>Curador + verificador + analista: noticias confiables → oportunidades.</td></tr>
   <tr><td>🎨 Banca creativa</td><td>Genera negocios sobre señales frescas, con ángulos distintos.</td></tr>
   <tr><td>📊 Analíticos + Ing. de Datos</td><td>Filtran, dimensionan (TAM/SAM/SOM) y costean con fuentes duras.</td></tr>
   <tr><td>⚔️ Red-team + Desafiador</td><td>Operador real, sin humo: deciden aptitud a producción.</td></tr>
   <tr><td>🚀 Equipo de ejecución</td><td>Con el GO: constructor, diseño/marca, cobro/fiscal, growth, operaciones.</td></tr>
  </table>` },

{ n:'3', t:'Cómo leer el panel', subs:[],
  html:`<p class="lead">El panel interactivo es la vista viva de la cartera. Estos son sus componentes.</p>
  <h3>El Índice de Factibilidad (0–100)</h3>
  <p>No mide "qué tan linda es la idea", sino qué tan cerca estamos de ejecutarla: suma <b>validación</b> + <b>producto construido</b> + <b>camino a cobrar</b> + <b>riesgo</b>. Ordena el leaderboard.</p>
  <h3>El semáforo de estado</h3>
  <ul><li>🟢 <b>A producción:</b> validado, se puede construir.</li><li>🟡 <b>En pista:</b> viable con una condición (canal, pricing, rubro).</li><li>🔴 <b>Descartado:</b> se mató antes de escribir código (competidor local, no paga, o el Estado lo regala).</li></ul>
  <h3>Ejecución por IA</h3>
  <p>🤖 <b>100% IA</b> (la construye y opera sola) · ⚙️ <b>Parcial</b> (una pieza humana removible) · 🧑 <b>Requiere humano</b> (bloqueo legal de por vida).</p>
  <h3>Costo real</h3>
  <p>🟢 <b>Sin costo real</b> · 🟡 <b>Costo por uso</b> · 🔴 <b>Costo real</b>. Dev y diseño no cuentan (los cubre la IA); solo se cuenta lo que la IA no puede cubrir. Ver Sección 5.</p>` },

{ n:'4', t:'La cartera en números', subs:[],
  html:`<p class="lead">${D.total} negocios evaluados, cada uno con investigación real, costeo en pesos y veredicto honesto.</p>
  <h3>Por cuán cerca estamos de cobrar</h3>
  <div class="grid3">
   <div class="card g"><div class="big">${D.nOk}</div><div class="lb">🟢 A producción</div><div class="ds">Validados por el red-team.</div></div>
   <div class="card y"><div class="big">${D.nWarn}</div><div class="lb">🟡 En pista</div><div class="ds">Viables con una condición.</div></div>
   <div class="card r"><div class="big">${D.nDead}</div><div class="lb">🔴 Descartados</div><div class="ds">Plata que NO gastamos.</div></div>
  </div>
  <h3>Por cuánto hace la IA sola</h3>
  <div class="grid3">
   <div class="card g"><div class="big">${D.iaFull}</div><div class="lb">🤖 100% IA</div></div>
   <div class="card y"><div class="big">${D.iaParc}</div><div class="lb">⚙️ Parcial</div></div>
   <div class="card r"><div class="big">${D.iaNo}</div><div class="lb">🧑 Requiere humano</div></div>
  </div>
  <h3>Por costo real de arranque</h3>
  <div class="grid3">
   <div class="card g"><div class="big">${D.cSin}</div><div class="lb">🟢 Sin costo real</div></div>
   <div class="card y"><div class="big">${D.cUso}</div><div class="lb">🟡 Costo por uso</div></div>
   <div class="card r"><div class="big">${D.cReal}</div><div class="lb">🔴 Costo real</div></div>
  </div>
  <p class="note">De los ${D.total}, <b>${D.dev}</b> ya tienen código funcionando (la apuesta actual). El resto es research validado, buscable en el panel.</p>` },

{ n:'5', t:'Costos — con dev y diseño ya cubiertos', subs:[],
  html:`<p class="lead">El desarrollo y el diseño los hace la IA del estudio: cuestan US$0 y no se cuentan. Solo costeamos lo que la IA NO puede cubrir.</p>
  <div class="grid3">
   <div class="card g"><div class="big">${D.cSin}</div><div class="lb">🟢 Sin costo real</div><div class="ds">Lanzar ≈US$0 (solo dominio). Opera con nuestra IA/infra.</div></div>
   <div class="card y"><div class="big">${D.cUso}</div><div class="lb">🟡 Costo por uso</div><div class="ds">Sin arranque; servicio externo por uso (WhatsApp, imagen, scraping).</div></div>
   <div class="card r"><div class="big">${D.cReal}</div><div class="lb">🔴 Costo real</div><div class="ds">Inversión que la IA no evita.</div></div>
  </div>
  <h3>Los ${D.cReal} que sí requieren inversión, y por qué</h3>
  <table><tr><th>Tipo</th><th>Negocios</th></tr>
   <tr><td><b>Voz / telefonía</b> (caro por minuto)</td><td>Recepcionista IA, Carga al Día, Confesionario</td></tr>
   <tr><td><b>Dataset pago</b></td><td>Trazabovina, Licita, Dominio Limpio, Directorio B2B, Arancel Libre (~US$1.000)</td></tr>
   <tr><td><b>Humano / legal obligatorio</b></td><td>Back-office AFIP, PrevenIA, Quien Firma, Compliance UIF, Aduana OEA Pyme</td></tr>
   <tr><td><b>Reportes pagos</b> (Nosis/Veraz/BCRA)</td><td>Puente Concursal</td></tr>
  </table>
  <div class="box"><p style="margin:0"><b>Ojo con lo variable:</b> aunque el arranque sea ≈US$0, operar consume IA por token y —en los "por uso"— WhatsApp por conversación. No es gratis para siempre: se cubre con el pricing, no se ignora.</p></div>` },

{ n:'6', t:'Cómo ejecuta la IA (de tu GO al primer peso)', subs:[],
  html:`<p class="lead">El mismo camino de 6 fases para cualquier negocio. La IA hace casi todo; el dueño aparece en el GO, en 2 gates y en el canal.</p>
  <div class="ph"><div class="ph-n">0</div><div class="ph-b"><b>GO del dueño.</b> Elegís el negocio y el objetivo (ej. 5 clientes en 60 días).</div></div>
  <div class="ph"><div class="ph-n">1</div><div class="ph-b"><b>Producto funcionando.</b> La IA construye y prueba de punta a punta. <span class="g">Gate: publicar = OK del dueño.</span></div></div>
  <div class="ph"><div class="ph-n">2</div><div class="ph-b"><b>Marca + página de venta.</b> Nombre, identidad y landing que convierte.</div></div>
  <div class="ph"><div class="ph-n">3</div><div class="ph-b"><b>Poder cobrar.</b> Alta fiscal (CUIT, Factura E, ARCA) + pasarela + un pago real. <span class="g">Gate: cobrar = OK del dueño.</span></div></div>
  <div class="ph"><div class="ph-n">4</div><div class="ph-b"><b>Lanzamiento y primer cliente.</b> El canal — lo único que depende del dueño.</div></div>
  <div class="ph"><div class="ph-n">5</div><div class="ph-b"><b>Operar y sostener.</b> Onboarding, soporte, retención, reporte mensual.</div></div>
  <p class="note">Se dispara diciendo <b>"GO [negocio]"</b>. Nada irreversible (publicar / cobrar) se hace sin tu OK.</p>` },

{ n:'7', t:'Roadmap por olas', subs:[],
  html:`<p class="lead">El ritmo lo marca cuántos canales firmamos y cuántos productos podemos sostener vivos, no el código. Ninguno se enciende sin un canal firmado.</p>
  <table><tr><th>Fase</th><th>Cuándo</th><th>Qué</th></tr>
   <tr><td><b>0 · Motor interno</b></td><td>una vez</td><td>Base común (login, cobro, WhatsApp, panel, plantillas) que abarata cada lanzamiento siguiente.</td></tr>
   <tr><td><b>Ola 1</b></td><td>mes 1–2</td><td>Los 4 que ya tienen código (Kudos, Testigo, Fantasma, Plantillería): primer peso real.</td></tr>
   <tr><td><b>Ola 2</b></td><td>mes 3–4</td><td>Los 7 más firmes (índice ≥ 48), con un canal por vertical.</td></tr>
   <tr><td><b>Ola 3</b></td><td>mes 5+</td><td>El resto de las accionables, en tandas ancladas a canal.</td></tr>
  </table>
  <p>Cada ola avanza solo si la anterior consiguió tracción, con criterios de éxito y de corte para no quemar meses en productos que no pagan.</p>` },

{ n:'8', t:'Aprendizajes clave', subs:[],
  html:`<p class="lead">La memoria de la célula — errores pagados con análisis reales, para no repetirlos.</p>
  <ul>
   <li><b>Validar competencia local antes de entusiasmarse.</b> El "hueco en español" hay que probarlo — mató varios negocios con competidor argentino ya instalado.</li>
   <li><b>El costo real no es construir, es distribuir.</b> El mercado casi nunca es el cuello; conseguir el primer cliente sí.</li>
   <li><b>El Estado como competidor.</b> Si la norma digitaliza un trámite, el organismo suele darlo gratis (mató a varios). Preguntar siempre "¿el Estado puede regalar esto?".</li>
   <li><b>Lo conversacional/voz se cobra por uso, nunca plano</b> — la voz cuesta 15–30× el texto.</li>
   <li><b>La integración con un ente público es el mejor moat</b> — cuando tu formato es "el que el inspector espera", el cliente no se va.</li>
   <li><b>Riesgo de cartera:</b> monocultivo regulatorio en un gobierno desregulador. Preferir drivers de plata (recupero dinero) sobre drivers de multa.</li>
  </ul>` },

{ n:'9', t:'Glosario', subs:[],
  html:`<dl class="gl">
   <dt>Canal</dt><dd>La vía concreta por la que llegan clientes que pagan (un socio, una cámara, un estudio contable, publicidad).</dd>
   <dt>Motor interno</dt><dd>Base de software común que se construye una vez y usan todos los productos.</dd>
   <dt>Gate</dt><dd>Punto donde el trabajo se frena y espera el OK del dueño. Hay dos: publicar y cobrar.</dd>
   <dt>Índice de factibilidad</dt><dd>0–100: qué tan listo está un negocio para ejecutarse.</dd>
   <dt>White-label</dt><dd>El producto sale con la marca del socio, no la nuestra; nosotros lo operamos por detrás.</dd>
   <dt>Revshare</dt><dd>El socio se lleva un % de lo cobrado por traer los clientes.</dd>
   <dt>TAM / SAM / SOM</dt><dd>Tamaño del mercado total / servible / alcanzable.</dd>
   <dt>Churn</dt><dd>La tasa de bajas mensual de clientes.</dd>
  </dl>` },

{ n:'A', t:'Apéndice — Índice de los 95 negocios', subs:[],
  html:`<p class="lead">Todos los negocios de la cartera, ordenados por índice de factibilidad. Estado, ejecución por IA y costo real.</p>
  <table class="appt"><tr><th>#</th><th>Negocio</th><th class="c n">Índice</th><th>Estado</th><th>IA</th><th>Costo</th></tr>
  ${D.list.map((r,i)=>{const est=r.prod==='ok'?'<span class="pill ok">Producción</span>':r.prod==='warn'?'<span class="pill warn">En pista</span>':'<span class="pill dead">Descartado</span>';
   const ia=r.ia==='full'?'🤖':r.ia==='parcial'?'⚙️':r.ia==='no'?'🧑':'';
   const co=r.costo==='sincosto'?'<span class="cc sin">🟢 s/costo</span>':r.costo==='uso'?'<span class="cc uso">🟡 por uso</span>':r.costo==='real'?'<span class="cc real">🔴 real</span>':'';
   return `<tr><td class="n">${i+1}</td><td class="nm">${esc(r.n)}</td><td class="c n">${r.idx}</td><td>${est}</td><td>${ia}</td><td>${co}</td></tr>`;}).join('')}
  </table>` },
];

// ====== construir HTML de secciones (para medir) ======
function secHTML(s){
  return `<section class="sec" id="sec${s.n}"><div class="pg"><div class="kick">${s.n==='A'?'Apéndice':'Sección '+s.n}</div><h2><span class="snum">${s.n}.</span> ${esc(s.t)}</h2>${s.html}</div></section>`;
}
const bodyHTML = secciones.map(secHTML).join('\n');

const browser = await chromium.launch({ executablePath: CHROME });

// ---- PASO 1: medir alturas para calcular páginas del índice ----
const mp = await browser.newPage({ viewport:{ width:794, height:1123 } });
await mp.emulateMedia({ media:'print' });
await mp.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${bodyHTML}`, { waitUntil:'load' });
const usable = 1123 - 40 - 55; // A4px - margen top/bottom aprox
const heights = await mp.$$eval('.sec', els=>els.map(e=>e.getBoundingClientRect().height));
await mp.close();
const pagesPer = heights.map(h=>Math.max(1, Math.ceil(h/usable)));
// cover=1, índice=2 (asumimos 2 pág para el TOC con subsecciones) -> secciones arrancan en pág 3
const TOCPAGES = 1;
let start = 1 /*cover*/ + TOCPAGES + 1; // primera sección
const startPages = [];
pagesPer.forEach((p,i)=>{ startPages[i]=start; start+=p; });

// ---- PASO 2: TOC con páginas reales ----
const tocRows = secciones.map((s,i)=>{
  let rows = `<div class="row"><span class="n">${s.n}</span><span class="t">${esc(s.t)}</span><span class="dots"></span><span class="p">${startPages[i]}</span></div>`;
  (s.subs||[]).forEach(([sn,st])=>{ rows += `<div class="row"><span class="n"></span><span class="t sub">${sn} · ${esc(st)}</span><span class="dots"></span><span class="p">${startPages[i]}</span></div>`; });
  return rows;
}).join('');

const coverHTML = `<section class="sec" style="page-break-before:avoid"><div class="pg cover">
  <span class="badge">Manual operativo · v1</span>
  <h1>Célula de<br>Negocios Digitales</h1>
  <div class="sub">Cómo funciona la consultora interna de agentes que inventa, analiza y ejecuta negocios digitales para Argentina — y todo lo que hay hoy en la cartera.</div>
  <div class="meta">${D.total} negocios evaluados · ${D.nOk} a producción · ${D.dev} en desarrollo<br>Dev y diseño cubiertos por IA · pesos al dólar oficial BNA $1.488,50<br>Todo local · sin publicar hasta el OK del dueño · 2026</div>
</div></section>`;
const tocHTML = `<section class="sec toc"><div class="pg"><div class="kick">Contenido</div><h2>Índice</h2>${tocRows}</div></section>`;

const finalHTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${coverHTML}${tocHTML}${bodyHTML}</body></html>`;

const p = await browser.newPage();
await p.setContent(finalHTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'10mm', bottom:'14mm', left:'0', right:'0' },
  displayHeaderFooter:true,
  headerTemplate:'<div></div>',
  footerTemplate:'<div style="width:100%;font-family:ui-monospace,monospace;font-size:8px;color:#999;padding:0 14mm;display:flex;justify-content:space-between"><span>Manual · Célula de Negocios Digitales</span><span>Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB');
console.log('páginas por sección:', JSON.stringify(secciones.map((s,i)=>s.n+':p'+startPages[i]+'('+pagesPer[i]+')')));
await browser.close();
