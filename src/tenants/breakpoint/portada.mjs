// PORTADA del sitio de Break Point Pádel (breakpointpadel.gsgapp.com.ar): el FRONT público del club, para los
// clientes. Diseño «la cancha desde arriba» (00-ESTADO/estetica-2026-10/fronts/breakpoint/DISENO.md, 29/10/2026):
// un plano de las canchas en SVG como objeto protagonista, las franjas del día como tizas del pizarrón, cómo se
// reserva, tarifas (si el club las publicó) y lo que hace el club además de alquilar canchas.
// La gestión del club (/club) es el BACK: no se linkea desde acá. Lo publicado sale de publico.json.
// La usa src/tenants/breakpoint/empaquetar.mjs para armar src/tenants/breakpoint/sitio/index.html.
//
// Restricciones (e2e src/tenants/breakpoint/turnero/e2e/sitio.e2e.mjs): exactamente UN a[href="/turnero"] (el CTA del
// héroe; franjas, canchas, encabezado y barra usan /turnero#…), ningún a[href="/club"] y la palabra «d-e-m-o» no
// aparece en el body (tampoco en el script inline). Sin datos inventados: sin WhatsApp no hay botón ni wa.me pelado,
// y la portada dice «pedilo por mensaje» (el turnero lo manda por el Instagram del club, QA 29/10);
// sin tarifas no hay precios; sin ubicación no hay dirección ni mapa.

// Horario del club por día de la semana (el mismo que usa el turnero: CONFIG_DEMO del motor, provisional a confirmar).
// La portada lo usa sólo para saber si «hoy» ya terminó y pasar a «Mañana, viernes 30» (QA 29/10).
import { CONFIG_DEMO } from "../../../public/previews/breakpoint/club/motor.mjs";

// Logo provisional a confirmar: trazos derivados del SVG del club (ccr-63ed11dc-brcdpp) para que no dependa de una
// fuente instalada (antes era <text> en Montserrat, que no se cargaba y cambiaba de forma según la máquina). Cuando
// llegue el vector oficial del club, reemplazar este SVG.
const LOGO = (tam) => `<svg class="logo" viewBox="0 0 120 120" width="${tam}" height="${tam}" aria-hidden="true" focusable="false"><rect width="120" height="120" fill="#035BA8"/><g transform="translate(8 20)"><rect x="0.5" y="3.5" width="3.6" height="73" fill="#fff"/><path fill="none" stroke="#fff" stroke-width="2.6" d="M10.8 15.17H18.86A3.94 3.94 0 0 0 18.86 7.3H10.8V23.7H18.94A4.26 4.26 0 0 0 18.94 15.17ZM28.8 23.7V7.3H38.26A3.94 3.94 0 0 1 38.26 15.17H28.8M37.06 15.17L42.4 23.7M58.2 7.3H47.8V23.7H58.2M47.8 15.17H56.8M63.4 25L72 7.1L80.6 25M66.1 19.4H77.9M85.8 7.3V23.7M100.6 6.9L86.4 17.37M90.2 14.57L100.6 24.1M10.8 49.7V33.3H17.96A4.24 4.24 0 0 1 17.96 41.78H10.8M50.1 33.3V49.7M56.3 51V33.3L72.7 49.7V32M77.5 33.3H101.5M89.5 33.3V51M10.8 75.7V59.3H17.97A4.23 4.23 0 0 1 17.97 67.76H10.8M28.15 77L36.75 59.1L45.35 77M30.85 71.4H42.65M51.3 59.3V75.7H57.14A8.56 8.2 0 0 0 57.14 59.3ZM82.45 59.3H72.05V75.7H82.45M72.05 67.17H81.05M88.8 59.3V75.7H100.2"/><g fill="none" stroke="#DC6E22" stroke-width="3.3" stroke-linecap="round"><circle cx="35" cy="42.4" r="8.1"/><path d="M34.2 35.6a7.6 7.6 0 0 0 0 13.6"/></g></g></svg>`;

