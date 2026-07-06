// PDF ejecutivo "De la idea a la ganancia" — v2, reescrito tras revisión de 4 agentes expertos
// (PMO/estrategia, inversor/CFO, ejecución+GTM Argentina, claridad ejecutiva).
// USO: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node generar-pdf-playbook.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'Playbook-y-Roadmap-ejecutivo.pdf');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const OLA1 = [['Kudos',86],['Testigo',84],['Fantasma',78],['Plantillería',74]];
const OLA2 = [['Recepcionista IA',62],['Calificación de leads',57],['Postora',54],['El Data Semanal',52],['Comparador con afiliados',50],['Trazabovina',48],['Disputa Ganada',48]];
const OLA3N = 26;
const chips = a => a.map(([n,i])=>`<span class="biz"><b>${i}</b> ${n}</span>`).join('');

const CSS = `*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1c;line-height:1.6;margin:0;background:#fff;font-size:13px}
.pg{max-width:760px;margin:0 auto;padding:32px 34px 18px}
.brk{page-break-after:always}
.kick{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a07d00;font-weight:700}
h2{font-size:20px;font-style:italic;font-weight:800;letter-spacing:.01em;margin:2px 0 3px;line-height:1.15}
.h2sub{color:#666;font-size:12.5px;margin:0 0 16px}
p{margin:0 0 11px}
b{color:#111}
.lead{font-size:13.5px;color:#2a2a2a}
/* portada */
.cover h1{font-size:36px;font-style:italic;margin:10px 0 8px;line-height:1.03}
.cover .lede{font-size:15px;color:#333;max-width:660px;margin-bottom:4px}
.ask{background:#101216;color:#f4f4f4;border-radius:14px;padding:18px 20px;margin:20px 0 0}
.ask .t{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#f5d20c;font-weight:700;margin-bottom:9px}
.ask p{margin:0 0 8px;font-size:13px;color:#e8e8e8}
.ask p:last-child{margin:0}
.ask b{color:#fff}
.ask .big{font-size:14.5px}
.foot{margin-top:18px;font-size:11px;color:#999;font-family:ui-monospace,monospace}
/* glosario */
.gloss{background:#f6f7f9;border:1px solid #e4e6ea;border-radius:11px;padding:14px 16px;margin:6px 0 4px}
.gloss dt{font-weight:750;font-size:12.5px;color:#111;float:left;margin-right:6px}
.gloss dd{margin:0 0 7px;font-size:12.5px;color:#444}
/* tesis */
.tesis{border-left:4px solid #d8b400;background:#fbf6d8;border-radius:0 10px 10px 0;padding:14px 18px;margin:2px 0 16px}
.tesis p{margin:0;font-size:14px;color:#4a3d00}
/* ejemplo embudo */
.flow{display:flex;flex-direction:column;gap:0;margin:6px 0 8px}
.step{display:grid;grid-template-columns:30px 1fr auto;gap:12px;align-items:start;padding:10px 0;border-bottom:1px solid #eee}
.step:last-child{border-bottom:none}
.step .sn{font-family:Georgia,serif;font-style:italic;font-weight:800;color:#a07d00;font-size:17px}
.step .sd b{font-size:13px}
.step .sd .sm{font-size:12px;color:#555}
.step .sv{font-family:ui-monospace,monospace;font-size:12px;font-weight:700;color:#0a7a3c;white-space:nowrap;text-align:right}
.step .sv.cost{color:#b0752a}
/* fases */
.ph{display:grid;grid-template-columns:38px 1fr;gap:13px;margin-bottom:10px;break-inside:avoid}
.ph-n{font-family:Georgia,serif;font-style:italic;font-weight:800;font-size:24px;color:#fff;background:#1a1a1a;border-radius:9px;display:flex;align-items:center;justify-content:center;height:38px}
.ph-body{border:1px solid #e2e2e2;border-left:3px solid #d8b400;border-radius:10px;padding:10px 14px;background:#fcfcfc}
.ph-h{font-weight:750;font-size:14px}
.ph-owner{font-size:11px;font-weight:700;margin-left:5px;padding:1px 7px;border-radius:10px}
.ph-owner.ia{color:#0a7a3c;background:#e8f5ee}
.ph-owner.you{color:#8a5200;background:#fdeede}
.ph-d{font-size:12.5px;color:#333;margin:4px 0 0}
/* split */
.split{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}
.split .c{border:1px solid #e2e2e2;border-radius:11px;padding:14px 16px}
.split .c.ia{background:#f2f8f4;border-color:#bfe3cd}
.split .c.you{background:#fbf6d8;border-color:#e6d68a}
.split .c h3{margin:0 0 8px;font-size:13.5px;font-style:italic}
.split .c ul{margin:0;padding-left:16px;font-size:12px;color:#333}
.split .c li{margin-bottom:5px}
/* callout */
.call{border:1px solid #d8c766;background:#fbf6d8;border-radius:12px;padding:15px 18px;margin:4px 0 14px}
.call h3{margin:0 0 6px;font-size:14.5px;font-style:italic;color:#7a5c00}
.call p{margin:0 0 8px;font-size:12.5px;color:#3a3200}
.call p:last-child{margin-bottom:0}
/* tres frentes */
.fr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:6px 0 4px}
.fr .f{border:1px solid #f2cfa0;background:#fdeede;border-radius:11px;padding:13px 14px}
.fr .f .fh{font-weight:750;font-size:13px;color:#8a5200;margin-bottom:5px}
.fr .f p{margin:0;font-size:11.5px;color:#5c4326}
/* olas */
.wave{border:1px solid #e2e2e2;border-radius:12px;padding:13px 16px;margin-bottom:11px;break-inside:avoid}
.wave.f0{border-left:4px solid #6b7280}.wave.o1{border-left:4px solid #1e9e56}.wave.o2{border-left:4px solid #d8b400}.wave.o3{border-left:4px solid #b0752a}
.wave .wh{display:flex;align-items:baseline;gap:10px;margin-bottom:3px;flex-wrap:wrap}
.wave .wh b{font-size:14.5px;font-style:italic}
.wave .wh .when{font-family:ui-monospace,monospace;font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.06em}
.wave .wd{font-size:12px;color:#444;margin-bottom:8px}
.wave .kg{font-size:11.5px;color:#2a2a2a;background:#f5f7f5;border:1px solid #e0e6e0;border-radius:7px;padding:7px 10px;margin-bottom:8px}
.wave .kg b{color:#0a7a3c}.wave .kg .kill{color:#b02a1f}
.bizwrap{display:flex;flex-wrap:wrap;gap:6px}
.biz{font-size:11px;background:#f4f4f4;border:1px solid #e4e4e4;border-radius:20px;padding:3px 9px;white-space:nowrap}
.biz b{font-family:ui-monospace,monospace;color:#a07d00}
/* tablas */
table{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 6px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#888;font-weight:700}
td.g{color:#0a7a3c;font-weight:700}td.r{color:#b02a1f;font-weight:700}td.n{font-family:ui-monospace,monospace}
/* riesgos */
.risk{display:grid;grid-template-columns:1fr;gap:8px}
.risk .r{border:1px solid #ecd9d6;background:#fdf6f5;border-radius:9px;padding:10px 13px}
.risk .r b{color:#a12a1c}
.risk .r p{margin:3px 0 0;font-size:12px;color:#4a4a4a}
/* decisión */
.branch{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0}
.branch .b1{border:1px solid #bfe3cd;background:#f2f8f4;border-radius:12px;padding:14px 16px}
.branch .b2{border:1px solid #e0e0e0;background:#fafafa;border-radius:12px;padding:14px 16px}
.branch h4{margin:0 0 7px;font-size:13.5px;font-style:italic}
.branch ul{margin:0;padding-left:16px;font-size:12px;color:#333}.branch li{margin-bottom:4px}
.rule{font-family:ui-monospace,monospace;font-size:11px;color:#7a5c00;background:#fbf6d8;border:1px dashed #d8c766;border-radius:8px;padding:9px 12px;margin-top:8px}
`;

