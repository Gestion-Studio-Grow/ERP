// Genera el PDF ejecutivo: "De la idea a la ganancia" — paso a paso de la IA + roadmap para poner en vivo las gratis.
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-playbook.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'Playbook-y-Roadmap-ejecutivo.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// ---- datos de olas (extraídos del panel: sin costo + 100% IA + no descartado) ----
const OLA1 = [['Kudos',86],['Testigo',84],['Fantasma',78],['Plantillería',74]];
const OLA2 = [['Recepcionista IA',62],['Calificación de leads',57],['Postora',54],['El Data Semanal',52],['Comparador con afiliados',50],['Trazabovina',48],['Disputa Ganada',48]];
const OLA3 = [['Mapa del Barrio',46],['Licita',46],['APOC Guard',46],['Grano en Regla',46],['Club en Regla',46],['Vigía de Marca',46],['Martillo Digital',46],['Escriba',46],['ObraLibre',45],['Cooperativa al Día',45],['Directorio B2B',44],['Buzón ARCA',44],['Siniestro Claro',44],['Anfitrión en Regla',44],['PAS al Día',43],['Colmena en Regla',42],['Costo al Plato',42],['Receta Clara',41],['Orden Válida',41],['Semáforo de Flota',40],['Título Verificado',40],['PAMI al 100',39],['Amarra Lista',39],['Carga al Día',36],['Garrafa Al Día',33],['Frená a Tiempo',32]];

const chips = a => a.map(([n,i])=>`<span class="biz"><b>${i}</b> ${n}</span>`).join('');

const PHASES = [
  ['0','GO del dueño','Vos','Elegís el negocio, se fija el objetivo (primeros N clientes) y el plazo. Es el único arranque.','—','Instantáneo','—'],
  ['1','Producto listo','🏗️ Constructor (IA)','Cablea las APIs reales (IA, WhatsApp, Google, pasarela) y deja el producto funcionando y verificado: typecheck + tests + demo real de punta a punta.','Publicar en la web = <b>tu OK</b>','1–3 semanas','≈ US$0 (crédito de IA)'],
  ['2','Marca + Landing','🎨 Diseño & Marca (IA)','Naming final, identidad, logo, sistema visual y la landing que convierte, con sus textos de venta.','—','2–4 días','Dominio ~US$12/año'],
  ['3','Cobro activo','💳 Cobro & Fiscal (IA)','Configura la pasarela (Mercado Pago / Lemon Squeezy), el pricing final y la facturación (exportación de servicios). Prueba un pago real.','Cobrar dinero real = <b>tu OK</b>','2–3 días','US$0 (MP gratis)'],
  ['4','Lanzamiento','📣 Growth + Vos','Abre el canal de adquisición, consigue los primeros clientes/beta pagos, arma el contenido de lanzamiento y mide. <b>Acá entra el canal — lo único que de verdad depende de vos.</b>','—','Continuo','Variable (pauta opcional)'],
  ['5','Operar y escalar','🧭 Operaciones (IA)','Onboarding, soporte y retención; reporte mensual al dueño. El producto ya genera ingresos y se mejora en loop.','—','Continuo','Se paga con los ingresos'],
];
const phaseRows = PHASES.map(p=>`<div class="ph">
  <div class="ph-n">${p[0]}</div>
  <div class="ph-body">
    <div class="ph-h">${p[1]} <span class="ph-owner">${p[2]}</span></div>
    <div class="ph-d">${p[3]}</div>
    <div class="ph-meta"><span class="m gate ${p[4]==='—'?'off':''}">🔒 ${p[4]==='—'?'sin gate':p[4]}</span><span class="m">⏱ ${p[5]}</span><span class="m">💵 ${p[6]}</span></div>
  </div>
</div>`).join('');

