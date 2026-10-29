// La piel de Qué Bien Olés: CSS embebido y acotado bajo `.qb` (como la de Shine), así sólo viaja en la
// página de esta marca. Las fuentes se auto-hospedan y se declaran ACÁ, no en el layout (ADR-099 §Letra):
// ninguna otra vidriera ni el backoffice pagan un byte por ellas.
//
// Idioma visual, sacado de sus placas: negro laca, oro en degradé, didona blanca, rótulos en versales
// espaciadas, filetes dorados finos, mármol negro. Contraste medido sobre el fondo (#0b0908):
// hueso 16:1 · hueso-2 9,2:1 · hueso-3 5,6:1 · oro 9,9:1 · papel 13,9:1 — todo AA o más para texto chico.
// Tinta (#2a211b) sobre papel (#efe6d3): 12,6:1.
//
// Rediseño 29/10 (fronts/quebienoles/DISENO.md): escala más grande y con más aire, la TIRITA de papel
// como sistema (vitrina, guía, regalo, ficha, bolsa) y la barra fija de la bolsa en el teléfono.

// Los tokens (fondo, oro, didona) están en tokens.ts: este módulo lo importa SÓLO el servidor
// (QuebienolesVidriera.tsx y GraciasQuebienoles.tsx); ningún componente de cliente lo toca, así la piel
// viaja una sola vez, en el HTML, y no también dentro del JS del navegador.
import { CARPETA_FUENTES, FONDO, MARMOL, ORO, PAPEL, PAPEL_APAGADO, TINTA } from "./tokens";

const F = CARPETA_FUENTES;