const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>

<!-- PORTADA -->
<section class="pg cover brk">
  <div class="kick">Célula de Negocios Digitales · Playbook + Roadmap ejecutivo · v2</div>
  <h1>De la idea<br>a la ganancia</h1>
  <div class="lede">Cómo el equipo de IA lleva un negocio de cero a su primer cliente pagando — y el plan real, honesto, para poner en marcha las opciones que casi no cuestan nada arrancar.</div>
  <div class="ask">
    <div class="t">Lo que te pido hoy (en una línea)</div>
    <p class="big">Dame el <b>OK para dos cosas</b>: (1) construir el <b>motor interno</b> —la base común que hace casi gratis cada lanzamiento siguiente— y (2) poner en marcha la <b>Ola 1</b>: los 4 negocios que ya tienen código.</p>
    <p><b>Qué te cuesta:</b> en plata, casi nada (unos US$50–150 en total). En tiempo tuyo: aprobar 2 momentos por producto y ayudar a abrir <b>1 canal de venta</b>.</p>
    <p><b>Qué ganás:</b> en ~6–8 semanas, el primer producto cobrando de verdad y la maquinaria lista para escalar el resto. <b>La decisión detallada está en la última página.</b></p>
  </div>
  <div class="foot">Todo local · nada se publica ni cobra sin tu OK · pesos al dólar oficial BNA $1.488,50 · 2026</div>
