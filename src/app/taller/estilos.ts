// La piel del taller (DISENO.md de AGR, 29/10/2026): CSS acotado bajo `.agr`, renderizado como <style> desde el
// SERVIDOR (layout.tsx). Ningún componente de cliente importa este módulo: la piel viaja una sola vez, en el HTML.
//
// Paleta (tres colores y nada más): tinta #111 · papel #fff · rojo AGR.
// [CONTRADICTORIO] el rojo: #d0111b medido en los píxeles del logo vs #c8102e en src/lib/taller/marca.ts:36.
// En el front manda el logo (#d0111b); marca.ts no se toca desde acá → queda para que lo confirme el dueño.
// Contraste (luminancia WCAG): rojo sobre blanco ≈ 5,5:1 · blanco sobre tinta ≈ 18:1 · #ff3b47 sobre #111 ≈ 5,4:1
// (el rojo que se usa como TEXTO o foco sobre fondo oscuro) · #4a4a4f sobre blanco ≈ 8,9:1.
//
// Movimiento: sólo transform / clip-path / color; nunca la opacidad del H1 (candidato a LCP). Con
// prefers-reduced-motion todo queda en su estado final.

export const ROJO_AGR = "#d0111b";

export const CSS_TALLER = `
.agr{
  --rojo:${ROJO_AGR};--rojo-osc:#ff3b47;--tinta:#111111;--papel:#ffffff;--gris:#f4f4f5;--linea:#e3e3e6;
  --panel:#1a1a1a;--texto-2:#4a4a4f;
  --display:var(--agr-f-display),"Arial Narrow",Arial,sans-serif;
  --cuerpo:var(--agr-f-cuerpo),Arial,system-ui,sans-serif;
  --mono:var(--agr-f-mono),"Courier New",ui-monospace,monospace;
  --sec:clamp(72px,calc(6rem + 4vw),144px);
  --curva:cubic-bezier(.2,.8,.2,1);
  position:relative;flex:1 0 auto;width:100%;background:var(--papel);color:var(--tinta);
  font-family:var(--cuerpo);font-size:clamp(1.0625rem,calc(1rem + .35vw),1.25rem);line-height:1.55;
  -webkit-font-smoothing:antialiased;overflow-x:clip;
}
.agr *,.agr *::before,.agr *::after{box-sizing:border-box}
html:has(.agr),body:has(.agr){background:#000}
.agr a{color:inherit}
.agr :focus-visible{outline:3px solid var(--rojo);outline-offset:3px}
.agr .agr-oscuro :focus-visible,.agr .agr-barra :focus-visible,.agr .agr-pie :focus-visible{outline-color:var(--rojo-osc)}
.agr .agr-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.agr .agr-mono{font-family:var(--mono);font-weight:600;font-variant-numeric:tabular-nums}
.agr .agr-cont{width:100%;max-width:1200px;margin:0 auto;padding:0 20px}
@media (min-width:768px){.agr .agr-cont{padding:0 32px}}
.agr main{display:block}
/* Celular: el pie termina por encima de la barra fija (el pie se lee completo, nada queda tapado). */
@media (max-width:767.98px){.agr:has(.agr-fija) .agr-pie{padding-bottom:calc(28px + 84px + env(safe-area-inset-bottom))}}

/* ── Botones ─────────────────────────────────────────────────────────────── */
.agr .agr-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 28px;border-radius:10px;
  border:2px solid var(--rojo);background:var(--rojo);color:#fff;font:600 1.0625rem/1.15 var(--cuerpo);text-transform:uppercase;
  letter-spacing:.04em;text-decoration:none;text-align:center;cursor:pointer;transition:transform 120ms var(--curva),background-color 120ms,border-color 120ms}
@media (min-width:768px){.agr .agr-btn{min-height:60px}}
@media (hover:hover){.agr .agr-btn:hover{transform:translateY(-1px);background:#b20e17;border-color:#b20e17}}
.agr .agr-btn:active{transform:scale(.985)}
.agr .agr-btn--borde{background:transparent;border-color:currentColor;color:inherit}
@media (hover:hover){.agr .agr-btn--borde:hover{background:transparent;border-color:currentColor}}
.agr .agr-btn--tinta{background:var(--tinta);border-color:var(--tinta)}
@media (hover:hover){.agr .agr-btn--tinta:hover{background:#000;border-color:#000}}
.agr .agr-btn--chico{min-height:44px;padding:0 18px;font-size:.9375rem}
.agr .agr-btn--ancho{width:100%}
.agr .agr-btn svg{flex:none}

/* ── Etiqueta de sección y titulares ─────────────────────────────────────── */
.agr .agr-etiqueta{display:flex;align-items:center;gap:12px;margin:0;font:600 .875rem/1.2 var(--cuerpo);text-transform:uppercase;letter-spacing:.08em}
.agr .agr-etiqueta::before{content:"";flex:none;width:32px;height:4px;background:var(--rojo)}
.agr .agr-h1{margin:20px 0 0;font:800 clamp(3rem,calc(2rem + 6.5vw),7rem)/.92 var(--display);text-transform:uppercase;letter-spacing:-.01em}
.agr .agr-h1 span{display:block;white-space:nowrap}
.agr .agr-h1 .agr-punto{display:inline;color:var(--rojo-osc)}
.agr .agr-h2{margin:16px 0 clamp(32px,4vw,56px);font:800 clamp(2.125rem,calc(1.5rem + 3vw),3.5rem)/.95 var(--display);text-transform:uppercase;letter-spacing:-.005em}
.agr .agr-h3{margin:0;font:700 clamp(1.375rem,calc(1.2rem + .8vw),1.75rem)/1.05 var(--display)}

/* ── Barra superior ──────────────────────────────────────────────────────── */
.agr .agr-barra{position:sticky;top:0;z-index:30;background:var(--tinta);color:#fff;border-bottom:4px solid var(--rojo)}
.agr .agr-barra__in{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.agr .agr-barra__logo{display:inline-flex;align-items:center;min-height:44px;color:#fff;text-decoration:none;font:800 1.25rem var(--display);text-transform:uppercase}
.agr .agr-barra__logo img{display:block;height:44px;width:auto}
.agr .agr-barra__nav{display:none;gap:32px;font:600 15px/1 var(--cuerpo)}
.agr .agr-barra__nav a{color:rgba(255,255,255,.85);text-decoration:none;padding:14px 0}
@media (hover:hover){.agr .agr-barra__nav a:hover{color:#fff;text-decoration:underline;text-underline-offset:6px;text-decoration-thickness:2px}}
@media (min-width:1024px){.agr .agr-barra__nav{display:flex}}
.agr .agr-barra__cta{display:none}
@media (min-width:768px){.agr .agr-barra__cta{display:inline-flex}}

/* ── Hero: la chapa ──────────────────────────────────────────────────────── */
.agr .agr-hero{background-color:var(--tinta);color:#fff;
  background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 2px,transparent 2px 14px);
  padding:clamp(48px,calc(3rem + 3vw),112px) 0 clamp(56px,calc(3rem + 4vw),128px)}
.agr .agr-hero__grid{display:grid;gap:clamp(40px,5vw,72px);align-items:center}
@media (min-width:960px){.agr .agr-hero__grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
.agr .agr-hero .agr-etiqueta{color:rgba(255,255,255,.85)}
.agr .agr-bajada{margin:24px 0 0;max-width:34ch;font-size:clamp(1.25rem,calc(1.1rem + .6vw),1.625rem);line-height:1.4;color:rgba(255,255,255,.9)}
.agr .agr-hechos{display:flex;flex-wrap:wrap;gap:10px 24px;margin:32px 0 0;padding:0;list-style:none;font:600 14px/1.3 var(--mono);color:rgba(255,255,255,.85)}
.agr .agr-hechos li{display:flex;align-items:center;gap:8px}
.agr .agr-hechos li::before{content:"";flex:none;width:6px;height:6px;background:var(--rojo-osc)}
.agr .agr-hechos a{color:#fff;text-underline-offset:4px;display:inline-flex;align-items:center;min-height:44px}

.agr .agr-chapa{width:100%;max-width:560px;justify-self:center}
.agr .agr-chapa__label{display:block;margin:0 0 12px;font:600 .875rem/1.2 var(--cuerpo);text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.85)}
.agr .agr-chapa__placa{container-type:inline-size;background:#fff;color:var(--tinta);border:4px solid var(--tinta);outline:2px solid rgba(255,255,255,.9);border-radius:12px;overflow:hidden;
  box-shadow:0 18px 40px rgba(0,0,0,.45);transition:border-color 200ms}
.agr .agr-chapa__placa[data-valida="si"]{border-color:var(--rojo)}
.agr .agr-chapa__banda{display:flex;align-items:center;justify-content:center;height:22px;background:var(--tinta);color:#fff;font:600 9px/1 var(--cuerpo);letter-spacing:.3em;text-transform:uppercase}
.agr .agr-chapa__input{display:block;width:100%;min-height:clamp(96px,calc(4rem + 8vw),168px);margin:0;padding:8px 12px;border:0;background:transparent;color:var(--tinta);
  font:600 min(clamp(2.5rem,calc(1.5rem + 6vw),5.5rem),calc((100cqi - 24px) / 6.9))/1 var(--mono);letter-spacing:.12em;text-align:center;text-transform:uppercase;border-radius:0}
.agr .agr-chapa__input::placeholder{color:rgba(17,17,17,.35)}
.agr .agr-chapa__input:focus{outline:none}
.agr .agr-chapa__placa:focus-within{box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 6px var(--rojo-osc)}
.agr .agr-chapa__input[data-tic="a"]{animation:agr-tecla-a 120ms var(--curva)}
.agr .agr-chapa__input[data-tic="b"]{animation:agr-tecla-b 120ms var(--curva)}
@keyframes agr-tecla-a{from{transform:translateY(-2px)}to{transform:none}}
@keyframes agr-tecla-b{from{transform:translateY(-2px)}to{transform:none}}
.agr .agr-chapa .agr-btn{margin-top:20px}
.agr .agr-chapa__aviso{min-height:1.5em;margin:10px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.88)}
.agr .agr-chapa__seguir{display:inline-block;margin:8px 0 0;padding:10px 0;color:#fff;font-size:15px;line-height:1.45;text-underline-offset:4px}

/* ── Secciones ───────────────────────────────────────────────────────────── */
.agr .agr-sec{padding:var(--sec) 0;scroll-margin-top:72px}
.agr .agr-sec--gris{background:var(--gris)}
.agr .agr-oscuro{background:var(--tinta);color:#fff}
.agr .agr-oscuro .agr-etiqueta{color:rgba(255,255,255,.85)}

/* Qué hacemos */
.agr .agr-rubros{list-style:none;margin:0;padding:0;display:grid;column-gap:32px}
@media (min-width:900px){.agr .agr-rubros{grid-template-columns:repeat(3,minmax(0,1fr))}}
.agr .agr-rubro{border-top:1px solid var(--linea);padding:32px 0 40px}
@media (min-width:900px){.agr .agr-rubro{padding:32px 40px 40px 0}}
.agr .agr-rubro__n{display:block;margin-bottom:14px;color:var(--rojo);font:600 1rem/1 var(--mono);transition:color 150ms}
@media (hover:hover){.agr .agr-rubro:hover .agr-rubro__n{color:var(--tinta)}}
.agr .agr-rubro p{margin:10px 0 0;color:var(--texto-2)}

.agr .agr-precios{margin-top:clamp(48px,6vw,88px)}
.agr .agr-precios__lista{list-style:none;margin:20px 0 0;padding:0;border-top:2px solid var(--tinta)}
.agr .agr-precio{border-bottom:1px solid var(--linea)}
.agr .agr-precio summary{display:grid;grid-template-columns:1fr auto;grid-template-areas:"nombre precio" "dur mas";gap:4px 16px;align-items:center;min-height:64px;padding:16px 0;cursor:pointer;list-style:none}
@media (min-width:768px){.agr .agr-precio summary{grid-template-columns:1fr 120px 200px 32px;grid-template-areas:"nombre dur precio mas"}}
.agr .agr-precio summary::-webkit-details-marker{display:none}
.agr .agr-precio__nombre{grid-area:nombre;font-weight:600}
.agr .agr-precio__dur{grid-area:dur;color:var(--texto-2);font:600 .9375rem/1 var(--mono)}
.agr .agr-precio__monto{grid-area:precio;text-align:right;white-space:nowrap}
.agr .agr-precio__monto small{font:600 .9375rem var(--cuerpo);margin-right:6px}
.agr .agr-precio__monto b{font:600 clamp(1.25rem,calc(1.1rem + .7vw),1.75rem)/1 var(--mono)}
.agr .agr-precio__mas{grid-area:mas;justify-self:end;display:grid;place-items:center;width:32px;height:32px;border:2px solid var(--tinta);border-radius:50%;font:600 1.125rem/1 var(--mono)}
.agr .agr-precio__mas::before{content:"+"}
.agr .agr-precio[open] .agr-precio__mas::before{content:"−"}
.agr .agr-precio__ficha{padding:0 0 28px;max-width:62ch}
.agr .agr-precio__ficha ul{margin:0 0 20px;padding-left:1.1em;color:var(--texto-2)}
.agr .agr-precio__ficha li{margin:4px 0}
.agr .agr-nota{margin:16px 0 0;font-size:.9375rem;color:var(--texto-2)}
.agr .agr-vacio{margin-top:clamp(40px,5vw,72px);padding:28px;border-radius:16px;background:var(--gris);display:grid;gap:20px;justify-items:start}
.agr .agr-vacio p{margin:0;max-width:52ch}

/* Así trabajamos: la misma barra de etapas que ve el cliente en su link */
.agr .agr-etapas{position:relative;list-style:none;margin:0;padding:0;display:grid;gap:40px}
.agr .agr-etapas__linea{position:absolute;background:var(--rojo);left:26px;top:28px;bottom:28px;width:4px;transition:clip-path 700ms ease-out}
.agr .agr-etapa{position:relative;display:grid;grid-template-columns:56px 1fr;gap:20px;align-items:start}
.agr .agr-etapa__n{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--tinta);color:#fff;border:4px solid var(--gris);font:600 1.125rem/1 var(--mono);transition:transform 400ms var(--curva)}
.agr .agr-etapa p{margin:8px 0 0;color:var(--texto-2)}
@media (min-width:900px){
  .agr .agr-etapas{grid-template-columns:repeat(4,minmax(0,1fr));gap:32px}
  .agr .agr-etapas__linea{left:28px;right:calc(25% - 4px);top:26px;bottom:auto;width:auto;height:4px}
  .agr .agr-etapa{grid-template-columns:1fr;gap:20px}
}
.agr .agr-etapas[data-anim="espera"] .agr-etapas__linea{clip-path:inset(0 0 100% 0)}
@media (min-width:900px){.agr .agr-etapas[data-anim="espera"] .agr-etapas__linea{clip-path:inset(0 100% 0 0)}}
.agr .agr-etapas[data-anim="espera"] .agr-etapa__n{transform:scale(.6)}
.agr .agr-etapas[data-anim="listo"] .agr-etapas__linea{clip-path:inset(0 0 0 0)}

/* Reseñas */
.agr .agr-resenas{list-style:none;margin:0 0 32px;padding:0;display:grid;gap:20px}
@media (min-width:900px){.agr .agr-resenas{grid-template-columns:repeat(3,minmax(0,1fr))}}
.agr .agr-resena{background:var(--gris);border-radius:16px;padding:28px}
.agr .agr-resena__estrellas{display:flex;gap:4px;color:var(--rojo)}
.agr .agr-resena__estrellas .apagada{color:#c9c9cf}
.agr .agr-resena blockquote{margin:16px 0;font:700 clamp(1.25rem,calc(1.1rem + .6vw),1.75rem)/1.15 var(--display)}
.agr .agr-resena cite{font:600 15px var(--cuerpo);font-style:normal}

/* Dónde estamos */
.agr .agr-donde{display:grid;gap:40px;align-items:start}
@media (min-width:900px){.agr .agr-donde{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
.agr .agr-direccion{margin:20px 0 0;font:700 clamp(1.75rem,calc(1.3rem + 2vw),2.75rem)/1.05 var(--display)}
.agr .agr-horario{margin:16px 0 0;font:600 1rem/1.5 var(--mono);color:rgba(255,255,255,.88)}
.agr .agr-botones{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.agr .agr-ig{margin:24px 0 0;font-size:1rem;color:rgba(255,255,255,.85)}
.agr .agr-ig a{color:#fff;font-weight:600;display:inline-flex;align-items:center;min-height:44px;text-underline-offset:4px}
.agr .agr-mapa{position:relative;aspect-ratio:16/10;border-radius:16px;overflow:hidden;background-color:var(--panel);
  background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px)}
.agr .agr-mapa__fachada{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:18px;padding:24px;text-align:center}
.agr .agr-mapa__fachada p{margin:0;font:600 1rem/1.4 var(--mono);color:rgba(255,255,255,.88)}
.agr .agr-mapa iframe{position:absolute;inset:0;width:100%;height:100%;border:0}

/* Pie */
.agr .agr-pie{background:#000;color:#fff;font-size:.9375rem;padding:28px 0}
.agr .agr-pie__in{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 24px}
.agr .agr-pie p{margin:0}
.agr .agr-pie__lema{color:rgba(255,255,255,.7)}
.agr .agr-pie a{color:#fff;display:inline-flex;align-items:center;min-height:44px;text-underline-offset:4px}
.agr .agr-pie__links{display:flex;flex-wrap:wrap;gap:0 24px}

/* Barra fija del celular */
.agr .agr-fija{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;gap:12px;background:#fff;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -8px 24px rgba(0,0,0,.12);border-top:1px solid var(--linea)}
.agr .agr-fija .agr-btn{flex:1;min-width:0}
.agr .agr-fija__wa{display:grid;place-items:center;flex:none;width:56px;height:56px;border-radius:10px;border:2px solid var(--tinta);background:#fff;color:var(--tinta)}
.agr .agr-fija__info{flex:1;min-width:0;font:600 .875rem/1.3 var(--mono);color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agr .agr-fija--turno .agr-btn{flex:none;padding:0 20px}
@media (min-width:768px){.agr .agr-fija{display:none}}

/* ── Turno ───────────────────────────────────────────────────────────────── */
.agr .agr-turno{padding:clamp(40px,5vw,88px) 0 var(--sec)}
.agr .agr-turno__grid{display:grid;gap:32px;align-items:start;grid-template-areas:"cab" "res" "form"}
.agr .agr-turno__cab{grid-area:cab}
.agr .agr-turno__form{grid-area:form;min-width:0}
.agr .agr-resumen{grid-area:res}
@media (min-width:1024px){.agr .agr-turno__grid{grid-template-columns:minmax(0,720px) 340px;grid-template-areas:"cab res" "form res";grid-template-rows:auto 1fr;justify-content:space-between;column-gap:48px}}
.agr .agr-turno .agr-h1{margin-top:12px;font-size:clamp(3rem,calc(2rem + 4vw),5.5rem)}
.agr .agr-turno__bajada{margin:16px 0 0;max-width:46ch;color:var(--texto-2)}
.agr .agr-turno__regla{margin:12px 0 0;font-size:.9375rem;color:var(--texto-2)}
.agr .agr-resumen{align-self:start;background:var(--tinta);color:#fff;border-radius:16px;padding:24px}
@media (min-width:1024px){.agr .agr-resumen{position:sticky;top:96px}}
.agr .agr-resumen h2{margin:0 0 16px;font:600 .875rem/1.2 var(--cuerpo);text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.85)}
.agr .agr-resumen dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:16px 0 0}
.agr .agr-resumen dt{color:rgba(255,255,255,.7);font-size:.9375rem}
.agr .agr-resumen dd{margin:0;font-weight:600;text-align:right}
.agr .agr-resumen dd.agr-mono{font-size:1rem}
.agr .agr-minichapa{display:inline-block;background:#fff;color:var(--tinta);border:3px solid #fff;outline:2px solid var(--tinta);border-radius:8px;overflow:hidden;min-width:180px;text-align:center}
.agr .agr-minichapa span{display:block;height:12px;background:var(--tinta);color:#fff;font:600 7px/12px var(--cuerpo);letter-spacing:.3em;text-transform:uppercase}
.agr .agr-minichapa b{display:block;padding:6px 14px;font:600 1.5rem/1.2 var(--mono);letter-spacing:.12em}

.agr .agr-pasos{list-style:none;margin:0;padding:0;border-top:2px solid var(--tinta)}
.agr .agr-paso{border-bottom:1px solid var(--linea);padding:24px 0;scroll-margin-top:84px}
.agr .agr-paso__cab{display:flex;align-items:center;gap:16px;min-height:44px}
.agr .agr-paso__n{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--gris);color:var(--tinta);font:600 1rem/1 var(--mono)}
.agr .agr-paso[data-estado="activo"] .agr-paso__n{background:var(--rojo);color:#fff}
.agr .agr-paso[data-estado="hecho"] .agr-paso__n{background:var(--tinta);color:#fff}
.agr .agr-paso__titulo{flex:1;min-width:0}
.agr .agr-paso__titulo h2{margin:0;font:700 clamp(1.375rem,calc(1.2rem + .8vw),1.75rem)/1.05 var(--display)}
.agr .agr-paso__valor{display:block;margin-top:2px;font-size:.9375rem;color:var(--texto-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agr .agr-paso__cambiar{flex:none;min-height:44px;padding:0 14px;border:2px solid var(--tinta);border-radius:10px;background:#fff;color:var(--tinta);font:600 .875rem var(--cuerpo);text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
.agr .agr-paso__cuerpo{padding-top:20px;animation:agr-abre 240ms var(--curva)}
@keyframes agr-abre{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
.agr .agr-campo{display:grid;gap:8px;margin:0 0 18px}
.agr .agr-campo label{font:600 .9375rem var(--cuerpo)}
.agr .agr-campo small{color:var(--texto-2);font-size:.875rem}
.agr .agr-input{width:100%;min-height:56px;padding:0 16px;border:2px solid var(--linea);border-radius:10px;background:#fff;color:var(--tinta);font:400 17px/1.3 var(--cuerpo)}
.agr .agr-input:focus{border-color:var(--tinta);outline:none}
.agr .agr-input:focus-visible{outline:3px solid var(--rojo);outline-offset:2px}
.agr .agr-input--patente{font:600 1.5rem/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;max-width:280px}
.agr .agr-opciones{display:grid;gap:12px}
@media (min-width:640px){.agr .agr-opciones{grid-template-columns:repeat(2,minmax(0,1fr))}}
.agr .agr-opcion{display:grid;gap:6px;align-content:center;min-height:76px;padding:14px 18px;border:2px solid var(--linea);border-radius:16px;background:#fff;color:var(--tinta);text-align:left;font:inherit;cursor:pointer;transition:border-color 120ms,transform 120ms var(--curva)}
@media (hover:hover){.agr .agr-opcion:hover{border-color:var(--tinta)}}
.agr .agr-opcion[aria-pressed="true"]{border-color:var(--rojo);box-shadow:inset 0 0 0 2px var(--rojo)}
.agr .agr-opcion b{font-weight:600;line-height:1.25}
.agr .agr-opcion span{font:600 .9375rem/1.2 var(--mono);color:var(--texto-2)}
.agr .agr-dias{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;min-height:176px}
@media (max-width:639.98px){
  .agr .agr-dias{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -20px;padding:0 20px 8px;min-height:92px;scrollbar-width:thin}
  .agr .agr-dia{flex:0 0 76px;scroll-snap-align:start}
}
.agr .agr-dia{display:grid;justify-items:center;gap:2px;min-height:84px;padding:10px 4px;border:2px solid var(--linea);border-radius:10px;background:#fff;color:var(--tinta);font:inherit;cursor:pointer}
.agr .agr-dia small{font:600 .8125rem/1.2 var(--cuerpo);text-transform:uppercase;letter-spacing:.04em}
.agr .agr-dia b{font:600 1.375rem/1.1 var(--mono)}
.agr .agr-dia span{font:600 .75rem/1.2 var(--mono);color:var(--texto-2)}
.agr .agr-dia:disabled{background:var(--gris);color:#8a8a90;border-color:var(--gris);cursor:default}
.agr .agr-dia:disabled span{color:#8a8a90}
.agr .agr-dia[aria-pressed="true"]{border-color:var(--rojo);box-shadow:inset 0 0 0 2px var(--rojo)}
.agr .agr-horas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:20px}
.agr .agr-hora{min-height:48px;border:2px solid var(--linea);border-radius:10px;background:#fff;color:var(--tinta);font:600 1.0625rem/1 var(--mono);cursor:pointer}
.agr .agr-hora[aria-pressed="true"]{background:var(--tinta);border-color:var(--tinta);color:#fff}
.agr .agr-estado{min-height:1.5em;margin:16px 0 0;color:var(--texto-2);font-size:.9375rem}
.agr .agr-error{margin:16px 0 0;padding:14px 16px;border-radius:10px;background:#fdecec;color:#8e0a12;border-left:4px solid var(--rojo);font-weight:600}
.agr .agr-letra-chica{margin:14px 0 0;font-size:.9375rem;color:var(--texto-2)}
.agr .agr-link{display:inline-flex;align-items:center;min-height:44px;color:var(--tinta);font-weight:600;text-underline-offset:4px;background:none;border:0;padding:0;cursor:pointer;font-size:inherit}

/* Error */
.agr .agr-falla{padding:var(--sec) 0;min-height:60vh}
.agr .agr-falla p{max-width:48ch;color:var(--texto-2)}

@media (prefers-reduced-motion:reduce){
  .agr *,.agr *::before,.agr *::after{animation:none!important;transition:none!important}
  .agr .agr-etapas[data-anim] .agr-etapas__linea{clip-path:none}
  .agr .agr-etapas[data-anim] .agr-etapa__n{transform:none}
  .agr .agr-btn:hover,.agr .agr-btn:active{transform:none}
}
`;
