// PDF "Kit de arranque y venta" — plantillas listas para usar de los primeros 4 negocios.
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-plantillas.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SP = '/tmp/claude-0/-home-user-ERP/4d94623a-7a97-5d75-a1ba-0f12eb1ab9b7/scratchpad';
const OUT = path.join(HERE, 'Plantillas-primeros-4.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const esc=s=>(''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const nl=s=>esc(s).replace(/\n/g,'<br>');

const kits=[0,1,2,3].map(i=>JSON.parse(fs.readFileSync(path.join(SP,'plantilla-'+i+'.json'),'utf8')));

const CSS=`*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1c;line-height:1.55;margin:0;background:#fff;font-size:12.5px}
.pg{padding:34px 40px}
.sec{page-break-before:always}
.kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a07d00;font-weight:700}
h1{font-size:34px;font-style:italic;margin:8px 0 6px;line-height:1.05}
.cover{height:1010px;display:flex;flex-direction:column;justify-content:center}
.cover .sub{font-size:15px;color:#444;max-width:640px}
.cover .list{margin-top:22px;font-size:14px}
.cover .list b{color:#111}
.cover .meta{margin-top:24px;font-family:ui-monospace,monospace;font-size:11px;color:#888;line-height:1.9}
.badge{display:inline-block;background:#101216;color:#f5d20c;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;border-radius:20px;font-weight:700}
.sh{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px}
.sh h2{font-size:24px;font-style:italic;font-weight:800;margin:0}
.sh .sub{color:#666;font-size:12px;margin-top:3px}
.blk{margin-bottom:16px;break-inside:avoid}
.blk .lb{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a07d00;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:7px}
.blk .lb .num{background:#1a1a1a;color:#fff;width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-style:italic;font-family:Georgia,serif}
.copy{background:#f6f7f9;border:1px solid #dfe3e8;border-left:3px solid #1e9e56;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#1a1a1a}
.copy .tagcopy{float:right;font-family:ui-monospace,monospace;font-size:8.5px;color:#8a9;text-transform:uppercase;letter-spacing:.08em}
.body{font-size:12.5px;color:#222}
.body.pre{white-space:normal}
.land{background:#101216;color:#f0f0f0;border-radius:10px;padding:16px 18px}
.land .h{font-size:19px;font-weight:800;font-style:italic;color:#fff;margin-bottom:6px}
.land .s{font-size:13px;color:#cfcfcf;margin-bottom:8px}
.land .cta{display:inline-block;background:#f5d20c;color:#191703;font-weight:800;font-size:13px;padding:8px 16px;border-radius:8px;margin-top:6px}`;

const LB=[['contacto_frio','Mensaje de contacto en frío','copy'],['guion_demo','Guion de la demo de 2 minutos','body'],['oferta','La oferta y el cierre','copy'],['objeciones','Manejo de objeciones','body'],['onboarding','Onboarding del primer cliente','body'],['landing','Copy de la landing','land']];

function kitHTML(k,i){
  const blocks = LB.map(([key,label,kind],bi)=>{
    const v=k[key]||''; if(!v) return '';
    let inner;
    if(kind==='copy') inner=`<div class="copy"><span class="tagcopy">para copiar</span>${nl(v)}</div>`;
    else if(kind==='land') inner=`<div class="copy"><span class="tagcopy">para la web</span>${nl(v)}</div>`;
    else inner=`<div class="body">${nl(v)}</div>`;
    return `<div class="blk"><div class="lb"><span class="num">${bi+1}</span>${label}</div>${inner}</div>`;
  }).join('');
  return `<section class="sec"><div class="pg"><div class="kick">Kit ${i+1} de ${kits.length}</div><div class="sh"><h2>${esc(k.name)}</h2><div class="sub">Plantillas listas para copiar y salir a vender.</div></div>${blocks}</div></section>`;
}

const HTML=`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<section><div class="pg cover">
  <span class="badge">Kit de arranque y venta · Ola 1</span>
  <h1>Plantillas para<br>vender los primeros 4</h1>
  <div class="sub">Todo listo para copiar, pegar y salir a la calle: el mensaje en frío, el guion de la demo, la oferta, cómo rebatir las objeciones, el onboarding y el copy de la landing.</div>
  <div class="list">${kits.map((k,i)=>`<b>${i+1}. ${esc(k.name)}</b>`).join(' &nbsp;·&nbsp; ')}</div>
  <div class="meta">Célula de Negocios Digitales · criollo, accionable · pesos al dólar oficial BNA $1.488,50<br>Reemplazá [Nombre], [barrio], [competidor] por los datos reales del cliente · 2026</div>
</div></section>
${kits.map(kitHTML).join('\n')}
</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME });
const p = await browser.newPage();
await p.setContent(HTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'12mm', bottom:'14mm', left:'0', right:'0' },
  displayHeaderFooter:true, headerTemplate:'<div></div>',
  footerTemplate:'<div style="width:100%;font-family:ui-monospace,monospace;font-size:8px;color:#999;padding:0 14mm;display:flex;justify-content:space-between"><span>Kit de arranque y venta · Célula de Negocios Digitales</span><span>Pág. <span class="pageNumber"></span></span></div>' });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB · kits:', kits.length);
await browser.close();