// Íconos genéricos (ADR-042: el globo, no el logo de WhatsApp; la cámara, no el de Instagram).
const GLOBO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z"/></svg>`;
const CAMARA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/></svg>`;

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hhmm = (m) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, "0")}`;
const pesos = (n) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Tarifas del «Link para clientes» (tar=desde-hasta-precio,… en minutos): la primera es Valle, las demás Pico. PURA. */
export function leerTarifas(texto) {
  const t = String(texto ?? "").split(",").map((x) => x.split("-").map(Number)).filter((x) => x.length === 3 && x.every((n) => Number.isFinite(n) && n >= 0));
  return t.map(([desde, hasta, precioHora], i) => ({ nombre: i ? "Pico" : "Valle", desde, hasta, precioHora }));
}

/** Número de WhatsApp publicable: sólo dígitos, de 8 a 15 (el mismo criterio que el turnero). Si no, "". PURA. */
export function leerWhatsapp(texto) {
  const n = String(texto ?? "").replace(/[\s+().-]/g, "");
  return /^\d{8,15}$/.test(n) ? n : "";
}

/** El plano de las canchas desde arriba (viewBox 640 × 520). Cada cancha 10 × 20 m es un link al turnero. PURA. */
function plano(cantidad, techadas) {
  const n = Math.min(Math.max(Math.round(Number(cantidad) || 4), 1), 6);
  const W = 120, H = 240, gap = Math.min(28, (600 - n * W) / Math.max(n - 1, 1));
  const x0 = (640 - (n * W + (n - 1) * gap)) / 2, y0 = 150;
  // «Techada» sólo dice algo si hay techadas y descubiertas; si son todas, va una sola leyenda debajo.
  const mixto = techadas.length > 0 && techadas.length < n;
  const canchas = Array.from({ length: n }, (_, i) => {
    const x = Math.round(x0 + i * (W + gap)), num = i + 1, techo = mixto && techadas.includes(num);
    const s = Math.round(H * (6.95 / 20)); // línea de saque a 6,95 m de la red
    return `<a class="cancha" href="/turnero#cancha-${num}" aria-label="Cancha ${num}${techo ? ", techada" : ""}: ver horarios"><g transform="translate(${x} ${y0})"><rect class="cesped" width="${W}" height="${H}"/><path class="lineas" d="M${W / 2} ${H / 2 - s}V${H / 2 + s}M0 ${H / 2 - s}H${W}M0 ${H / 2 + s}H${W}"/><rect class="borde" width="${W}" height="${H}"/><path class="cristal" d="M0 48V0H${W}V48M0 ${H - 48}V${H}H${W}V${H - 48}"/><path class="red" d="M-6 ${H / 2}H${W + 6}"/><text class="num" x="${W / 2}" y="-22" text-anchor="middle">${num}</text>${techo ? `<text class="techo" x="${W / 2}" y="${H + 30}" text-anchor="middle">Techada</text>` : ""}</g></a>`;
  }).join("");
  const leyenda = techadas.length && !mixto ? `<text class="leyenda" x="320" y="${y0 + H + 54}" text-anchor="middle">${n === 1 ? "Cancha techada" : `Las ${n}, techadas`}</text>` : "";
  return `<svg class="plano-svg" viewBox="0 0 640 520" role="group" aria-label="Plano de las canchas del club: tocá una para ver sus horarios"><text class="pizarron" x="320" y="58" text-anchor="middle">Las canchas</text>${canchas}${leyenda}<g class="pelota"><ellipse class="sombra" cx="0" cy="16" rx="13" ry="4"/><circle r="13" fill="#DC6E22"/><path d="M-4 -12a12.5 12.5 0 0 0 0 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></g></svg>`;
}