</section>

<!-- 1 · TESIS + GLOSARIO -->
<section class="pg brk">
  <div class="kick">Empecemos por lo esencial</div>
  <h2>La idea en una frase</h2>
  <div class="tesis"><p><b>Construir el software ya está resuelto: la IA lo hace rápido y casi gratis.</b> El proyecto no se gana ni se pierde en el código — se gana o se pierde en <b>tres cosas lentas y humanas</b>: prender WhatsApp, poder cobrar (los trámites fiscales) y <b>conseguir quién venda</b>. Ahí es donde te necesito.</p></div>
  <p class="lead">Todo lo que sigue desarrolla esa frase: primero un negocio real de punta a punta con números, después cómo trabaja la IA y dónde entrás vos, el plan por olas, los números que importan y los riesgos. Antes, un mini-diccionario para que nada quede en jerga.</p>
  <dl class="gloss">
    <dt>Canal —</dt><dd>la vía concreta por la que te llegan clientes que pagan (un socio que te presenta su cartera, una cámara, un estudio contable, publicidad). Sin canal, un producto publicado es un local abierto en un pueblo fantasma.</dd>
    <dt>Motor interno —</dt><dd>una base de software común (login, cobro, WhatsApp, panel) que se construye <b>una sola vez</b> y la usan todos los productos, para no rehacerla cada vez.</dd>
    <dt>Gate —</dt><dd>un punto donde el trabajo se <b>frena y espera tu OK</b>. Hay solo dos: publicar en internet y cobrar dinero real.</dd>
    <dt>Índice de factibilidad (0–100) —</dt><dd>qué tan listo está un negocio para ejecutarse (validación + producto + camino a cobrar + riesgo). De 48 para arriba = entre los más listos de la cartera.</dd>
    <dt>White-label —</dt><dd>el producto sale con la <b>marca del socio</b> (ej. el estudio contable), no la nuestra; nosotros lo operamos por detrás.</dd>
    <dt>Revshare —</dt><dd>el socio se lleva un <b>% de lo cobrado</b> a cambio de traernos los clientes de su cartera.</dd>
  </dl>
</section>

<!-- 2 · EJEMPLO PUNTA A PUNTA -->
<section class="pg brk">
  <div class="kick">Para que se vea, no que se explique</div>
  <h2>Un negocio real, de punta a punta</h2>
  <div class="h2sub">Kudos (reseñas en piloto automático para comercios) recorriendo las 6 fases, con números reales aproximados.</div>
  <div class="flow">
    <div class="step"><div class="sn">1</div><div class="sd"><b>Construir el producto</b><div class="sm">La IA cablea Google + WhatsApp + el motor de respuestas. Queda funcionando y probado.</div></div><div class="sv">US$0</div></div>
    <div class="step"><div class="sn">2</div><div class="sd"><b>Marca + página de venta</b><div class="sm">Nombre, logo, landing que convierte. Se registra el dominio.</div></div><div class="sv cost">~US$12/año</div></div>
    <div class="step"><div class="sn">3</div><div class="sd"><b>Poder cobrar</b><div class="sm">Alta fiscal + Mercado Pago / cobro en USD + un pago de prueba real.</div></div><div class="sv cost">US$0 fijo</div></div>
    <div class="step"><div class="sn">4</div><div class="sd"><b>Primer cliente</b><div class="sm">Vía un canal (una peluquería/resto de una red conocida). Paga una suscripción.</div></div><div class="sv">US$99–149/mes</div></div>
    <div class="step"><div class="sn">5</div><div class="sd"><b>A los 6 meses</b><div class="sm">~15 locales activos. Costo variable ~US$3–10 por local/mes. Churn (bajas) 3–7%/mes.</div></div><div class="sv">~US$1.700/mes</div></div>
    <div class="step"><div class="sn">6</div><div class="sd"><b>Cada cliente, a lo largo de su vida</b><div class="sm">Con esa baja mensual, un local queda ~14–33 meses. Ingreso total por cliente (LTV):</div></div><div class="sv">~US$1.400–4.900</div></div>
  </div>
  <p style="font-size:11.5px;color:#666;margin-top:2px">La plata para arrancar Kudos son ~US$200 de bolsillo (dominio + crédito de IA + setup). Lo que de verdad costó no fue eso: fue <b>conseguir esos 15 locales</b> — el tiempo de venta. Ese es el patrón de todos.</p>
