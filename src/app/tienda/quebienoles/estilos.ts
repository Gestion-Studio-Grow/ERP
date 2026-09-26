// La piel de Qué Bien Olés: CSS embebido y acotado bajo `.qb` (como la de Shine), así sólo viaja en la
// página de esta marca. Las fuentes se auto-hospedan y se declaran ACÁ, no en el layout (ADR-099 §Letra):
// ninguna otra vidriera ni el backoffice pagan un byte por ellas.
//
// Idioma visual, sacado de sus placas: negro laca, oro en degradé, didona blanca, rótulos en versales
// espaciadas, filetes dorados finos, mármol negro. Contraste medido sobre el fondo (#0b0908):
// hueso 16:1 · hueso-2 9,2:1 · hueso-3 5,6:1 · oro 9,9:1 — todo AA o más para texto chico.

export const FONDO = "#0b0908";
export const ORO = "#d8b36a";
/** La familia CSS de la didona, tal como se declara abajo (la usa el lienzo 3D para dibujar la Q). */
export const LETRA_DIDONA = '"QB Bodoni"';

const F = "/tenants/quebienoles/fuentes";

const GRANO =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Tokens, fuentes, botones, oro y grano: lo que comparten la vidriera y la página de gracias. */
export const CSS_BASE = `
@font-face{font-family:"QB Bodoni";src:url(${F}/bodoni-moda.woff2) format("woff2");font-weight:400 900;font-style:normal;font-display:swap}
@font-face{font-family:"QB Bodoni";src:url(${F}/bodoni-moda-italic.woff2) format("woff2");font-weight:400 900;font-style:italic;font-display:swap}
@font-face{font-family:"QB Jost";src:url(${F}/jost.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"QB Pinyon";src:url(${F}/pinyon-script.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}

.qb{
  --fondo:${FONDO};--fondo-2:#12100d;--fondo-3:#1b1713;
  --hueso:#f2eadc;--hueso-2:#bdb1a0;--hueso-3:#948877;
  --oro:${ORO};--oro-claro:#f6e3a8;--oro-oscuro:#8f6726;
  --linea:rgba(216,179,106,.24);--linea-2:rgba(242,234,220,.1);
  --didona:"QB Bodoni","Bodoni 72","Bodoni MT",Didot,"Times New Roman",serif;
  --palo:"QB Jost",Futura,"Century Gothic","Avenir Next",system-ui,sans-serif;
  --caligrafia:"QB Pinyon","Snell Roundhand","Apple Chancery","Segoe Script",cursive;
  --brillo:.5;--familia:${ORO};
  --curva:cubic-bezier(.2,.8,.2,1);
  position:relative;min-height:100vh;background:var(--fondo);color:var(--hueso);
  font-family:var(--palo);font-size:16px;line-height:1.6;overflow-x:clip;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.qb *,.qb *::before,.qb *::after{box-sizing:border-box}
.qb,.qb *{scrollbar-width:thin;scrollbar-color:rgba(216,179,106,.35) transparent}
.qb::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:70;opacity:.055;background-image:${GRANO};mix-blend-mode:overlay}
.qb a{color:inherit}
.qb :focus-visible{outline:2px solid var(--oro-claro);outline-offset:3px}
.qb .qb-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.qb .qb-tenue{color:var(--hueso-3)}
.qb .qb-num{font-variant-numeric:lining-nums tabular-nums}

/* El oro de sus placas: degradé que brilla donde está el puntero (en táctil, solo). */
.qb .qb-oro{
  background:linear-gradient(100deg,var(--oro-oscuro) 0%,var(--oro) 20%,var(--oro-claro) 36%,#fff5d6 44%,var(--oro) 58%,var(--oro-oscuro) 100%);
  background-size:260% 100%;background-position:calc(var(--brillo) * 100%) 50%;
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
  transition:background-position .8s var(--curva);
}
@media (hover:none){.qb .qb-oro{animation:qb-foil 8s ease-in-out infinite alternate}}
@keyframes qb-foil{from{background-position:0% 50%}to{background-position:100% 50%}}
@media (forced-colors:active){.qb .qb-oro{background:none;color:CanvasText;-webkit-text-fill-color:currentColor}}

.qb .qb-antetitulo{display:flex;align-items:center;gap:10px;margin:0 0 18px;font:500 12px/1 var(--palo);letter-spacing:.34em;text-transform:uppercase;color:var(--oro)}
.qb .qb-antetitulo::after{content:"";width:48px;height:1px;background:linear-gradient(90deg,var(--oro),transparent)}
.qb .qb-corona{width:22px;height:10px;color:var(--oro)}

.qb .qb-boton{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 28px;
  border:1px solid transparent;border-radius:1px;font:500 12.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;
  text-decoration:none;cursor:pointer;transition:transform .35s var(--curva),background-color .3s,color .3s,border-color .3s,box-shadow .35s;
}
.qb .qb-boton-oro{
  color:#140f09;border-color:rgba(255,236,190,.4);
  background:linear-gradient(100deg,#9a712d,var(--oro) 28%,var(--oro-claro) 50%,var(--oro) 72%,#9a712d);background-size:230% 100%;
  background-position:calc(var(--brillo) * 100%) 50%;box-shadow:0 14px 34px -16px rgba(216,179,106,.7),inset 0 1px 0 rgba(255,255,255,.4);
}
.qb .qb-boton-oro:hover{transform:translateY(-2px);box-shadow:0 20px 40px -16px rgba(216,179,106,.8),inset 0 1px 0 rgba(255,255,255,.4)}
.qb .qb-boton-linea{color:var(--hueso);border-color:var(--linea);background:rgba(242,234,220,.02)}
.qb .qb-boton-linea:hover{border-color:var(--oro);color:var(--oro-claro)}
.qb .qb-boton:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
.qb .qb-boton-ancho{width:100%}

@media (prefers-reduced-motion:reduce){
  .qb *,.qb *::before,.qb *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
}
`;