const CSS = `
@font-face{font-family:Anton;font-style:normal;font-weight:400;font-display:swap;src:url(/tenants/breakpoint/fuentes/anton-400-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Barlow Semi Condensed";font-style:normal;font-weight:500;font-display:swap;src:url(/tenants/breakpoint/fuentes/barlow-semi-condensed-500-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Barlow Semi Condensed";font-style:normal;font-weight:700;font-display:swap;src:url(/tenants/breakpoint/fuentes/barlow-semi-condensed-700-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Anton Fallback";src:local("Arial");ascent-override:129.7%;descent-override:36.29%;line-gap-override:0%;size-adjust:90.69%}
@font-face{font-family:"Barlow Fallback";src:local("Arial");ascent-override:115.49%;descent-override:23.1%;line-gap-override:0%;size-adjust:86.59%}
:root{color-scheme:light dark;--azul:#035BA8;--azul-o:#02427D;--heroe:#035BA8;--pelota:#DC6E22;--nar-ui:#BF5A00;--nar-t:#8F4400;--nar-g:#DC6E22;
--tinta:#101418;--tinta2:#2B3138;--gris:#5B6570;--linea:#D7DCE2;--papel:#F5F7F9;--panel:#fff;--azul-txt:#035BA8;--cesped:#1F6E43;
--display:Anton,"Anton Fallback",Impact,"Arial Narrow",sans-serif;--ui:"Barlow Semi Condensed","Barlow Fallback","Arial Narrow",system-ui,sans-serif;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--g:clamp(16px,4vw,64px);--sec:clamp(64px,9vw,140px);--barra:76px}
@media (prefers-color-scheme:dark){:root{--heroe:#125095;--nar-t:#FFB873;--nar-g:#FFB873;--nar-ui:#FF9A3D;--tinta:#EEF2F6;--tinta2:#CBD3DC;--gris:#9AA7B5;--linea:#26323F;--papel:#0E1620;--panel:#141F2C;--azul-txt:#7DB6F2}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font:clamp(17px,1.1vw,19px)/1.5 var(--sans);overflow-x:clip;padding-bottom:calc(var(--barra) + env(safe-area-inset-bottom))}
@media (min-width:900px){body{padding-bottom:0}}
a{color:inherit}
:focus-visible{outline:3px solid var(--nar-ui);outline-offset:3px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cont{width:min(1280px,100%);margin:0 auto;padding:0 var(--g)}
h1,h2,h3{font-family:var(--display);font-weight:400;font-style:italic;text-transform:uppercase;letter-spacing:.01em;margin:0}
h2{font-size:clamp(34px,4.2vw,60px);line-height:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:60px;padding:0 28px;border-radius:2px;font:700 20px/1 var(--ui);text-transform:uppercase;letter-spacing:.04em;text-decoration:none;transition:transform 60ms cubic-bezier(.2,0,0,1)}
.btn:active,.franja:active{transform:scale(.97)}
.btn svg{width:24px;height:24px;flex:none}
.btn-blanco{background:#fff;color:var(--azul);box-shadow:inset 0 -3px 0 var(--pelota)}
.btn-azul{background:var(--azul);color:#fff;box-shadow:inset 0 -3px 0 var(--azul-o)}
/* encabezado: chapa azul con filete doble naranja (firma «Chapa») */
.top{background:var(--azul);color:#fff}
.top::after{content:"";display:block;height:5px;background:linear-gradient(var(--pelota) 0 2px,transparent 2px 3px,var(--pelota) 3px)}
.top .cont{height:72px;display:flex;align-items:center;gap:16px}
.top :focus-visible,.heroe :focus-visible,.barra :focus-visible{outline-color:#fff}
.top .logo{display:block;flex:none;box-shadow:0 0 0 2px #fff;border-radius:2px}
.top .nombre{font:400 italic 22px/1 var(--display);text-transform:uppercase;letter-spacing:.02em}
.top .acc{margin-left:auto;display:flex;gap:10px;align-items:center}
.top .btn{min-height:48px;padding:0 20px;font-size:17px}
.globo{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:2px;background:rgba(255,255,255,.14);color:#fff}
.globo svg{width:24px;height:24px}
@media (max-width:899px){.top .btn-head{display:none}}
@media (max-width:420px){.top .nombre{display:none}}
/* héroe: la cancha desde arriba */
.heroe{background:var(--heroe);color:#fff;overflow:hidden}
.heroe .cont{display:grid;gap:20px;padding-top:clamp(28px,5vw,72px);padding-bottom:clamp(40px,6vw,96px)}
.rotulo{margin:0;font:700 15px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:#DCE9F7}
.rotulo::before{content:"";display:inline-block;width:10px;height:10px;margin-right:10px;border-radius:50%;background:var(--pelota);vertical-align:1px}
h1{font-size:clamp(64px,12vw,168px);line-height:.88;text-wrap:balance}
h1 span{display:block;white-space:nowrap}
h1 .caja{width:fit-content;margin-top:.08em;padding:.04em .2em .06em .12em;background:#fff;color:var(--azul);clip-path:polygon(1.5% 6%,99% 0,100% 88%,97% 100%,0 96%)}
.bajada{margin:0;max-width:30em;font:500 clamp(20px,1.7vw,26px)/1.3 var(--ui);color:#F2F6FB}
.heroe .cta{justify-self:start}
.hoy{margin:8px 0 0;font:700 15px/1.2 var(--ui);letter-spacing:.08em;text-transform:uppercase;color:#DCE9F7}
.franjas{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.franja{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px;padding:0 20px;border:1px solid rgba(255,255,255,.45);border-left:6px solid #fff;border-radius:4px;background:rgba(255,255,255,.08);text-decoration:none;transition:transform 60ms cubic-bezier(.2,0,0,1)}
.franja b{font:400 italic 30px/1 var(--display);text-transform:uppercase;letter-spacing:.02em}
.franja span{font:700 15px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase;color:#DCE9F7}
.franja .pico{padding:5px 8px;border-radius:2px;background:var(--pelota);color:#101418;letter-spacing:.08em}
.franja.noche{border-left-color:var(--pelota)}
@media (hover:hover){.franja:hover{background:rgba(255,255,255,.16)}}
.plano{margin:0}
.plano-svg{display:block;width:100%;height:auto;aspect-ratio:640/520;overflow:visible}
.pizarron{font:400 italic 30px var(--display);text-transform:uppercase;letter-spacing:.06em;fill:#DCE9F7}
.cancha{cursor:pointer;outline:none}
.cancha>g>*{transition:stroke-width 140ms}
.cancha .cesped{fill:var(--cesped)}
.cancha .borde{fill:none;stroke:#fff;stroke-width:3}
.cancha .lineas{fill:none;stroke:#fff;stroke-width:2.5}
.cancha .cristal{fill:none;stroke:#BFE3FF;stroke-width:7;stroke-opacity:.75}
.cancha .red{stroke:#fff;stroke-width:4;stroke-linecap:round}
.cancha .num{font:400 italic 64px var(--display);fill:#fff}
.cancha .techo,.leyenda{font:700 20px var(--ui);letter-spacing:.08em;text-transform:uppercase;fill:#DCE9F7}
.cancha>g{transform-box:fill-box;transform-origin:center;transition:transform 140ms cubic-bezier(.2,0,0,1)}
@media (hover:hover){.cancha:hover>g{transform:scale(1.02)}.cancha:hover .borde,.cancha:hover .lineas{stroke-width:5}}
.cancha:focus-visible .borde{stroke:var(--pelota);stroke-width:8}
.cancha:focus-visible .num{fill:var(--pelota)}
.pelota{transform:translate(332px,470px)}
.pelota .sombra{fill:rgba(0,0,0,.25)}
@media (prefers-reduced-motion:no-preference){.pelota{animation:rueda 900ms 200ms cubic-bezier(.2,0,0,1) both}}
@keyframes rueda{from{transform:translate(700px,500px) rotate(540deg)}to{transform:translate(332px,470px) rotate(0)}}
@media (min-width:900px){
.heroe .cont{grid-template-columns:7fr 5fr;grid-template-areas:"rot rot" "h1 h1" "baj plano" "cta plano" "hoy plano" "fra plano";column-gap:clamp(24px,4vw,64px);align-items:start}
.rotulo{grid-area:rot}h1{grid-area:h1}.bajada{grid-area:baj}.heroe .cta{grid-area:cta}.hoy{grid-area:hoy}.franjas{grid-area:fra}
.plano{grid-area:plano;align-self:center}
.franjas{grid-template-columns:repeat(3,minmax(0,1fr))}
.franja{flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;min-height:96px}}
@media (max-width:899px){.plano{grid-row:3}.rotulo{grid-row:1}h1{grid-row:2}}
/* secciones */
.sec{padding:var(--sec) 0 0}
.sec h2{margin-bottom:clamp(24px,3vw,44px)}
.pasos{display:grid;gap:clamp(16px,2vw,32px);margin:0;padding:0;list-style:none;counter-reset:paso}
.pasos li{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:16px;padding-top:16px;border-top:2px solid var(--tinta);counter-increment:paso}
.pasos li::before{content:counter(paso);font:400 italic 72px/.9 var(--display);color:var(--nar-g)}
.pasos p{margin:0;font:500 clamp(20px,1.5vw,24px)/1.3 var(--ui)}
.pasos b{font-weight:700}
@media (min-width:900px){.pasos{grid-template-columns:repeat(3,minmax(0,1fr))}.pasos li{grid-template-columns:1fr}}
.tarifas{display:grid;gap:16px}
@media (min-width:700px){.tarifas{grid-template-columns:repeat(2,minmax(0,1fr))}}
.placa{padding:24px;background:var(--panel);border:1px solid var(--linea);border-left:6px solid var(--azul);border-radius:4px}
.placa.pico{border-left-color:var(--pelota)}
.placa h3{font-size:34px;line-height:1}
.precio{margin:12px 0 4px;font:700 40px/1 var(--ui);font-variant-numeric:tabular-nums}
.precio small{font-size:20px;font-weight:500;color:var(--gris)}
.placa p{margin:0;color:var(--tinta2)}
.nota{margin:16px 0 0;font-size:15px;color:var(--gris)}
.club{display:grid;gap:clamp(16px,2vw,32px)}
@media (min-width:900px){.club{grid-template-columns:repeat(2,minmax(0,1fr))}.club .escuelita{grid-column:1/-1;grid-template-columns:minmax(0,1fr) 300px;column-gap:clamp(24px,4vw,64px)}.escuelita>:not(img){grid-column:1}.escuelita img{grid-column:2;grid-row:1/span 6}}
.tarjeta{display:grid;align-content:start;gap:14px;padding:clamp(20px,2.4vw,32px);background:var(--panel);border:1px solid var(--linea);border-radius:4px}
.tarjeta h3{font-size:clamp(30px,3vw,44px);line-height:1}
.tarjeta p{margin:0;color:var(--tinta2)}
.tarjeta .btn{justify-self:start}
.horarios{display:grid;gap:0;margin:0;padding:0;list-style:none;font:500 clamp(18px,1.3vw,21px)/1.3 var(--ui);color:var(--tinta2)}
.horarios li{padding:10px 0;border-top:1px solid var(--linea)}
.horarios b{display:inline-block;min-width:5.5em;font-weight:700;color:var(--tinta)}
.escuelita img{display:block;width:100%;max-width:360px;height:auto;aspect-ratio:360/640;border-radius:4px;background:#E3EEF9}
.tarjeta .afiche{justify-self:start;padding:10px 16px 8px;background:var(--azul);color:#fff;font:400 italic clamp(26px,2.6vw,36px)/1 var(--display);text-transform:uppercase;letter-spacing:.02em;clip-path:polygon(1% 4%,99% 0,100% 92%,0 100%)}
.etiqueta{font:700 14px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:var(--nar-t)}
.enlace{display:inline-flex;align-items:center;gap:10px;min-height:48px;font:700 20px/1 var(--ui);color:var(--azul-txt);text-underline-offset:4px}
.enlace svg{width:26px;height:26px}
/* pie */
.pie{margin-top:var(--sec);padding:40px 0 calc(32px + env(safe-area-inset-bottom));border-top:2px solid var(--tinta)}
.pie .cont{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px}
.pie .marca{font:400 italic 32px/1 var(--display);text-transform:uppercase}
.pie p{margin:0}
.pie .enlace{font-size:17px}
.pie .aviso{flex-basis:100%;font-size:14px;opacity:.75}
/* barra fija del celular: siempre a un toque */
.barra{position:fixed;inset:auto 0 0;z-index:20;display:flex;gap:10px;padding:8px var(--g) calc(8px + env(safe-area-inset-bottom));background:var(--azul);border-top:3px solid var(--pelota);box-shadow:0 -12px 28px -14px rgba(16,20,24,.6)}
.barra .btn{flex:1;min-height:60px}
.barra .globo{width:60px;height:60px}
@media (min-width:900px){.barra{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-delay:0s!important;transition-duration:1ms!important}}
`;