const CSS = `*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.55;margin:0;background:#fff}
.pg{max-width:760px;margin:0 auto;padding:30px 30px 16px}
.brk{page-break-after:always}
h2{font-size:19px;font-style:italic;font-weight:800;text-transform:uppercase;letter-spacing:.01em;margin:0 0 4px;padding-top:6px}
.h2sub{color:#666;font-size:12.5px;margin:0 0 16px}
.kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#a07d00;font-weight:700}
/* portada */
.cover h1{font-size:34px;font-style:italic;margin:8px 0 6px;line-height:1.05}
.cover .lede{font-size:15px;color:#333;max-width:640px}
.tldr{background:#fbf6d8;border:1px solid #d8c766;border-radius:12px;padding:16px 18px;margin:22px 0 0}
.tldr .t{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7400;font-weight:700;margin-bottom:8px}
.tldr ul{margin:0;padding-left:18px;font-size:13px;color:#3a3200}
.tldr li{margin-bottom:6px}
.cover .foot{margin-top:20px;font-size:11px;color:#999;font-family:ui-monospace,monospace}
/* timeline fases */
.ph{display:grid;grid-template-columns:40px 1fr;gap:14px;margin-bottom:11px;break-inside:avoid}
.ph-n{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:26px;color:#fff;background:#1a1a1a;border-radius:9px;display:flex;align-items:center;justify-content:center;height:40px}
.ph-body{border:1px solid #e2e2e2;border-left:3px solid #d8b400;border-radius:10px;padding:11px 14px;background:#fcfcfc}
.ph-h{font-weight:750;font-size:14.5px}
.ph-owner{font-size:11px;color:#a07d00;font-weight:700;margin-left:4px}
.ph-d{font-size:12.5px;color:#333;margin:4px 0 8px}
.ph-meta{display:flex;gap:7px;flex-wrap:wrap}
.ph-meta .m{font-family:ui-monospace,monospace;font-size:10.5px;background:#f0f0f0;border:1px solid #e0e0e0;border-radius:5px;padding:3px 7px;color:#333}
.ph-meta .gate{background:#fdeede;border-color:#f2cfa0;color:#8a5200}
.ph-meta .gate.off{background:#f0f0f0;border-color:#e0e0e0;color:#999}
/* split IA vs vos */
.split{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}
.split .c{border:1px solid #e2e2e2;border-radius:11px;padding:14px 16px}
.split .c.ia{background:#f2f8f4;border-color:#bfe3cd}
.split .c.you{background:#fbf6d8;border-color:#e6d68a}
.split .c h3{margin:0 0 8px;font-size:14px;font-style:italic}
.split .c ul{margin:0;padding-left:17px;font-size:12.5px;color:#333}
.split .c li{margin-bottom:5px}
.pct{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:30px}
/* callout */
.call{border:1px solid #d8c766;background:#fbf6d8;border-radius:12px;padding:16px 18px;margin:4px 0 16px}
.call h3{margin:0 0 6px;font-size:15px;font-style:italic;color:#7a5c00}
.call p{margin:0 0 8px;font-size:13px;color:#3a3200}
.call p:last-child{margin-bottom:0}
/* roadmap olas */
.wave{border:1px solid #e2e2e2;border-radius:12px;padding:14px 16px;margin-bottom:12px;break-inside:avoid}
.wave.f0{border-left:4px solid #6b7280}
.wave.o1{border-left:4px solid #1e9e56}
.wave.o2{border-left:4px solid #d8b400}
.wave.o3{border-left:4px solid #b0752a}
.wave .wh{display:flex;align-items:baseline;gap:10px;margin-bottom:3px}
.wave .wh b{font-size:15px;font-style:italic}
.wave .wh .when{font-family:ui-monospace,monospace;font-size:10.5px;color:#777;text-transform:uppercase;letter-spacing:.08em}
.wave .wd{font-size:12.5px;color:#444;margin-bottom:9px}
.bizwrap{display:flex;flex-wrap:wrap;gap:6px}
.biz{font-size:11.5px;background:#f4f4f4;border:1px solid #e4e4e4;border-radius:20px;padding:3px 10px;white-space:nowrap}
.biz b{font-family:ui-monospace,monospace;color:#a07d00}
table.cost{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
table.cost th,table.cost td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top}
table.cost th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888;font-weight:700}
table.cost td.g{color:#0a7a3c;font-weight:700}
.rule{font-family:ui-monospace,monospace;font-size:11px;color:#7a5c00;background:#fbf6d8;border:1px dashed #d8c766;border-radius:8px;padding:9px 12px;margin-top:10px}
.dec{display:grid;grid-template-columns:26px 1fr;gap:11px;margin-bottom:9px;break-inside:avoid}
.dec .num{font-family:Georgia,serif;font-style:italic;font-weight:800;color:#a07d00;font-size:17px}
.dec .txt{font-size:13px}
.dec .txt b{color:#111}
`;

const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>

