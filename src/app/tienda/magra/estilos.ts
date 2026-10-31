// El CSS de la vidriera de MAGRA (fronts/magra/DISENO.md §3–§8), scopeado a `.magra`.
//
// Lo importa SÓLO el servidor (MagraPiel.tsx / GraciasMagra.tsx) y viaja una vez, en un <style> del
// HTML: si lo importara un componente cliente viajaría dos veces, en el HTML y en el JS (trampa
// medida en QBO, skill vidriera-de-autor §5).
//
// Paleta del sitio real de MAGRA (carbón, crema, oro) con los contrastes AA medidos sobre carbón:
// crema 14,9:1 · oro 8,2:1 · acero 11,6:1 · gris #9BA2AA 6,5:1. El sangre es sólo chispa.
// Movimiento sólo con transform / clip-path / filter, nunca la opacidad de lo que puede ser LCP;
// todo quieto con `prefers-reduced-motion`. Cajas con alto o proporción fijos: CLS 0.

/** Tokens, base, botones y rótulos: lo comparten la vidriera y la página de gracias. */
export const CSS_BASE = `
.magra{--carbon:#1D1D1B;--negro:#000;--crema:#F2E6D7;--oro:#C5AE86;--oro-hi:#D8C39C;--acero:#CCD6DF;--gris:#9BA2AA;--sangre:#7A1F19;--alerta:#F0B4A8;--wa:#0B7A3B;
  --filete:rgba(197,174,134,.24);--linea:rgba(242,230,215,.28);--tarjeta:#151514;
  --rail:440px;--top:72px;--barra:64px;--gut:clamp(20px,5vw,88px);
  --f-d:var(--mg-f-display),'Bebas Neue',Impact,'Arial Narrow',sans-serif;--f-c:var(--mg-f-cuerpo),'Open Sans',system-ui,Arial,sans-serif;
  background:var(--carbon);color:var(--crema);font:400 clamp(17px,1.15vw,20px)/1.6 var(--f-c);-webkit-font-smoothing:antialiased;min-height:100vh;overflow-x:clip}
.magra *,.magra *::before,.magra *::after{box-sizing:border-box}
.magra a{color:inherit}
.magra p{margin:0}
.magra .mg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.magra .mg-eyebrow{display:inline-block;font:700 13px/1.3 var(--f-c);letter-spacing:.3em;text-transform:uppercase;color:var(--oro);margin:0}
.magra .mg-h2{margin:0;font:400 clamp(52px,11cqi,128px)/.88 var(--f-d);letter-spacing:.01em;text-transform:uppercase;text-wrap:balance}
.magra .mg-num{font-variant-numeric:tabular-nums}
.magra .mg-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 32px;border-radius:6px;border:1px solid transparent;font:700 15px/1.1 var(--f-c);letter-spacing:.1em;text-transform:uppercase;text-decoration:none;text-align:center;cursor:pointer;transition:transform .16s,background-color .16s,border-color .16s,color .16s}
.magra .mg-btn-oro{background:var(--oro);color:var(--carbon)}
.magra .mg-btn-oro:hover{background:var(--oro-hi)}
.magra .mg-btn-oro:disabled{background:#5b5346;color:var(--crema);cursor:not-allowed}
.magra .mg-btn-ghost{background:transparent;color:var(--crema);border-color:rgba(242,230,215,.4)}
.magra .mg-btn-ghost:hover{border-color:var(--oro);color:var(--oro)}
.magra .mg-btn-wa{background:var(--wa);color:#fff}
.magra .mg-btn-wa:hover{background:#0a6935}
.magra .mg-btn:active{transform:scale(.98)}
.magra .mg-logo{font:400 34px/1 var(--f-d);letter-spacing:.08em;color:var(--crema)}
.magra .mg-logo b{color:var(--oro);font-weight:400}
.magra .mg-link{appearance:none;background:none;border:0;padding:0;cursor:pointer;color:var(--oro);font:700 16px/1.3 var(--f-c);text-decoration:underline;text-underline-offset:4px;min-height:44px;display:inline-flex;align-items:center;gap:.35em}
.magra .mg-link:hover{color:var(--oro-hi)}
.magra .mg-x{position:absolute;top:12px;right:12px;z-index:3;width:56px;height:56px;border-radius:999px;border:1px solid var(--linea);background:var(--carbon);color:var(--crema);font:400 32px/1 var(--f-c);cursor:pointer;display:grid;place-items:center}
.magra .mg-x:hover{border-color:var(--oro);color:var(--oro)}
@keyframes mg-sube{from{transform:translateY(24px)}}
/* Flechas, estrellas y glifos: con la letra del sistema. Si los pintara Open Sans, el navegador
   bajaría dos archivos más (símbolos y matemática, ~68 KB) sólo por «→» y «★». */
.magra .mg-sim{font-family:system-ui,'Segoe UI Symbol','Apple Symbols',sans-serif;font-style:normal}
`;

