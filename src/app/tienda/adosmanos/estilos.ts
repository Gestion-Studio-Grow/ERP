// ============================================================================
// LA PIEL DE A DOS MANOS — se escribe desde el servidor (AdosmanosVidriera.tsx), no viaja en el JS.
// ============================================================================
//
// Paleta, letras y logotipo PROVISIONALES a confirmar por el dueño (tokens.ts). Todo cuelga de `.adm`:
// no toca a ninguna otra vidriera. Movimiento sólo con transform / clip-path (nunca la opacidad del H1,
// que es el candidato a LCP) y nada con `prefers-reduced-motion: reduce`. Lo de abajo del pliegue lleva
// `content-visibility: auto` con su tamaño reservado (CLS 0).

/** Tokens, base, letras, botones y chips: lo comparten la vidriera y la página de gracias. */
export const CSS_BASE = `
html:has(.adm),body:has(.adm){background:#f3f2ec}
.adm{--cal:#f3f2ec;--cal-2:#e9e8e0;--carbon:#111418;--cancha:#1b48d2;--cancha-2:#0f2f96;--pelota:#d9f03a;--gris:#5f6872;--linea:#d6d9d2;--blanco:#fff;
--titular:var(--am-archivo),"Arial Narrow",Arial,sans-serif;--cuerpo:var(--am-instrument),system-ui,-apple-system,"Segoe UI",sans-serif;
--gutter:clamp(20px,5vw,80px);--max:1360px;--curva:cubic-bezier(.2,.8,.2,1);--entre:clamp(88px,11vw,168px);
width:100%;background:var(--cal);color:var(--carbon);font-family:var(--cuerpo);font-size:clamp(17px,1.25vw,20px);line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.adm *,.adm *::before,.adm *::after{box-sizing:border-box}
.adm :where(h1,h2,h3,p,ul,ol,dl,dd,figure,fieldset){margin:0}
.adm :where(ul,ol){padding:0;list-style:none}
.adm a{color:inherit}
.adm button,.adm input,.adm select,.adm textarea{font:inherit;color:inherit}
.adm :focus-visible{outline:3px solid var(--cancha);outline-offset:3px;border-radius:6px}
.adm .am-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.adm .am-num{font-variant-numeric:tabular-nums lining-nums}
.adm .am-kicker{font:600 12px/1.3 var(--cuerpo);letter-spacing:.28em;text-transform:uppercase;color:var(--gris)}
.adm .am-h1{font-family:var(--titular);font-weight:800;text-transform:uppercase;line-height:.86;letter-spacing:-.04em;word-spacing:.1em;text-wrap:balance}
.adm .am-h2{font-family:var(--titular);font-weight:700;letter-spacing:-.03em;text-transform:uppercase;font-size:clamp(40px,5.2vw,84px);line-height:.92;text-wrap:balance}
.adm .am-h3{font-family:var(--titular);font-weight:700;text-transform:uppercase;font-size:26px;line-height:1}
.adm .am-cuerpo{max-width:58ch;color:#2b3036}
.adm .am-nota{font-size:14px;line-height:1.45;color:var(--gris)}
.adm .am-sub{font:600 13px/1.3 var(--cuerpo);letter-spacing:.14em;text-transform:uppercase;color:var(--gris)}
.adm .am-error{font-size:14px;line-height:1.4;color:#a3162b;background:#fdecee;border-radius:10px;padding:10px 12px}
/* Botones: 52 px de alto, mayúsculas con aire, radio 10. */
.adm .am-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 24px;border-radius:10px;border:2px solid transparent;font:600 15px/1.1 var(--cuerpo);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background-color .2s,border-color .2s,color .2s,transform .2s var(--curva)}
.adm .am-btn:disabled{cursor:not-allowed;opacity:.55}
.adm .am-btn-p{background:var(--cancha);color:var(--blanco)}
.adm .am-btn-p:hover:not(:disabled){background:var(--cancha-2)}
.adm .am-btn-b{background:transparent;border-color:var(--carbon);color:var(--carbon)}
.adm .am-btn-b:hover:not(:disabled){background:var(--carbon);color:var(--cal)}
.adm .am-btn-pelota{background:var(--pelota);color:var(--carbon)}
.adm .am-btn-ancho{width:100%}
.adm .am-link{background:none;border:0;padding:6px 0;min-height:44px;font:600 14px/1 var(--cuerpo);letter-spacing:.06em;text-transform:uppercase;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:2px;text-decoration-color:var(--pelota);cursor:pointer;color:inherit}
.adm .am-cerrar{background:none;border:2px solid var(--carbon);border-radius:999px;min-height:44px;padding:0 18px;font:600 13px/1 var(--cuerpo);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
/* Chips: los de marca, orden, talle y consejo. */
.adm .am-chips{display:flex;gap:8px}
.adm .am-chips-wrap{flex-wrap:wrap}
.adm .am-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--linea);background:var(--blanco);font:600 14px/1 var(--cuerpo);letter-spacing:.04em;cursor:pointer;white-space:nowrap;transition:background-color .15s,border-color .15s}
.adm .am-chip:hover{border-color:var(--carbon)}
.adm .am-chip[aria-pressed="true"],.adm .am-chip[data-elegida]{background:var(--carbon);border-color:var(--carbon);color:var(--cal)}
.adm .am-chip-radio input{position:absolute;opacity:0;pointer-events:none}
.adm .am-chip-radio:has(input:focus-visible){outline:3px solid var(--cancha);outline-offset:3px}
.adm .am-chip-talle{min-width:56px;justify-content:center;padding:0 12px}
/* Logotipo tipográfico PROVISIONAL. */
.adm .am-logo{display:inline-flex;flex-direction:column;line-height:.82;color:var(--carbon);text-decoration:none}
.adm .am-logo-nombre{display:flex;flex-direction:column;font-family:var(--titular);font-weight:800;font-size:21px;letter-spacing:-.01em}
.adm .am-logo-nombre>span{display:flex;align-items:center;gap:.18em}
.adm .am-logo-pelota{width:.45em;height:.45em;flex:none}
.adm .am-logo-padel{margin-top:4px;font-family:var(--titular);font-weight:500;font-size:10px;letter-spacing:.3em}
/* Siluetas. */
.adm .am-sil{display:block;max-width:100%;overflow:visible}
.adm .am-sil-cuerpo{fill:var(--carbon);fill-opacity:.92}
.adm .am-sil-canto{stroke:var(--carbon)}
.adm .am-sil-franja{fill:var(--pelota)}
.adm .am-sil-franja-linea{stroke:var(--pelota)}
.adm .am-sil-marca{font:800 8.6px/1 var(--titular);letter-spacing:.08em;fill:var(--carbon)}
.adm .am-sil-hueco{fill:var(--cal-2)}
.adm .am-sil-grip{fill:#e8e6dc}
.adm .am-sil-vendas{stroke:#9aa1a8}
.adm .am-sil-suela{fill:#e8e6dc}
.adm .am-sil-pelota{fill:var(--pelota)}
.adm .am-sil-costura{stroke:var(--carbon)}
.adm .am-sil-fantasma{stroke:#9aa1a8}
.adm :is(.am-t-abrir,.am-ficha-foto,.am-pareja-sil,.am-b-mini,.am-fila-sil,.am-parecida-sil,.am-vs-sil,.am-nosotros-sil)>.am-sil{width:100%;height:100%}
.adm .am-pelota{display:inline-block;width:18px;height:18px;flex:none}
.adm .am-ilus{position:absolute;top:10px;left:12px;font:600 11px/1 var(--cuerpo);letter-spacing:.08em;text-transform:uppercase;color:var(--gris);pointer-events:none}
.adm .am-ilus-suelta{position:static}
.adm .am-dispo{display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border-radius:999px;background:var(--carbon);color:var(--cal);font:600 12px/1 var(--cuerpo);letter-spacing:.06em;text-transform:uppercase}
.adm .am-precio{font-family:var(--titular);font-weight:700;font-size:clamp(24px,2vw,32px);line-height:1.05}
@media (prefers-reduced-motion:reduce){.adm *,.adm *::before,.adm *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

/** La vidriera completa. */
export const CSS =
  CSS_BASE +
  `