<section class="pg cover brk">
  <div class="kick">Célula de Negocios Digitales · Playbook + Roadmap ejecutivo</div>
  <h1>De la idea<br>a la ganancia</h1>
  <div class="lede">Cómo el equipo de IA lleva un negocio de cero a su primer peso — y el roadmap real para poner en vivo las opciones que no cuestan nada arrancar.</div>
  <div class="tldr">
    <div class="t">Resumen para el dueño</div>
    <ul>
      <li><b>La IA hace ~90% del trabajo sola</b> (construir, marca, cobro, operar). Vos hacés 3 cosas: dar el <b>GO</b>, apretar <b>2 gates</b> (publicar y cobrar) y <b>abrir el canal</b>.</li>
      <li><b>Construir es casi gratis</b> con Claude Code. El costo real —y el único cuello— es <b>vender/distribuir</b>, no el código.</li>
      <li>Por eso "ponerlas todas en vivo ya" no es publicar 74 landings (serían 74 landings muertas): es <b>modo fábrica</b> — un motor interno compartido + <b>olas ancladas a un canal</b>.</li>
      <li>Arrancás con la <b>Ola 1</b> (4 negocios que ya tienen código) para validar el canal, y escalás. La decisión que te toca está al final.</li>
    </ul>
  </div>
  <div class="foot">Todo local · sin publicar hasta tu OK · dólar oficial BNA para los números · 2026</div>
</section>

<section class="pg brk">
  <div class="kick">Parte 1</div>
  <h2>Cómo ejecuta la IA</h2>
  <div class="h2sub">El mismo runbook de 6 fases para cualquier negocio: de tu GO al primer peso cobrado.</div>
  ${phaseRows}
  <div class="rule">🔒 Gates vigentes: <b>publicar en producción</b> y <b>cobrar dinero real</b> requieren tu OK explícito. Nada irreversible se hace solo.</div>
</section>

<section class="pg brk">
  <div class="kick">Parte 2</div>
  <h2>Quién hace qué</h2>
  <div class="h2sub">El reparto real de trabajo entre el equipo de IA y vos.</div>
  <div class="split">
    <div class="c ia">
      <h3>🤖 La IA, sola <span class="pct" style="color:#1e9e56">~90%</span></h3>
      <ul>
        <li>Construye el producto y cablea las integraciones reales</li>
        <li>Diseña marca, logo y la landing que convierte</li>
        <li>Configura cobro (MP/USD) y facturación</li>
        <li>Instrumenta métricas, límites de uso y alertas</li>
        <li>Redacta el outreach, el contenido y responde soporte</li>
        <li>Opera y reporta mes a mes</li>
      </ul>
    </div>
    <div class="c you">
      <h3>🎯 Vos <span class="pct" style="color:#a07d00">3 cosas</span></h3>
      <ul>
        <li><b>El GO:</b> decidís qué negocio y cuándo</li>
        <li><b>2 gates:</b> aprobás publicar y aprobás cobrar dinero real</li>
        <li><b>El canal:</b> las relaciones que abren la puerta al primer cliente (un estudio contable, una cámara, una federación). <b>Esto es lo único que la IA no puede hacer por vos.</b></li>
      </ul>
    </div>
  </div>
</section>

<section class="pg brk">
  <div class="kick">Parte 3</div>
  <h2>"Si son gratis, ¿por qué no todas en vivo ya?"</h2>
  <div class="h2sub">La pregunta correcta. La respuesta honesta de PMO.</div>
  <div class="call">
    <h3>Tenés razón en el instinto — y a la vez hay una trampa</h3>
    <p><b>Sí:</b> construir cada una cuesta casi cero y son 100% operables por IA. Técnicamente, ponerlas en vivo es barato y rápido.</p>
    <p><b>Pero "en vivo" no es "publicada" — es "con un cliente que paga".</b> Publicar 74 landings sin un canal detrás da 74 páginas que nadie visita. El aprendizaje más caro de la célula: <b>el costo real no es construir, es distribuir</b>. El mercado casi nunca es el cuello; conseguir el primer cliente sí.</p>
    <p><b>La jugada que sí funciona: modo fábrica.</b> Un <b>motor interno</b> compartido (auth, cobro, WhatsApp, panel, plantillas de landing) que amortiza el código de todas, y después <b>olas</b> donde cada negocio se ancla a un canal antes de encenderse. Se lanzan todas — pero en secuencia, no de golpe.</p>
  </div>
  <div class="rule">Regla de oro de la célula: <b>ningún vertical se enciende sin un canal firmado.</b> El motor amortiza el código; no amortiza el costo de conseguir clientes.</div>
</section>

