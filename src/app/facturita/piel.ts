// FACTURITA · Piel de la vidriera pública: «el talonario que se desprende» (diseño 29/10/2026,
// fronts/facturita/DISENO.md). Módulo PURO: un string de CSS que VidrieraMarco (servidor) imprime
// en un <style>. Así no viaja dentro del JS de los componentes cliente (trampa de
// vidriera-de-autor §5: el CSS importado por un cliente baja dos veces).
//
// Reglas que este CSS respeta:
// - Variables locales del marco (--fx-*), nada en tokens globales.
// - Texto ámbar SIEMPRE en --fx-ambar-tinta (#8f621c, 5,0:1 sobre papel); el #9a6a1f queda para
//   fondos de botón (tinta blanca) y filetes, porque como texto sobre papel da 4,41:1.
// - Movimiento sólo con transform / clip-path / filter; nunca la opacidad de un H1/H2.
// - prefers-reduced-motion: todo en estado final, sin transición.

export const PIEL_FACTURITA = `
.fx{
  --fx-papel:#fbf7f0;--fx-papel-2:#f3ecdf;--fx-fondo:#fffdf9;--fx-borde:#e6dac4;
  --fx-ambar:#9a6a1f;--fx-ambar-hover:#865b19;--fx-ambar-tinta:#8f621c;
  --fx-tinta:#1b1508;--fx-tenue:#5e5547;--fx-ok:#2f6b3a;--fx-ok-suave:#e3efe0;
  --fx-gutter:clamp(16px,5vw,72px);--fx-seccion:clamp(4.5rem,3rem + 7vw,9rem);
  --fx-cuerpo:clamp(1.0625rem,1rem + .3vw,1.1875rem);
  --fx-serif:var(--font-fraunces),Georgia,"Times New Roman",serif;
  --fx-sans:var(--font-hanken),system-ui,-apple-system,"Segoe UI",sans-serif;
  min-height:100vh;background:var(--fx-fondo);color:var(--fx-tinta);
  font-family:var(--fx-sans);font-size:var(--fx-cuerpo);line-height:1.6;
  overflow-x:clip;
}
.fx *,.fx *::before,.fx *::after{box-sizing:border-box}
.fx .fx-cifras{font-variant-numeric:tabular-nums}

/* ── contenedor y ritmo ─────────────────────────────────────────────── */
.fx .fx-caja{width:100%;max-width:calc(1200px + 2 * var(--fx-gutter));margin-inline:auto;padding-inline:var(--fx-gutter)}
.fx .fx-caja--texto{max-width:calc(68ch + 2 * var(--fx-gutter))}
.fx .fx-caja--alta{max-width:calc(760px + 2 * var(--fx-gutter))}
.fx .fx-seccion{padding-block:var(--fx-seccion)}
.fx .fx-seccion--papel{background:var(--fx-papel);border-block:1px solid var(--fx-papel-2)}

/* ── tipografía ─────────────────────────────────────────────────────── */
.fx .fx-h1{margin:0;font-family:var(--fx-serif);font-weight:500;font-size:clamp(2.75rem,1.5rem + 5vw,5.75rem);line-height:.98;letter-spacing:-.02em;text-wrap:balance;color:var(--fx-tinta)}
.fx .fx-h2{margin:0;font-family:var(--fx-serif);font-weight:500;font-size:clamp(2rem,1.1rem + 2.8vw,3.5rem);line-height:1.04;letter-spacing:-.015em;text-wrap:balance;color:var(--fx-tinta)}
.fx .fx-h1 em,.fx .fx-h2 em{font-style:italic;font-weight:400;color:var(--fx-ambar-tinta)}
.fx .fx-h3{margin:0;font-family:var(--fx-serif);font-weight:600;font-size:clamp(1.375rem,1.2rem + .6vw,1.75rem);line-height:1.2;letter-spacing:-.01em;color:var(--fx-tinta)}
.fx .fx-ante{margin:0 0 20px;font-weight:600;font-size:1rem;letter-spacing:.01em;color:var(--fx-ambar-tinta)}
.fx .fx-lead{margin:20px 0 0;max-width:52ch;font-size:clamp(1.25rem,1.1rem + .6vw,1.5rem);line-height:1.5;color:var(--fx-tenue)}
.fx .fx-bajada{margin:18px 0 0;max-width:60ch;color:var(--fx-tenue)}
.fx .fx-tenue{color:var(--fx-tenue)}
.fx .fx-chico{font-size:.9375rem;line-height:1.55;color:var(--fx-tenue)}
.fx .fx-enlace{color:var(--fx-tinta);font-weight:600;text-decoration:underline;text-decoration-color:var(--fx-ambar);text-underline-offset:5px;text-decoration-thickness:2px;border-radius:4px}
.fx .fx-enlace:hover{color:var(--fx-ambar-tinta)}

/* ── foco ───────────────────────────────────────────────────────────── */
.fx a:focus-visible,.fx button:focus-visible,.fx summary:focus-visible,.fx input:focus-visible{outline:3px solid var(--fx-ambar-tinta);outline-offset:3px}

/* ── botones ────────────────────────────────────────────────────────── */
.fx .fx-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 28px;border-radius:14px;border:0;background:var(--fx-ambar);color:#fff;font-family:var(--fx-sans);font-weight:600;font-size:clamp(1.0625rem,1rem + .25vw,1.1875rem);line-height:1.2;text-align:center;text-decoration:none;cursor:pointer;transition:background-color .15s}
.fx .fx-btn:hover{background:var(--fx-ambar-hover)}
.fx .fx-btn--2{background:#fff;color:var(--fx-tinta);box-shadow:inset 0 0 0 1.5px var(--fx-borde)}
.fx .fx-btn--2:hover{background:var(--fx-papel)}
.fx .fx-btn--chico{min-height:44px;padding:0 18px;font-size:1rem;border-radius:12px}
@media (min-width:1024px){.fx .fx-btn:not(.fx-btn--chico){min-height:60px}}

/* ── barra de arriba y pie ──────────────────────────────────────────── */
.fx .fx-saltar{position:fixed;left:16px;top:-80px;z-index:60;padding:12px 18px;border-radius:12px;background:var(--fx-tinta);color:#fff;font-weight:600;text-decoration:none;transition:top .15s}
.fx .fx-saltar:focus{top:12px}
.fx .fx-barra{background:var(--fx-papel);border-bottom:1px solid var(--fx-papel-2)}
.fx .fx-barra-fila{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px}
.fx .fx-marca{display:inline-flex;align-items:center;gap:10px;border-radius:10px;color:var(--fx-tinta);text-decoration:none;font-family:var(--fx-serif);font-weight:600;font-size:1.375rem;letter-spacing:-.01em}
.fx .fx-nav{display:flex;align-items:center;gap:4px}
.fx .fx-nav a.fx-nav-item{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:10px;color:var(--fx-tenue);font-weight:500;font-size:1rem;text-decoration:none}
.fx .fx-nav a.fx-nav-item:hover{color:var(--fx-tinta)}
.fx .fx-nav .fx-btn{margin-left:8px}
@media (max-width:767.98px){.fx .fx-solo-compu{display:none!important}}
@media (min-width:768px){.fx .fx-solo-celu{display:none!important}}
.fx .fx-pie{border-top:1px solid var(--fx-papel-2);background:var(--fx-fondo)}
.fx .fx-pie-fila{display:flex;flex-direction:column;gap:10px;padding-block:28px;font-size:.8125rem;line-height:1.5;color:var(--text-faint)}
.fx .fx-pie a{color:inherit;border-radius:4px}
.fx .fx-pie a:hover{color:var(--fx-tinta)}
@media (min-width:768px){.fx .fx-pie-fila{flex-direction:row;justify-content:space-between;align-items:center}}

/* ── barra fija inferior (celular) ──────────────────────────────────── */
.fx .fx-barrafija{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--fx-papel);border-top:1px solid var(--fx-borde);box-shadow:0 -8px 24px -16px rgba(27,21,8,.35);transition:transform .24s cubic-bezier(.2,.8,.2,1)}
.fx .fx-barrafija .fx-btn{width:100%}
@media (scripting:enabled){.fx .fx-barrafija[data-modo="tras-cta"]:not([data-visible]){transform:translateY(calc(100% + 8px))}}
@media (min-width:768px){.fx .fx-barrafija{display:none}}
@media (max-width:767.98px){.fx[data-barra]{padding-bottom:calc(88px + env(safe-area-inset-bottom))}}

/* ── héroe ──────────────────────────────────────────────────────────── */
.fx .fx-heroe{padding-block:clamp(40px,3rem + 3vw,112px) var(--fx-seccion)}
.fx .fx-heroe-grilla{display:grid;gap:clamp(48px,6vw,72px);align-items:center}
@media (min-width:1280px){.fx .fx-heroe-grilla{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:32px}}
.fx .fx-acciones{display:flex;flex-direction:column;align-items:flex-start;gap:16px;margin-top:36px}
@media (min-width:640px){.fx .fx-acciones{flex-direction:row;align-items:center;gap:24px}}
.fx .fx-acciones .fx-btn{width:100%}
@media (min-width:640px){.fx .fx-acciones .fx-btn{width:auto}}
.fx .fx-garantias{display:flex;flex-wrap:wrap;gap:10px 24px;margin:32px 0 0;padding:0;list-style:none;font-size:1rem;color:var(--fx-tenue)}
.fx .fx-garantias li{display:inline-flex;align-items:center;gap:10px}
.fx .fx-garantias li::before{content:"";width:7px;height:7px;border-radius:999px;background:var(--fx-ambar);flex:none}

/* ── escena: teléfono + hoja ────────────────────────────────────────── */
.fx .fx-escena{position:relative;display:grid;justify-items:center;width:100%}
.fx .fx-escena > .fx-telefono{grid-area:1/1}
.fx .fx-escena > .fx-hoja-lugar{grid-row:2;margin-top:-20px;width:min(340px,100%);position:relative;z-index:2;scroll-margin-block:24px}
@media (max-width:767.98px){.fx .fx-escena > .fx-hoja-lugar{scroll-margin-bottom:calc(104px + env(safe-area-inset-bottom))}}
@media (min-width:640px){
  .fx .fx-escena{max-width:600px;margin-inline:auto;min-height:700px;justify-items:start;align-items:start}
  .fx .fx-escena > .fx-hoja-lugar{grid-area:1/1;justify-self:end;align-self:end;margin-top:0}
}
@media (min-width:1280px){
  .fx .fx-escena{max-width:none;margin-inline:0 calc(-1 * min(var(--fx-gutter),40px));width:auto}
}
.fx .fx-telefono{position:relative;width:260px;height:540px;padding:10px;border-radius:40px;background:#1b1508;box-shadow:0 40px 80px -36px rgba(27,21,8,.55),0 0 0 1px rgba(255,255,255,.07) inset}
@media (min-width:640px){.fx .fx-telefono{width:300px;height:620px;padding:12px}}
.fx .fx-pantalla{position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden;border-radius:30px;background:var(--fx-papel)}
.fx .fx-isla{position:absolute;top:9px;left:50%;width:84px;height:24px;margin-left:-42px;border-radius:999px;background:#1b1508}
.fx .fx-app-cabecera{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:42px 16px 8px}
.fx .fx-app-nombre{display:inline-flex;align-items:center;gap:8px;font-family:var(--fx-serif);font-weight:600;font-size:1rem}
.fx .fx-rotulo{display:inline-block;padding:3px 8px;border-radius:999px;background:var(--fx-papel-2);color:var(--fx-tenue);font-size:.6875rem;font-weight:600;line-height:1.3;letter-spacing:.02em;text-transform:uppercase}
.fx .fx-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:0;padding:4px 10px 0;list-style:none}
.fx .fx-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:48px;padding:4px 2px;border:0;border-radius:10px;background:none;color:var(--fx-tenue);font:600 .75rem/1.2 var(--fx-sans);cursor:pointer;text-align:center}
.fx .fx-tab::after{content:"";display:block;width:100%;height:3px;margin-top:6px;border-radius:999px;background:var(--fx-borde)}
.fx .fx-tab[aria-current="step"]{color:var(--fx-tinta)}
.fx .fx-tab[aria-current="step"]::after,.fx .fx-tab[data-hecho]::after{background:var(--fx-ambar)}
.fx .fx-pista{display:flex;flex:1;min-height:0;transition:transform 240ms cubic-bezier(.2,.8,.2,1)}
.fx .fx-panel{display:flex;flex:0 0 100%;flex-direction:column;gap:10px;min-width:0;padding:14px 16px 16px}
.fx .fx-panel-titulo{margin:0 0 2px;font-family:var(--fx-serif);font-weight:500;font-size:1.375rem;line-height:1.15;letter-spacing:-.01em}
.fx .fx-etiqueta{display:block;font-size:.8125rem;font-weight:600;color:var(--fx-tinta)}
.fx .fx-campo{display:block;width:100%;height:48px;margin-top:4px;padding:0 12px;border:1.5px solid var(--fx-borde);border-radius:12px;background:#fff;color:var(--fx-tinta);font:500 1rem var(--fx-sans)}
.fx .fx-campo:read-only{background:var(--fx-papel-2)}
.fx .fx-opcion{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:0 14px;border:1.5px solid var(--fx-borde);border-radius:12px;background:#fff;color:var(--fx-tinta);font:600 .9375rem var(--fx-sans);text-align:left;cursor:pointer}
.fx .fx-opcion[aria-pressed="true"]{border-color:var(--fx-ambar);background:#fff7e8;box-shadow:inset 0 0 0 1px var(--fx-ambar)}
.fx .fx-opcion::before{content:"";flex:none;width:16px;height:16px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--fx-tenue)}
.fx .fx-opcion[aria-pressed="true"]::before{box-shadow:inset 0 0 0 5px var(--fx-ambar)}
.fx .fx-panel .fx-btn{width:100%;min-height:48px;margin-top:auto;font-size:1rem;border-radius:12px}
.fx .fx-resumen{margin:0;padding:12px 14px;border-radius:12px;background:#fff;font-size:.875rem;line-height:1.5}
.fx .fx-resumen div{display:flex;justify-content:space-between;gap:10px}
.fx .fx-resumen dt{color:var(--fx-tenue)}
.fx .fx-resumen dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
.fx .fx-lista-ok{display:grid;place-items:center;width:56px;height:56px;border-radius:999px;background:var(--fx-ok-suave);color:var(--fx-ok)}
.fx .fx-solo-js{}
@media (scripting:none){.fx .fx-solo-js{display:none!important}}

/* ── la hoja (factura de ejemplo) ───────────────────────────────────── */
.fx .fx-hoja{position:relative;margin:0;width:100%;padding:26px 22px 16px;border:1px solid var(--fx-papel-2);border-radius:20px;background:var(--fx-papel);box-shadow:inset 0 6px 0 var(--fx-ambar),0 2px 6px rgba(27,21,8,.06),0 28px 56px -28px rgba(27,21,8,.4);color:var(--fx-tinta);font-size:.9375rem;line-height:1.45}
.fx .fx-hoja::before{content:"";position:absolute;left:18px;right:18px;top:12px;height:4px;background:radial-gradient(circle,var(--fx-borde) 1.5px,transparent 2px) 0 50%/10px 4px repeat-x}
.fx .fx-hoja-cabeza{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fx .fx-letra{display:grid;place-items:center;width:44px;height:44px;border:2px solid var(--fx-tinta);border-radius:8px;font-family:var(--fx-serif);font-weight:600;font-size:1.625rem;line-height:1}
.fx .fx-hoja-tipo{display:flex;align-items:center;gap:12px}
.fx .fx-hoja-tipo p{margin:0}
.fx .fx-cap{font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fx-tenue)}
.fx .fx-numero{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:.875rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.fx .fx-hoja dl{margin:18px 0 0;display:grid;gap:6px}
.fx .fx-hoja dl div{display:flex;justify-content:space-between;gap:12px}
.fx .fx-hoja dt{color:var(--fx-tenue)}
.fx .fx-hoja dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere;min-width:0}
.fx .fx-hoja-total{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--fx-borde)}
.fx .fx-hoja-total strong{font-family:var(--fx-serif);font-weight:500;font-size:2rem;line-height:1;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.fx .fx-hoja-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap}
.fx .fx-sello{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--fx-ok-suave);color:var(--fx-ok);font-weight:700;font-size:.875rem;white-space:nowrap}
.fx .fx-sello--borrador{background:var(--fx-papel-2);color:var(--fx-tenue)}
.fx .fx-sin-validez{font-weight:700;font-size:.8125rem;letter-spacing:.04em;text-transform:uppercase;color:var(--fx-tinta)}
.fx .fx-pdf{margin:8px 0 0;font-size:.8125rem;color:var(--fx-tenue)}
.fx .fx-sim-error{margin:-4px 0 0;font-size:.8125rem;font-weight:600;color:var(--danger)}
.fx .fx-campo[aria-invalid="true"]{border-color:var(--danger)}
.fx .fx-descargo{margin:14px -6px 0;padding:10px 6px 0;border-top:1px dashed var(--fx-borde);font-size:.8125rem;line-height:1.45;color:var(--fx-tenue)}
.fx .fx-descargo strong{color:var(--fx-tinta)}
.fx .fx-qr{display:flex;align-items:center;gap:12px}
.fx .fx-qr svg{flex:none;width:72px;height:72px}
.fx .fx-marca-n{display:inline-grid;place-items:center;flex:none;width:24px;height:24px;border-radius:999px;background:var(--fx-ambar);color:#fff;font:700 .75rem/1 var(--fx-sans);font-variant-numeric:tabular-nums}
.fx .fx-con-marca{display:inline-flex;align-items:center;gap:8px}

/* la hoja grande de «Así sale» */
.fx .fx-hoja--grande{padding:clamp(28px,4vw,44px) clamp(20px,3.5vw,40px) 20px;font-size:var(--fx-cuerpo)}
.fx .fx-hoja--grande .fx-letra{width:56px;height:56px;font-size:2rem}
.fx .fx-hoja--grande .fx-numero{font-size:1rem}
.fx .fx-hoja--grande .fx-hoja-total strong{font-size:clamp(2.25rem,1.6rem + 2vw,3rem)}
.fx .fx-asi-grilla{display:grid;gap:clamp(32px,5vw,64px);margin-top:clamp(40px,4vw,56px);align-items:start}
@media (min-width:1024px){.fx .fx-asi-grilla{grid-template-columns:560px minmax(0,1fr)}}
.fx .fx-partes{display:grid;gap:24px;margin:0;padding:0;list-style:none}
.fx .fx-partes li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:14px}
.fx .fx-partes h3{margin:0;font-weight:700;font-size:var(--fx-cuerpo);line-height:1.4}
.fx .fx-partes p{margin:4px 0 0;color:var(--fx-tenue)}

/* ── movimiento de la hoja ──────────────────────────────────────────── */
@keyframes fx-desprender{from{clip-path:inset(0 0 100% 0);transform:translateY(-12px) rotate(-1.5deg)}to{clip-path:inset(0);transform:none}}
@keyframes fx-sello{from{transform:scale(.9)}to{transform:none}}
@keyframes fx-aparece{from{transform:translateY(28px);filter:blur(4px)}to{transform:none;filter:none}}
.fx .fx-hoja[data-estado="pegada"]{clip-path:inset(0 0 100% 0);transform:translateY(-12px) rotate(-1.5deg)}
@media (prefers-reduced-motion:no-preference){
  @media (scripting:enabled){
    .fx .fx-hoja[data-estado="inicial"]{animation:fx-desprender 520ms cubic-bezier(.2,.8,.2,1) 1.8s both}
    .fx .fx-escena[data-espera] .fx-hoja[data-estado="inicial"]{animation-play-state:paused}
  }
  .fx .fx-hoja[data-estado="suelta"]{transition:clip-path 520ms cubic-bezier(.2,.8,.2,1),transform 520ms cubic-bezier(.2,.8,.2,1)}
  .fx .fx-hoja[data-estado="suelta"] .fx-sello{animation:fx-sello 180ms cubic-bezier(.2,.8,.2,1) 380ms both}
  @supports (animation-timeline:view()){
    .fx .fx-aparece{animation:fx-aparece linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
  }
}
@media (prefers-reduced-motion:reduce){
  .fx *,.fx *::before,.fx *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}

/* ── secciones ──────────────────────────────────────────────────────── */
.fx .fx-pasos{display:grid;gap:clamp(16px,2vw,32px);margin:clamp(40px,4vw,56px) 0 0;padding:0;list-style:none}
@media (min-width:768px){.fx .fx-pasos{grid-template-columns:repeat(3,minmax(0,1fr))}}
.fx .fx-paso{position:relative;overflow:hidden;padding:clamp(24px,3vw,36px);border-radius:20px;background:var(--fx-fondo);box-shadow:inset 0 4px 0 var(--fx-ambar),0 1px 0 var(--fx-papel-2),0 18px 36px -28px rgba(27,21,8,.35)}
.fx .fx-paso-n{display:block;margin:-8px 0 8px;font-family:var(--fx-serif);font-weight:500;font-size:96px;line-height:1;color:color-mix(in srgb,var(--fx-ambar) 22%,transparent);font-variant-numeric:tabular-nums}
.fx .fx-paso p{margin:10px 0 0;color:var(--fx-tenue)}

.fx .fx-precios{display:grid;gap:clamp(16px,2vw,32px);margin-top:clamp(40px,4vw,56px)}
@media (min-width:768px){.fx .fx-precios{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fx .fx-hoja-plan{position:relative;display:flex;flex-direction:column;padding:clamp(28px,3vw,40px);border-radius:20px;background:var(--fx-papel);border:1px solid var(--fx-papel-2);box-shadow:inset 0 6px 0 var(--fx-ambar),0 24px 48px -32px rgba(27,21,8,.35)}
.fx .fx-hoja-plan--quieta{box-shadow:inset 0 6px 0 var(--fx-borde),0 24px 48px -32px rgba(27,21,8,.25)}
.fx .fx-precio{margin:12px 0 0;font-family:var(--fx-serif);font-weight:500;font-size:clamp(3rem,2rem + 3.5vw,5rem);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.fx .fx-precio small{font-family:var(--fx-sans);font-weight:400;font-size:var(--fx-cuerpo);letter-spacing:0;color:var(--fx-tenue)}
.fx .fx-precio-desde{font-family:var(--fx-sans);font-weight:500;font-size:var(--fx-cuerpo);letter-spacing:0;color:var(--fx-tenue);margin-right:6px}
.fx .fx-precio--m{font-size:clamp(3rem,2.6rem + 1vw,3.5rem)}
.fx .fx-lista{display:grid;gap:10px;margin:20px 0 0;padding:0;list-style:none}
.fx .fx-lista li{position:relative;padding-left:22px}
.fx .fx-lista li::before{content:"";position:absolute;left:2px;top:.62em;width:8px;height:8px;border-radius:999px;background:var(--fx-ambar)}
.fx .fx-lista--no li{color:var(--fx-tenue)}
.fx .fx-lista--no li::before{height:2px;width:10px;border-radius:2px;top:.78em;background:var(--fx-tenue)}

.fx .fx-dos{display:grid;gap:clamp(24px,3vw,48px);margin-top:32px}
@media (min-width:768px){.fx .fx-dos{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fx .fx-dos ol{margin:10px 0 0;padding-left:1.3em;display:grid;gap:6px;color:var(--fx-tenue)}

.fx .fx-faq{margin-top:clamp(32px,4vw,48px);border-top:1px solid var(--fx-borde)}
.fx .fx-faq details{border-bottom:1px solid var(--fx-borde)}
.fx .fx-faq summary{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:14px 4px;border-radius:10px;cursor:pointer;list-style:none;font-weight:600;font-size:clamp(1.125rem,1.05rem + .3vw,1.25rem)}
.fx .fx-faq summary::-webkit-details-marker{display:none}
.fx .fx-faq summary span{flex:none;font-size:1.75rem;font-weight:400;line-height:1;color:var(--fx-ambar-tinta);transition:transform .2s}
.fx .fx-faq details[open] summary span{transform:rotate(45deg)}
.fx .fx-faq details p{margin:0;padding:0 4px 22px;max-width:62ch;color:var(--fx-tenue)}

.fx .fx-cierre{display:flex;flex-direction:column;align-items:flex-start;gap:28px}
@media (min-width:768px){.fx .fx-cierre{flex-direction:row;align-items:center;justify-content:space-between}}

/* ── planes ─────────────────────────────────────────────────────────── */
.fx .fx-planes-top{display:grid;gap:clamp(16px,2vw,32px);margin-top:clamp(40px,4vw,56px)}
@media (min-width:1024px){.fx .fx-planes-top{grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:stretch}}
.fx .fx-cuando{display:flex;flex-direction:column;justify-content:center;gap:16px;padding:clamp(28px,3vw,40px);border-radius:20px;background:var(--fx-fondo);border:1px solid var(--fx-papel-2)}
.fx .fx-planes-4{display:grid;gap:clamp(16px,2vw,24px);margin-top:clamp(32px,3vw,48px)}
@media (min-width:768px){.fx .fx-planes-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1280px){.fx .fx-planes-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.fx .fx-planes-4 .fx-hoja-plan{padding:28px 24px}
.fx .fx-planes-4 .fx-lista{font-size:1rem}

/* ── alta ───────────────────────────────────────────────────────────── */
.fx .fx-progreso{margin:clamp(32px,4vw,48px) 0 0;font-size:var(--fx-cuerpo);font-weight:600;color:var(--fx-tinta)}
.fx .fx-segmentos{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;margin-top:10px}
.fx .fx-segmentos span{height:6px;border-radius:999px;background:var(--fx-borde)}
.fx .fx-segmentos span[data-lleno]{background:var(--fx-ambar)}
.fx .fx-hoja-form{margin-top:24px;padding:clamp(24px,4vw,44px) clamp(18px,4vw,44px);border-radius:20px;background:var(--fx-papel);border:1px solid var(--fx-papel-2);box-shadow:inset 0 6px 0 var(--fx-ambar),0 2px 6px rgba(27,21,8,.05),0 28px 56px -36px rgba(27,21,8,.35)}
.fx .fx-hoja-form h2{font-family:var(--fx-serif);font-weight:500;font-size:clamp(1.75rem,1.4rem + 1.2vw,2.25rem);line-height:1.1;letter-spacing:-.01em;color:var(--fx-tinta);outline:none}
.fx .fx-alta-label{display:block;font-size:var(--fx-cuerpo);font-weight:600;color:var(--fx-tinta)}
.fx .fx-alta-ayuda{margin:2px 0 0;font-size:1rem;color:var(--fx-tenue)}
.fx .fx-alta-input{display:block;width:100%;height:56px;margin-top:8px;padding:0 16px;border:1.5px solid var(--fx-borde);border-radius:14px;background:#fff;color:var(--fx-tinta);font:500 1.0625rem var(--fx-sans);scroll-margin-bottom:calc(120px + env(safe-area-inset-bottom));scroll-margin-top:96px}
.fx .fx-alta-input[aria-invalid="true"]{border-color:var(--danger)}
.fx .fx-alta-input:disabled{background:var(--fx-papel-2);color:var(--fx-tenue)}
.fx .fx-alta-input::placeholder{color:#8a7f6e}
.fx .fx-alta-texto{height:auto;min-height:10rem;padding-block:12px;line-height:1.45;white-space:pre-wrap;resize:vertical}
.fx .fx-condicion{display:flex;gap:14px;min-height:72px;padding:16px 18px;border-radius:16px;border:1.5px solid var(--fx-borde);background:#fff;cursor:pointer}
.fx .fx-condicion:has(:checked){border-color:var(--fx-ambar);background:#fff7e8;box-shadow:inset 0 0 0 1px var(--fx-ambar)}
.fx .fx-condicion:has(:focus-visible){outline:3px solid var(--fx-ambar-tinta);outline-offset:3px}
.fx .fx-condicion input{flex:none;width:20px;height:20px;margin-top:3px;accent-color:var(--fx-ambar)}
.fx .fx-check{display:flex;align-items:flex-start;gap:12px;min-height:48px;font-size:1rem;color:var(--fx-tinta)}
.fx .fx-check input{flex:none;width:20px;height:20px;margin-top:3px;accent-color:var(--fx-ambar);scroll-margin-bottom:calc(120px + env(safe-area-inset-bottom))}
.fx .fx-alta-acciones{display:flex;justify-content:space-between;gap:12px;margin-top:36px;padding-top:24px;border-top:1px solid var(--fx-borde)}
.fx .fx-alta-grupo{display:flex;gap:12px}
@media (max-width:767.98px){
  .fx .fx-alta-acciones .fx-btn{width:100%}
  .fx .fx-alta-acciones[data-vacia]{display:none}
  .fx .fx-alta-acciones{position:fixed;left:0;right:0;bottom:0;z-index:40;margin:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--fx-papel);border-top:1px solid var(--fx-borde);box-shadow:0 -8px 24px -16px rgba(27,21,8,.35)}
  .fx .fx-alta-acciones > *{flex:1}
  .fx .fx-alta-acciones:empty{display:none}
  .fx[data-alta]{padding-bottom:calc(88px + env(safe-area-inset-bottom))}
}
.fx .fx-volver{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin:-8px 0 8px -4px;padding:0 4px;border:0;background:none;color:var(--fx-tinta);font:600 1rem var(--fx-sans);text-decoration:underline;text-decoration-color:var(--fx-ambar);text-underline-offset:5px;cursor:pointer;border-radius:8px}
.fx .fx-resumen-alta{margin:0;border-radius:16px;background:#fff;border:1px solid var(--fx-borde)}
.fx .fx-resumen-alta div{display:flex;justify-content:space-between;gap:16px;padding:14px 18px;border-top:1px solid var(--fx-papel-2)}
.fx .fx-resumen-alta div:first-child{border-top:0}
.fx .fx-resumen-alta dt{color:var(--fx-tenue)}
.fx .fx-resumen-alta dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}

/* ── legales ────────────────────────────────────────────────────────── */
.fx .fx-doc{padding:clamp(28px,5vw,64px) clamp(20px,5vw,64px);border-radius:20px;background:var(--fx-papel);border:1px solid var(--fx-papel-2);box-shadow:inset 0 6px 0 var(--fx-ambar)}
.fx .fx-doc h1{margin:0;font-family:var(--fx-serif);font-weight:500;font-size:clamp(2.75rem,2.2rem + 1.6vw,3.5rem);line-height:1.02;letter-spacing:-.02em;text-wrap:balance}
.fx .fx-doc h2{margin:48px 0 0;font-family:var(--fx-serif);font-weight:500;font-size:1.75rem;line-height:1.2;letter-spacing:-.01em}
.fx .fx-doc p{margin:14px 0 0;max-width:68ch;font-size:clamp(1.125rem,1.05rem + .25vw,1.1875rem);line-height:1.65}
.fx .fx-borrador{margin:0 0 32px;padding:14px 18px;border-radius:12px;background:#efe9df;box-shadow:inset 4px 0 0 var(--fx-ambar);color:var(--fx-tinta);font-size:1rem;line-height:1.5}
`;