// Nombre del día en hora argentina («Hoy, jueves 29»). Después del último turno de hoy (cierre − duración del turno,
// con los 15 min de margen del turnero) pasa a «Mañana, viernes 30», igual que el turnero. Sin JS queda «Hoy».
const HORARIOS = JSON.stringify(CONFIG_DEMO.horarios.map((h) => [h.abre, h.cierra]));
const JS = `(()=>{const e=document.getElementById("hoy-dia");if(!e)return;try{const H=${HORARIOS},D=${Number(CONFIG_DEMO.duracionTurno) || 90},P=${Number(CONFIG_DEMO.paso) || 30};const a=new Date(Date.now()-108e5),m=a.getUTCHours()*60+a.getUTCMinutes(),[ab,ci]=H[a.getUTCDay()],u=ab+Math.floor((ci-D-ab)/P)*P,man=m+15>u,f=new Date(a.getTime()+(man?864e5:0)),t=new Intl.DateTimeFormat("es-AR",{weekday:"long",day:"numeric",timeZone:"UTC"}).format(f).replace(",","");e.textContent=(man?"Mañana, ":"Hoy, ")+t;}catch{}})();`;

/** El HTML de la portada (estático; un script inline mínimo sólo para el nombre del día). PURA. */
export function portada(publico = {}) {
  const wa = leerWhatsapp(publico.whatsapp);
  const tarifas = leerTarifas(publico.tarifas);
  const hayTienda = Boolean(String(publico.catalogo ?? "").trim());
  const ubicacion = String(publico.ubicacion ?? "").trim();
  const techadas = Array.isArray(publico.techadas) ? publico.techadas.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
  // Sin WhatsApp publicado el pedido sale por mensaje al Instagram del club (el turnero lo copia y abre el chat).
  const canal = wa ? "por WhatsApp" : "por mensaje";
  const linkWa = (texto) => `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`;
  const globo = (clase = "globo") => (wa ? `<a class="${clase}" href="${esc(linkWa("Hola Break Point, quería consultar por un turno."))}" target="_blank" rel="noopener" aria-label="Escribirle al club por WhatsApp">${GLOBO}</a>` : "");
  const seccionTarifas = tarifas.length
    ? `<section class="sec cont" aria-labelledby="t-tarifas"><h2 id="t-tarifas">Tarifas</h2><div class="tarifas">${tarifas.map((t) => `<div class="placa${t.nombre === "Pico" ? " pico" : ""}"><h3>${t.nombre}</h3><p class="precio">${pesos(t.precioHora)} <small>por hora</small></p><p>De ${hhmm(t.desde)} a ${hhmm(t.hasta)}</p></div>`).join("")}</div><p class="nota">Seña por transferencia, con el código en el concepto. Precios de referencia: el club te los confirma ${canal}.</p></section>`
    : "";
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Break Point Pádel · reservá tu cancha</title>
<meta name="description" content="Break Point Pádel${ubicacion ? ` (${esc(ubicacion)})` : ""}: elegí día y horario, pedí tu cancha ${canal} y el club te confirma. Escuelita, torneos y el bodegón del club.">
<meta name="generator" content="Gestión Studio Grow">
<meta name="theme-color" content="#035BA8">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23035BA8'/%3E%3Ccircle cx='16' cy='16' r='8' fill='none' stroke='%23DC6E22' stroke-width='3'/%3E%3C/svg%3E">
<link rel="preload" href="/tenants/breakpoint/fuentes/anton-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS.trim()}</style>
</head>
<body>
<header class="top">
  <div class="cont">
    ${LOGO(56)}
    <span class="nombre">Break Point Pádel</span>
    <div class="acc">
      <a class="btn btn-blanco btn-head" href="/turnero#hoy">Reservá tu cancha</a>
      ${globo()}
    </div>
  </div>
</header>
<main>
  <section class="heroe" aria-labelledby="titulo">
    <div class="cont">
      <p class="rotulo">Club de pádel${ubicacion ? ` · ${esc(ubicacion)}` : ""}</p>
      <h1 id="titulo"><span>Reservá</span> <span class="caja">tu cancha</span></h1>
      <p class="bajada">Elegí el día y el horario, pedilo ${canal} y el club te confirma.</p>
      <a class="btn btn-blanco cta" href="/turnero">Elegí tu horario</a>
      <p class="hoy" id="hoy-dia">Hoy</p>
      <ul class="franjas" aria-label="Franjas del día: ver horarios">
        <li><a class="franja" href="/turnero#manana"><b>Mañana</b><span>Ver horarios</span></a></li>
        <li><a class="franja" href="/turnero#tarde"><b>Tarde</b><span>Ver horarios</span></a></li>
        <li><a class="franja noche" href="/turnero#noche"><b>Noche</b><span class="pico">Pico</span></a></li>
      </ul>
      <figure class="plano">${plano(publico.canchas, techadas)}</figure>
    </div>
  </section>

  <section class="sec cont" aria-labelledby="t-como">
    <h2 id="t-como">Cómo se reserva</h2>
    <ol class="pasos">
      <li><p><b>Elegí el día y el horario.</b></p></li>
      <li><p>${wa ? "<b>Pedilo por WhatsApp:</b> el mensaje sale armado con tu nombre." : "<b>Pedilo por mensaje:</b> sale armado con tu nombre y lo mandás al Instagram del club."}</p></li>
      <li><p><b>El club te confirma</b> y te pasa el alias para la seña.</p></li>
    </ol>
  </section>
  ${seccionTarifas}
  <section class="sec cont" aria-labelledby="t-club">
    <h2 id="t-club">El club</h2>
    <div class="club">
      <article class="tarjeta escuelita" aria-labelledby="t-escuelita">
        <span class="etiqueta">Para chicos</span>
        <h3 id="t-escuelita">Escuelita de pádel</h3>
        <p>De 5 a 12 años, por nivel. Anotate.</p>
        <!-- Horarios de la placa que publicó el club en Instagram (placa-escuelita.jpg): confirmar que sigan vigentes. -->
        <ul class="horarios">
          <li><b>Martes</b> 15 a 16 · inicial, 5 a 9 años</li>
          <li><b>Jueves</b> 15 a 16 · avanzado, 9 a 12 años</li>
          <li><b>Sábados</b> 9.30 a 10.30 · inicial, 5 a 9 años</li>
          <li><b>Sábados</b> 10.30 a 11.30 · avanzado, 9 a 12 años</li>
        </ul>
        ${wa ? `<a class="btn btn-azul" href="${esc(linkWa("Hola Break Point, quería anotar a mi hijo/a en la Escuelita de pádel."))}" target="_blank" rel="noopener">${GLOBO}Anotate por WhatsApp</a>` : ""}
        <img src="/tenants/breakpoint/escuelita-360.webp" width="360" height="640" sizes="(min-width:1024px) 360px, 90vw" loading="lazy" decoding="async" alt="Placa de la Escuelita de Pádel: martes y jueves 15 a 16, sábados 9.30 a 11.30">
      </article>
      <article class="tarjeta" aria-labelledby="t-torneos">
        <span class="etiqueta">Torneos</span>
        <h3 id="t-torneos">Sede del Circuito Padel Sur</h3>
        <p class="afiche">Copa Clubes · etapa 3</p>
        <p>En octubre de 2026 el club fue sede de la etapa 3 de la Copa Clubes. 70 jugadores eligieron representar a Break Point.</p>
      </article>
      <article class="tarjeta" aria-labelledby="t-delicias">
        <span class="etiqueta">Buffet</span>
        <h3 id="t-delicias">Delicias Break</h3>
        <p>El bodegón del club: antes o después del partido.</p>
      </article>${hayTienda ? `
      <article class="tarjeta" aria-labelledby="t-tienda">
        <span class="etiqueta">Shop</span>
        <h3 id="t-tienda">Tienda del club</h3>
        <p>Pelotas, grips y más: encargalo y lo retirás en el club.</p>
        <a class="enlace" href="/turnero#tienda">Ver la tienda</a>
      </article>` : ""}
    </div>
  </section>

  <section class="sec cont" aria-labelledby="t-donde">
    <h2 id="t-donde">${ubicacion ? "Dónde estamos" : "Seguí al club"}</h2>
    ${ubicacion ? `<p>${esc(ubicacion)}</p>` : ""}
    <a class="enlace" href="https://www.instagram.com/breakpointpadel_/" target="_blank" rel="noopener">${CAMARA}Instagram @breakpointpadel_</a>
  </section>
</main>
<footer class="pie">
  <div class="cont">
    <p class="marca">Break Point Pádel</p>
    <p><a class="enlace" href="https://www.instagram.com/breakpointpadel_/" target="_blank" rel="noopener">@breakpointpadel_</a>${wa ? ` · <a class="enlace" href="${esc(linkWa("Hola Break Point"))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</p>
    <p class="aviso">Logo, letras y plano de canchas provisionales, a confirmar con el club.</p>
  </div>
</footer>
<nav class="barra" aria-label="Reservar">
  <a class="btn btn-blanco" href="/turnero#hoy">Reservá tu cancha</a>
  ${globo()}
</nav>
<script>${JS}</script>
</body>
</html>
`;
}