</section>

<!-- 3 · CÓMO EJECUTA LA IA + DÓNDE ENTRÁS VOS -->
<section class="pg brk">
  <div class="kick">El motor de trabajo</div>
  <h2>Cómo ejecuta la IA — y dónde te necesito</h2>
  <div class="h2sub">El mismo camino de 6 fases para cualquier negocio. La IA hace casi todo el código; vos aparecés en 3 momentos que son los que definen el resultado.</div>
  <div class="ph"><div class="ph-n">0</div><div class="ph-body"><div class="ph-h">El GO <span class="ph-owner you">vos</span></div><div class="ph-d">Elegís el negocio y el objetivo (ej. "5 clientes en 60 días"). Es el arranque.</div></div></div>
  <div class="ph"><div class="ph-n">1</div><div class="ph-body"><div class="ph-h">Producto funcionando <span class="ph-owner ia">IA</span></div><div class="ph-d">La IA construye y prueba el producto de punta a punta. <b>Rápido y casi gratis.</b> Ojo: "demo funcionando" (1–3 semanas) no es lo mismo que "producto que un cliente usa en producción" — esa última milla (datos reales, casos borde) lleva más.</div></div></div>
  <div class="ph"><div class="ph-n">2</div><div class="ph-body"><div class="ph-h">Marca + página de venta <span class="ph-owner ia">IA</span></div><div class="ph-d">Nombre, identidad y una landing que convierte, con sus textos. Días de trabajo, dominio ~US$12/año.</div></div></div>
  <div class="ph"><div class="ph-n">3</div><div class="ph-body"><div class="ph-h">Poder cobrar <span class="ph-owner you">vos + IA</span></div><div class="ph-d">Acá hay un <b>frente humano real</b>: alta fiscal (CUIT, Factura E, ARCA), decidir monotributo o responsable inscripto, y conectar el cobro. La IA configura; vos resolvés lo fiscal. <b>Gate: cobrar dinero real = tu OK.</b></div></div></div>
  <div class="ph"><div class="ph-n">4</div><div class="ph-body"><div class="ph-h">Lanzamiento y primer cliente <span class="ph-owner you">vos</span></div><div class="ph-d"><b>El momento que define todo.</b> Sin un canal que traiga clientes, no hay negocio. La IA redacta el material de venta; <b>abrir la puerta (las relaciones) es tuyo.</b> Gate: publicar = tu OK.</div></div></div>
  <div class="ph"><div class="ph-n">5</div><div class="ph-body"><div class="ph-h">Operar y sostener <span class="ph-owner ia">IA</span></div><div class="ph-d">Onboarding, soporte, retención y reporte mensual. Cuidado: sostener muchos productos vivos a la vez es una carga creciente — por eso el plan pone un límite y mata lo que no tracciona.</div></div></div>
  <div class="rule">Reencuadre honesto: la IA hace ~90% del <b>código</b> — pero ese 90% es la parte fácil y barata. El 10% que queda (prender, cobrar, vender) es <b>humano, lento, y es el 90% del resultado.</b> Ahí está el trabajo real.</div>
</section>