.adm{padding-top:72px}
.adm .am-saltar{position:fixed;left:12px;top:-60px;z-index:80;background:var(--carbon);color:var(--cal);padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600}
.adm .am-saltar:focus{top:12px}
html:has(.adm){scroll-padding-top:88px;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html:has(.adm){scroll-behavior:auto}}

/* ── Cabecera fija 72 px ── */
.adm .am-cab{position:fixed;top:0;left:0;right:0;z-index:40;height:72px;display:flex;align-items:center;gap:24px;padding:0 var(--gutter);background:var(--cal);border-bottom:1px solid transparent;transition:border-color .2s}
.adm .am-cab.pegada{border-bottom-color:var(--linea)}
@media (min-width:900px){.adm .am-cab.pegada{background:rgba(243,242,236,.92);-webkit-backdrop-filter:saturate(1.2) blur(8px);backdrop-filter:saturate(1.2) blur(8px)}}
.adm .am-cab-marca{display:inline-flex;text-decoration:none;width:148px}
.adm .am-nav{display:none;gap:clamp(16px,2vw,32px);margin-left:auto}
.adm .am-nav a{font:600 14px/1 var(--cuerpo);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;padding:12px 0;background:linear-gradient(var(--pelota),var(--pelota)) left bottom/0 3px no-repeat;transition:background-size .25s var(--curva)}
.adm .am-nav a:hover{background-size:100% 3px}
.adm .am-cab-bolsa{margin-left:auto;min-height:44px;padding:0 18px}
.adm .am-cab-n{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:var(--pelota);color:var(--carbon);font-size:13px;letter-spacing:0}
@media (min-width:1100px){.adm .am-nav{display:flex}.adm .am-cab-bolsa{margin-left:0}}
@media (max-width:640px){.adm .am-cab-marca{width:112px}.adm .am-logo-nombre{font-size:16px}.adm .am-logo-padel{font-size:8px}}