<section class="pg brk">
  <div class="kick">Parte 4</div>
  <h2>Roadmap para poner en vivo las gratis</h2>
  <div class="h2sub">74 negocios sin costo de arranque, 37 además 100% IA y no descartados. Se encienden en modo fábrica.</div>

  <div class="wave f0">
    <div class="wh"><b>Fase 0 · Motor interno</b><span class="when">una sola vez · ~2–3 semanas</span></div>
    <div class="wd">Se construye una vez y lo usan todas: login, cobro (MP/Lemon), WhatsApp API, panel de operación y plantillas de landing. Baja el costo y el tiempo de cada lanzamiento siguiente a casi nada.</div>
  </div>

  <div class="wave o1">
    <div class="wh"><b>Ola 1 · Las que ya tienen código</b><span class="when">mes 1 · primer peso real</span></div>
    <div class="wd">Ya están construidas o casi. Se lanzan primero para validar el motor de venta con plata real antes de escalar.</div>
    <div class="bizwrap">${chips(OLA1)}</div>
  </div>

  <div class="wave o2">
    <div class="wh"><b>Ola 2 · Las más firmes (índice ≥ 48)</b><span class="when">mes 2–3 · 1 canal por vertical</span></div>
    <div class="wd">Sin costo, 100% IA, alto índice de factibilidad. Cada una se enciende cuando tiene su canal (estudio contable, cámara, federación, comunidad).</div>
    <div class="bizwrap">${chips(OLA2)}</div>
  </div>

  <div class="wave o3">
    <div class="wh"><b>Ola 3 · El resto de las accionables</b><span class="when">mes 4+ · tandas de 5–8</span></div>
    <div class="wd">Las ${OLA3.length} restantes del corte accionable, en tandas ancladas a canal. El motor interno ya hace cada lanzamiento casi instantáneo.</div>
    <div class="bizwrap">${chips(OLA3)}</div>
  </div>
</section>

<section class="pg brk">
  <div class="kick">Parte 5</div>
  <h2>El costo real de ponerlas en vivo</h2>
  <div class="h2sub">Qué cuesta de verdad encender un producto — spoiler: casi nada en plata.</div>
  <table class="cost">
    <tr><th>Concepto</th><th>Costo</th><th>Cuándo se paga</th></tr>
    <tr><td>Construir el producto (con IA)</td><td class="g">≈ US$0</td><td>Crédito de IA, ya disponible</td></tr>
    <tr><td>Dominio + hosting</td><td>~US$12–40 / año</td><td>Al publicar cada uno</td></tr>
    <tr><td>Pasarela de cobro (MP / Lemon)</td><td class="g">US$0 fijo</td><td>Comisión solo sobre lo cobrado</td></tr>
    <tr><td>APIs con uso real (WhatsApp, IA)</td><td>Variable, por uso</td><td>Se paga con el 1er cliente, no antes</td></tr>
    <tr><td>Motor interno (Fase 0)</td><td class="g">≈ US$0 (tiempo de IA)</td><td>Una vez, lo amortizan todas</td></tr>
    <tr><td><b>El canal</b> (relaciones)</td><td><b>Tu tiempo</b></td><td>Es el verdadero costo — y lo único no delegable</td></tr>
  </table>
  <div class="rule">Traducción: encender 10 productos cuesta menos que un almuerzo en dólares. Lo que "cuesta" es <b>vender</b> — por eso el roadmap invierte en canal, no en más código.</div>
</section>

<section class="pg">
  <div class="kick">Parte 6</div>
  <h2>Recomendación PMO — la decisión que te toca</h2>
  <div class="h2sub">Qué haría yo con esto, en concreto.</div>
  <div class="dec"><div class="num">1</div><div class="txt"><b>Sí, ponelas en vivo</b> — tu instinto es correcto. Pero en <b>modo fábrica</b> (motor interno + olas), no las 74 de golpe: eso dispersa el esfuerzo y mata el canal.</div></div>
  <div class="dec"><div class="num">2</div><div class="txt"><b>Lo que destraba todo no es más código: son 2–3 canales firmados.</b> Un par de estudios contables y una cámara/federación abren la puerta a decenas de estos negocios. Es la inversión de mayor retorno.</div></div>
  <div class="dec"><div class="num">3</div><div class="txt"><b>Empezá chico y real:</b> dame el GO para (a) construir el <b>motor interno</b> y (b) poner en vivo la <b>Ola 1</b> (Kudos, Testigo, Fantasma, Plantillería). En semanas tenés el primer producto cobrando y el motor listo para escalar el resto casi gratis.</div></div>
  <div class="call" style="margin-top:14px">
    <h3>El próximo movimiento (una línea)</h3>
    <p style="margin:0"><b>Decí "GO motor interno + Ola 1"</b> y arranco: construyo la base compartida y dejo los 4 primeros listos para publicar, frenando en los gates de publicar y cobrar para tu OK.</p>
  </div>
  <div class="cover"><div class="foot" style="margin-top:22px">Célula de Negocios Digitales · documento ejecutivo · todo local, sin publicar hasta tu OK</div></div>
</section>

</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME });
const p = await browser.newPage();
await p.setContent(HTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'0', bottom:'0', left:'0', right:'0' } });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB');
await browser.close();