<!-- 4 · LOS TRES FRENTES + POR QUÉ NO TODAS -->
<section class="pg brk">
  <div class="kick">La verdad incómoda (y la buena noticia)</div>
  <h2>"Si son gratis, ¿por qué no todas en vivo ya?"</h2>
  <div class="h2sub">Tu instinto es correcto: construir es casi gratis. Pero "en vivo" no es "publicada" — es "con un cliente que paga".</div>
  <div class="call">
    <h3>Publicar 74 páginas sin quién las venda = 74 locales en un pueblo fantasma</h3>
    <p>El aprendizaje más caro de la célula: <b>el costo real no es construir, es distribuir.</b> Podemos encender 10 productos por menos que un almuerzo en dólares — pero no se pueden <b>vender</b> 10 a la vez con una sola persona abriendo puertas. La capacidad de vender y sostener es el límite real, no el código.</p>
    <p>Por eso el plan no es "prender las 74 de golpe" (dispersa el esfuerzo y no hay quién las atienda), sino <b>subordinar el ritmo de lanzamiento a cuántos canales firmamos y cuántos productos podemos sostener vivos.</b></p>
  </div>
  <p style="font-size:12.5px;margin-bottom:6px"><b>Los tres frentes lentos y humanos que marcan el ritmo real</b> (no el código):</p>
  <div class="fr">
    <div class="f"><div class="fh">1 · Prender WhatsApp</div><p>Meta pide verificar el negocio, un número nuevo y aprobar cada plantilla de mensaje. Tarda 1–4 semanas y puede rechazar. No es "cablear una API".</p></div>
    <div class="f"><div class="fh">2 · Poder cobrar</div><p>Alta fiscal, Factura E, ARCA, elegir monotributo o RI. Y si escala, el monotributo se queda chico y hay que saltar a responsable inscripto (IVA 21%).</p></div>
    <div class="f"><div class="fh">3 · Firmar el canal</div><p>Un estudio contable o cámara decide en <b>meses</b>, no en días (les preocupa su reputación). Es el verdadero cuello de botella del ritmo.</p></div>
  </div>
  <div class="rule">Regla de oro: <b>ningún producto se enciende sin un canal firmado.</b> El motor interno amortiza el código; no amortiza el costo de conseguir clientes.</div>
</section>

<!-- 5 · ROADMAP -->
<section class="pg brk">
  <div class="kick">El plan</div>
  <h2>Roadmap por olas — el ritmo lo marca el canal, no el código</h2>
  <div class="h2sub">Cada ola avanza solo si la anterior consiguió tracción. Con criterios de éxito y de corte, para no quemar meses en productos que no pagan.</div>

  <div class="wave f0">
    <div class="wh"><b>Fase 0 · Motor interno</b><span class="when">una vez · MVP en 2–3 semanas, se endurece después</span></div>
    <div class="wd">La base común (login, cobro, WhatsApp, panel, plantillas de landing). Es el trabajo más difícil y sostiene todo lo de arriba: si sale flojo, cada producto hereda el problema.</div>
    <div class="kg"><b>Éxito:</b> un producto nuevo pasa de GO a poder cobrar en &lt;1 semana usando el motor. &nbsp;·&nbsp; <span class="kill">Riesgo:</span> es el único camino crítico — si se estira, frena las olas.</div>
  </div>
  <div class="wave o1">
    <div class="wh"><b>Ola 1 · Las que ya tienen código</b><span class="when">mes 1–2 · primer peso real</span></div>
    <div class="wd">Ya construidas o casi. Se lanzan primero para <b>validar la máquina de vender</b> con plata real, no para probar tecnología.</div>
    <div class="kg"><b>Éxito:</b> 1 canal firmado + ≥3 clientes pagando a 60 días. &nbsp;·&nbsp; <span class="kill">Corte:</span> 0 clientes pagos a 90 días → se congela y se revisa antes de abrir la Ola 2.</div>
    <div class="bizwrap">${chips(OLA1)}</div>
  </div>
  <div class="wave o2">
    <div class="wh"><b>Ola 2 · Las más firmes</b><span class="when">mes 3–4 · solo si la Ola 1 dio un canal replicable</span></div>
    <div class="wd">Alto índice de factibilidad, sin costo y 100% operables por IA. Cada una se enciende cuando tiene su canal.</div>
    <div class="kg"><b>Éxito:</b> 2 verticales con ≥5 clientes c/u. &nbsp;·&nbsp; <span class="kill">Corte por producto:</span> &lt;2 clientes a 60 días de tener canal → se pausa.</div>
    <div class="bizwrap">${chips(OLA2)}</div>
  </div>
  <div class="wave o3">
    <div class="wh"><b>Ola 3 · El resto de las accionables</b><span class="when">mes 5+ · tandas, con canal cada una</span></div>
    <div class="wd">Las ${OLA3N} restantes del corte accionable, solo si ya hay un canal que se pueda repetir y capacidad para sostenerlas. El motor hace cada lanzamiento casi instantáneo — pero venderlas sigue siendo el límite.</div>
  </div>