/** Lo de la vidriera (cabecera, hero, despiece, carta, ficha, bolsa, barra, pie). */
export const CSS_VIDRIERA = `
/* CABECERA */
.magra .mg-top{position:fixed;inset:0 0 auto;z-index:50;height:var(--top);display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 var(--gut);background:var(--carbon);border-bottom:1px solid var(--filete)}
.magra .mg-marca{display:flex;flex-direction:column;justify-content:center;min-height:48px;text-decoration:none;line-height:1}
.magra .mg-marca small{margin-top:5px;font:700 11px/1.2 var(--f-c);letter-spacing:.24em;text-transform:uppercase;color:var(--acero)}
.magra .mg-nav{display:flex;gap:28px}
.magra .mg-nav a{display:inline-flex;align-items:center;min-height:48px;font:700 13px/1 var(--f-c);letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:var(--acero)}
.magra .mg-nav a:hover{color:var(--crema)}
.magra .mg-top-cta{min-height:48px;padding:0 22px;font-size:13px}

/* HERO: la foto real de los packs y el título de la marca */
.magra .mg-hero{display:grid;grid-template-columns:1.15fr .85fr;align-items:center;gap:clamp(24px,4vw,72px);min-height:100svh;max-width:1680px;margin:0 auto;padding:calc(var(--top) + 32px) var(--gut) 64px}
.magra .mg-hero-copy{container-type:inline-size;min-width:0}
.magra .mg-h1{margin:20px 0 24px;font:400 clamp(64px,21cqi,208px)/.86 var(--f-d);letter-spacing:.005em;text-transform:uppercase;color:var(--crema)}
.magra .mg-h1-l{display:block;animation:mg-linea .6s cubic-bezier(.2,.8,.2,1) both}
.magra .mg-h1-l+.mg-h1-l{animation-delay:80ms;color:var(--oro)}
@keyframes mg-linea{from{clip-path:inset(-20% -5% 100% -5%);transform:translateY(.14em)}to{clip-path:inset(-20% -5% -20% -5%)}}
.magra .mg-lede{max-width:58ch;color:var(--crema)}
.magra .mg-pausa{margin-top:20px;padding:14px 18px;border:1px solid var(--oro);border-radius:6px;color:var(--oro);font-weight:700}
.magra .mg-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.magra .mg-hero-zona{margin-top:22px;font-size:15px;color:var(--gris)}
.magra .mg-hero-foto{position:relative;margin:0;aspect-ratio:1100/874;background:var(--negro);border-radius:12px;overflow:hidden}
.magra .mg-hero-foto img{display:block;width:100%;height:100%;object-fit:cover;animation:mg-foto 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes mg-foto{from{transform:scale(1.04)}}
.magra .mg-hero-foto::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,transparent 58%,rgba(0,0,0,.6))}
.magra .mg-sello{position:absolute;z-index:1;top:16px;left:16px;padding:10px 14px;border-radius:999px;border:1px solid rgba(197,174,134,.5);background:var(--carbon);color:var(--oro);font:700 12px/1 var(--f-c);letter-spacing:.2em;text-transform:uppercase}
.magra .mg-hero-foto figcaption{position:absolute;z-index:1;left:16px;right:16px;bottom:14px;width:fit-content;padding:8px 12px;border-radius:4px;background:var(--carbon);font:700 12px/1.3 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--crema)}

/* MARQUEE */
.magra .mg-marquee{position:relative;overflow:hidden;border-block:1px solid var(--filete);padding:18px 0}
.magra .mg-marquee:hover .mg-track,.magra .mg-quieto .mg-track{animation-play-state:paused}
.magra .mg-marquee-pausa{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:48px;height:48px;display:grid;place-items:center;border:1px solid var(--filete);border-radius:50%;background:var(--carbon);color:var(--crema);font-size:13px;cursor:pointer}
.magra .mg-saltar{position:fixed;left:12px;top:12px;z-index:100;display:inline-flex;align-items:center;min-height:48px;padding:0 20px;border-radius:4px;background:var(--crema);color:var(--carbon);font:700 15px/1 var(--f-c);text-decoration:none;transform:translateY(-200%)}
.magra .mg-saltar:focus{transform:none}
.magra .mg-track{display:flex;width:max-content;animation:mg-marq 36s linear infinite}
.magra .mg-track span{font:400 28px/1 var(--f-d);letter-spacing:.08em;white-space:nowrap;padding-right:28px;text-transform:uppercase}
.magra .mg-track i{font-style:normal;color:var(--oro);margin-left:28px}
@keyframes mg-marq{to{transform:translateX(-50%)}}

/* PROPUESTAS DE VALOR */
.magra .mg-valores{list-style:none;margin:0 auto;max-width:1680px;padding:64px var(--gut);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px}
.magra .mg-valores li{display:flex;flex-direction:column;gap:6px}
.magra .mg-valor-g{font-size:28px;line-height:1;color:var(--oro)}
.magra .mg-valores b{font:700 18px/1.3 var(--f-c)}
.magra .mg-valores li>span:last-child{font-size:16px;color:var(--acero)}

/* COLUMNA + RIEL */
.magra .mg-shell{display:grid;grid-template-columns:minmax(0,1fr) var(--rail);align-items:start;border-top:1px solid var(--filete)}
.magra .mg-col{min-width:0;container-type:inline-size;padding:0 var(--gut)}
.magra .mg-sec{padding-block:clamp(96px,12vh,176px) 0}
.magra .mg-cortes{padding-top:96px;scroll-margin-top:var(--top)}
.magra .mg-sec-cab{display:flex;flex-direction:column;gap:12px}

/* PESTAÑAS POR ANIMAL */
.magra .mg-tabs{position:relative;display:flex;gap:4px;margin:40px 0 32px;border-bottom:1px solid var(--filete);overflow-x:auto;scrollbar-width:none}
.magra .mg-tabs button{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 20px;border:0;border-bottom:3px solid transparent;background:none;color:var(--acero);font:400 30px/1 var(--f-d);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;cursor:pointer}
.magra .mg-tabs button.on{color:var(--crema);border-bottom-color:var(--oro)}
.magra .mg-tab-n{font:700 12px/1 var(--f-c);color:var(--gris);letter-spacing:.06em}

/* DESPIECE: el momento protagonista */
.magra .mg-desp{margin-bottom:40px}
.magra .mg-desp-svg{display:block;width:100%;height:auto;aspect-ratio:880/470}
.magra .mg-desp-trazo{fill:none;stroke:var(--oro);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.magra .mg-desp-reg{fill:var(--oro);fill-opacity:0;stroke:var(--oro);stroke-width:1.5;stroke-linejoin:round;cursor:pointer;outline:none;transition:fill-opacity .18s,filter .18s}
.magra .mg-desp-reg.vista,.magra .mg-desp-reg:focus-visible{fill-opacity:.18;filter:drop-shadow(0 0 6px rgba(197,174,134,.55))}
.magra .mg-desp-reg:focus-visible{stroke-width:3.5}
.magra .mg-desp-reg.on{fill:var(--sangre);fill-opacity:.9;filter:drop-shadow(0 0 8px rgba(197,174,134,.6))}
.magra .mg-desp-rotulos text{font:400 24px/1 var(--f-d);letter-spacing:.06em;fill:var(--crema);pointer-events:none;text-transform:uppercase}
.magra .mg-desp-vista{min-height:1.6em;margin:12px 0 16px;font-size:16px;color:var(--acero)}
.magra .mg-desp-vista b{color:var(--oro)}
.magra .mg-desp-chips{display:flex;flex-wrap:wrap;gap:8px}
.magra .mg-chip{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px;border-radius:999px;border:1px solid var(--linea);background:transparent;color:var(--crema);font:700 14px/1 var(--f-c);letter-spacing:.04em;white-space:nowrap;cursor:pointer;position:relative}
.magra .mg-chip:hover{border-color:var(--oro)}
.magra .mg-chip.on{background:var(--oro);border-color:var(--oro);color:var(--carbon)}
.magra .mg-chip-n{font-weight:400;color:var(--gris)}
.magra .mg-chip.on .mg-chip-n{color:var(--carbon)}

/* LA CARTA */
.magra .mg-carta-cab{display:flex;align-items:baseline;flex-wrap:wrap;gap:12px 20px;margin:24px 0 20px}
.magra .mg-carta-h{font-size:clamp(52px,12cqi,128px)}
.magra .mg-carta-n{font:700 14px/1 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--oro)}
.magra .mg-filtros{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:32px;scroll-margin-top:calc(var(--top) + 24px)}
.magra .mg-filtros-k{margin-right:8px;font:700 13px/1 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--acero)}
.magra .mg-sin{padding:24px 0 48px;color:var(--acero)}
.magra .mg-carta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
@container (min-width:1160px){.magra .mg-carta{grid-template-columns:repeat(4,minmax(0,1fr))}}
@container (max-width:760px){.magra .mg-carta{grid-template-columns:repeat(2,minmax(0,1fr))}}
.magra .mg-carta.lista{grid-template-columns:repeat(2,minmax(0,1fr))}

/* LA ETIQUETA: el rótulo del pack */
.magra .mg-eti{position:relative;display:flex;flex-direction:column;background:var(--tarjeta);border:1px solid rgba(197,174,134,.18);border-radius:12px;overflow:hidden;transition:border-color .16s,transform .16s}
.magra .mg-eti:hover{border-color:rgba(197,174,134,.55)}
.magra .mg-eti:has(.mg-eti-abrir:active){transform:scale(.98)}
.magra .mg-eti.on{border-color:var(--oro)}
.magra .mg-eti-vis{aspect-ratio:4/5;background:var(--negro);display:grid;place-items:center;overflow:hidden;position:relative}
.magra .mg-ficha-vis{position:relative}
.magra .mg-pendiente{position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);padding:3px 8px;border-radius:3px;background:rgba(13,13,12,.86);color:var(--crema);font:600 11px/1.3 var(--f-c);letter-spacing:.03em}
.magra .mg-eti-vis img{display:block;width:100%;height:100%;object-fit:cover}
.magra .mg-eti.off .mg-eti-vis{filter:grayscale(1) brightness(.55)}
.magra .mg-mini{display:block;width:100%;height:100%}
.magra .mg-mini use{fill:none;stroke:var(--oro);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.magra .mg-mini use.on{fill:var(--oro);fill-opacity:.85}
/* LA ETIQUETA DE PACK (cortes sin foto real): medida en unidades del contenedor, caja fija. */
.magra .mg-pack{container-type:size;width:100%;height:100%;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,rgba(242,230,215,.07) 0%,transparent 38%,rgba(242,230,215,.035) 62%,transparent 78%),#0d0d0c}
.magra .mg-pack-et{container-type:inline-size;display:flex;flex-direction:column;gap:4.5cqmin;width:min(76cqw,60cqh);padding:5cqmin 4.6cqmin 4.2cqmin;border:max(1px,.8cqmin) solid var(--oro);border-radius:4.5cqmin;background:var(--negro);box-shadow:inset 0 0 0 max(1px,.5cqmin) rgba(197,174,134,.22);transform:rotate(-1.5deg)}
/* Adentro de la etiqueta, todo en unidades de la etiqueta (cqi). El nombre achica según su palabra más larga
   (--n, la pone EtiquetaDePack): «Hamburguesas» entra entera, sin cortarse a la mitad. */
.magra .mg-pack-marca{font:400 13cqi/1 var(--f-d);letter-spacing:.14em;text-align:center;color:var(--crema)}
.magra .mg-pack-marca b{color:var(--oro);font-weight:400}
.magra .mg-pack-nom{display:grid;place-items:center;min-height:34cqi;padding:4cqi;overflow:hidden;border-radius:2cqi;background:var(--crema);color:var(--carbon);font:400 min(18cqi,calc(86cqi / (var(--n,8) * .47)))/.92 var(--f-d);letter-spacing:.02em;text-transform:uppercase;text-align:center;text-wrap:balance}
.magra .mg-pack-pie{display:flex;align-items:center;justify-content:space-between;gap:3cqi;min-height:19cqi;font:700 5cqi/1.15 var(--f-c);letter-spacing:.14em;text-transform:uppercase;color:var(--oro)}
.magra .mg-pack-sello{flex:none;display:grid;place-items:center;width:20cqi;height:20cqi;padding:2.2cqi;border-radius:50%;border:max(1px,.6cqi) solid var(--oro)}
.magra .mg-pack-sello .mg-mini{width:100%;height:auto;aspect-ratio:880/470}
@container (max-width:140px){.magra .mg-pack-pie>span:first-child{display:none}.magra .mg-pack-pie{justify-content:center}}
.magra .mg-eti-rot{flex:1;display:flex;flex-direction:column;gap:10px;margin:12px;padding:16px 18px 18px;border:1px solid rgba(197,174,134,.55);border-radius:4px}
.magra .mg-eti-prov{font:700 12px/1.2 var(--f-c);letter-spacing:.22em;text-transform:uppercase;color:var(--oro)}
.magra .mg-eti-nom{margin:0;font:400 clamp(30px,2.4vw,40px)/.95 var(--f-d);letter-spacing:.02em;text-transform:uppercase}
.magra .mg-eti-abrir{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;letter-spacing:inherit;text-transform:inherit;color:var(--crema);text-align:left;cursor:pointer}
.magra .mg-eti-abrir::after{content:"";position:absolute;inset:0;z-index:1;border-radius:12px}
.magra .mg-eti-abrir:focus-visible{outline:none}
.magra .mg-eti-abrir:focus-visible::after{outline:2px solid var(--oro);outline-offset:-3px}
.magra .mg-eti-nom small,.magra .mg-ficha-h small{font:700 14px/1 var(--f-c);letter-spacing:.06em;color:var(--acero);text-transform:none}
.magra .mg-eti-pie{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:auto}
.magra .mg-eti-precio{font:400 clamp(28px,2.2vw,38px)/1 var(--f-d);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.magra .mg-eti-precio small{margin-left:6px;font:700 12px/1 var(--f-c);letter-spacing:.06em;color:var(--gris)}
.magra .mg-eti.off .mg-eti-precio{color:var(--gris)}
.magra .mg-step{position:relative;z-index:2;display:inline-flex;align-items:center;height:52px;border:1px solid rgba(197,174,134,.55);border-radius:999px}
.magra .mg-step button{width:52px;height:52px;border:0;border-radius:999px;background:none;color:var(--oro);font:400 26px/1 var(--f-c);cursor:pointer;transition:transform .16s}
.magra .mg-step button:active{transform:scale(.9)}
.magra .mg-step button:disabled{color:#6f747a;cursor:not-allowed}
.magra .mg-step-q{min-width:64px;text-align:center;font:700 15px/1 var(--f-c);font-variant-numeric:tabular-nums}
.magra .mg-step.grande{height:56px}
.magra .mg-step.grande button{width:56px;height:56px}
.magra .mg-disp{position:relative;z-index:2;font:700 12px/1.2 var(--f-c);letter-spacing:.16em;text-transform:uppercase;color:var(--oro)}
.magra .mg-disp.off{color:var(--alerta)}
.magra .mg-eti.lista .mg-eti-rot{margin:0;border:0;border-radius:0}

/* ENVASADOS AL VACÍO, GOURMET, PROVEEDORES, RESEÑAS, QUIÉNES SOMOS */
.magra .mg-vac{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:48px}
.magra .mg-vac-card{display:flex;flex-direction:column;gap:12px;padding:24px;border:1px solid var(--filete);border-radius:12px}
.magra .mg-vac-card .mg-mini{height:auto;aspect-ratio:880/470}
.magra .mg-vac-card h3{margin:8px 0 0;font:400 32px/1 var(--f-d);letter-spacing:.02em;text-transform:uppercase}
.magra .mg-vac-card p{color:var(--acero);font-size:16px}
.magra .mg-gou{list-style:none;margin:48px 0 16px;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.magra .mg-gou img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:12px;background:var(--tarjeta)}
.magra .mg-gou span{display:block;margin-top:12px;font:700 15px/1.3 var(--f-c)}
.magra .mg-prov-sec{padding-top:96px}
.magra .mg-prov{list-style:none;margin:32px 0 0;padding:0;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:16px;align-items:center}
.magra .mg-prov img{display:block;width:100%;max-width:150px;height:auto;margin:0 auto}
.magra .mg-prov span{font:400 24px var(--f-d)}
.magra .mg-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:48px}
.magra .mg-rev{margin:0;padding:28px;background:var(--tarjeta);border:1px solid rgba(197,174,134,.18);border-radius:12px;display:flex;flex-direction:column;gap:16px}
.magra .mg-estrellas{color:var(--oro);letter-spacing:.2em}
.magra .mg-rev-txt{margin:0;font-size:17px;line-height:1.6}
.magra .mg-rev figcaption{margin-top:auto;font:700 13px/1.3 var(--f-c);letter-spacing:.12em;text-transform:uppercase;color:var(--oro)}
.magra .mg-about{padding-bottom:clamp(96px,12vh,176px)}
.magra .mg-about .mg-h2{font-size:clamp(40px,7cqi,96px);max-width:16ch}
.magra .mg-about p{max-width:58ch;margin-top:24px;color:var(--acero)}
.magra .mg-vacio-carta{padding:48px 0;display:flex;flex-direction:column;gap:16px;align-items:flex-start;color:var(--acero)}
.magra .mg-vacio-t{font:400 48px/1 var(--f-d);color:var(--crema);text-transform:uppercase}

/* LA BOLSA — en la compu, un riel fijo (el <dialog> se muestra siempre, en su columna) */
.magra .mg-bolsa{position:sticky;inset:auto;top:var(--top);display:flex;flex-direction:column;width:auto;max-width:none;height:calc(100vh - var(--top));max-height:none;margin:0;padding:0;border:0;border-left:1px solid var(--filete);background:#141412;color:var(--crema);overflow-y:auto;overscroll-behavior:contain}
.magra .mg-bolsa-cab{position:relative;padding:28px 28px 18px;border-bottom:1px solid rgba(242,230,215,.08)}
.magra .mg-bolsa-t{margin:8px 0 0;display:flex;align-items:center;gap:12px;font:400 40px/1 var(--f-d);letter-spacing:.03em;text-transform:uppercase}
.magra .mg-cnt{display:inline-grid;place-items:center;min-width:36px;height:36px;padding:0 8px;border-radius:999px;background:var(--oro);color:var(--carbon);font:700 16px/1 var(--f-c)}
.magra .mg-bolsa-x{display:none}
.magra .mg-bolsa-form{flex:1;display:flex;flex-direction:column}
.magra .mg-renglones{padding:4px 0}
.magra .mg-bolsa-vacia{padding:24px 28px;font-size:16px;color:var(--acero)}
.magra .mg-renglon{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;padding:16px 28px;border-bottom:1px solid rgba(242,230,215,.08)}
.magra .mg-renglon-info{display:flex;flex-direction:column;gap:6px;min-width:0}
.magra .mg-renglon-nom{font:700 16px/1.3 var(--f-c)}
.magra .mg-renglon-pu{font-size:14px;color:var(--gris)}
.magra .mg-renglon-t{font:400 28px/1 var(--f-d);font-variant-numeric:tabular-nums}
.magra .mg-renglon .mg-step{align-self:flex-start}
.magra .mg-aviso{grid-column:1/-1;font-size:14px;color:var(--alerta)}
.magra .mg-bolsa-pie{margin-top:auto;padding:20px 28px 28px;background:rgba(0,0,0,.3);border-top:1px solid rgba(242,230,215,.1)}
.magra .mg-campos{display:grid;gap:12px;margin-bottom:16px}
.magra .mg-campo{display:grid;gap:6px;font:700 13px/1.2 var(--f-c);letter-spacing:.06em;color:var(--acero)}
.magra .mg-campo input,.magra .mg-campo select{width:100%;min-height:52px;padding:0 14px;border-radius:6px;border:1px solid rgba(242,230,215,.3);background:#0d0d0c;color:var(--crema);font:400 16px/1.2 var(--f-c);letter-spacing:0}
.magra .mg-campo input:focus,.magra .mg-campo select:focus{border-color:var(--oro)}
.magra .mg-cupon{display:flex;gap:8px}
.magra .mg-cupon .mg-btn{min-height:52px;padding:0 16px}
.magra .mg-retiro{font-size:15px;color:var(--acero)}
.magra .mg-franjas{border:0;margin:0;padding:0;display:grid;gap:10px}
.magra .mg-franjas legend{margin-bottom:8px;font:700 13px/1.2 var(--f-c);color:var(--acero)}
.magra .mg-franjas-op{display:flex;flex-wrap:wrap;gap:8px}
.magra .mg-franjas-op input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.magra .mg-franjas-op label:has(input:focus-visible){outline:2px solid var(--oro);outline-offset:3px}
.magra .mg-tot{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;font-size:15px;color:var(--acero)}
.magra .mg-tot .mg-num{color:var(--crema)}
.magra .mg-tot-grande{margin-top:8px;padding-top:14px;border-top:1px solid var(--filete)}
.magra .mg-tot-grande>span:first-child{font:700 13px/1.2 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--oro)}
.magra .mg-tot-grande .mg-num{font:400 clamp(44px,4vw,72px)/1 var(--f-d)}
.magra .mg-gratis,.magra .mg-pend,.magra .mg-empujon{color:var(--oro);font-weight:700}
.magra .mg-empujon{font-size:14px}
.magra .mg-nota-peso{margin:4px 0 12px;font-size:14px;color:var(--gris)}
.magra .mg-pago{margin:12px 0 14px;font-size:14px;color:var(--gris)}
.magra .mg-freno{display:grid;gap:10px;margin:12px 0;padding:12px 14px;border:1px solid var(--oro);border-radius:6px;font-size:15px}
.magra .mg-error{margin:12px 0;font-size:15px;color:var(--alerta)}
.magra .mg-ok{margin:12px 0;padding:14px;border:1px solid var(--oro);border-radius:6px;font-size:15px}
.magra .mg-ok a{display:inline-flex;align-items:center;min-height:44px;color:var(--oro);font-weight:700}
.magra .mg-enviar,.magra .mg-bolsa-wa{width:100%}
.magra .mg-bolsa-wa{margin-top:10px}

/* LA FICHA (<dialog> modal) */
.magra .mg-ficha{margin:auto;width:min(1100px,calc(100% - 48px));max-width:none;max-height:calc(100svh - 48px);padding:0;border:1px solid rgba(197,174,134,.4);border-radius:12px;background:var(--carbon);color:var(--crema);overflow:hidden}
.magra .mg-ficha[open],.magra .mg-bolsa:modal{animation:mg-sube .24s cubic-bezier(.2,.8,.2,1)}
.magra .mg-ficha::backdrop,.magra .mg-bolsa::backdrop{background:rgba(0,0,0,.6)}
.magra .mg-ficha-in{position:relative;display:grid;grid-template-columns:5fr 7fr;grid-template-rows:minmax(0,1fr) auto;height:min(760px,calc(100svh - 50px))}
.magra .mg-ficha-vis{grid-row:1/3;min-height:0;display:grid;grid-template-rows:minmax(0,1fr);place-items:center;background:var(--negro)}
/* Nunca ampliada (P0-2): la foto de 480 px y la etiqueta se ven a su tamaño, centradas sobre el negro. */
.magra .mg-ficha-vis img{display:block;width:auto;height:auto;max-width:min(100%,480px);max-height:100%;object-fit:contain}
.magra .mg-ficha-vis .mg-pack{max-width:480px;max-height:600px}
.magra .mg-ficha-txt{min-height:0;overflow-y:auto;padding:48px 48px 24px}
.magra .mg-ficha-h{margin:10px 0 24px;padding-right:56px;font:400 clamp(48px,6vw,96px)/.88 var(--f-d);letter-spacing:.01em;text-transform:uppercase;text-wrap:balance}
.magra .mg-ficha-sale{display:flex;align-items:center;gap:16px;padding:16px 0;border-block:1px solid var(--filete)}
.magra .mg-ficha-sale .mg-mini{flex:none;width:150px;height:auto;aspect-ratio:880/470}
.magra .mg-k{display:block;font:700 12px/1.2 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--oro)}
.magra .mg-v{display:block;margin-top:4px;font:400 30px/1 var(--f-d);letter-spacing:.02em;text-transform:uppercase}
.magra .mg-ficha-cocc{list-style:none;margin:16px 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.magra .mg-ficha-cocc li{padding:8px 14px;border:1px solid var(--linea);border-radius:999px;font:700 13px/1 var(--f-c)}
.magra .mg-ficha-pres{font-size:15px;color:var(--acero)}
.magra .mg-ficha-precio{margin:10px 0 16px;font:400 clamp(44px,4vw,72px)/1 var(--f-d);font-variant-numeric:tabular-nums}
.magra .mg-ficha-precio small{font:700 14px/1 var(--f-c);color:var(--gris);letter-spacing:.06em}
.magra .mg-cuantos{margin:16px 0;padding:0;border:0}
.magra .mg-cuantos legend{margin-bottom:12px;padding:0;font:700 13px/1.2 var(--f-c);letter-spacing:.2em;text-transform:uppercase;color:var(--oro)}
.magra .mg-cuantos-op{display:flex;gap:8px}
.magra .mg-cuantos-op label{position:relative;display:grid;place-items:center;min-width:56px;height:56px;border:1px solid var(--linea);border-radius:6px;font:400 30px/1 var(--f-d);cursor:pointer}
.magra .mg-cuantos-op label.on{background:var(--oro);border-color:var(--oro);color:var(--carbon)}
.magra .mg-cuantos-op input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.magra .mg-cuantos-op label:has(input:focus-visible){outline:2px solid var(--oro);outline-offset:3px}
.magra .mg-cuantos-nota{margin-top:10px;font-size:14px;color:var(--gris)}
.magra .mg-ficha-cant{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:8px}
.magra .mg-ficha-pie{grid-column:2;padding:16px 48px 24px;border-top:1px solid var(--filete);background:var(--carbon)}
.magra .mg-ficha-pie .mg-btn{width:100%}

/* PIE */
.magra .mg-pie{padding:72px var(--gut) 40px;background:var(--negro);border-top:1px solid var(--filete)}
.magra .mg-pie-logo{display:block;width:150px;height:auto}
.magra .mg-pie-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px;margin:40px 0}
.magra .mg-pie h3{margin:0 0 12px;font:700 12px/1.2 var(--f-c);letter-spacing:.24em;text-transform:uppercase;color:var(--oro)}
.magra .mg-pie p{font-size:15px;color:var(--acero)}
.magra .mg-pie-cols a{display:flex;align-items:center;min-height:44px;font-size:15px;color:var(--acero);text-decoration:none}
.magra .mg-pie-cols a:hover{color:var(--oro)}
.magra .mg-pie-legal{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding-top:20px;border-top:1px solid var(--filete);font-size:13px;color:var(--gris)}
@media (max-width:820px){.magra .mg-pie-cols{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:480px){.magra .mg-pie-cols{grid-template-columns:minmax(0,1fr)}}

/* BARRA DE LA BOLSA (celular) */
.magra .mg-barra{display:none}
@keyframes mg-late{50%{transform:scale(1.2)}}

@media (max-width:1080px){
  .magra .mg-nav{display:none}
  .magra .mg-shell{grid-template-columns:minmax(0,1fr)}
  .magra .mg-bolsa:not([open]){display:none}
  .magra .mg-bolsa:modal{position:fixed;inset:auto 0 0 0;width:100%;max-width:none;height:auto;max-height:90svh;border:0;border-top:1px solid var(--oro);border-radius:16px 16px 0 0;padding-bottom:env(safe-area-inset-bottom)}
  .magra .mg-bolsa-x{display:grid}
  .magra .mg-bolsa-cab{padding-right:84px}
  .magra .mg-barra{display:block;position:fixed;left:0;right:0;bottom:0;z-index:40;height:calc(var(--barra) + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);background:var(--oro);color:var(--carbon)}
  .magra .mg-barra-in{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;height:var(--barra);padding:0 20px;border:0;background:none;color:var(--carbon);font:400 15px/1.2 var(--f-c);text-align:left;text-decoration:none;cursor:pointer}
  .magra .mg-barra-in b{font-weight:700}
  .magra .mg-barra-n{display:inline-block;animation:mg-late .16s ease-out}
  .magra .mg-barra-ir{flex:none;font:700 13px/1 var(--f-c);letter-spacing:.12em;text-transform:uppercase}
  .magra .mg-barra-in:focus-visible{outline:2px solid var(--carbon);outline-offset:-6px}
  .magra .mg-pie{padding-bottom:calc(40px + var(--barra) + env(safe-area-inset-bottom) + 24px)}
}
@media (max-width:820px){
  .magra{--top:64px}
  .magra .mg-top{background:var(--carbon);border-bottom:1px solid var(--filete)}
  .magra .mg-top-cta{display:none}
  .magra .mg-hero{grid-template-columns:minmax(0,1fr);min-height:0;padding-top:var(--top);gap:28px}
  .magra .mg-hero-foto{order:-1;margin:0 calc(var(--gut) * -1);border-radius:0}
  .magra .mg-valores{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 20px;padding-block:48px}
  .magra .mg-ficha{inset:auto 0 0 0;margin:0;width:100%;max-width:none;height:94svh;max-height:94svh;border:0;border-top:1px solid var(--oro);border-radius:16px 16px 0 0}
  .magra .mg-ficha-in{display:block;height:100%;max-height:none;overflow-y:auto;overscroll-behavior:contain}
  .magra .mg-ficha-vis{height:min(40svh,320px);overflow:hidden}
  .magra .mg-ficha-txt{overflow:visible;padding:24px 20px 16px}
  .magra .mg-ficha-pie{position:sticky;bottom:0;z-index:2;padding:12px 20px calc(12px + env(safe-area-inset-bottom))}
  .magra .mg-step{height:56px}
  .magra .mg-step button{width:56px;height:56px}
}
@container (max-width:700px){
  .magra .mg-vac{grid-template-columns:minmax(0,1fr)}
  .magra .mg-gou{grid-template-columns:repeat(2,minmax(0,1fr))}
  .magra .mg-revs{grid-template-columns:minmax(0,1fr)}
  .magra .mg-prov{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@container (max-width:600px){
  .magra .mg-desp-rotulos{display:none}
  .magra .mg-desp-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 calc(var(--gut) * -1);padding:0 var(--gut) 8px}
  .magra .mg-carta,.magra .mg-carta.lista{grid-template-columns:minmax(0,1fr);gap:16px}
  .magra .mg-eti{flex-direction:row}
  .magra .mg-eti-vis{flex:none;width:120px;align-self:flex-start}
  .magra .mg-eti-rot{min-width:0;margin:10px;padding:12px 14px}
  .magra .mg-eti-nom{font-size:30px}
}

/* Con un <dialog> abierto (ficha u hoja de la bolsa), la página de atrás no se corre. */
html:has(.magra dialog:modal){overflow:hidden}
@media (prefers-reduced-motion:no-preference){html:has(.magra){scroll-behavior:smooth}}
@media (prefers-reduced-motion:reduce){
  .magra *,.magra *::before,.magra *::after{animation:none!important;transition:none!important}
}
/* Foco visible oro en todo (al final: gana sobre los reseteos de arriba). */
.magra :focus-visible{outline:2px solid var(--oro);outline-offset:3px}
.magra .mg-desp-reg:focus-visible{outline:none}
`;