export const CSS =
  CSS_BASE +
  `
/* ── estructura ─────────────────────────────────────────────────────────── */
.qb main{display:block}
.qb .qb-saltar{position:fixed;left:16px;top:-80px;z-index:90;background:var(--oro);color:#140f09;padding:12px 18px;font-weight:600;text-decoration:none;transition:top .2s}
.qb .qb-saltar:focus{top:12px}
.qb .qb-estela{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:55;mix-blend-mode:screen}
.qb .qb-h2{margin:0;font:400 clamp(44px,6.4vw,96px)/.98 var(--didona);letter-spacing:-.015em;font-variation-settings:"opsz" 96;text-wrap:balance}
.qb .qb-h2 em{font-style:italic}
.qb .qb-lead{margin:18px 0 0;max-width:52ch;color:var(--hueso-2);font-size:clamp(16px,1.35vw,19px)}
.qb .qb-encabezado{padding:0 clamp(20px,5vw,72px);max-width:1180px}

/* aparición al entrar en pantalla, con la línea de tiempo del scroll (sin JS) */
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    .qb .qb-revela{animation:qb-revela both var(--curva);animation-timeline:view();animation-range:entry 4% cover 26%}
  }
}
@keyframes qb-revela{from{opacity:0;transform:translateY(38px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}

/* ── cabecera ───────────────────────────────────────────────────────────── */
.qb .qb-cabecera{position:fixed;inset:0 0 auto;z-index:40;display:flex;align-items:center;gap:28px;padding:12px clamp(16px,4vw,48px);min-height:68px;background:linear-gradient(rgba(11,9,8,.9),rgba(11,9,8,0))}
@supports (animation-timeline:scroll()){
  .qb .qb-cabecera{background:transparent;animation:qb-cabecera linear both;animation-timeline:scroll(root);animation-range:0 240px}
}
@keyframes qb-cabecera{to{background:rgba(11,9,8,.84);backdrop-filter:blur(14px) saturate(1.15);box-shadow:0 1px 0 var(--linea)}}
.qb .qb-marca{display:flex;align-items:baseline;gap:.2em;font:500 21px/1 var(--didona);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:var(--hueso);white-space:nowrap}
.qb .qb-marca-bien{font:400 1.3em/0 var(--caligrafia);letter-spacing:0;text-transform:none;color:var(--oro);transform:translateY(.08em)}
.qb .qb-nav{display:flex;gap:28px;margin-left:auto}
.qb .qb-nav a{font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;text-decoration:none;color:var(--hueso-2);padding:10px 0;background:linear-gradient(var(--oro),var(--oro)) 0 100%/0 1px no-repeat;transition:background-size .45s var(--curva),color .3s}
.qb .qb-nav a:hover{color:var(--hueso);background-size:100% 1px}
.qb .qb-boton-bolsa{position:relative;display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 16px;border:1px solid var(--linea);background:rgba(11,9,8,.4);color:var(--hueso);cursor:pointer;font:500 11.5px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase}
.qb .qb-boton-bolsa:hover{border-color:var(--oro)}
.qb .qb-icono-bolsa{width:20px;height:20px}
.qb .qb-bolsa-cuenta{display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--oro);color:#140f09;font:600 12px/1 var(--palo);letter-spacing:0}
.qb .qb-boton-bolsa[data-latido="0"] .qb-icono-bolsa{animation:qb-latido-a .6s var(--curva)}
.qb .qb-boton-bolsa[data-latido="1"] .qb-icono-bolsa{animation:qb-latido-b .6s var(--curva)}
@keyframes qb-latido-a{30%{transform:scale(1.35) rotate(-8deg)}60%{transform:scale(.92)}}
@keyframes qb-latido-b{30%{transform:scale(1.35) rotate(-8deg)}60%{transform:scale(.92)}}
@media (max-width:959px){.qb .qb-nav{display:none}.qb .qb-boton-bolsa{margin-left:auto}}
@media (max-width:420px){.qb .qb-bolsa-texto{display:none}.qb .qb-marca{font-size:18px}}

/* ── el portal ──────────────────────────────────────────────────────────── */
.qb .qb-portal{position:relative;min-height:100svh;display:grid;align-items:center;padding:120px clamp(20px,5vw,72px) 120px;isolation:isolate;overflow:hidden}
.qb .qb-frasco{position:absolute;inset:0;z-index:-1}
.qb .qb-frasco-lienzo{display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;opacity:1;transition:opacity 1.4s ease}
.qb .qb-frasco-lienzo:active{cursor:grabbing}
.qb .qb-frasco[data-estado="cargando"] .qb-frasco-lienzo{opacity:0}
.qb .qb-frasco[data-estado="sin-3d"] .qb-frasco-lienzo{display:none}
.qb .qb-frasco-respaldo{position:absolute;right:7%;bottom:14%;width:min(34vw,440px);mix-blend-mode:lighten;animation:qb-flotar 7s ease-in-out infinite}
.qb .qb-frasco-respaldo img{width:100%;height:auto;display:block}
.qb .qb-portal-texto{position:relative;max-width:660px;pointer-events:none}
.qb .qb-portal-texto a,.qb .qb-portal-texto button{pointer-events:auto}
.qb .qb-titular{margin:0;padding-top:.14em;display:grid;font:500 clamp(76px,11.6vw,184px)/.8 var(--didona);letter-spacing:-.018em;text-transform:uppercase;font-variation-settings:"opsz" 96;text-shadow:0 2px 40px rgba(0,0,0,.5)}
.qb .qb-titular>span{display:block;animation:qb-subir 1.2s var(--curva) both}
.qb .qb-t-que{animation-delay:.15s!important}
.qb .qb-t-bien{font:400 .74em/.9 var(--caligrafia);text-transform:none;letter-spacing:0;margin:-.24em 0 -.3em .82em;transform:rotate(-7deg);position:relative;z-index:1;text-shadow:none;animation:qb-escribir 1.6s cubic-bezier(.6,0,.2,1) .55s both!important;padding-right:.12em}
.qb .qb-t-oles{animation-delay:.32s!important}
@keyframes qb-subir{from{opacity:0;transform:translateY(.28em);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
@keyframes qb-escribir{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 -5% 0 0)}}
.qb .qb-bajada{margin:34px 0 0;font:400 clamp(20px,2vw,27px)/1.35 var(--didona);max-width:26ch;animation:qb-subir 1.2s var(--curva) .7s both}
.qb .qb-bajada strong{font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:.82em}
.qb .qb-bajada em{font-style:italic}
.qb .qb-sub{margin:14px 0 0;color:var(--hueso-2);max-width:44ch;animation:qb-subir 1.2s var(--curva) .82s both}
.qb .qb-acciones{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px;animation:qb-subir 1.2s var(--curva) .95s both}
.qb .qb-rocio{position:absolute;right:clamp(24px,12vw,220px);top:22%;margin:0;font:400 clamp(44px,5vw,78px)/1 var(--caligrafia);color:var(--oro-claro);text-shadow:0 0 30px rgba(246,227,168,.45);opacity:0;transform:translateY(16px) rotate(-6deg);filter:blur(8px);transition:opacity .7s var(--curva),transform 1.1s var(--curva),filter .7s;pointer-events:none}
.qb .qb-rocio[data-visible="true"]{opacity:1;transform:translateY(-10px) rotate(-6deg);filter:none}
.qb .qb-rociar{position:absolute;right:clamp(20px,8vw,150px);bottom:120px;display:inline-flex;align-items:center;gap:12px;min-height:44px;padding:0 18px;border:1px solid var(--linea);background:rgba(11,9,8,.55);backdrop-filter:blur(6px);color:var(--hueso-2);font:500 11px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}
.qb .qb-rociar:hover,.qb .qb-rociar:active{color:var(--hueso);border-color:var(--oro)}
.qb .qb-rociar-punto{width:8px;height:8px;border-radius:50%;background:var(--familia);box-shadow:0 0 0 0 var(--familia);animation:qb-pulso 2.2s ease-out infinite}
@keyframes qb-pulso{0%{box-shadow:0 0 0 0 color-mix(in oklab,var(--familia) 70%,transparent)}80%,100%{box-shadow:0 0 0 12px transparent}}
.qb .qb-hechos{position:absolute;left:clamp(20px,5vw,72px);right:clamp(20px,5vw,72px);bottom:34px;display:flex;flex-wrap:wrap;gap:10px 28px;margin:0;padding:18px 0 0;list-style:none;border-top:1px solid var(--linea);font:500 11px/1.4 var(--palo);letter-spacing:.26em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-hechos li{display:flex;align-items:center;gap:10px}
.qb .qb-hechos li::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--oro)}
@media (max-width:899px){
  .qb .qb-portal{display:flex;flex-direction:column;align-items:stretch;padding:104px 20px 28px;min-height:auto}
  .qb .qb-portal-texto{max-width:none}
  .qb .qb-titular{font-size:clamp(64px,21vw,120px)}
  .qb .qb-bajada{margin-top:26px}
  .qb .qb-frasco{position:relative;inset:auto;z-index:0;height:min(128vw,600px);margin:4px -20px 0}
  .qb .qb-frasco-respaldo{right:auto;left:50%;bottom:10%;width:62vw;margin-left:-31vw}
  .qb .qb-rociar{left:50%;right:auto;bottom:18px;transform:translateX(-50%);white-space:nowrap}
  .qb .qb-rocio{right:auto;left:10%;top:auto;bottom:34%}
  .qb .qb-hechos{position:static;margin-top:6px}
}

/* ── las cuatro puertas ─────────────────────────────────────────────────── */
.qb .qb-familias{padding:clamp(96px,13vw,190px) 0 clamp(80px,10vw,140px)}
.qb .qb-puertas{display:flex;gap:1px;margin-top:clamp(40px,6vw,72px);height:min(80vh,660px);background:var(--linea);border-block:1px solid var(--linea)}
.qb .qb-puerta{position:relative;flex:1 1 0;min-width:0;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:28px clamp(18px,2vw,30px) 30px;border:0;background:var(--fondo);color:var(--hueso);text-align:left;cursor:pointer;font:inherit;transition:flex-grow .8s var(--curva);container-type:inline-size}
.qb .qb-puerta::before{content:"";position:absolute;inset:0;background:radial-gradient(130% 70% at 50% 108%,color-mix(in oklab,var(--color-puerta) 38%,transparent),transparent 70%);opacity:0;transition:opacity .7s var(--curva)}
.qb .qb-puerta:hover,.qb .qb-puerta:focus-visible,.qb .qb-puerta[aria-pressed="true"]{flex-grow:1.75}
.qb .qb-puerta:hover::before,.qb .qb-puerta:focus-visible::before,.qb .qb-puerta[aria-pressed="true"]::before{opacity:1}
.qb .qb-puerta>*{position:relative}
.qb .qb-puerta-num{font:italic 400 16px/1 var(--didona);color:var(--hueso-3)}
.qb .qb-icono{width:66px;height:66px;color:var(--oro);flex:none}
.qb .qb-icono .qb-icono-aro{opacity:.7}
.qb .qb-icono-dibujo *{stroke-dasharray:1;stroke-dashoffset:0}
.qb .qb-puerta:hover .qb-icono-dibujo *,.qb .qb-puerta:focus-visible .qb-icono-dibujo *{animation:qb-trazo 1.3s cubic-bezier(.65,0,.25,1) both}
@keyframes qb-trazo{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.qb .qb-puerta-nombre{margin-top:auto;font:400 clamp(30px,16.5cqi,80px)/.92 var(--didona);letter-spacing:-.015em;white-space:nowrap}
.qb .qb-puerta-cuando{font:400 clamp(24px,10cqi,40px)/1 var(--caligrafia);color:var(--color-puerta);margin:-4px 0 4px 4px}
.qb .qb-puerta-bajada{max-width:26ch;color:var(--hueso-2);font-size:15px;line-height:1.5}
.qb .qb-puerta-cuenta{margin-top:10px;font:500 11.5px/1 var(--palo);letter-spacing:.26em;text-transform:uppercase;color:var(--oro)}
.qb .qb-puerta-abanico{position:absolute!important;right:-2%;top:8%;width:62%;height:52%;pointer-events:none}
.qb .qb-puerta-abanico img{position:absolute;bottom:0;left:calc(var(--k) * 24%);width:52%;height:auto;mix-blend-mode:lighten;opacity:0;transform:translateY(46%) rotate(calc((var(--k) - 1) * 10deg));transform-origin:50% 130%;transition:transform .9s var(--curva) calc(var(--k) * 80ms),opacity .7s ease calc(var(--k) * 80ms)}
.qb .qb-puerta:hover .qb-puerta-abanico img,.qb .qb-puerta:focus-visible .qb-puerta-abanico img,.qb .qb-puerta[aria-pressed="true"] .qb-puerta-abanico img{opacity:1;transform:translateY(0) rotate(calc((var(--k) - 1) * 10deg))}
@media (max-width:899px){
  .qb .qb-puertas{display:grid;grid-template-columns:1fr 1fr;height:auto}
  .qb .qb-puerta{min-height:380px;padding:18px 16px 22px}
  .qb .qb-puerta .qb-icono{display:none}
  .qb .qb-puerta-abanico{width:96%;height:160px;right:-10%;top:34px}
  .qb .qb-puerta-abanico img{opacity:.92;transform:translateY(0) rotate(calc((var(--k) - 1) * 10deg))}
  .qb .qb-icono{width:52px;height:52px}
}

/* ── ¿no sabés cuál elegir? ─────────────────────────────────────────────── */
.qb .qb-guia{padding:clamp(80px,10vw,150px) 0;background:linear-gradient(180deg,transparent,rgba(216,179,106,.035) 30%,transparent)}
.qb .qb-preguntas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(20px,3vw,40px);padding:0 clamp(20px,5vw,72px);margin-top:48px}
.qb .qb-pregunta{margin:0;padding:22px 0 0;border:0;border-top:1px solid var(--linea);min-width:0}
.qb .qb-pregunta legend{padding:0;margin-bottom:16px;font:400 24px/1.2 var(--didona)}
.qb .qb-pregunta-num{display:inline-grid;place-items:center;width:30px;height:30px;margin-right:8px;border:1px solid var(--oro);border-radius:50%;font:italic 400 15px/1 var(--didona);color:var(--oro);vertical-align:3px}
.qb .qb-pregunta[data-contestada="true"] .qb-pregunta-num{background:var(--oro);color:#140f09}
.qb .qb-opciones{display:grid;gap:8px}
.qb .qb-opcion{position:relative;display:flex;align-items:center;min-height:52px;padding:0 18px;border:1px solid var(--linea-2);cursor:pointer;transition:border-color .3s,background-color .3s,transform .3s var(--curva)}
.qb .qb-opcion input{position:absolute;opacity:0;pointer-events:none}
.qb .qb-opcion span{font-size:16px;color:var(--hueso-2);transition:color .3s}
.qb .qb-opcion:hover{border-color:var(--linea)}
.qb .qb-opcion:has(input:checked){border-color:var(--oro);background:rgba(216,179,106,.08);transform:translateX(4px)}
.qb .qb-opcion:has(input:checked) span{color:var(--hueso)}
.qb .qb-opcion:has(input:focus-visible){outline:2px solid var(--oro-claro);outline-offset:2px}
.qb .qb-respuesta{padding:48px clamp(20px,5vw,72px) 0}
.qb .qb-respuesta-titulo{margin:0 0 22px;font:italic 400 26px/1.2 var(--didona);color:var(--oro-claro)}
.qb .qb-respuesta-espera{margin:0;font-style:italic}
.qb .qb-recs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2.4vw,32px)}
.qb .qb-rec{display:grid;grid-template-columns:40% 1fr;gap:18px;align-items:start;padding:18px;border:1px solid var(--linea-2);background:radial-gradient(80% 70% at 20% 60%,color-mix(in oklab,var(--color-puerta) 14%,transparent),transparent 70%);animation:qb-revela .8s var(--curva) both;animation-delay:calc(var(--i) * 120ms)}
.qb .qb-rec-foto{border:0;padding:0;background:transparent;cursor:pointer}
.qb .qb-rec-foto img{width:100%;height:auto;mix-blend-mode:lighten;display:block}
.qb .qb-rec-orden{margin:0;font:500 10.5px/1 var(--palo);letter-spacing:.28em;text-transform:uppercase;color:var(--oro)}
.qb .qb-rec-nombre{margin:8px 0 6px;font:400 26px/1.1 var(--didona)}
.qb .qb-rec-nombre span{display:block;margin-top:4px;font:500 11px/1 var(--palo);letter-spacing:.26em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-rec-porque{margin:0;color:var(--hueso-2);font-size:14.5px;line-height:1.55}
.qb .qb-rec-precio{margin:10px 0 0;font:600 20px/1 var(--didona);color:var(--oro)}
.qb .qb-rec-acciones{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.qb .qb-guia-humana{margin:34px 0 0;color:var(--hueso-2)}
.qb .qb-guia-humana a,.qb .qb-como-pie a,.qb .qb-vacio a,.qb .qb-bolsa-nota a,.qb .qb-ficha-sinnotas a,.qb .qb-fuente a{color:var(--oro-claro);text-underline-offset:4px;text-decoration-thickness:1px}
.qb .qb-enlace{align-self:flex-start;border:0;background:none;padding:6px 0;color:var(--oro-claro);font:inherit;font-size:14px;text-decoration:underline;text-underline-offset:4px;cursor:pointer}
@media (max-width:1099px){.qb .qb-recs{grid-template-columns:1fr}.qb .qb-rec{grid-template-columns:120px 1fr}}
@media (max-width:899px){.qb .qb-preguntas{grid-template-columns:1fr}}

/* ── la vitrina ─────────────────────────────────────────────────────────── */
.qb .qb-vitrina{padding:clamp(90px,12vw,170px) clamp(20px,5vw,72px) clamp(60px,8vw,120px)}
.qb .qb-vitrina-cabeza{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:28px}
.qb .qb-herramientas{display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px}
.qb .qb-buscar input{width:min(360px,86vw);height:50px;padding:0 2px;border:0;border-bottom:1px solid var(--linea);border-radius:0;background:transparent;color:var(--hueso);font:400 17px var(--palo);outline:none;transition:border-color .3s}
.qb .qb-buscar input:focus{border-bottom-color:var(--oro)}
.qb .qb-buscar input::placeholder{color:var(--hueso-3)}
.qb .qb-vistas{display:inline-flex;border:1px solid var(--linea)}
.qb .qb-vistas button{height:46px;padding:0 18px;border:0;background:transparent;color:var(--hueso-2);font:500 11.5px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;cursor:pointer}
.qb .qb-vistas button[aria-pressed="true"]{background:var(--oro);color:#140f09}
.qb .qb-chips{position:sticky;top:67px;z-index:6;display:flex;gap:8px;margin:30px -4px 0;padding:14px 4px 18px;overflow-x:auto;scrollbar-width:none;background:linear-gradient(var(--fondo) 72%,rgba(11,9,8,0))}
.qb .qb-chips::-webkit-scrollbar{display:none}
.qb .qb-chips button{display:inline-flex;align-items:center;gap:9px;flex:none;height:44px;padding:0 16px;border:1px solid var(--linea-2);background:rgba(11,9,8,.6);color:var(--hueso-2);font:500 11.5px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:border-color .3s,color .3s,background-color .3s}
.qb .qb-chips button i{width:8px;height:8px;border-radius:50%;background:var(--color-puerta)}
.qb .qb-chips button span{color:var(--hueso-3);font-variant-numeric:tabular-nums;letter-spacing:.05em}
.qb .qb-chips button:hover{border-color:var(--linea)}
.qb .qb-chips button[aria-pressed="true"]{border-color:var(--oro);background:rgba(216,179,106,.1);color:var(--hueso)}
.qb .qb-vacio{padding:60px 0;text-align:center;color:var(--hueso-2)}
.qb .qb-vacio p:first-child{font:italic 400 28px var(--didona);color:var(--hueso)}
.qb .qb-estante{margin-top:clamp(52px,7vw,104px)}
.qb .qb-estante-cabeza{display:grid;grid-template-columns:auto 1fr;column-gap:18px;align-items:center;margin-bottom:30px}
.qb .qb-icono-chico{grid-row:span 2;width:54px;height:54px}
.qb .qb-h3{margin:0;font:400 clamp(36px,4.6vw,64px)/1 var(--didona);letter-spacing:-.01em}
.qb .qb-estante-cabeza p{margin:4px 0 0;font:italic 400 19px/1.3 var(--didona);color:var(--hueso-2)}
.qb .qb-piezas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:clamp(26px,3vw,44px) clamp(16px,2vw,28px)}
.qb .qb-repisa{height:1px;margin-top:26px;background:linear-gradient(90deg,transparent,var(--oro) 18%,var(--oro-claro) 50%,var(--oro) 82%,transparent);opacity:.55;box-shadow:0 0 22px 1px rgba(216,179,106,.35)}
.qb .qb-pieza{position:relative;display:flex;flex-direction:column;height:100%;perspective:900px}
.qb .qb-pieza-foto{position:relative;display:block;width:100%;aspect-ratio:4/5;padding:0;border:0;cursor:pointer;overflow:hidden;background:radial-gradient(68% 58% at 50% 64%,color-mix(in oklab,var(--color-puerta) 17%,transparent),transparent 72%),#070605;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .6s var(--curva)}
.qb .qb-pieza-foto img{display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:lighten;transition:transform .8s var(--curva)}
.qb .qb-pieza:hover .qb-pieza-foto img{transform:translateY(-7px) scale(1.04)}
.qb .qb-pieza-foto::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(38% 28% at var(--mx,50%) var(--my,30%),rgba(255,244,220,.2),transparent 70%);mix-blend-mode:screen;opacity:0;transition:opacity .5s}
.qb .qb-pieza:hover .qb-pieza-foto::after{opacity:1}
.qb .qb-pieza-sinfoto{display:grid;place-items:center;width:100%;height:100%;font:italic 400 96px/1 var(--didona);color:var(--oro);background:radial-gradient(50% 50% at 50% 50%,rgba(216,179,106,.12),transparent)}
.qb .qb-pieza-texto{display:grid;gap:3px;padding-top:16px}
.qb .qb-pieza-casa{margin:0;font:500 10.5px/1.2 var(--palo);letter-spacing:.3em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-pieza-nombre{margin:0;font:400 24px/1.12 var(--didona)}
.qb .qb-pieza-nombre button{padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.qb .qb-pieza-nombre button:hover{color:var(--oro-claro)}
.qb .qb-pieza-precio{margin:6px 0 0;font:600 20px/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}
.qb .qb-pieza-dispo{margin:6px 0 0;font:500 11px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;color:#e9b98a}
.qb .qb-sumar{width:100%;margin-top:auto;min-height:46px;border:1px solid var(--linea);background:transparent;color:var(--hueso);font:500 11px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;cursor:pointer;transition:background-color .3s,color .3s,border-color .3s}
.qb .qb-pieza .qb-sumar,.qb .qb-pieza .qb-cantidad{margin-top:16px}
.qb .qb-sumar:hover:not(:disabled){background:var(--oro);border-color:var(--oro);color:#140f09}
.qb .qb-sumar:disabled{opacity:.45;cursor:not-allowed}
.qb .qb-cantidad{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;height:46px;border:1px solid var(--oro)}
.qb .qb-cantidad button{height:100%;border:0;background:transparent;color:var(--oro-claro);font:400 22px/1 var(--palo);cursor:pointer}
.qb .qb-cantidad button:hover:not(:disabled){background:rgba(216,179,106,.12)}
.qb .qb-cantidad button:disabled{opacity:.35}
.qb .qb-cantidad span{text-align:center;font-variant-numeric:tabular-nums}
@media (max-width:719px){
  .qb .qb-piezas{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:64%;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 20px;margin:0 -20px;padding:4px 20px 20px;scrollbar-width:none}
  .qb .qb-piezas::-webkit-scrollbar{display:none}
  .qb .qb-piezas>li{scroll-snap-align:start}
  .qb .qb-chips{top:67px}
}

/* índice */
.qb .qb-indice{width:100%;margin-top:28px;border-collapse:collapse}
.qb .qb-indice th,.qb .qb-indice td{padding:16px 12px;border-bottom:1px solid var(--linea-2);text-align:left;vertical-align:middle}
.qb .qb-indice thead th{font:500 10.5px/1 var(--palo);letter-spacing:.28em;text-transform:uppercase;color:var(--hueso-3);border-bottom-color:var(--linea)}
.qb .qb-indice tbody th button{padding:0;border:0;background:none;color:var(--hueso);font:400 22px/1.2 var(--didona);text-align:left;cursor:pointer}
.qb .qb-indice tbody th button:hover{color:var(--oro-claro)}
.qb .qb-indice-n{font:italic 400 17px/1 var(--didona);color:var(--hueso-3);width:56px}
.qb .qb-indice td i{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:var(--color-puerta)}
.qb .qb-indice .qb-num{font:600 19px/1 var(--didona);color:var(--oro);text-align:right;white-space:nowrap}
.qb .qb-indice-sumar{min-height:40px;padding:0 14px;border:1px solid var(--linea);background:transparent;color:var(--hueso);font:500 10.5px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.qb .qb-indice-sumar:hover:not(:disabled){border-color:var(--oro);color:var(--oro-claro)}
.qb .qb-indice tbody tr{transition:background-color .3s}
.qb .qb-indice tbody tr:hover{background:rgba(216,179,106,.04)}
@media (max-width:719px){
  .qb .qb-indice thead{display:none}
  .qb .qb-indice tr{display:grid;grid-template-columns:40px 1fr auto;grid-template-areas:"n p precio" "n casa sumar";padding:14px 0;border-bottom:1px solid var(--linea-2)}
  .qb .qb-indice th,.qb .qb-indice td{padding:2px 6px;border:0}
  .qb .qb-indice-n{grid-area:n}
  .qb .qb-indice tbody th{grid-area:p}
  .qb .qb-indice td:nth-of-type(2){grid-area:casa;font-size:13px;color:var(--hueso-3)}
  .qb .qb-indice td:nth-of-type(3){display:none}
  .qb .qb-indice .qb-num{grid-area:precio}
  .qb .qb-indice td:last-child{grid-area:sumar;text-align:right}
}

/* ── para regalar ───────────────────────────────────────────────────────── */
.qb .qb-regalo{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr);gap:clamp(30px,5vw,80px);align-items:center;padding:clamp(90px,12vw,170px) clamp(20px,5vw,72px);border-top:1px solid var(--linea-2)}
.qb .qb-regalo-texto .qb-boton{margin-top:30px}
.qb .qb-regalo-nota{margin:14px 0 0;color:var(--hueso-3);font-size:14px}
.qb .qb-regalo-lista{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(14px,2vw,26px);align-items:end}
.qb .qb-regalo-lista li:nth-child(2){transform:translateY(-34px)}
.qb .qb-regalo-item{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;padding:0;border:0;background:none;color:var(--hueso);text-align:left;cursor:pointer;font:inherit}
.qb .qb-regalo-item img{width:100%;height:auto;mix-blend-mode:lighten;transition:transform .8s var(--curva)}
.qb .qb-regalo-item:hover img{transform:translateY(-8px) rotate(-2deg)}
.qb .qb-regalo-para{font:400 30px/1 var(--caligrafia);color:var(--oro-claro)}
.qb .qb-regalo-nombre{font:400 24px/1.1 var(--didona)}
.qb .qb-regalo-porque{font-size:14px;color:var(--hueso-2);line-height:1.5}
.qb .qb-regalo-precio{font:600 19px/1 var(--didona);color:var(--oro)}
@media (max-width:899px){.qb .qb-regalo{grid-template-columns:1fr}.qb .qb-regalo-lista{grid-template-columns:repeat(3,70%);overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -20px;padding:0 20px 10px}.qb .qb-regalo-lista li{scroll-snap-align:start}.qb .qb-regalo-lista li:nth-child(2){transform:none}}

/* ── cómo comprar ───────────────────────────────────────────────────────── */
.qb .qb-como{padding:clamp(80px,10vw,150px) clamp(20px,5vw,72px);border-top:1px solid var(--linea-2)}
.qb .qb-pasos{list-style:none;margin:56px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(24px,4vw,64px)}
.qb .qb-pasos li{padding-top:26px;border-top:1px solid var(--linea)}
.qb .qb-paso-num{font:italic 400 58px/1 var(--didona);color:var(--oro)}
.qb .qb-pasos h3{margin:16px 0 8px;font:400 30px/1.1 var(--didona)}
.qb .qb-pasos p{margin:0;color:var(--hueso-2);max-width:34ch}
.qb .qb-como-pie{margin:56px 0 0;color:var(--hueso-2);font-size:17px}
@media (max-width:899px){.qb .qb-pasos{grid-template-columns:1fr}}

/* ── pie ────────────────────────────────────────────────────────────────── */
.qb .qb-pie{padding:clamp(70px,9vw,130px) clamp(20px,5vw,72px) 40px;border-top:1px solid var(--linea);background:radial-gradient(80% 60% at 50% 0%,rgba(216,179,106,.07),transparent 70%)}
.qb .qb-pie-marca{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:0 .16em;margin:0;font:500 clamp(58px,13vw,210px)/.9 var(--didona);letter-spacing:-.02em;text-transform:uppercase;text-align:center}
.qb .qb-pie-marca .qb-oro{font:400 .7em/1 var(--caligrafia);text-transform:none;letter-spacing:0;transform:rotate(-6deg) translateY(.12em);padding:0 .08em}
.qb .qb-pie-lema{margin:22px 0 0;text-align:center;font:italic 400 clamp(18px,1.8vw,24px) var(--didona);color:var(--hueso-2)}
.qb .qb-pie-datos{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 34px;margin:40px 0 0;padding:0;list-style:none;font:500 11.5px/1.6 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-pie-ig{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--hueso)}
.qb .qb-pie-ig:hover{color:var(--oro-claro)}
.qb .qb-icono-ig{width:18px;height:18px}
.qb .qb-pie-casas{margin:44px 0 0;text-align:center;color:var(--hueso-3);font-size:13px;letter-spacing:.14em}

/* ── la ficha ───────────────────────────────────────────────────────────── */
.qb .qb-ficha,.qb .qb-bolsa{padding:0;border:0;background:transparent;color:var(--hueso);max-width:none;max-height:none;overflow:visible}
.qb .qb-ficha::backdrop,.qb .qb-bolsa::backdrop{background:rgba(5,4,3,.74);backdrop-filter:blur(8px)}
.qb .qb-ficha{width:min(1120px,94vw);height:min(780px,92vh);margin:auto}
.qb .qb-ficha-caja{position:relative;display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);height:100%;overflow:hidden;border:1px solid var(--linea);background:linear-gradient(180deg,#15120f,#0c0a08);animation:qb-abrir .55s var(--curva) both}
@keyframes qb-abrir{from{opacity:0;transform:translateY(24px) scale(.985)}}
.qb .qb-cerrar{position:absolute;top:14px;right:14px;z-index:3;display:grid;place-items:center;width:46px;height:46px;border:1px solid var(--linea);background:rgba(11,9,8,.7);color:var(--hueso);cursor:pointer}
.qb .qb-cerrar svg{width:20px;height:20px}
.qb .qb-cerrar:hover{border-color:var(--oro);color:var(--oro-claro)}
.qb .qb-ficha-foto{position:relative;display:grid;place-items:center;overflow:hidden;background:radial-gradient(58% 48% at 50% 62%,color-mix(in oklab,var(--color-puerta) 30%,transparent),transparent 72%),#070605}
.qb .qb-ficha-foto::before{content:"";position:absolute;left:50%;top:-10%;width:60%;height:80%;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,236,200,.14),transparent);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);filter:blur(10px)}
.qb .qb-ficha-foto img{position:relative;width:min(86%,440px);height:auto;mix-blend-mode:lighten;animation:qb-flotar 6.5s ease-in-out infinite}
@keyframes qb-flotar{50%{transform:translateY(-12px)}}
.qb .qb-ficha-sinfoto{font-size:200px}
.qb .qb-ficha-texto{overflow-y:auto;padding:56px clamp(24px,4vw,60px) 44px;overscroll-behavior:contain}
.qb .qb-ficha-casa{margin:0;font:500 11px/1.4 var(--palo);letter-spacing:.3em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-ficha-nombre{margin:12px 0 0;font:400 clamp(44px,5vw,76px)/.95 var(--didona);letter-spacing:-.015em;font-variation-settings:"opsz" 96}
.qb .qb-ficha-familia{display:flex;align-items:center;gap:10px;margin:18px 0 0;color:var(--hueso-2)}
.qb .qb-ficha-familia em{font-style:normal;font-family:var(--caligrafia);font-size:1.5em;color:var(--color-puerta)}
.qb .qb-icono-mini{width:34px;height:34px}
.qb .qb-ficha-precio{margin:22px 0 0;font:600 34px/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums}
.qb .qb-aviso{margin:16px 0 0;padding:12px 14px;border-left:2px solid var(--oro);background:rgba(216,179,106,.07);color:var(--hueso)}
.qb .qb-ficha-acciones{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.qb .qb-ficha-acciones>*{flex:1 1 200px}
.qb .qb-cantidad-grande{height:52px}
.qb .qb-ficha-sub{margin:44px 0 20px;font:500 11px/1 var(--palo);letter-spacing:.32em;text-transform:uppercase;color:var(--oro)}
.qb .qb-piramide ol{position:relative;list-style:none;margin:0;padding:0 0 0 32px}
.qb .qb-piramide ol::before{content:"";position:absolute;left:10px;top:10px;bottom:24px;width:1px;background:linear-gradient(var(--oro-claro),var(--oro) 50%,var(--oro-oscuro))}
.qb .qb-capa{position:relative;padding-bottom:24px}
.qb .qb-capa-nodo{position:absolute;left:-27px;top:7px;width:11px;height:11px;border:1px solid var(--oro);border-radius:50%;background:var(--fondo)}
.qb .qb-capa[data-capa="salida"] .qb-capa-nodo{background:var(--oro-claro);animation:qb-vapor 2.6s ease-out infinite}
.qb .qb-capa[data-capa="corazon"] .qb-capa-nodo{background:var(--oro)}
@keyframes qb-vapor{0%{box-shadow:0 0 0 0 rgba(246,227,168,.55)}70%,100%{box-shadow:0 0 0 14px rgba(246,227,168,0)}}
.qb .qb-capa-nombre{margin:0 0 10px;font:400 23px/1.2 var(--didona)}
.qb .qb-capa-nombre span{margin-left:10px;font:500 10.5px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-notas{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.qb .qb-notas li{padding:7px 13px;border:1px solid var(--linea-2);font-size:14.5px;line-height:1.2;animation:qb-nota .7s var(--curva) both;animation-delay:calc(var(--i) * 280ms + var(--k) * 70ms + 200ms)}
@keyframes qb-nota{from{opacity:0;transform:translateY(12px);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}
.qb .qb-acordes{margin:8px 0 0;color:var(--hueso-2);font-size:14.5px}
.qb .qb-acordes span{color:var(--hueso-3);font-size:11px;letter-spacing:.24em;text-transform:uppercase;margin-right:6px}
.qb .qb-fuente{margin:14px 0 0;color:var(--hueso-3);font-size:13px}
.qb .qb-ficha-sinnotas{margin:36px 0 0;color:var(--hueso-2)}
.qb .qb-parecidos ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
.qb .qb-parecidos button{display:flex;flex-direction:column;gap:6px;width:100%;padding:10px;border:1px solid var(--linea-2);background:#0a0807;color:var(--hueso);text-align:left;cursor:pointer;font:inherit}
.qb .qb-parecidos button:hover{border-color:var(--linea)}
.qb .qb-parecidos img{width:100%;height:auto;mix-blend-mode:lighten}
.qb .qb-parecido-nombre{font:400 17px/1.15 var(--didona)}
.qb .qb-parecido-precio{font-size:13px;color:var(--oro)}
@media (max-width:819px){
  .qb .qb-ficha{width:100vw;height:100dvh;max-height:100dvh;margin:0}
  .qb .qb-ficha-caja{grid-template-columns:1fr;grid-template-rows:auto;overflow-y:auto;border:0}
  .qb .qb-ficha-foto{height:48vh;min-height:300px}
  .qb .qb-ficha-foto img{width:auto;height:92%}
  .qb .qb-ficha-texto{overflow:visible;padding:28px 20px calc(40px + env(safe-area-inset-bottom))}
}

/* el frasco que viaja de la tarjeta a la ficha (View Transitions) y a la bolsa */
::view-transition-group(qb-frasco-activo){animation-duration:.6s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
::view-transition-old(qb-frasco-activo),::view-transition-new(qb-frasco-activo){mix-blend-mode:lighten}
.qb .qb-vuelo{position:fixed;z-index:85;pointer-events:none;object-fit:contain;mix-blend-mode:lighten;margin:0}

/* ── la bolsa ───────────────────────────────────────────────────────────── */
.qb .qb-bolsa{width:min(500px,100vw);height:100dvh;max-height:100dvh;margin:0 0 0 auto}
.qb .qb-bolsa[open] .qb-bolsa-caja{animation:qb-cajon .5s var(--curva) both}
@keyframes qb-cajon{from{opacity:0;transform:translateX(48px)}}
.qb .qb-bolsa-caja{display:flex;flex-direction:column;height:100%;border-left:1px solid var(--linea);background:#0f0c0a}
.qb .qb-bolsa-cabeza{display:flex;align-items:center;gap:14px;padding:22px 24px;border-bottom:1px solid var(--linea-2)}
.qb .qb-bolsa-cabeza h2{margin:0;font:400 34px/1 var(--didona);outline:none}
.qb .qb-bolsa-cuantos{color:var(--hueso-3);font-size:13px;letter-spacing:.14em;text-transform:uppercase}
.qb .qb-bolsa-cabeza .qb-cerrar{position:static;margin-left:auto}
.qb .qb-bolsa-vacia{flex:1;display:grid;place-content:center;justify-items:center;gap:6px;padding:40px 24px;text-align:center}
.qb .qb-bolsa-vacia p{margin:0}
.qb .qb-bolsa-vacia p:nth-of-type(1){font:italic 400 28px var(--didona)}
.qb .qb-bolsa-vacia .qb-boton{margin-top:22px}
.qb .qb-bolsa-vacia-icono{width:54px;height:54px;color:var(--oro);margin-bottom:10px}
.qb .qb-lineas{flex:1;overflow-y:auto;margin:0;padding:4px 24px;list-style:none;overscroll-behavior:contain}
.qb .qb-linea{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:14px;padding:18px 0;border-bottom:1px solid var(--linea-2)}
.qb .qb-linea-foto{display:grid;place-items:center;width:64px;aspect-ratio:4/5;background:#070605;font:italic 400 28px var(--didona);color:var(--oro)}
.qb .qb-linea-foto img{width:100%;height:100%;object-fit:contain;mix-blend-mode:lighten}
.qb .qb-linea-nombre{margin:0;font:400 20px/1.15 var(--didona)}
.qb .qb-linea-texto>p.qb-tenue{margin:2px 0 10px;font-size:12px;letter-spacing:.2em;text-transform:uppercase}
.qb .qb-linea-texto .qb-cantidad{width:132px;height:40px;grid-template-columns:40px 1fr 40px}
.qb .qb-linea-fin{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between}
.qb .qb-linea-fin p{margin:0;font:600 17px/1 var(--didona);color:var(--oro)}
.qb .qb-sacar{min-height:40px;padding:0;border:0;background:none;color:var(--hueso-3);font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.qb .qb-sacar:hover{color:var(--hueso)}
.qb .qb-error-linea{margin:8px 0 0;color:#f0b3a6;font-size:13.5px}
.qb .qb-bolsa-pie{display:grid;gap:12px;padding:18px 24px calc(18px + env(safe-area-inset-bottom));border-top:1px solid var(--linea);background:#0c0a08}
.qb .qb-totales{display:grid;gap:8px;margin:0}
.qb .qb-totales>div{display:flex;justify-content:space-between;gap:16px}
.qb .qb-totales dt{color:var(--hueso-2)}
.qb .qb-totales dd{margin:0}
.qb .qb-total{padding-top:10px;border-top:1px solid var(--linea-2)}
.qb .qb-total dt{color:var(--hueso)}
.qb .qb-total dd{font:600 26px/1 var(--didona);color:var(--oro)}
.qb .qb-bolsa-nota{margin:0;font-size:13.5px;line-height:1.5}
.qb .qb-error{margin:0;padding:12px 14px;border-left:2px solid #e07a6a;background:rgba(224,122,106,.09);color:#f5cfc6}
.qb .qb-datos{flex:1;display:grid;align-content:start;gap:18px;overflow-y:auto;padding:18px 24px 24px;overscroll-behavior:contain}
.qb .qb-volver{justify-self:start;min-height:40px;padding:0;border:0;background:none;color:var(--oro-claro);font:inherit;font-size:14px;cursor:pointer}
.qb .qb-campo{display:grid;gap:7px}
.qb .qb-campo>label{font:500 11px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-campo>label em{font-style:normal;letter-spacing:.06em;text-transform:none;color:var(--hueso-3)}
.qb .qb-campo input{height:52px;padding:0 14px;border:1px solid var(--linea-2);border-radius:0;background:#16120f;color:var(--hueso);font:400 16px var(--palo);outline:none;transition:border-color .25s,box-shadow .25s}
.qb .qb-campo input:focus{border-color:var(--oro);box-shadow:0 0 0 3px rgba(216,179,106,.18)}
.qb .qb-campo input::placeholder{color:var(--hueso-3)}
.qb .qb-campo small{color:var(--hueso-3);font-size:13px}
.qb .qb-entrega{display:grid;gap:10px;margin:0;padding:0;border:0}
.qb .qb-entrega legend{margin-bottom:10px;padding:0;font:500 11px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-entrega label{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid var(--linea-2);cursor:pointer;transition:border-color .25s,background-color .25s}
.qb .qb-entrega label:has(input:checked){border-color:var(--oro);background:rgba(216,179,106,.07)}
.qb .qb-entrega input{width:18px;height:18px;margin-top:3px;accent-color:var(--oro);flex:none}
.qb .qb-entrega strong{display:block;font-weight:500}
.qb .qb-entrega small{display:block;color:var(--hueso-3);font-size:13px}
.qb .qb-cupon summary{min-height:40px;display:flex;align-items:center;color:var(--hueso-2);cursor:pointer;font-size:14px}
.qb .qb-cupon-fila{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:8px}
.qb .qb-cupon-fila .qb-boton{min-height:52px}
@media (max-width:640px){
  .qb .qb-bolsa{width:100vw;height:92dvh;max-height:92dvh;margin:auto 0 0}
  .qb .qb-bolsa-caja{border-left:0;border-top:1px solid var(--linea);border-radius:16px 16px 0 0}
  .qb .qb-bolsa[open] .qb-bolsa-caja{animation-name:qb-hoja}
  @keyframes qb-hoja{from{opacity:0;transform:translateY(60px)}}
}
`;