</section>

<!-- 6 · LOS NÚMEROS -->
<section class="pg brk">
  <div class="kick">La pregunta del dueño: ¿gana plata y en cuánto?</div>
  <h2>Los números que importan (el retorno, no solo el costo)</h2>
  <div class="h2sub">Economía por cliente de un producto típico validado, y el escenario honesto de una cartera de 37 lanzamientos.</div>
  <table>
    <tr><th>Concepto (producto típico)</th><th>Valor</th><th>Nota</th></tr>
    <tr><td>Precio</td><td class="n">US$99–149/mes</td><td>≈ $147.000–222.000 ARS</td></tr>
    <tr><td>Costo variable por cliente (IA/WhatsApp)</td><td class="n">US$3–30/mes</td><td>Sube con voz/IA pesada → <b>pricing con tope de uso</b></td></tr>
    <tr><td>Margen bruto</td><td class="g">80–95%</td><td>Antes del corte del canal (revshare)</td></tr>
    <tr><td>Bajas (churn)</td><td class="n">3–7%/mes</td><td>Vida media del cliente: 14–33 meses</td></tr>
    <tr><td>Ingreso total por cliente (LTV)</td><td class="n">US$1.400–4.900</td><td>Menos comisión de canal si aplica</td></tr>
    <tr><td>Break-even de caja por producto</td><td class="g">1 cliente</td><td>Cubre dominio+infra (~US$30/mes)</td></tr>
    <tr><td>Break-even <b>real</b></td><td class="r">tu tiempo</td><td>Las horas de venta para el 1er cliente</td></tr>
  </table>
  <div class="call" style="margin-top:2px">
    <h3>El escenario honesto de una cartera de 37 (no todos pegan)</h3>
    <p>Una cartera así no funciona con "todos venden un poco". Funciona como <b>power-law: 3–5 pegan fuerte y sostienen todo, ~10 vegetan, el resto no despega.</b> El objetivo no es que ganen las 37 — es <b>encontrar rápido a los 3–5 ganadores gastando poco</b> en los demás.</p>
    <p><b>Por eso el riesgo real no es la plata (es poca): es el tiempo hundido.</b> Meses de atención tuya en productos zombis que nunca pagan. La defensa son los criterios de corte de cada ola: se mata rápido lo que no tracciona y se concentra en lo que sí.</p>
  </div>
</section>