/* ── Portada «La pared» ── */
.adm .am-portada{min-height:calc(92svh - 72px);max-width:var(--max);margin:0 auto;padding:clamp(28px,5vw,64px) var(--gutter) 0;display:flex;flex-direction:column;container-type:inline-size}
.adm .am-portada-texto{max-width:1180px}
.adm .am-portada .am-kicker{margin-bottom:clamp(16px,2vw,28px)}
.adm .am-h1{font-size:min(clamp(46px,7.6vw,128px),14.5cqi)}
.adm .am-h1>span{display:block}
@media (prefers-reduced-motion:no-preference){.adm .am-h1{animation:am-revela 700ms var(--curva) both}}
@keyframes am-revela{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 -10% 0)}}
.adm .am-lead{margin-top:clamp(18px,2vw,28px);max-width:40ch;font-size:clamp(20px,1.9vw,27px);line-height:1.35;color:#2b3036}
.adm .am-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:clamp(24px,3vw,36px)}

/* El riel y las palas colgadas. */
.adm .am-pared{position:relative;margin-top:clamp(40px,6vw,80px)}
.adm .am-riel{height:4px;border-radius:2px;background:var(--cancha);margin:0 calc(var(--gutter) * -.5)}
.adm .am-perchas{display:flex;justify-content:space-between;gap:clamp(8px,1.5vw,24px);padding:0 4px}
.adm .am-percha{position:relative;flex:0 1 clamp(120px,14vw,200px);display:flex;flex-direction:column;align-items:center;padding-bottom:84px}
@media (prefers-reduced-motion:no-preference){.adm .am-percha{animation:am-cuelga 600ms var(--curva) both;animation-delay:calc(var(--i,0) * 60ms + 200ms)}}
@keyframes am-cuelga{from{transform:translateY(-24px)}}
.adm .am-gancho{display:block;width:2px;height:20px;background:var(--carbon);position:relative}
.adm .am-gancho::before{content:"";position:absolute;top:-6px;left:50%;width:10px;height:10px;margin-left:-5px;border-radius:999px;background:var(--cancha);border:2px solid var(--cal)}
.adm .am-pala-btn{display:block;width:100%;padding:0;margin:0;border:0;background:none;cursor:pointer;transform-origin:50% 0;transition:transform 500ms cubic-bezier(.34,1.56,.64,1)}
.adm .am-pala-btn .am-sil{width:100%;height:auto;aspect-ratio:100/190}
.adm .am-percha:hover .am-pala-btn,.adm .am-pala-btn:focus-visible,.adm .am-percha.activa .am-pala-btn{transform:translateY(-14px) rotate(-6deg);transition:transform 420ms var(--curva)}
.adm .am-percha.agotado .am-sil{opacity:.55}
.adm .am-pala-gris .am-sil-cuerpo{fill:#b9bdb6}
.adm .am-pala-gris .am-sil-franja{fill:#d6d9d2}
.adm .am-etiqueta{position:absolute;left:50%;bottom:0;width:max(100%,196px);transform:translateX(-50%) translateY(8px);display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;padding:10px 10px 10px 12px;border-radius:12px;background:var(--carbon);color:var(--cal);visibility:hidden;opacity:0;transition:opacity .2s,transform .3s var(--curva),visibility 0s .2s;z-index:2}
.adm .am-percha:hover .am-etiqueta,.adm .am-percha:focus-within .am-etiqueta,.adm .am-percha.activa .am-etiqueta{visibility:visible;opacity:1;transform:translateX(-50%) translateY(0);transition:opacity .2s,transform .3s var(--curva)}
.adm .am-etiqueta-modelo{grid-column:1;font:700 14px/1.15 var(--titular);text-transform:uppercase}
.adm .am-etiqueta-dato{grid-column:1;font-size:13px;color:#c9cdc5}
.adm .am-etiqueta .am-mas{grid-column:2;grid-row:1/3}
.adm .am-pared-pie{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:8px;font-size:14px;color:var(--gris)}
.adm .am-pared-vacia .am-vacio{margin-top:12px}
.adm .am-hechos{display:flex;flex-wrap:wrap;gap:6px 0;margin:clamp(28px,4vw,48px) 0 0;padding:18px 0;border-top:1px solid var(--linea);border-bottom:1px solid var(--linea);font:600 13px/1.4 var(--cuerpo);letter-spacing:.14em;text-transform:uppercase}
.adm .am-hechos li:not(:last-child)::after{content:"·";margin:0 14px;color:var(--cancha)}
@media (max-width:899px){
  .adm .am-perchas{justify-content:flex-start;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:-24px calc(var(--gutter) * -1) 0;padding:24px var(--gutter) 0;scroll-padding:0 var(--gutter);touch-action:pan-x pan-y}
  .adm .am-perchas::-webkit-scrollbar{display:none}
  .adm .am-percha{flex:0 0 40%;scroll-snap-align:start;padding-bottom:84px}
  .adm .am-riel{margin:0 calc(var(--gutter) * -1)}
}

/* ── Secciones ── */
.adm .am-sec{max-width:var(--max);margin:0 auto;padding:var(--entre) var(--gutter) 0;content-visibility:auto;contain-intrinsic-size:auto 1200px}
.adm .am-sec-cab{display:grid;gap:14px;margin-bottom:clamp(24px,3vw,40px)}
.adm .am-conteo{font-size:15px;color:var(--gris)}
.adm .am-vacio{padding:28px;border:1.5px dashed var(--linea);border-radius:18px;color:var(--gris)}
.adm .am-controles{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;margin-bottom:clamp(20px,2.4vw,32px)}
.adm .am-controles .am-chips{overflow-x:auto;scrollbar-width:none;padding:2px}
.adm .am-controles .am-chips::-webkit-scrollbar{display:none}
.adm .am-controles-der{display:flex;gap:12px;align-items:center}
.adm .am-orden{display:flex;align-items:center;gap:10px;font:600 13px/1 var(--cuerpo);letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.adm .am-orden select,.adm .am-vs-elegir select{min-height:44px;padding:0 36px 0 14px;border:1.5px solid var(--linea);border-radius:10px;background:var(--blanco) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23111418' stroke-width='2'/%3E%3C/svg%3E") no-repeat right 12px center;appearance:none;font:600 15px/1 var(--cuerpo);color:var(--carbon);letter-spacing:0;text-transform:none}
.adm .am-modo{display:inline-flex;border:1.5px solid var(--carbon);border-radius:10px;overflow:hidden}
.adm .am-modo button{min-height:44px;padding:0 16px;border:0;background:transparent;font:600 13px/1 var(--cuerpo);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.adm .am-modo button[aria-pressed="true"]{background:var(--carbon);color:var(--cal)}
.adm .am-filtrar{display:none;min-height:44px;padding:0 18px}
@media (max-width:899px){
  .adm .am-controles{flex-wrap:nowrap;gap:10px}
  .adm .am-controles .am-chips{flex:1 1 auto;min-width:0}
  .adm .am-orden,.adm .am-modo{display:none}
  .adm .am-filtrar{display:inline-flex;flex:none}
}

/* Tarjetas: 4 columnas a 1440, 2 a 390. */
.adm .am-grilla{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(24px,3vw,40px) clamp(12px,2vw,28px)}
@media (min-width:760px){.adm .am-grilla{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:1100px){.adm .am-grilla{grid-template-columns:repeat(4,minmax(0,1fr))}}
.adm .am-t{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0}
.adm .am-t-foto{position:relative;aspect-ratio:4/5;border-radius:18px;background:var(--cal-2);transition:transform 220ms var(--curva),box-shadow 220ms var(--curva)}
.adm .am-t:hover .am-t-foto{transform:translateY(-4px);box-shadow:0 18px 30px -22px rgba(17,20,24,.45)}
.adm .am-t-abrir{position:absolute;inset:0;display:block;width:100%;padding:9% 8% 12%;border:0;background:none;cursor:pointer;border-radius:18px}
.adm .am-t.agotado .am-t-abrir .am-sil{opacity:.55}
.adm .am-t-foto .am-dispo{position:absolute;left:12px;bottom:12px}
.adm .am-t-accion{position:absolute;right:8px;bottom:8px}
.adm .am-mas{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;border:0;background:var(--cancha);color:var(--blanco);font:400 28px/1 var(--titular);cursor:pointer;transition:background-color .15s,transform .2s var(--curva)}
.adm .am-mas:hover:not(:disabled){background:var(--cancha-2);transform:scale(1.06)}
.adm .am-mas:disabled{opacity:.5;cursor:progress}
.adm .am-etiqueta .am-mas,.adm .am-mas-chico{width:44px;height:44px;font-size:24px}
.adm .am-paso{display:inline-flex;align-items:center;gap:2px;height:48px;padding:2px;border-radius:999px;background:var(--carbon);color:var(--cal)}
.adm .am-paso button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:inherit;font:400 24px/1 var(--titular);cursor:pointer}
.adm .am-paso button:hover:not(:disabled){background:rgba(243,242,236,.14)}
.adm .am-paso button:disabled{opacity:.4;cursor:default}
.adm .am-paso span{min-width:20px;text-align:center;font:700 17px/1 var(--titular)}
.adm .am-t-marca{margin-top:6px;font:600 12px/1.2 var(--cuerpo);letter-spacing:.28em;text-transform:uppercase;color:var(--gris)}
.adm .am-t-nombre{font-family:var(--titular);font-weight:700;font-size:clamp(19px,1.5vw,23px);line-height:1.08;text-transform:uppercase}
.adm .am-t-nombre button{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0;border:0;background:none;text-align:left;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
.adm .am-t-chips{display:flex;flex-wrap:wrap;gap:6px;min-height:26px;position:relative;z-index:1}
.adm .am-tag{display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--linea);font-size:13px;line-height:1;color:#2b3036;background:var(--blanco)}
.adm .am-tag-en{background:var(--pelota);border-color:var(--pelota);color:var(--carbon)}
.adm .am-precio-b{display:grid;gap:4px;margin-top:2px}
.adm .am-chip-transf{justify-self:start;padding:5px 10px;border-radius:999px;background:var(--carbon);color:var(--pelota);font:700 clamp(15px,1.1vw,17px)/1 var(--titular);}
.adm .am-cuotas{font-size:13px;color:var(--gris)}
.adm .am-precio-b.grande .am-precio{font-size:clamp(36px,3.4vw,56px)}
.adm .am-t .am-link{align-self:flex-start}

/* Tabla de palas (compu). */
.adm .am-tabla-caja{overflow-x:auto;border:1.5px solid var(--linea);border-radius:18px;background:var(--blanco)}
.adm .am-tabla{width:100%;border-collapse:collapse;font-size:16px}
.adm .am-tabla th,.adm .am-tabla td{padding:14px 16px;text-align:left;border-bottom:1px solid var(--linea);vertical-align:middle}
.adm .am-tabla thead th{padding:0;background:var(--cal-2)}
.adm .am-tabla thead button{display:flex;align-items:center;gap:6px;width:100%;min-height:48px;padding:0 16px;border:0;background:none;font:600 13px/1 var(--cuerpo);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.adm .am-flecha-orden{font-size:10px;color:var(--cancha)}
.adm .am-tabla tbody tr:hover{background:#fafaf6}
.adm .am-tabla tbody th{font-weight:400}
.adm .am-link-fila{padding:0;border:0;background:none;font:700 17px/1.15 var(--titular);text-transform:uppercase;text-align:left;cursor:pointer;min-height:44px}
.adm .am-tabla-precio{font:700 20px/1 var(--titular);}

/* Accesorios: lista de dos columnas. */
.adm .am-lista{display:grid;grid-template-columns:1fr;column-gap:clamp(24px,4vw,64px)}
@media (min-width:760px){.adm .am-lista{grid-template-columns:1fr 1fr}}
.adm .am-fila{display:grid;grid-template-columns:44px 1fr auto 48px;gap:14px;align-items:center;min-height:76px;padding:12px 0;border-bottom:1px solid var(--linea)}
.adm .am-fila-sil{display:block;height:52px}
.adm .am-fila-nombre{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:0;border:0;background:none;text-align:left;font-size:17px;line-height:1.3;cursor:pointer;min-height:44px}
.adm .am-fila-precio{font:700 20px/1 var(--titular);white-space:nowrap}
.adm .am-fila-mas{display:flex;justify-content:flex-end}
.adm .am-fila .am-paso{height:44px}
.adm .am-fila .am-paso button{width:36px;height:40px}
.adm .am-fila-mas:has(.am-paso){grid-column:3/5;justify-self:end}
.adm .am-fila:has(.am-paso) .am-fila-precio{display:none}
.adm .am-fila.agotado .am-sil{opacity:.55}
.adm .am-fila-aviso{grid-column:1/-1}

/* ── Enfrentadas (banda carbón) ── */
.adm .am-vs{max-width:none;margin-top:var(--entre);padding:var(--entre) max(var(--gutter),calc((100% - var(--max)) / 2 + var(--gutter)));background:var(--carbon);color:var(--cal)}
.adm .am-vs .am-kicker,.adm .am-vs .am-nota{color:#a9b0b7}
.adm .am-vs .am-cuerpo{color:#d9dcd4}
.adm .am-vs :focus-visible{outline-color:var(--pelota)}
.adm .am-vs-tabla{--rot:clamp(84px,14vw,200px);display:grid}
.adm .am-vs-fila{position:relative;display:grid;grid-template-columns:var(--rot) 1fr 1fr;gap:0 clamp(12px,2vw,32px);align-items:start;padding:14px 0 34px;border-bottom:1px solid #2a2f35}
.adm .am-vs-cabeza{padding-bottom:20px;align-items:end}
.adm .am-vs-cabeza>[role=columnheader]:first-child{grid-column:1}
.adm .am-vs-col{display:grid;gap:16px;justify-items:start}
.adm .am-vs-elegir{width:100%}
.adm .am-vs-elegir select{width:100%;background-color:#1d2228;color:var(--cal);border-color:#3a4047;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23f3f2ec' stroke-width='2'/%3E%3C/svg%3E")}
.adm .am-vs-sil{display:block;width:clamp(90px,10vw,130px);height:clamp(150px,18vw,240px);padding:0;border:0;background:none;cursor:pointer}
.adm .am-vs .am-sil-cuerpo{fill:#e9e8e0}
.adm .am-vs .am-sil-canto{stroke:#e9e8e0}
.adm .am-vs .am-sil-hueco{fill:var(--carbon)}
.adm .am-vs .am-sil-grip{fill:#5f6872}
.adm .am-vs-rotulo{font:600 12px/1.4 var(--cuerpo);letter-spacing:.2em;text-transform:uppercase;color:#a9b0b7;padding-top:4px}
.adm .am-vs-dato{font:700 clamp(17px,1.6vw,24px)/1.2 var(--titular);text-transform:uppercase}
.adm .am-vs-dato.gana{color:var(--pelota)}
.adm .am-vs-pelota{position:absolute;left:calc(var(--rot) + clamp(12px,2vw,32px));bottom:8px;width:calc((100% - var(--rot) - 2 * clamp(12px,2vw,32px)) / 2);display:flex;align-items:center;gap:8px;font:600 12px/1 var(--cuerpo);letter-spacing:.1em;text-transform:uppercase;color:var(--pelota);transform:translateX(calc(var(--lado,0) * (100% + clamp(12px,2vw,32px))));visibility:hidden;transition:transform 420ms var(--curva)}
.adm .am-vs-pelota.ver{visibility:visible}
.adm .am-vs-acciones{border-bottom:0;padding-top:24px}
.adm .am-vs-fuente{margin-top:20px}

/* ── ¿Cuál te conviene? ── */
.adm .am-consejo-grilla{display:grid;gap:clamp(28px,4vw,64px)}
@media (min-width:1000px){.adm .am-consejo-grilla{grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start}}
.adm .am-preguntas{display:grid;gap:28px}
.adm .am-pregunta{border:0;padding:0;min-width:0}
.adm .am-pregunta legend{margin-bottom:12px;font:700 clamp(20px,1.7vw,26px)/1.1 var(--titular);text-transform:uppercase}
.adm .am-pareja{display:grid;gap:18px;min-height:360px;padding:clamp(20px,3vw,40px);border-radius:18px;background:var(--blanco);border:1.5px solid var(--linea)}
.adm .am-pareja-espera{align-self:center;max-width:32ch;font:700 clamp(22px,2vw,30px)/1.15 var(--titular);text-transform:uppercase;color:var(--gris)}
.adm .am-pareja-lista{display:grid;gap:22px}
.adm .am-pareja-lista>li{display:grid;grid-template-columns:clamp(84px,10vw,120px) 1fr;gap:clamp(14px,2vw,28px);align-items:start}
.adm .am-pareja-sil{display:block;aspect-ratio:4/5;width:100%;padding:10%;border:0;border-radius:14px;background:var(--cal-2);cursor:pointer}
.adm .am-pareja-lista>li>div{display:grid;gap:8px;justify-items:start}
.adm .am-pareja-nombre{font:700 clamp(20px,1.6vw,24px)/1.1 var(--titular);text-transform:uppercase}
.adm .am-pareja-porque{font-size:16px;line-height:1.45;color:#2b3036}
.adm .am-asesor{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding-top:18px;border-top:1px solid var(--linea)}

/* ── Nosotros ── */
.adm .am-nosotros{display:grid;gap:clamp(28px,4vw,64px);align-items:center}
@media (min-width:900px){.adm .am-nosotros{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}}
.adm .am-nosotros-texto{display:grid;gap:20px;justify-items:start}
.adm .am-nosotros-sil{position:relative;display:block;aspect-ratio:5/4;border-radius:18px;background:var(--cal-2);padding:8%}

/* ── Pie ── */
.adm .am-pie{margin-top:var(--entre);padding:clamp(48px,6vw,88px) var(--gutter) 40px;background:var(--carbon);color:var(--cal)}
.adm .am-pie a{color:var(--cal)}
.adm .am-pie :focus-visible{outline-color:var(--pelota)}
.adm .am-pie-grilla{max-width:var(--max);margin:0 auto;display:grid;gap:36px}
@media (min-width:760px){.adm .am-pie-grilla{grid-template-columns:2fr 1fr 1fr}}
.adm .am-logo-pie{color:var(--cal)}
.adm .am-logo-pie .am-logo-nombre{font-size:30px}
.adm .am-logo-pie .am-logo-padel{font-size:12px}
.adm .am-pie-linea{margin-top:16px;font-size:16px;color:#c9cdc5}
.adm .am-pie-t{margin-bottom:12px;font:600 12px/1 var(--cuerpo);letter-spacing:.24em;text-transform:uppercase;color:#a9b0b7}
.adm .am-pie-lista{display:grid;gap:6px;font-size:16px}
.adm .am-pie-lista a{display:inline-block;padding:6px 0;text-decoration:none}
.adm .am-pie-lista a:hover{text-decoration:underline;text-decoration-color:var(--pelota)}
.adm .am-pie-provisional{max-width:var(--max);margin:36px auto 0;padding-top:20px;border-top:1px solid #2a2f35;font-size:13px;color:#a9b0b7}

/* ── Barra fija del celular ── */
.adm .am-abajo{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;gap:10px;align-items:center;min-height:calc(64px + env(safe-area-inset-bottom));padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:rgba(243,242,236,.97);border-top:1px solid var(--linea);box-shadow:0 -12px 28px -20px rgba(17,20,24,.5)}
.adm .am-abajo .am-btn{min-height:48px;padding:0 14px;font-size:13px}
.adm .am-abajo-izq{flex:1 1 auto;min-width:0}
.adm .am-abajo-bolsa{flex:1 1 auto;min-width:0}
@media (max-width:1099px){.adm{padding-bottom:calc(64px + env(safe-area-inset-bottom))}}
@media (min-width:1100px){.adm .am-abajo{display:none}}

/* ── Diálogos: ficha, bolsa y filtros ── */
.adm dialog{color:var(--carbon)}
.adm dialog::backdrop{background:rgba(17,20,24,.55)}
.adm .am-hoja{inset:0;margin:auto;width:min(1120px,calc(100vw - 48px));max-width:none;max-height:min(90vh,920px);padding:0;border:0;border-radius:18px;background:var(--cal);overflow:auto;overscroll-behavior:contain}
.adm .am-ficha-caja{position:relative;display:grid;grid-template-columns:52fr 48fr}
.adm .am-ficha-cerrar{position:absolute;top:16px;right:16px;z-index:2;background:var(--cal)}
.adm .am-ficha-foto{position:sticky;top:0;align-self:start;display:block;aspect-ratio:4/5;padding:12% 14%;background:var(--cal-2)}
.adm .am-ficha-foto .am-ilus{top:auto;bottom:14px;left:16px}
.adm .am-ficha-texto{display:grid;gap:16px;align-content:start;padding:clamp(28px,3vw,48px) clamp(20px,3vw,44px) 0}
.adm .am-ficha-nombre{padding-right:96px;font-family:var(--titular);font-weight:700;text-transform:uppercase;font-size:clamp(32px,3vw,48px);line-height:.95}
.adm .am-spec{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;border-top:1px solid var(--linea)}
.adm .am-spec>div{display:grid;gap:2px;padding:10px 0;border-bottom:1px solid var(--linea)}
.adm .am-spec dt{font:600 11px/1.2 var(--cuerpo);letter-spacing:.18em;text-transform:uppercase;color:var(--gris)}
.adm .am-spec dd{font:700 18px/1.2 var(--titular);text-transform:uppercase}
.adm .am-fuente{font-size:13px;line-height:1.45;color:var(--gris)}
.adm .am-aviso-ficha{padding:14px 16px;border-radius:12px;background:var(--blanco);border:1.5px dashed var(--linea);font-size:16px}
.adm .am-talles{display:grid;gap:10px}
.adm .am-ficha-acciones{position:sticky;bottom:0;z-index:1;display:flex;gap:12px;align-items:center;margin:4px calc(clamp(20px,3vw,44px) * -1) 0;padding:12px clamp(20px,3vw,44px) calc(12px + env(safe-area-inset-bottom));background:var(--cal);border-top:1px solid var(--linea)}
.adm .am-ficha-sumar{flex:1 1 auto;min-height:56px}
.adm .am-ficha-links{display:flex;flex-wrap:wrap;gap:4px 20px}
.adm .am-parecidas{display:grid;gap:10px;padding-bottom:clamp(24px,3vw,40px)}
.adm .am-parecidas ul{display:grid;gap:8px}
.adm .am-parecidas button{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;width:100%;min-height:56px;padding:6px 12px 6px 6px;border:1.5px solid var(--linea);border-radius:12px;background:var(--blanco);text-align:left;cursor:pointer;font-size:15px}
.adm .am-parecidas button:hover{border-color:var(--carbon)}
.adm .am-parecida-sil{display:block;height:44px}
.adm .am-parecida-precio{font:700 17px/1 var(--titular);}
@media (max-width:820px){
  .adm .am-hoja{width:100vw;height:100dvh;max-height:none;border-radius:0;margin:0}
  .adm .am-ficha-caja{grid-template-columns:1fr}
  .adm .am-ficha-foto{position:relative;aspect-ratio:auto;height:min(46vh,380px);padding:28px}
  .adm .am-spec{grid-template-columns:1fr 1fr}
}
@media (prefers-reduced-motion:no-preference){.adm .am-hoja[open]{animation:am-sube 320ms var(--curva)}}
@keyframes am-sube{from{transform:translateY(24px)}}

.adm .am-bolsa{position:fixed;inset:0 0 0 auto;width:min(460px,100vw);height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--cal);overflow:hidden}
@media (prefers-reduced-motion:no-preference){.adm .am-bolsa[open]{animation:am-entra 320ms var(--curva)}}
@keyframes am-entra{from{transform:translateX(100%)}}
.adm .am-b-caja{display:flex;flex-direction:column;height:100%}
.adm .am-b-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--linea)}
.adm .am-b-cab h2:focus{outline:none}
.adm .am-b-cuerpo{flex:1 1 auto;overflow:auto;overscroll-behavior:contain;padding:8px 20px 20px}
.adm .am-b-vacia{display:grid;gap:18px;justify-items:start;padding:28px 0;font-size:17px}
.adm .am-b-renglones{display:grid}
.adm .am-b-r{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:start;padding:14px 0;border-bottom:1px solid var(--linea)}
.adm .am-b-mini{display:block;height:64px;border-radius:10px;background:var(--cal-2);padding:6px}
.adm .am-b-info{display:grid;gap:6px;justify-items:start;min-width:0}
.adm .am-b-nombre{font-size:16px;line-height:1.3;font-weight:600}
.adm .am-b-talle{font-size:14px;color:var(--gris)}
.adm .am-paso-chico{height:44px}
.adm .am-paso-chico button{width:40px;height:40px;font-size:20px}
.adm .am-b-importe{font:700 18px/1.2 var(--titular);}
.adm .am-b-aviso{grid-column:1/-1}
.adm .am-b-datos{display:grid;gap:14px;padding-top:20px}
.adm .am-campo{display:grid;gap:6px;border:0;padding:0;margin:0;min-width:0}
.adm .am-campo>span,.adm .am-campo>legend,.adm .am-campo label{font:600 13px/1.2 var(--cuerpo);letter-spacing:.06em;color:#2b3036;margin-bottom:2px}
.adm .am-campo input,.adm .am-campo select,.adm .am-campo textarea,.adm .am-b-cupon input{width:100%;min-height:48px;padding:10px 14px;border:1.5px solid var(--linea);border-radius:10px;background:var(--blanco);font-size:16px}
.adm .am-campo textarea{min-height:80px;resize:vertical}
.adm .am-campo input:focus,.adm .am-campo textarea:focus,.adm .am-campo select:focus,.adm .am-b-cupon input:focus{border-color:var(--cancha);outline:none;box-shadow:0 0 0 3px rgba(27,72,210,.2)}
.adm .am-b-entrega{display:grid;gap:12px}
.adm .am-b-cupon summary{min-height:44px;display:flex;align-items:center;font:600 14px/1 var(--cuerpo);cursor:pointer;text-decoration:underline;text-decoration-color:var(--pelota);text-decoration-thickness:2px;text-underline-offset:4px}
.adm .am-b-cupon-fila{display:flex;gap:8px;margin-top:6px}
.adm .am-b-cupon-fila .am-btn{min-height:48px;padding:0 16px}
.adm .am-b-pie{display:grid;gap:10px;padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--linea);background:var(--cal)}
.adm .am-b-cuentas{display:grid;gap:4px}
.adm .am-b-cuentas>div{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.adm .am-b-cuentas dd{font-weight:600}
.adm .am-b-total{padding-top:6px;margin-top:2px;border-top:1px solid var(--linea)}
.adm .am-b-total dt,.adm .am-b-total dd{font:700 24px/1.1 var(--titular);text-transform:uppercase}
.adm .am-b-transf dd{padding:2px 8px;border-radius:999px;background:var(--carbon);color:var(--pelota)}
.adm .am-b-ok{padding:12px 14px;border-radius:12px;background:#eef6d0;font-size:15px}
.adm .am-b-pie .am-btn{min-height:56px}
@media (max-width:640px){.adm .am-bolsa{width:100vw}}

.adm .am-hoja-filtros{position:fixed;inset:auto 0 0 0;width:100vw;max-width:none;max-height:88dvh;margin:0;padding:0;border:0;border-radius:18px 18px 0 0;background:var(--cal);overflow:auto}
@media (prefers-reduced-motion:no-preference){.adm .am-hoja-filtros[open]{animation:am-sube 280ms var(--curva)}}
.adm .am-hf-caja{display:grid;gap:22px;padding:18px 20px calc(18px + env(safe-area-inset-bottom))}
.adm .am-hf-cab{display:flex;align-items:center;justify-content:space-between}
.adm .am-hf-grupo{border:0;padding:0;margin:0;min-width:0}
.adm .am-hf-grupo legend{margin-bottom:10px;font:600 12px/1 var(--cuerpo);letter-spacing:.2em;text-transform:uppercase;color:var(--gris)}
`;