const GRANO =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Tokens, fuentes, botones, oro y grano: lo que comparten la vidriera y la página de gracias. */
export const CSS_BASE = `
@font-face{font-family:"QB Bodoni";src:url(${F}/bodoni-moda.woff2) format("woff2");font-weight:400 900;font-style:normal;font-display:swap}
@font-face{font-family:"QB Bodoni";src:url(${F}/bodoni-moda-italic.woff2) format("woff2");font-weight:400 900;font-style:italic;font-display:swap}
@font-face{font-family:"QB Jost";src:url(${F}/jost.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"QB Pinyon";src:url(${F}/pinyon-script.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
/* Respaldos con métricas ajustadas (medidos con el cargador de next/font sobre estos archivos, como
   src/design/fuentes.ts): mientras llega la letra, Times/Arial ocupan EXACTAMENTE el mismo lugar y el
   cambio de letra no mueve el titular ni la bajada (CLS 0 por fuentes). Sólo actúan si el local() existe. */
@font-face{font-family:"QB Bodoni Respaldo";src:local("Times New Roman");ascent-override:97.77%;descent-override:34.76%;line-gap-override:0%;size-adjust:115.07%}
@font-face{font-family:"QB Bodoni Respaldo";font-style:italic;src:local("Times New Roman Italic"),local("TimesNewRomanPS-ItalicMT");ascent-override:105.29%;descent-override:37.44%;line-gap-override:0%;size-adjust:106.85%}
@font-face{font-family:"QB Jost Respaldo";src:local("Arial");ascent-override:112.02%;descent-override:39.26%;line-gap-override:0%;size-adjust:95.51%}
@font-face{font-family:"QB Pinyon Respaldo";src:local("Times New Roman");ascent-override:101.28%;descent-override:45.09%;line-gap-override:0%;size-adjust:85.23%}

.qb{
  --fondo:${FONDO};--fondo-2:#12100d;--fondo-3:#1b1713;
  --hueso:#f2eadc;--hueso-2:#bdb1a0;--hueso-3:#948877;
  --oro:${ORO};--oro-claro:#f6e3a8;--oro-oscuro:#8f6726;
  --papel:${PAPEL};--papel-apagado:${PAPEL_APAGADO};--tinta:${TINTA};--marmol:${MARMOL};
  --linea:rgba(216,179,106,.24);--linea-2:rgba(242,234,220,.1);
  --didona:"QB Bodoni","QB Bodoni Respaldo","Bodoni 72","Bodoni MT",Didot,"Times New Roman",serif;
  --palo:"QB Jost","QB Jost Respaldo",Futura,"Century Gothic","Avenir Next",system-ui,sans-serif;
  --caligrafia:"QB Pinyon","QB Pinyon Respaldo","Snell Roundhand","Apple Chancery","Segoe Script",cursive;
  --brillo:.5;--familia:${ORO};
  --curva:cubic-bezier(.2,.8,.2,1);
  /* Escala del rediseño: márgenes laterales, contenedor de 1520 px y aire entre secciones. */
  --margen:clamp(24px,6vw,104px);--ancho:1520px;
  --pad:max(var(--margen),calc((100vw - var(--ancho)) / 2));
  --seccion:clamp(128px,15vw,232px);
  position:relative;min-height:100vh;background:var(--fondo);color:var(--hueso);
  font-family:var(--palo);font-size:clamp(17px,1.15vw,20px);line-height:1.6;overflow-x:clip;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.qb *,.qb *::before,.qb *::after{box-sizing:border-box}
/* El body del ERP es crema: con esta piel, el rebote del scroll (iOS) y las barras nativas van en negro. */
html:has(.qb),body:has(.qb){background:${FONDO};color-scheme:dark}
.qb,.qb *{scrollbar-width:thin;scrollbar-color:rgba(216,179,106,.35) transparent}
.qb::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:70;opacity:.055;background-image:${GRANO};mix-blend-mode:overlay}
.qb a{color:inherit}
.qb :focus-visible{outline:2px solid var(--oro-claro);outline-offset:3px}
/* Seleccionar texto también es de la casa: oro sobre negro. El oro en degradé (fondo recortado por la
   letra) se rellena sólido al seleccionarlo, si no la selección lo dejaría invisible. */
.qb ::selection{background:var(--oro);color:#140f09;-webkit-text-fill-color:#140f09}
.qb ::target-text{background:var(--oro);color:#140f09}
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

.qb .qb-antetitulo{display:flex;align-items:center;gap:12px;margin:0 0 24px;font:500 12.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--oro)}
.qb .qb-antetitulo::after{content:"";width:56px;height:1px;background:linear-gradient(90deg,var(--oro),transparent)}
.qb .qb-corona{width:24px;height:11px;color:var(--oro)}

/* Botones: laca (radio 0), 60 px en compu y 56 px en el teléfono. Apretar cede un pelo (scale .98). */
.qb .qb-boton{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:60px;padding:0 34px;
  border:1px solid transparent;border-radius:0;font:500 13.5px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;
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
.qb .qb-boton:active:not(:disabled){transform:scale(.98);transition-duration:.12s}
.qb .qb-boton:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
.qb .qb-boton-ancho{width:100%}
@media (max-width:899px){.qb .qb-boton{min-height:56px;padding:0 26px}}

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
.qb .qb-h2{margin:0;font:400 clamp(56px,7.4vw,124px)/.96 var(--didona);letter-spacing:-.015em;font-variation-settings:"opsz" 96;text-wrap:balance}
.qb .qb-h2 em{font-style:italic}
.qb .qb-lead{margin:24px 0 0;max-width:48ch;color:var(--hueso-2);font-size:clamp(19px,1.5vw,24px);line-height:1.5}
.qb .qb-encabezado{padding:0 var(--pad);max-width:none}

/* aparición al entrar en pantalla, con la línea de tiempo del scroll (sin JS) */
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    .qb .qb-revela{animation:qb-revela both var(--curva);animation-timeline:view();animation-range:entry 4% cover 26%}
  }
}
@keyframes qb-revela{from{opacity:0;transform:translateY(38px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}

/* Lo que está muy abajo no se calcula ni se pinta hasta que se acerca (content-visibility): la primera
   pintura y cada scroll pagan sólo lo que está en pantalla. El alto estimado evita que la barra de
   scroll salte; después de la primera pasada el navegador recuerda el alto real (auto). */
.qb .qb-guia,.qb .qb-vitrina,.qb .qb-regalo,.qb .qb-como,.qb .qb-pie{content-visibility:auto}
.qb .qb-guia{contain-intrinsic-size:auto 1100px}
.qb .qb-vitrina{contain-intrinsic-size:auto 4200px}
.qb .qb-regalo{contain-intrinsic-size:auto 980px}
.qb .qb-como{contain-intrinsic-size:auto 760px}
.qb .qb-pie{contain-intrinsic-size:auto 640px}

/* Carruseles del teléfono: las orillas se funden con el fondo, y la orilla del lado donde ya no hay
   nada se abre (línea de tiempo del scroll del propio carrusel; sin soporte queda el fundido parejo). */
@property --qb-orilla-i{syntax:"<length>";inherits:false;initial-value:20px}
@property --qb-orilla-d{syntax:"<length>";inherits:false;initial-value:20px}
@supports (animation-timeline:scroll()){
  @media (prefers-reduced-motion:no-preference){
    .qb .qb-carrusel{animation:qb-orillas linear both;animation-timeline:scroll(self inline)}
  }
}
@keyframes qb-orillas{0%{--qb-orilla-i:0px;--qb-orilla-d:40px}12%,88%{--qb-orilla-i:40px;--qb-orilla-d:40px}100%{--qb-orilla-i:40px;--qb-orilla-d:0px}}

/* ── la mesa y la tirita (sistema: vitrina, guía, regalo, ficha, bolsa) ───────────────────────── */
/* La mesa: mármol negro con vetas doradas muy tenues y un reflejo del color de la familia abajo.
   Es un grupo aislado: la capa del frasco se funde con ella (lighten) y el fondo negro de la foto de
   Instagram desaparece, así el frasco queda apoyado sobre el mármol, delante de la tirita. */
.qb .qb-mesa{position:relative;display:block;width:100%;aspect-ratio:4/6;isolation:isolate;overflow:hidden;container-type:inline-size;
  background:
    radial-gradient(64% 26% at 50% 98%,color-mix(in oklab,var(--color-puerta,var(--oro)) 20%,transparent),transparent 72%),
    linear-gradient(118deg,transparent 30%,rgba(216,179,106,.08) 31.2%,transparent 33%,transparent 61%,rgba(216,179,106,.06) 62%,transparent 63.6%),
    linear-gradient(64deg,transparent 52%,rgba(242,234,220,.035) 53%,transparent 55%),
    var(--marmol)}
/* La tirita: papel secante, esquinas de 2 px, inclinada (alterna por posición), con la mancha del
   rocío en el color de la familia. Sale por detrás del frasco hacia arriba; abajo se funde con la mesa. */
.qb .qb-tirita{position:absolute;left:31%;width:38%;top:4.5%;bottom:47%;z-index:0;display:flex;flex-direction:column;align-items:center;padding:13cqi 8px 0;border-radius:2px;
  background:radial-gradient(80% 30% at 50% 30%,color-mix(in oklab,var(--color-puerta,var(--oro)) 26%,transparent),transparent 74%),var(--papel);
  color:var(--tinta);text-align:center;box-shadow:0 24px 40px -20px #000;
  -webkit-mask-image:linear-gradient(#000 82%,transparent);mask-image:linear-gradient(#000 82%,transparent);
  transform:rotate(var(--giro,-1.5deg));transform-origin:50% 100%;transition:transform .45s var(--curva)}
/* la línea del troquel, arriba, como las tiras de verdad */
.qb .qb-tirita::before{content:"";position:absolute;left:10%;right:10%;top:7cqi;border-top:1px dashed rgba(42,33,27,.28)}
.qb .qb-tirita[data-apagada]{background:var(--papel-apagado);color:#5a5047}
.qb .qb-tirita[data-sinfoto]{bottom:8%;left:28%;width:44%;-webkit-mask-image:none;mask-image:none}
.qb .qb-tirita-q{width:52%;margin:auto 0 22%;color:var(--tinta);opacity:.86}
.qb .qb-tirita-rotulo{display:grid;justify-items:center;gap:6px;width:100%}
.qb .qb-tirita-nombre{margin:0;font:400 clamp(20px,8.4cqi,34px)/1.02 var(--caligrafia);color:inherit;text-wrap:balance;overflow-wrap:break-word}
.qb .qb-tirita-casa{margin:0;font:500 10px/1.25 var(--palo);letter-spacing:.2em;text-transform:uppercase;color:rgba(42,33,27,.72)}
.qb .qb-mesa-capa{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;margin:0;padding:0;border:0;background:transparent;mix-blend-mode:lighten}
.qb .qb-mesa-frasco{position:absolute;left:21%;bottom:2.5%;width:58%;height:auto;aspect-ratio:4/5;object-fit:contain}
@media (hover:hover) and (pointer:fine){
  .qb .qb-pieza:hover .qb-tirita,.qb .qb-regalo-item:hover .qb-tirita,.qb .qb-rec:hover .qb-tirita,.qb .qb-parecidos button:hover .qb-tirita{transform:translateY(-6px) rotate(0deg)}
}

/* ── cabecera ───────────────────────────────────────────────────────────── */
.qb .qb-cabecera{position:fixed;inset:0 0 auto;z-index:40;display:flex;align-items:center;gap:32px;padding:12px var(--margen);min-height:76px;background:linear-gradient(rgba(11,9,8,.9),rgba(11,9,8,0))}
@supports (animation-timeline:scroll()){
  .qb .qb-cabecera{background:transparent;animation:qb-cabecera linear both;animation-timeline:scroll(root);animation-range:0 240px}
}
@keyframes qb-cabecera{to{background:rgba(11,9,8,.84);backdrop-filter:blur(14px) saturate(1.15);box-shadow:0 1px 0 var(--linea)}}
.qb .qb-marca{display:flex;align-items:baseline;gap:.2em;font:500 23px/1 var(--didona);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:var(--hueso);white-space:nowrap}
.qb .qb-marca-bien{font:400 1.3em/0 var(--caligrafia);letter-spacing:0;text-transform:none;color:var(--oro);transform:translateY(.08em)}
.qb .qb-nav{display:flex;gap:32px;margin-left:auto}
.qb .qb-nav a{font:500 12.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;text-decoration:none;color:var(--hueso-2);padding:12px 0;background:linear-gradient(var(--oro),var(--oro)) 0 100%/0 1px no-repeat;transition:background-size .45s var(--curva),color .3s}
.qb .qb-nav a:hover{color:var(--hueso);background-size:100% 1px}
.qb .qb-boton-bolsa{position:relative;display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 18px;border:1px solid var(--linea);background:rgba(11,9,8,.4);color:var(--hueso);cursor:pointer;font:500 12.5px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;transition:border-color .3s,transform .12s}
.qb .qb-boton-bolsa:hover{border-color:var(--oro)}
.qb .qb-boton-bolsa:active{transform:scale(.98)}
.qb .qb-icono-bolsa{width:20px;height:20px}
.qb .qb-bolsa-cuenta{display:grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--oro);color:#140f09;font:600 12.5px/1 var(--palo);letter-spacing:0;font-variant-numeric:tabular-nums}
.qb [data-latido="0"] .qb-icono-bolsa{animation:qb-latido-a .6s var(--curva)}
.qb [data-latido="1"] .qb-icono-bolsa{animation:qb-latido-b .6s var(--curva)}
@keyframes qb-latido-a{30%{transform:scale(1.35) rotate(-8deg)}60%{transform:scale(.92)}}
@keyframes qb-latido-b{30%{transform:scale(1.35) rotate(-8deg)}60%{transform:scale(.92)}}
@media (max-width:1059px){.qb .qb-nav{display:none}.qb .qb-boton-bolsa{margin-left:auto}}
/* En el teléfono la bolsa vive en la barra fija de abajo (§6 del diseño). */
@media (max-width:899px){.qb .qb-cabecera{min-height:64px;padding-inline:20px}.qb .qb-boton-bolsa{display:none}.qb .qb-marca{font-size:20px}}

/* ── el portal ──────────────────────────────────────────────────────────── */
/* Compu: titular + bajada + botones + barra de hechos tienen que entrar en 900 px de alto. */
.qb .qb-portal{position:relative;min-height:100svh;display:grid;align-items:center;padding:92px var(--pad) 96px;isolation:isolate;overflow:hidden}
/* El escenario: la caja de la Q (respaldo, en el HTML del servidor, con prioridad) debajo y el lienzo 3D
   encima. El lienzo aparece en fundido sobre la caja cuando la escena está lista: nada aparece de golpe. */
.qb .qb-escenario{position:absolute;inset:0;z-index:-1}
.qb .qb-frasco{position:absolute;inset:0}
.qb .qb-frasco-lienzo{display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;opacity:1;transition:opacity 1.6s ease .1s}
.qb .qb-frasco-lienzo:active{cursor:grabbing}
.qb .qb-frasco[data-estado="cargando"] .qb-frasco-lienzo{opacity:0}
.qb .qb-frasco[data-estado="sin-3d"] .qb-frasco-lienzo{display:none}
.qb .qb-frasco-respaldo{position:absolute;right:7%;bottom:15%;width:min(30vw,440px);mix-blend-mode:lighten;pointer-events:none;animation:qb-flotar 7s ease-in-out infinite;transition:opacity 1.4s ease .4s,visibility 0s}
/* La foto viene con su propio fondo (mármol y viñeta, no negro puro): se funde por los bordes para que
   no se lea el rectángulo de la foto sobre la página. */
.qb .qb-frasco-respaldo img{width:100%;height:auto;display:block;mask-image:radial-gradient(ellipse 58% 56% at 50% 60%,#000 46%,transparent 100%)}
/* Con la escena lista la caja se va en fundido (y se oculta recién al final); si el 3D se pierde después
   (contexto WebGL), vuelve al instante. */
.qb .qb-escenario:has(.qb-frasco[data-estado="listo"]) .qb-frasco-respaldo{opacity:0;visibility:hidden;transition:opacity 1.4s ease .4s,visibility 0s 1.8s}
/* El texto ocupa 7/12 a la izquierda; el frasco (en 3D, ≈ 70 % del ancho) queda libre a la derecha. */
.qb .qb-portal-texto{position:relative;max-width:min(58vw,880px);pointer-events:none}
.qb .qb-portal-texto a,.qb .qb-portal-texto button{pointer-events:auto}
.qb .qb-titular{margin:0;padding-top:.14em;display:grid;font:500 clamp(96px,13.5vw,232px)/.8 var(--didona);letter-spacing:-.018em;text-transform:uppercase;font-variation-settings:"opsz" 96;text-shadow:0 2px 40px rgba(0,0,0,.5)}
.qb .qb-titular>span{display:block;animation:qb-subir 1.2s var(--curva) both}
.qb .qb-t-que{animation-delay:.15s!important}
.qb .qb-t-bien{font:400 .74em/.9 var(--caligrafia);text-transform:none;letter-spacing:0;margin:-.24em 0 -.3em .82em;transform:rotate(-7deg);position:relative;z-index:1;text-shadow:none;animation:qb-escribir 1.6s cubic-bezier(.6,0,.2,1) .55s both!important;padding-right:.12em}
.qb .qb-t-oles{animation-delay:.32s!important}
/* La entrada del titular NO toca la opacidad: Chrome no toma como candidato a LCP un texto que empieza en
   opacity 0, y el titular (o la bajada) tiene que contar desde el primer pintado. Sube y enfoca, nada más. */
@keyframes qb-subir{from{transform:translateY(.28em);filter:blur(12px)}to{transform:none;filter:none}}
@keyframes qb-escribir{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 -5% 0 0)}}
.qb .qb-bajada{margin:28px 0 0;font:400 clamp(24px,2.2vw,34px)/1.3 var(--didona);max-width:26ch;animation:qb-subir 1.2s var(--curva) .7s both}
.qb .qb-bajada strong{font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:.82em}
.qb .qb-bajada em{font-style:italic}
.qb .qb-sub{margin:12px 0 0;color:var(--hueso-2);max-width:44ch;font-size:clamp(19px,1.5vw,24px);line-height:1.5;animation:qb-subir 1.2s var(--curva) .82s both}
.qb .qb-acciones{display:flex;flex-wrap:wrap;gap:14px;margin-top:30px;animation:qb-subir 1.2s var(--curva) .95s both}
.qb .qb-rocio{position:absolute;right:clamp(24px,12vw,220px);top:22%;margin:0;font:400 clamp(44px,5vw,78px)/1 var(--caligrafia);color:var(--oro-claro);text-shadow:0 0 30px rgba(246,227,168,.45);opacity:0;transform:translateY(16px) rotate(-6deg);filter:blur(8px);transition:opacity .7s var(--curva),transform 1.1s var(--curva),filter .7s;pointer-events:none}
.qb .qb-rocio[data-visible="true"]{opacity:1;transform:translateY(-10px) rotate(-6deg);filter:none}
/* La barra de hechos, abajo del portal. El cuarto hecho es el botón de rociar (vive en el escenario,
   Frasco.tsx) y se ubica al final de esta línea: ya no flota encima del frasco. */
.qb .qb-hechos{position:absolute;left:var(--pad);right:var(--pad);bottom:34px;display:flex;flex-wrap:wrap;gap:12px 32px;margin:0;padding:20px 340px 0 0;list-style:none;border-top:1px solid var(--linea);font:500 12.5px/1.4 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-2);pointer-events:none}
.qb .qb-hechos li{display:flex;align-items:center;gap:10px}
.qb .qb-hechos li::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--oro)}
.qb .qb-rociar{position:absolute;right:var(--pad);bottom:22px;display:inline-flex;align-items:center;gap:12px;min-height:44px;padding:0 4px;border:0;background:transparent;color:var(--hueso);font:500 12.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;transition:color .3s,transform .12s}
.qb .qb-rociar:hover{color:var(--oro-claro)}
.qb .qb-rociar:active{transform:scale(.98)}
.qb .qb-rociar-punto{width:9px;height:9px;border-radius:50%;background:var(--familia);box-shadow:0 0 0 0 var(--familia);animation:qb-pulso 2.2s ease-out infinite}
.qb .qb-rociar-gota{display:none;width:20px;height:20px}
@keyframes qb-pulso{0%{box-shadow:0 0 0 0 color-mix(in oklab,var(--familia) 70%,transparent)}80%,100%{box-shadow:0 0 0 12px transparent}}
@media (max-width:1199px) and (min-width:900px){.qb .qb-hechos{padding-right:0;bottom:84px}}
/* Teléfono, 390: tres filas en la primera pantalla — (1) antetítulo + titular, (2) el escenario con el
   frasco ENTERO y centrado, (3) bajada y botones. El texto se parte en dos bloques (display: contents)
   y el escenario va en medio con order. */
@media (max-width:899px){
  .qb .qb-portal{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;align-items:start;min-height:100svh;padding:88px var(--margen) 32px}
  .qb .qb-portal-texto{display:contents}
  .qb .qb-portal-cabeza{order:1}
  .qb .qb-escenario{order:2;position:relative;inset:auto;z-index:0;height:min(100vw,48svh);margin:6px calc(var(--margen) * -1) 0}
  .qb .qb-portal-pie{order:3}
  .qb .qb-hechos{order:4;position:static;margin-top:32px;padding:18px 0 0;gap:10px 22px;font-size:11.5px;letter-spacing:.2em}
  .qb .qb-titular{font-size:clamp(72px,22vw,124px)}
  .qb .qb-antetitulo{margin-bottom:18px}
  .qb .qb-bajada{margin-top:22px}
  .qb .qb-acciones{margin-top:26px}
  .qb .qb-acciones .qb-boton-oro{flex:1 1 100%}
  /* «Ver los 25 perfumes» como enlace: el botón principal es uno solo. */
  .qb .qb-acciones-ver{min-height:48px;padding:0;border:0;background:none;color:var(--oro-claro);text-decoration:underline;text-underline-offset:6px;text-decoration-thickness:1px}
  .qb .qb-frasco-respaldo{right:auto;left:50%;bottom:4%;width:min(66vw,36svh);margin-left:calc(min(66vw,36svh) / -2)}
  /* La pastilla de rociar: adentro del escenario, abajo a la derecha, sólo la gota. */
  .qb .qb-rociar{right:16px;bottom:16px;width:48px;height:48px;min-height:0;justify-content:center;padding:0;border:1px solid var(--linea);border-radius:999px;background:rgba(11,9,8,.62)}
  .qb .qb-rociar-punto,.qb .qb-rociar-texto{display:none}
  .qb .qb-rociar-gota{display:block;color:var(--oro-claro)}
  .qb .qb-rocio{right:auto;left:6%;top:6%;bottom:auto}
}

/* ── las cuatro puertas ─────────────────────────────────────────────────── */
.qb .qb-familias{padding:var(--seccion) 0 calc(var(--seccion) * .6)}
.qb .qb-puertas{display:flex;gap:1px;margin-top:clamp(48px,6vw,88px);height:min(84vh,760px);background:var(--linea);border-block:1px solid var(--linea)}
.qb .qb-puerta{position:relative;flex:1 1 0;min-width:0;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:34px clamp(20px,2.2vw,36px) 36px;border:0;background:var(--fondo);color:var(--hueso);text-align:left;cursor:pointer;font:inherit;transition:flex-grow .8s var(--curva);container-type:inline-size}
.qb .qb-puerta::before{content:"";position:absolute;inset:0;background:radial-gradient(130% 70% at 50% 108%,color-mix(in oklab,var(--color-puerta) 38%,transparent),transparent 70%);opacity:0;transition:opacity .7s var(--curva)}
.qb .qb-puerta:hover,.qb .qb-puerta:focus-visible,.qb .qb-puerta[aria-pressed="true"]{flex-grow:1.75}
.qb .qb-puerta:hover::before,.qb .qb-puerta:focus-visible::before,.qb .qb-puerta[aria-pressed="true"]::before{opacity:1}
.qb .qb-puerta:focus-visible{outline-offset:-4px}
.qb .qb-puerta>*{position:relative}
.qb .qb-puerta-num{font:italic 400 18px/1 var(--didona);color:var(--hueso-3)}
.qb .qb-icono{width:72px;height:72px;color:var(--oro);flex:none}
.qb .qb-icono .qb-icono-aro{opacity:.7}
.qb .qb-icono-dibujo *{stroke-dasharray:1;stroke-dashoffset:0}
.qb .qb-puerta:hover .qb-icono-dibujo *,.qb .qb-puerta:focus-visible .qb-icono-dibujo *{animation:qb-trazo 1.3s cubic-bezier(.65,0,.25,1) both}
@keyframes qb-trazo{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.qb .qb-puerta-nombre{margin-top:auto;font:400 clamp(34px,16.5cqi,92px)/.92 var(--didona);letter-spacing:-.015em;white-space:nowrap}
.qb .qb-puerta-cuando{font:400 clamp(26px,10cqi,46px)/1 var(--caligrafia);color:var(--color-puerta);margin:-4px 0 4px 4px}
.qb .qb-puerta-bajada{max-width:26ch;color:var(--hueso-2);font-size:17px;line-height:1.5}
.qb .qb-puerta-cuenta{margin-top:12px;font:500 12.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--oro)}
.qb .qb-puerta-abanico{position:absolute!important;right:-2%;top:8%;width:62%;height:52%;pointer-events:none}
.qb .qb-puerta-abanico img{position:absolute;bottom:0;left:calc(var(--k) * 24%);width:52%;height:auto;mix-blend-mode:lighten;opacity:0;transform:translateY(46%) rotate(calc((var(--k) - 1) * 10deg));transform-origin:50% 130%;transition:transform .9s var(--curva) calc(var(--k) * 80ms),opacity .7s ease calc(var(--k) * 80ms)}
.qb .qb-puerta:hover .qb-puerta-abanico img,.qb .qb-puerta:focus-visible .qb-puerta-abanico img,.qb .qb-puerta[aria-pressed="true"] .qb-puerta-abanico img{opacity:1;transform:translateY(0) rotate(calc((var(--k) - 1) * 10deg))}
@media (max-width:899px){
  .qb .qb-puertas{display:grid;grid-template-columns:1fr 1fr;height:auto}
  .qb .qb-puerta{height:300px;padding:18px 16px 22px;gap:8px}
  .qb .qb-puerta .qb-icono{display:none}
  .qb .qb-puerta-nombre{font-size:clamp(30px,13cqi,56px)}
  .qb .qb-puerta-cuando{font-size:clamp(24px,12cqi,34px)}
  .qb .qb-puerta-bajada{display:none}
  .qb .qb-puerta-cuenta{font-size:11.5px;letter-spacing:.2em}
  .qb .qb-puerta-abanico{width:96%;height:136px;right:-10%;top:30px}
  .qb .qb-puerta-abanico img{opacity:.92;transform:translateY(0) rotate(calc((var(--k) - 1) * 10deg))}
}

/* ── ¿no sabés cuál elegir? ─────────────────────────────────────────────── */
.qb .qb-guia{padding:calc(var(--seccion) * .7) 0 var(--seccion);background:linear-gradient(180deg,transparent,rgba(216,179,106,.035) 30%,transparent)}
.qb .qb-preguntas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(24px,3.2vw,56px);padding:0 var(--pad);margin-top:64px}
.qb .qb-pregunta{margin:0;padding:24px 0 0;border:0;border-top:1px solid var(--linea);min-width:0}
.qb .qb-pregunta legend{padding:0;margin-bottom:18px;font:400 clamp(24px,1.9vw,30px)/1.2 var(--didona)}
.qb .qb-pregunta-num{display:inline-grid;place-items:center;width:34px;height:34px;margin-right:10px;border:1px solid var(--oro);border-radius:50%;font:italic 400 16px/1 var(--didona);color:var(--oro);vertical-align:4px}
.qb .qb-pregunta[data-contestada="true"] .qb-pregunta-num{background:var(--oro);color:#140f09}
.qb .qb-opciones{display:grid;gap:10px}
.qb .qb-opcion{position:relative;display:flex;align-items:center;min-height:56px;padding:0 20px;border:1px solid var(--linea-2);cursor:pointer;transition:border-color .3s,background-color .3s,transform .3s var(--curva)}
.qb .qb-opcion input{position:absolute;opacity:0;pointer-events:none}
.qb .qb-opcion span{font-size:17px;color:var(--hueso-2);transition:color .3s}
/* El rombo dorado de los «hechos» del portal marca la opción elegida: se abre al elegir, se cierra al cambiar. */
.qb .qb-opcion::before{content:"";flex:none;width:6px;height:6px;margin-right:12px;background:var(--oro);transform:rotate(45deg) scale(0);transition:transform .35s var(--curva)}
.qb .qb-opcion:hover{border-color:var(--linea)}
.qb .qb-opcion:hover span{color:var(--hueso)}
.qb .qb-opcion:active{transform:scale(.98)}
.qb .qb-opcion:has(input:checked){border-color:var(--oro);background:rgba(216,179,106,.08);transform:translateX(4px)}
.qb .qb-opcion:has(input:checked)::before{transform:rotate(45deg) scale(1)}
.qb .qb-opcion:has(input:checked) span{color:var(--hueso)}
.qb .qb-opcion:has(input:focus-visible){outline:2px solid var(--oro-claro);outline-offset:2px}
.qb .qb-respuesta{padding:64px var(--pad) 0}
.qb .qb-respuesta-titulo{margin:0 0 28px;font:italic 400 clamp(26px,2vw,32px)/1.2 var(--didona);color:var(--oro-claro)}
.qb .qb-respuesta-espera{margin:0;font-style:italic}
.qb .qb-recs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(20px,2.6vw,40px)}
.qb .qb-rec{display:grid;grid-template-columns:42% minmax(0,1fr);gap:20px;align-items:start;padding:18px;border:1px solid var(--linea-2);background:radial-gradient(80% 70% at 20% 60%,color-mix(in oklab,var(--color-puerta) 10%,transparent),transparent 70%);animation:qb-revela .8s var(--curva) both;animation-delay:calc(var(--i) * 120ms)}
.qb .qb-rec-foto{cursor:pointer;border:0;padding:0}
.qb .qb-rec-orden{margin:0;font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--oro)}
.qb .qb-rec-nombre{margin:10px 0 8px;font:400 clamp(24px,1.9vw,30px)/1.1 var(--didona)}
.qb .qb-rec-nombre span{display:block;margin-top:6px;font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-rec-porque{margin:0;color:var(--hueso-2);font-size:16px;line-height:1.55}
.qb .qb-rec-precio{margin:12px 0 0;font:500 clamp(22px,1.7vw,28px)/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}
.qb .qb-rec-acciones{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.qb .qb-guia-humana{margin:40px 0 0;color:var(--hueso-2)}
.qb .qb-guia-humana a,.qb .qb-como-pie a,.qb .qb-vacio a,.qb .qb-bolsa-nota a,.qb .qb-ficha-sinnotas a,.qb .qb-fuente a{color:var(--oro-claro);text-underline-offset:4px;text-decoration-thickness:1px}
.qb .qb-enlace{align-self:flex-start;min-height:44px;border:0;background:none;padding:6px 0;color:var(--oro-claro);font:inherit;font-size:16px;text-decoration:underline;text-underline-offset:4px;cursor:pointer}
@media (max-width:1199px){.qb .qb-recs{grid-template-columns:1fr}.qb .qb-rec{grid-template-columns:150px minmax(0,1fr)}}
@media (max-width:899px){.qb .qb-preguntas{grid-template-columns:1fr}.qb .qb-rec{grid-template-columns:120px minmax(0,1fr);gap:16px;padding:14px}}

/* ── la vitrina ─────────────────────────────────────────────────────────── */
.qb .qb-vitrina{padding:var(--seccion) var(--pad) calc(var(--seccion) * .6)}
.qb .qb-vitrina-cabeza{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:32px}
.qb .qb-herramientas{display:flex;flex-wrap:wrap;align-items:flex-end;gap:20px}
.qb .qb-buscar input{width:min(400px,86vw);height:60px;padding:0 2px;border:0;border-bottom:1px solid var(--oro-oscuro);border-radius:0;background:transparent;color:var(--hueso);font:400 18px var(--palo);outline:none;transition:border-color .3s}
.qb .qb-buscar input:focus{border-bottom-color:var(--oro)}
.qb .qb-buscar input::placeholder{color:var(--hueso-3)}
.qb .qb-vistas{display:inline-flex;border:1px solid var(--linea)}
.qb .qb-vistas button{height:48px;padding:0 20px;border:0;background:transparent;color:var(--hueso-2);font:500 12.5px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;cursor:pointer;transition:transform .12s}
.qb .qb-vistas button:active{transform:scale(.98)}
.qb .qb-vistas button[aria-pressed="true"]{background:var(--oro);color:#140f09}
.qb .qb-chips{position:sticky;top:75px;z-index:6;display:flex;gap:10px;margin:36px -4px 0;padding:14px 4px 20px;overflow-x:auto;scrollbar-width:none;background:linear-gradient(var(--fondo) 72%,rgba(11,9,8,0))}
.qb .qb-chips::-webkit-scrollbar{display:none}
.qb .qb-chips button{display:inline-flex;align-items:center;gap:10px;flex:none;height:48px;padding:0 20px;border:1px solid var(--linea-2);border-radius:999px;background:rgba(11,9,8,.6);color:var(--hueso-2);font:500 12.5px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:border-color .3s,color .3s,transform .12s}
.qb .qb-chips button i{width:9px;height:9px;border-radius:50%;background:var(--color-puerta);box-shadow:0 0 0 0 color-mix(in oklab,var(--color-puerta) 60%,transparent);transition:box-shadow .4s}
.qb .qb-chips button span{color:var(--hueso-3);font-variant-numeric:tabular-nums;letter-spacing:.05em}
.qb .qb-chips button:hover{border-color:var(--linea);color:var(--hueso)}
.qb .qb-chips button:active{transform:scale(.98)}
.qb .qb-chips button[aria-pressed="true"]{border-color:var(--oro);color:var(--hueso)}
.qb .qb-chips button[aria-pressed="true"] i{box-shadow:0 0 0 3px color-mix(in oklab,var(--color-puerta) 28%,transparent)}
.qb .qb-vacio{padding:72px 0;text-align:center;color:var(--hueso-2)}
.qb .qb-vacio p:first-child{font:italic 400 clamp(28px,2.4vw,38px) var(--didona);color:var(--hueso)}
.qb .qb-vacio .qb-boton{margin-top:20px}
.qb .qb-estante{margin-top:clamp(64px,7vw,104px)}
/* Del segundo estante en adelante, ni se calcula hasta que se acerca. */
.qb .qb-estante+.qb-estante{content-visibility:auto;contain-intrinsic-size:auto 720px}
.qb .qb-estante-cabeza{display:grid;grid-template-columns:auto 1fr;column-gap:20px;align-items:center;margin-bottom:40px}
.qb .qb-icono-chico{grid-row:span 2;width:60px;height:60px}
.qb .qb-h3{margin:0;font:400 clamp(44px,5.2vw,80px)/1 var(--didona);letter-spacing:-.01em}
.qb .qb-estante-cabeza p{margin:6px 0 0;font:italic 400 clamp(20px,1.6vw,26px)/1.3 var(--didona);color:var(--hueso-2)}
.qb .qb-piezas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:clamp(32px,3.2vw,56px) clamp(24px,2.4vw,40px)}
.qb .qb-repisa{height:1px;margin-top:32px;background:linear-gradient(90deg,transparent,var(--oro) 18%,var(--oro-claro) 50%,var(--oro) 82%,transparent);opacity:.55;box-shadow:0 0 22px 1px rgba(216,179,106,.35)}

/* La tarjeta-tirita */
.qb .qb-pieza{position:relative;display:flex;flex-direction:column;height:100%}
.qb .qb-pieza-foto{cursor:pointer}
.qb .qb-pieza-foto:focus-visible{outline-offset:-3px}
.qb .qb-pieza-huele{margin:18px 0 0;color:var(--hueso-2);font-size:17px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qb .qb-pieza-pie{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 14px;margin-top:10px}
.qb .qb-pieza-precio{margin:0;font:500 clamp(22px,1.7vw,30px)/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}
.qb .qb-pieza-dispo{margin:0;font:500 12.5px/1.2 var(--palo);letter-spacing:.2em;text-transform:uppercase;color:var(--oro)}
.qb .qb-pieza-dispo[data-dispo="sin-stock"]{color:var(--hueso-3)}
.qb .qb-sumar{width:100%;margin-top:auto;min-height:56px;border:1px solid var(--linea);border-radius:0;background:transparent;color:var(--hueso);font:500 13px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;cursor:pointer;transition:background-color .3s,color .3s,border-color .3s,transform .12s}
.qb .qb-pieza .qb-sumar,.qb .qb-pieza .qb-cantidad{margin-top:18px}
.qb .qb-sumar:hover:not(:disabled){background:var(--oro);border-color:var(--oro);color:#140f09}
.qb .qb-sumar:active:not(:disabled){transform:scale(.98)}
.qb .qb-sumar:disabled{opacity:.45;cursor:not-allowed}
.qb .qb-cantidad{display:grid;grid-template-columns:56px 1fr 56px;align-items:center;height:56px;border:1px solid var(--oro)}
.qb .qb-cantidad button{height:100%;border:0;background:transparent;color:var(--oro-claro);font:400 24px/1 var(--palo);cursor:pointer;transition:transform .12s}
.qb .qb-cantidad button:hover:not(:disabled){background:rgba(216,179,106,.12)}
.qb .qb-cantidad button:active:not(:disabled){transform:scale(.94)}
.qb .qb-cantidad button:disabled{opacity:.35}
.qb .qb-cantidad span{text-align:center;font-variant-numeric:tabular-nums}
@media (max-width:719px){
  .qb .qb-piezas{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:78%;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 var(--margen);margin:0 calc(var(--margen) * -1);padding:4px var(--margen) 20px;scrollbar-width:none;mask-image:linear-gradient(90deg,transparent,#000 var(--qb-orilla-i),#000 calc(100% - var(--qb-orilla-d)),transparent)}
  .qb .qb-piezas::-webkit-scrollbar{display:none}
  .qb .qb-piezas>li{scroll-snap-align:start}
}
@media (max-width:899px){.qb .qb-chips{top:63px}}

/* índice */
.qb .qb-indice{width:100%;margin-top:32px;border-collapse:collapse}
.qb .qb-indice th,.qb .qb-indice td{padding:18px 12px;border-bottom:1px solid var(--linea-2);text-align:left;vertical-align:middle}
.qb .qb-indice thead th{font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-3);border-bottom-color:var(--linea)}
.qb .qb-indice tbody th button{min-height:44px;padding:0;border:0;background:none;color:var(--hueso);font:400 clamp(22px,1.7vw,28px)/1.2 var(--didona);text-align:left;cursor:pointer}
.qb .qb-indice tbody th button:hover{color:var(--oro-claro)}
.qb .qb-indice-n{font:italic 400 18px/1 var(--didona);color:var(--hueso-3);width:56px}
.qb .qb-indice td i{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:var(--color-puerta)}
.qb .qb-indice .qb-num{font:500 clamp(20px,1.5vw,26px)/1 var(--didona);color:var(--oro);text-align:right;white-space:nowrap}
.qb .qb-indice-sumar{min-height:44px;padding:0 16px;border:1px solid var(--linea);background:transparent;color:var(--hueso);font:500 11.5px/1 var(--palo);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.qb .qb-indice-sumar:hover:not(:disabled){border-color:var(--oro);color:var(--oro-claro)}
.qb .qb-indice tbody tr{transition:background-color .3s}
.qb .qb-indice tbody tr:hover{background:rgba(216,179,106,.04)}
@media (max-width:719px){
  .qb .qb-indice thead{display:none}
  .qb .qb-indice tr{display:grid;grid-template-columns:40px 1fr auto;grid-template-areas:"n p precio" "n casa sumar";padding:14px 0;border-bottom:1px solid var(--linea-2)}
  .qb .qb-indice th,.qb .qb-indice td{padding:2px 6px;border:0}
  .qb .qb-indice-n{grid-area:n}
  .qb .qb-indice tbody th{grid-area:p}
  .qb .qb-indice td:nth-of-type(2){grid-area:casa;font-size:14px;color:var(--hueso-3)}
  .qb .qb-indice td:nth-of-type(3){display:none}
  .qb .qb-indice .qb-num{grid-area:precio}
  .qb .qb-indice td:last-child{grid-area:sumar;text-align:right}
}

/* ── para regalar ───────────────────────────────────────────────────────── */
.qb .qb-regalo{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr);gap:clamp(32px,5vw,96px);align-items:center;padding:var(--seccion) var(--pad);border-top:1px solid var(--linea-2)}
.qb .qb-regalo-texto .qb-boton{margin-top:36px}
.qb .qb-regalo-nota{margin:16px 0 0;color:var(--hueso-3);font-size:16px}
.qb .qb-regalo-lista{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2.2vw,32px);align-items:end}
.qb .qb-regalo-lista li:nth-child(2){transform:translateY(-34px)}
.qb .qb-regalo-item{display:flex;flex-direction:column;align-items:flex-start;gap:10px;width:100%;padding:0;border:0;background:none;color:var(--hueso);text-align:left;cursor:pointer;font:inherit}
.qb .qb-regalo-para{font:400 clamp(30px,2.4vw,40px)/1 var(--caligrafia);color:var(--oro-claro)}
.qb .qb-regalo-porque{font-size:16px;color:var(--hueso-2);line-height:1.5}
.qb .qb-regalo-precio{font:500 clamp(22px,1.7vw,30px)/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}
@media (max-width:899px){.qb .qb-regalo{grid-template-columns:1fr}.qb .qb-regalo-lista{grid-template-columns:repeat(3,72%);overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 var(--margen);margin:0 calc(var(--margen) * -1);padding:0 var(--margen) 10px;scrollbar-width:none;mask-image:linear-gradient(90deg,transparent,#000 var(--qb-orilla-i),#000 calc(100% - var(--qb-orilla-d)),transparent)}.qb .qb-regalo-lista::-webkit-scrollbar{display:none}.qb .qb-regalo-lista li{scroll-snap-align:start}.qb .qb-regalo-lista li:nth-child(2){transform:none}}

/* ── cómo comprar ───────────────────────────────────────────────────────── */
.qb .qb-como{padding:var(--seccion) var(--pad);border-top:1px solid var(--linea-2)}
.qb .qb-pasos{list-style:none;margin:64px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(24px,4vw,72px)}
.qb .qb-pasos li{padding-top:28px;border-top:1px solid var(--linea)}
.qb .qb-paso-num{font:italic 400 clamp(56px,6vw,96px)/1 var(--didona);color:var(--oro)}
.qb .qb-pasos h3{margin:18px 0 10px;font:400 clamp(30px,2.4vw,40px)/1.1 var(--didona)}
.qb .qb-pasos p{margin:0;color:var(--hueso-2);max-width:34ch}
.qb .qb-como-pie{margin:64px 0 0;color:var(--hueso-2)}
@media (max-width:899px){.qb .qb-pasos{grid-template-columns:1fr}}

/* ── pie ────────────────────────────────────────────────────────────────── */
.qb .qb-pie{padding:clamp(80px,10vw,150px) var(--pad) 48px;border-top:1px solid var(--linea);background:radial-gradient(80% 60% at 50% 0%,rgba(216,179,106,.07),transparent 70%)}
.qb .qb-pie-marca{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:0 .16em;margin:0;font:500 clamp(64px,14vw,240px)/.9 var(--didona);letter-spacing:-.02em;text-transform:uppercase;text-align:center}
.qb .qb-pie-marca .qb-oro{font:400 .7em/1 var(--caligrafia);text-transform:none;letter-spacing:0;transform:rotate(-6deg) translateY(.12em);padding:0 .08em}
.qb .qb-pie-lema{margin:26px 0 0;text-align:center;font:italic 400 clamp(20px,1.9vw,28px) var(--didona);color:var(--hueso-2)}
.qb .qb-pie-datos{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 40px;margin:48px 0 0;padding:0;list-style:none;font:500 12.5px/1.6 var(--palo);letter-spacing:.22em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-pie-ig{display:inline-flex;align-items:center;gap:8px;min-height:44px;text-decoration:none;color:var(--hueso)}
.qb .qb-pie-ig:hover{color:var(--oro-claro)}
.qb .qb-icono-ig{width:20px;height:20px}
.qb .qb-pie-casas{margin:48px 0 0;text-align:center;color:var(--hueso-3);font-size:14px;letter-spacing:.14em}
/* En el teléfono, el pie termina por encima de la barra fija de la bolsa. */
@media (max-width:899px){.qb .qb-pie{padding-bottom:calc(48px + 72px + env(safe-area-inset-bottom))}}

/* ── la barra de la bolsa (teléfono) ────────────────────────────────────── */
.qb .qb-barra{display:none}
@media (max-width:899px){
  .qb .qb-barra{position:fixed;inset:auto 0 0;z-index:80;display:flex;align-items:center;gap:12px;height:calc(64px + env(safe-area-inset-bottom));padding:0 8px env(safe-area-inset-bottom) 14px;background:#0c0a08;border-top:1px solid rgba(216,179,106,.55);box-shadow:0 -18px 30px -18px rgba(0,0,0,.9)}
  .qb .qb-barra-resumen{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:56px;padding:0;border:0;background:none;color:var(--hueso);font:500 14px/1.2 var(--palo);text-align:left;cursor:pointer;transition:transform .12s}
  .qb .qb-barra-resumen:active{transform:scale(.98)}
  .qb .qb-barra-texto{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qb .qb-barra-texto strong{font-weight:500;letter-spacing:.06em;color:var(--oro)}
  .qb .qb-barra-texto .qb-num{font-family:var(--didona);font-size:17px}
  .qb .qb-barra-icono{position:relative;display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid var(--linea);border-radius:999px;color:var(--oro-claro)}
  .qb .qb-barra-icono .qb-bolsa-cuenta{position:absolute;top:-6px;right:-8px;min-width:20px;height:20px;padding:0 5px;font-size:11px}
  .qb .qb-barra-accion{flex:none;min-height:56px;height:56px;padding:0 18px;letter-spacing:.16em}
}

/* ── la ficha ───────────────────────────────────────────────────────────── */
.qb .qb-ficha,.qb .qb-bolsa{padding:0;border:0;background:transparent;color:var(--hueso);max-width:none;max-height:none;overflow:visible}
.qb .qb-ficha::backdrop,.qb .qb-bolsa::backdrop{background:rgba(5,4,3,.74);backdrop-filter:blur(8px);animation:qb-velo .45s ease both}
@keyframes qb-velo{from{opacity:0}}
.qb .qb-ficha{width:min(1240px,92vw);height:min(860px,92vh);margin:auto}
.qb .qb-ficha-caja{position:relative;display:grid;grid-template-columns:minmax(0,46fr) minmax(0,54fr);height:100%;overflow:hidden;border:1px solid var(--linea);background:linear-gradient(180deg,#15120f,#0c0a08);animation:qb-abrir .55s var(--curva) both}
@keyframes qb-abrir{from{opacity:0;transform:translateY(24px) scale(.985)}}
.qb .qb-cerrar{position:absolute;top:16px;right:16px;z-index:5;display:grid;place-items:center;width:48px;height:48px;border:1px solid var(--linea);background:rgba(11,9,8,.72);color:var(--hueso);cursor:pointer}
.qb .qb-cerrar svg{width:20px;height:20px;transition:transform .4s var(--curva)}
.qb .qb-cerrar:hover{border-color:var(--oro);color:var(--oro-claro)}
.qb .qb-cerrar:hover svg{transform:rotate(90deg)}
.qb .qb-cerrar:active{transform:scale(.98)}
/* La mesa de la ficha: alta como la caja. El frasco, a lo sumo a su tamaño real (300 px). */
.qb .qb-ficha-foto{aspect-ratio:auto;height:100%;--color-puerta:inherit}
.qb .qb-ficha-foto .qb-tirita{left:31%;width:38%;top:7%;bottom:calc(8% + min(375px,60cqi) - 3%);padding-top:12cqi}
.qb .qb-ficha-foto .qb-tirita-nombre{font-size:clamp(34px,8cqi,58px)}
.qb .qb-ficha-foto .qb-tirita-casa{font-size:11.5px}
.qb .qb-ficha-foto .qb-mesa-frasco{left:calc(50% - min(150px,24cqi));bottom:8%;width:min(300px,48cqi)}
.qb .qb-ficha-texto{overflow-y:auto;padding:64px clamp(28px,4vw,64px) 56px;overscroll-behavior:contain}
.qb .qb-ficha-casa{margin:0;font:500 12.5px/1.4 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-ficha-nombre{margin:14px 0 0;font:400 clamp(52px,5.6vw,92px)/.95 var(--didona);letter-spacing:-.015em;font-variation-settings:"opsz" 96;text-wrap:balance}
.qb .qb-ficha-familia{display:flex;align-items:center;gap:12px;margin:22px 0 0;color:var(--hueso-2)}
.qb .qb-ficha-familia em{font-style:normal;font-family:var(--caligrafia);font-size:1.6em;color:var(--color-puerta)}
.qb .qb-icono-mini{width:38px;height:38px}
.qb .qb-ficha-precio{margin:26px 0 8px;font:500 clamp(34px,2.6vw,48px)/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}
.qb .qb-aviso{margin:18px 0 0;padding:14px 16px;border-left:2px solid var(--oro);background:rgba(216,179,106,.07);color:var(--hueso)}
/* Compu: las acciones quedan pegadas arriba de la columna al scrollear (fondo laca). Chrome mide el
   top desde el borde del contenido (descontado el padding de 64 px de la columna): por eso -64px. */
.qb .qb-ficha-acciones{position:sticky;top:-64px;z-index:3;display:flex;flex-wrap:wrap;gap:12px;margin:22px calc(clamp(28px,4vw,64px) * -1) 0;padding:16px clamp(28px,4vw,64px);background:#100d0b;box-shadow:0 1px 0 var(--linea-2)}
.qb .qb-ficha-acciones>*{flex:1 1 200px}
.qb .qb-ficha-acciones .qb-boton{padding:0 20px;white-space:nowrap}
.qb .qb-cantidad-grande{height:60px}
.qb .qb-ficha-sub{margin:52px 0 22px;font:500 12.5px/1 var(--palo);letter-spacing:.28em;text-transform:uppercase;color:var(--oro)}

/* Olelo en el tiempo: tres pestañas y la regla de tiempo (línea oro con tres nodos, el encendido se desliza). */
.qb .qb-tiempo-pestanas{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding-bottom:30px}
.qb .qb-tiempo-pestanas button{display:grid;gap:8px;justify-items:center;align-content:start;min-height:72px;padding:8px 6px 10px;border:0;background:none;color:var(--hueso-2);text-align:center;cursor:pointer;transition:color .3s,transform .12s}
.qb .qb-tiempo-pestanas button:active{transform:scale(.98)}
.qb .qb-tiempo-nombre{font:400 clamp(20px,1.6vw,26px)/1.15 var(--didona)}
.qb .qb-tiempo-capa{font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-tiempo-pestanas button[aria-selected="true"]{color:var(--hueso)}
.qb .qb-tiempo-pestanas button[aria-selected="true"] .qb-tiempo-nombre{font-style:italic;color:var(--oro-claro)}
.qb .qb-tiempo-pestanas button:focus-visible{outline-offset:-2px}
.qb .qb-regla{position:absolute;left:16.667%;right:16.667%;bottom:12px;height:1px;background:linear-gradient(90deg,var(--oro-claro),var(--oro) 50%,var(--oro-oscuro));pointer-events:none}
.qb .qb-regla::before{content:"";position:absolute;inset:-6px -6px;background:
  radial-gradient(circle at 6px 50%,var(--fondo) 3px,var(--oro) 3.6px,var(--oro) 4.6px,transparent 5.2px),
  radial-gradient(circle at 50% 50%,var(--fondo) 3px,var(--oro) 3.6px,var(--oro) 4.6px,transparent 5.2px),
  radial-gradient(circle at calc(100% - 6px) 50%,var(--fondo) 3px,var(--oro) 3.6px,var(--oro) 4.6px,transparent 5.2px)}
.qb .qb-regla-cursor{position:absolute;inset:0;transform:translateX(calc(var(--paso,0) * 50%));transition:transform .4s var(--curva)}
.qb .qb-regla-cursor::before{content:"";position:absolute;left:-7px;top:-7px;width:15px;height:15px;border-radius:50%;background:var(--oro-claro);box-shadow:0 0 0 5px rgba(246,227,168,.16),0 0 18px 2px rgba(246,227,168,.45)}
.qb .qb-notas{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
/* Las notas son fichas de papel que entran de a una (clip-path, escalonado 60 ms). */
.qb .qb-notas li{padding:10px 16px;border-radius:2px;background:var(--papel);color:var(--tinta);font-size:17px;line-height:1.2;box-shadow:0 12px 20px -14px #000;animation:qb-nota .32s var(--curva) both;animation-delay:calc(var(--k) * 60ms)}
@keyframes qb-nota{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.qb .qb-acordes{margin:22px 0 0;color:var(--hueso-2);font-size:16px}
.qb .qb-acordes span{color:var(--hueso-3);font-size:12px;letter-spacing:.24em;text-transform:uppercase;margin-right:6px}
.qb .qb-fuente{margin:14px 0 0;color:var(--hueso-3);font-size:15px}
.qb .qb-ficha-sinnotas{margin:40px 0 0;color:var(--hueso-2)}

/* Ponelo al lado: los parecidos como tiritas chicas. */
.qb .qb-parecidos-bajada{margin:-8px 0 18px;color:var(--hueso-3);font-size:16px}
.qb .qb-parecidos ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}
.qb .qb-parecidos button{display:flex;flex-direction:column;gap:8px;width:100%;padding:0 0 12px;border:1px solid var(--linea-2);background:#0a0807;color:var(--hueso);text-align:left;cursor:pointer;font:inherit;transition:border-color .3s,transform .12s}
.qb .qb-parecidos button:hover{border-color:var(--linea)}
.qb .qb-parecidos button:active{transform:scale(.98)}
.qb .qb-mesa-mini{aspect-ratio:4/5}
.qb .qb-mesa-mini .qb-tirita{top:5%;bottom:56%}
.qb .qb-mesa-mini .qb-mesa-frasco{left:24%;width:52%}
.qb .qb-parecido-nombre{padding:0 12px;font:400 19px/1.15 var(--didona)}
.qb .qb-parecido-precio{padding:0 12px;font:500 17px/1 var(--didona);color:var(--oro);font-variant-numeric:lining-nums tabular-nums}

/* La comparación: dos columnas, tres capas en paralelo; la segunda entra desde la derecha. */
.qb .qb-comparar .qb-ficha-sub{margin-top:18px}
.qb .qb-comparar-fila{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(0,1fr) minmax(0,1fr);gap:18px;padding:18px 0;border-bottom:1px solid var(--linea-2);align-items:start}
.qb .qb-comparar-cabeza{align-items:stretch;padding-top:0}
.qb .qb-comparar-col{min-width:0;font-size:17px;line-height:1.45;color:var(--hueso)}
.qb .qb-comparar-col[data-lado="1"]{animation:qb-lado .36s var(--curva) both}
@keyframes qb-lado{from{transform:translateX(24px)}}
.qb .qb-comparar-cabeza .qb-comparar-col{display:grid;grid-template-rows:1fr auto;gap:10px}
.qb .qb-comparar-tirita{display:grid;justify-items:center;align-content:center;gap:6px;padding:22px 10px 18px;border-radius:2px;background:radial-gradient(80% 40% at 50% 30%,color-mix(in oklab,var(--color-puerta,var(--oro)) 24%,transparent),transparent 74%),var(--papel);color:var(--tinta);text-align:center;box-shadow:0 24px 40px -20px #000;transform:rotate(-1.5deg)}
.qb .qb-comparar-col[data-lado="1"] .qb-comparar-tirita{transform:rotate(1deg)}
.qb .qb-comparar-tirita .qb-tirita-nombre{font-size:clamp(26px,2.2vw,36px)}
.qb .qb-comparar-precio{font:500 clamp(22px,1.7vw,28px)/1 var(--didona);color:var(--oro);text-align:center;font-variant-numeric:lining-nums tabular-nums}
.qb .qb-comparar-momento{font:400 20px/1.2 var(--didona);color:var(--hueso)}
.qb .qb-comparar-momento small{display:block;margin-top:6px;font:500 11.5px/1 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--hueso-3)}
.qb .qb-comparar-acciones{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.qb .qb-comparar-acciones>*{flex:1 1 200px}

/* Teléfono: hoja a pantalla completa, foto arriba con la tirita, texto debajo y la barra de acciones
   FIJA al pie de la hoja. La hoja entra con clip-path (no transform: con transform la barra fija dejaría
   de estar fija a la pantalla). */
@media (max-width:819px){
  .qb .qb-ficha{width:100vw;height:100dvh;max-height:100dvh;margin:0}
  .qb .qb-ficha-caja{display:block;overflow-y:auto;overscroll-behavior:contain;border:0;animation-name:qb-hoja-ficha}
  @keyframes qb-hoja-ficha{from{clip-path:inset(18% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
  .qb .qb-cerrar{position:fixed;top:12px;right:12px}
  .qb .qb-ficha-foto{height:46svh;min-height:320px;touch-action:pan-up}
  .qb .qb-ficha-foto .qb-tirita{top:6%;left:30%;width:40%;bottom:calc(5% + min(260px,30svh) - 3%);padding-top:10cqi}
  .qb .qb-ficha-foto .qb-tirita-nombre{font-size:clamp(26px,7.4cqi,40px)}
  .qb .qb-ficha-foto .qb-mesa-frasco{left:calc(50% - min(104px,12svh));bottom:5%;width:min(208px,24svh)}
  .qb .qb-ficha-texto{overflow:visible;padding:30px var(--margen) calc(120px + env(safe-area-inset-bottom))}
  .qb .qb-ficha-barra{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:4;display:flex;flex-wrap:nowrap;gap:10px;margin:0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:#0c0a08;border-top:1px solid rgba(216,179,106,.55);box-shadow:0 -18px 30px -18px rgba(0,0,0,.9)}
  .qb .qb-ficha-barra>*{flex:1 1 auto}
  .qb .qb-ficha-barra .qb-ficha-consultar{flex:0 0 56px;padding:0}
  .qb .qb-ficha-consultar-texto{display:none}
  .qb .qb-tiempo-nombre{font-size:18px}
  .qb .qb-tiempo-capa{font-size:10.5px;letter-spacing:.18em}
  .qb .qb-parecidos ul{gap:10px}
  .qb .qb-parecido-nombre{font-size:16px;padding:0 8px}
  .qb .qb-parecido-precio{font-size:15px;padding:0 8px}
  .qb .qb-comparar-fila{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
  .qb .qb-comparar-momento{grid-column:1/-1}
  .qb .qb-comparar-col{font-size:16px}
}
@media (min-width:820px){.qb .qb-ficha-consultar-texto{display:inline}}

/* el frasco que viaja de la tarjeta a la ficha (View Transitions) y a la bolsa */
::view-transition-group(qb-frasco-activo){animation-duration:.6s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
::view-transition-old(qb-frasco-activo),::view-transition-new(qb-frasco-activo){mix-blend-mode:lighten}
.qb .qb-vuelo{position:fixed;z-index:85;pointer-events:none;object-fit:contain;mix-blend-mode:lighten;margin:0;filter:drop-shadow(0 12px 26px rgba(216,179,106,.38))}
@keyframes qb-flotar{50%{transform:translateY(-12px)}}

/* ── la bolsa ───────────────────────────────────────────────────────────── */
.qb .qb-bolsa{width:min(560px,100vw);height:100dvh;max-height:100dvh;margin:0 0 0 auto}
.qb .qb-bolsa[open] .qb-bolsa-caja{animation:qb-cajon .5s var(--curva) both}
@keyframes qb-cajon{from{opacity:0;transform:translateX(48px)}}
.qb .qb-bolsa-caja{display:flex;flex-direction:column;height:100%;border-left:1px solid var(--linea);background:#0f0c0a}
.qb .qb-bolsa-cabeza{display:flex;align-items:center;gap:14px;padding:24px 28px;border-bottom:1px solid var(--linea-2)}
.qb .qb-bolsa-cabeza h2{margin:0;font:400 clamp(32px,2.6vw,40px)/1 var(--didona);outline:none}
.qb .qb-bolsa-cuantos{color:var(--hueso-3);font-size:13px;letter-spacing:.16em;text-transform:uppercase}
.qb .qb-bolsa-cabeza .qb-cerrar{position:static;margin-left:auto}
.qb .qb-bolsa-vacia{flex:1;display:grid;place-content:center;justify-items:center;gap:8px;padding:40px 28px;text-align:center}
.qb .qb-bolsa-vacia p{margin:0}
.qb .qb-bolsa-vacia p:nth-of-type(1){font:italic 400 32px var(--didona)}
.qb .qb-bolsa-vacia .qb-boton{margin-top:26px}
.qb .qb-bolsa-vacia-icono{width:60px;height:60px;color:var(--oro);margin-bottom:12px}
.qb .qb-lineas{flex:1;overflow-y:auto;margin:0;padding:6px 28px;list-style:none;overscroll-behavior:contain}
.qb .qb-linea{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:18px;padding:20px 0;border-bottom:1px solid var(--linea-2)}
/* La foto de la línea: una mesa chiquita con su tirita detrás del frasco (las que te llevás, apiladas). */
.qb .qb-linea-foto{position:relative;width:88px;aspect-ratio:4/5;isolation:isolate;overflow:hidden;background:var(--marmol)}
.qb .qb-linea-tirita{position:absolute;left:32%;width:36%;top:5%;bottom:58%;border-radius:2px;background:var(--papel);transform:rotate(-2deg);-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}
.qb .qb-linea-foto img{position:absolute;left:16%;bottom:2%;width:68%;height:auto;object-fit:contain;mix-blend-mode:lighten}
.qb .qb-linea-q{position:absolute;left:30%;top:24%;width:40%;color:var(--oro)}
.qb .qb-linea-nombre{margin:0;font:400 24px/1.15 var(--didona)}
.qb .qb-linea-texto>p.qb-tenue{margin:4px 0 12px;font-size:12.5px;letter-spacing:.2em;text-transform:uppercase}
.qb .qb-linea-texto .qb-cantidad{width:144px;height:44px;grid-template-columns:44px 1fr 44px}
.qb .qb-linea-fin{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between}
.qb .qb-linea-fin p{margin:0;font:500 20px/1 var(--didona);color:var(--oro)}
.qb .qb-sacar{min-height:44px;padding:0;border:0;background:none;color:var(--hueso-3);font:inherit;font-size:15px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.qb .qb-sacar:hover{color:var(--hueso)}
.qb .qb-error-linea{margin:8px 0 0;color:#f0b3a6;font-size:15px}
.qb .qb-bolsa-pie{display:grid;gap:14px;padding:20px 28px calc(20px + env(safe-area-inset-bottom));border-top:1px solid var(--linea);background:#0c0a08}
.qb .qb-totales{display:grid;gap:10px;margin:0}
.qb .qb-totales>div{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
.qb .qb-totales dt{color:var(--hueso-2)}
.qb .qb-totales dd{margin:0}
.qb .qb-total{padding-top:12px;border-top:1px solid var(--linea-2)}
.qb .qb-total dt{color:var(--hueso)}
.qb .qb-total dd{font:500 clamp(32px,2.8vw,40px)/1 var(--didona);color:var(--oro)}
.qb .qb-bolsa-nota{margin:0;font-size:15px;line-height:1.5}
.qb .qb-error{margin:0;padding:14px 16px;border-left:2px solid #e07a6a;background:rgba(224,122,106,.09);color:#f5cfc6}
.qb .qb-datos{flex:1;display:grid;align-content:start;gap:20px;overflow-y:auto;padding:20px 28px 28px;overscroll-behavior:contain}
.qb .qb-volver{justify-self:start;min-height:44px;padding:0;border:0;background:none;color:var(--oro-claro);font:inherit;font-size:16px;cursor:pointer}
.qb .qb-campo{display:grid;gap:8px}
.qb .qb-campo>label{font:500 12px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-campo>label em{font-style:normal;letter-spacing:.06em;text-transform:none;color:var(--hueso-3)}
/* 17 px en los campos: además de la escala, evita el zoom automático de iOS al enfocar. */
.qb .qb-campo input{height:56px;padding:0 16px;border:1px solid var(--linea-2);border-radius:0;background:#16120f;color:var(--hueso);font:400 17px var(--palo);outline:none;transition:border-color .25s,box-shadow .25s}
.qb .qb-campo input:focus{border-color:var(--oro);box-shadow:0 0 0 3px rgba(216,179,106,.18)}
.qb .qb-campo input::placeholder{color:var(--hueso-3)}
.qb .qb-campo small{color:var(--hueso-3);font-size:15px}
.qb .qb-entrega{display:grid;gap:10px;margin:0;padding:0;border:0}
.qb .qb-entrega legend{margin-bottom:10px;padding:0;font:500 12px/1 var(--palo);letter-spacing:.22em;text-transform:uppercase;color:var(--hueso-2)}
.qb .qb-entrega label{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border:1px solid var(--linea-2);cursor:pointer;transition:border-color .25s,background-color .25s}
.qb .qb-entrega label:has(input:checked){border-color:var(--oro);background:rgba(216,179,106,.07)}
.qb .qb-entrega input{width:20px;height:20px;margin-top:3px;accent-color:var(--oro);flex:none}
.qb .qb-entrega strong{display:block;font-weight:500}
.qb .qb-entrega small{display:block;color:var(--hueso-3);font-size:15px}
.qb .qb-cupon summary{min-height:44px;display:flex;align-items:center;color:var(--hueso-2);cursor:pointer;font-size:16px}
.qb .qb-cupon-fila{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:8px}
.qb .qb-cupon-fila .qb-boton{min-height:56px}
/* Teléfono: hoja completa; el botón principal de cada paso queda fijo abajo (el pie de la hoja), con
   la zona segura. Lo de arriba scrollea solo. */
@media (max-width:640px){
  .qb .qb-bolsa{width:100vw;height:100dvh;max-height:100dvh;margin:0}
  .qb .qb-bolsa-caja{border-left:0}
  .qb .qb-bolsa[open] .qb-bolsa-caja{animation-name:qb-hoja}
  @keyframes qb-hoja{from{opacity:0;transform:translateY(60px)}}
  .qb .qb-bolsa-cabeza{padding:16px 16px 16px 20px}
  .qb .qb-lineas,.qb .qb-datos{padding-inline:20px}
  .qb .qb-bolsa-pie{padding:16px 20px calc(16px + env(safe-area-inset-bottom))}
  .qb .qb-linea{grid-template-columns:72px minmax(0,1fr) auto;gap:14px}
  .qb .qb-linea-foto{width:72px}
  .qb .qb-linea-nombre{font-size:21px}
}
`;