<!-- 7 · COSTO REAL + RIESGOS -->
<section class="pg brk">
  <div class="kick">Sin letra chica</div>
  <h2>El costo real de encender — y los riesgos</h2>
  <div class="h2sub">Corregido: qué cuesta de verdad (con las comisiones y trámites que sí existen) y qué puede salir mal.</div>
  <table>
    <tr><th>Concepto</th><th>Costo real</th><th>Detalle honesto</th></tr>
    <tr><td>Construir (con IA)</td><td class="g n">≈ US$0</td><td>Crédito de IA ya disponible</td></tr>
    <tr><td>Dominio + hosting</td><td class="n">~US$12–40/año</td><td>Por producto</td></tr>
    <tr><td>WhatsApp Business</td><td class="n">Por conversación</td><td><b>Recurrente desde el día 1</b>, no US$0</td></tr>
    <tr><td>Cobro (Mercado Pago)</td><td class="n">~5–6% + retenciones</td><td>IVA/IIBB/Ganancias; el neto llega con desfase</td></tr>
    <tr><td>Cobro USD (Lemon/Paddle)</td><td class="n">~5%</td><td>Payouts a Argentina con fricción</td></tr>
    <tr><td>Motor interno</td><td class="g n">≈ US$0</td><td>Tiempo de IA, una vez</td></tr>
    <tr><td><b>El canal</b></td><td class="r">tu tiempo</td><td>El costo real y no delegable</td></tr>
  </table>
  <p style="font-size:12.5px;margin:6px 0 8px"><b>Riesgos que hay que tener a la vista</b> (ninguno es excusa para no arrancar — son cosas a gestionar):</p>
  <div class="risk">
    <div class="r"><b>Concentración regulatoria.</b><p>Muchos negocios dependen de una norma argentina. Un gobierno desregulador o una AFIP/ARCA que cambia el régimen puede herir varios a la vez. Mitigación: no poner todas las fichas en verticales de la misma norma.</p></div>
    <div class="r"><b>Dependemos de plataformas que cambian reglas.</b><p>Meta (WhatsApp) sube precios y suspende números; Google limita APIs; MP retiene fondos; Lemon fue comprada por Stripe. Mitigación: no atarse a una sola y tener plan B por dependencia.</p></div>
    <div class="r"><b>El dueño como único vendedor.</b><p>Las 3 cosas no delegables recaen en vos; con una sola persona el plan se satura en la Ola 2. Mitigación: los canales (socios que venden por nosotros) son justamente lo que rompe ese techo.</p></div>
    <div class="r"><b>Datos de terceros = Ley 25.326.</b><p>Si un estudio nos pasa datos de su cartera, somos responsables del tratamiento. Todo acuerdo white-label necesita su contrato de datos y medidas de seguridad.</p></div>
  </div>
</section>

<!-- 8 · DECISIÓN -->
<section class="pg">
  <div class="kick">La decisión que te toca</div>
  <h2>Recomendación PMO — y qué pasa según lo que elijas</h2>
  <div class="h2sub">Qué haría yo, en concreto, y las dos ramas para que decidas con todo a la vista.</div>
  <p style="font-size:12.5px"><b>Mi recomendación:</b> sí, ponelas en vivo — tu instinto es correcto — pero en <b>modo fábrica</b> (motor interno + olas con corte), no las 74 de golpe. Y sabiendo que <b>lo que destraba todo no es más código: son 2–3 canales firmados</b> (un par de estudios contables + una cámara abren decenas de estos negocios). Es la inversión de mayor retorno.</p>
  <div class="branch">
    <div class="b1"><h4>✅ Si decís "GO"</h4><ul>
      <li>Semana 1–3: construyo el <b>motor interno</b> y dejo la Ola 1 lista para publicar.</li>
      <li>En paralelo, arrancamos <b>1 canal</b> (te ayudo con el term sheet: white-label + revshare).</li>
      <li>Semana 6–8: primer producto <b>cobrando</b>, con datos reales para decidir la Ola 2.</li>
      <li>Freno en los 2 gates (publicar / cobrar) para tu OK. Nada irreversible solo.</li>
    </ul></div>
    <div class="b2"><h4>⏸ Si decís "todavía no"</h4><ul>
      <li>Todo queda documentado y buscable en el panel; no se pierde nada.</li>
      <li>El costo de esperar es de <b>oportunidad</b>: varias señales tienen ventana (ej. obligaciones nuevas que hoy crean mercado y mañana ya están tomadas).</li>
      <li>No hay gasto ni riesgo corriendo mientras tanto.</li>
    </ul></div>
  </div>
  <div class="call" style="margin-top:6px">
    <h3>El próximo movimiento (una línea)</h3>
    <p style="margin:0"><b>Decí "GO motor interno + Ola 1"</b> y arranco: construyo la base compartida, dejo los 4 primeros listos para publicar y preparo el primer canal — frenando en publicar y cobrar para tu OK.</p>
  </div>
  <div class="foot" style="margin-top:16px">Revisado por un panel de 4 agentes expertos (estrategia · finanzas · ejecución/GTM Argentina · claridad) · Célula de Negocios Digitales · documento ejecutivo · todo local</div>
</section>

</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME });
const p = await browser.newPage();
await p.setContent(HTML, { waitUntil:'load' });
await p.pdf({ path: OUT, format:'A4', printBackground:true, margin:{ top:'0', bottom:'0', left:'0', right:'0' } });
console.log('PDF:', OUT, '·', (fs.statSync(OUT).size/1024).toFixed(0), 'KB');
await browser.close();
