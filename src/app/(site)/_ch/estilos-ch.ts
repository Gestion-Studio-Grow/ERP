// ============================================================================
// LA PIEL DEL DISEÑO NUEVO DE CH (DISENO.md §4, §6 y §8) — un string, servido UNA vez por el layout.
// ============================================================================
//
// Sólo la importa PielCH.tsx (componente de servidor) y sólo la dibuja el layout de (site) cuando CH tiene
// el interruptor «Diseño nuevo» prendido. Un componente cliente NO la importa: el string viajaría dos veces
// (en el HTML y en el JS; trampa medida en QBO, skill vidriera-de-autor §5). Sin CSS de módulo: un `import`
// de .css se sumaría a la ruta de CH aunque esto no se dibuje (diseno-nuevo.test.ts).
//
// Prefijos: `chf-` el front (home, carta, ficha, encabezado, barra), `chm-` la piel del modal de reserva,
// `chr-` la piel de /reserva. Todo con los tokens del tema (globals.css) y el acento del negocio
// (`--accent`, que pone el layout): nada de colores escritos a mano salvo el negro del color-mix.
// Movimiento sólo con transform / clip-path; nunca la opacidad del H1 (el LCP).

export const CSS_CH = `
:where(.chf,.chf-cab,.chf-barra,.chm-fondo,.chr){
  --chf-tinta:color-mix(in srgb,var(--accent) 78%,#000);
  --chf-margen:clamp(20px,5vw,72px);
  --chf-cuerpo:clamp(1.0625rem,1rem + .3vw,1.1875rem);
  --chf-lede:clamp(1.25rem,1.05rem + .8vw,1.5rem);
  --chf-kicker:clamp(.75rem,.7rem + .2vw,.875rem);
  --chf-precio:clamp(1.25rem,1.1rem + .8vw,1.75rem);
  --chf-nombre:clamp(1.375rem,1.1rem + 1vw,1.875rem);
  --chf-h2:clamp(2.25rem,1.5rem + 3.2vw,4.25rem);
  --chf-boton:52px;
  --chf-ritmo:clamp(96px,7vw + 48px,168px);
}
.chf *,.chf-cab *,.chf-barra *,.chm-fondo *{box-sizing:border-box}
.chf :where(h1,h2,h3,p,ul,ol,dl,dd,blockquote,figure){margin:0}
.chf :where(ul,ol){padding:0;list-style:none}
.chf{font-size:var(--chf-cuerpo);line-height:1.55;color:var(--text-strong)}
.chf [id]{scroll-margin-top:88px}
.chf-env{max-width:1280px;margin:0 auto;padding-inline:var(--chf-margen)}
.chf-bloque{padding-block:var(--chf-ritmo) 0}
.chf-bloque:last-of-type{padding-bottom:var(--chf-ritmo)}
.chf-kicker{font-family:var(--font-body),system-ui,sans-serif;text-transform:uppercase;letter-spacing:.2em;font-weight:600;font-size:var(--chf-kicker);color:var(--text-muted)}
.chf-h1{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:clamp(3rem,2rem + 5.5vw,7rem);line-height:.98;letter-spacing:-.015em;margin-top:16px;text-wrap:balance;color:var(--text-strong)}
.chf-h2{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:var(--chf-h2);line-height:1.04;letter-spacing:-.01em;margin-top:16px;text-wrap:balance}
.chf-h2 em,.chf-h1 em{font-style:italic;font-weight:300}
.chf-lede{margin-top:24px;font-size:var(--chf-lede);line-height:1.45;color:var(--text);max-width:34rem}
.chf-baja{margin-top:16px;color:var(--text-muted);max-width:40rem}
.chf-acc{display:flex;flex-wrap:wrap;align-items:center;gap:16px 28px;margin-top:32px}
.chf-enlace{display:inline-flex;align-items:center;min-height:48px;color:var(--chf-tinta);text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px;font-weight:600}
.chf-enlace:hover{text-decoration-thickness:2px}

/* Teclas: 52 px (56 en el celular), radio 2, petróleo sólido o con borde. */
.chf-btn,.chf-btn-borde{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:var(--chf-boton);padding:0 28px;border-radius:2px;font:600 1.0625rem/1.2 var(--font-body),system-ui,sans-serif;cursor:pointer;text-decoration:none;transition:transform var(--ch-transicion),background-color var(--ch-transicion),border-color var(--ch-transicion)}
.chf-btn{background:var(--accent);color:var(--text-on-accent);border:1px solid var(--accent)}
.chf-btn:hover{background:var(--chf-tinta);border-color:var(--chf-tinta);transform:translateY(-1px)}
.chf-btn-borde{background:transparent;color:var(--text-strong);border:1px solid var(--line-strong)}
.chf-btn-borde:hover{border-color:var(--chf-tinta);color:var(--chf-tinta);transform:translateY(-1px)}
.chf-btn-chico{min-height:48px;padding:0 18px;font-size:.9375rem}
:where(.chf,.chf-cab,.chf-barra,.chm-fondo,.chr) :focus-visible{outline:2px solid var(--chf-tinta);outline-offset:2px}

/* ── Encabezado ─────────────────────────────────────────────────────────── */
.chf-cab{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid transparent;transition:border-color var(--ch-transicion)}
.chf-cab[data-bajo]{border-bottom-color:var(--line)}
.chf-cab-env{max-width:1280px;margin:0 auto;padding-inline:var(--chf-margen);height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.chf-marca{display:inline-flex;align-items:center;min-height:48px;font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:clamp(1.5rem,1.3rem + .6vw,1.875rem);line-height:1;color:var(--chf-tinta);text-decoration:none;white-space:nowrap}
.chf-nav{display:flex;align-items:center;gap:clamp(16px,2.4vw,36px)}
.chf-nav a{color:var(--text-strong);text-decoration:none;font-size:1.0625rem;min-height:48px;display:inline-flex;align-items:center;transition:color var(--ch-transicion)}
.chf-nav a:hover{color:var(--chf-tinta)}

/* El pie lo pone el layout de siempre: con el diseño nuevo, sus enlaces también se tocan con el dedo. */
.chf-cab ~ footer a{display:inline-flex!important;align-items:center;min-height:48px}

.chf-aviso-x{min-width:48px;min-height:48px;display:inline-grid;place-items:center}

/* ── Hero ───────────────────────────────────────────────────────────────── */
/* En la compu, dos columnas: a la izquierda el H1, la bajada y las teclas; a la derecha la agenda viva sobre un plano
   petróleo que arranca a la altura del H1 (antes se montaba sobre el titular: «spa en La» tocaba el borde). */
.chf-hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:clamp(16px,2vw,32px);align-items:start;padding-block:clamp(28px,4vw,64px) 0}
.chf-hero-tit{grid-column:1 / -1;grid-row:1}
.chf-hero-a{grid-column:1 / span 5;grid-row:2}
.chf-hero-b{grid-column:1 / span 5;grid-row:3}
.chf-agenda{grid-column:7 / -1;grid-row:2 / span 2}
.chf-atienden{display:flex;align-items:center;gap:14px;margin-top:24px;color:var(--text-muted)}
.chf-caras{display:inline-flex;flex-shrink:0}
.chf-caras img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--surface);margin-left:-12px;background:var(--surface-sunken)}
.chf-caras img:first-child{margin-left:0}
.chf-datos{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 20px;margin-top:40px;padding-top:20px;border-top:1px solid var(--line);max-width:36rem}
.chf-datos div{display:contents}
.chf-datos dt{color:var(--text-muted)}
@media (min-width:1001px){
  .chf-hero{grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);column-gap:clamp(32px,4vw,72px)}
  .chf-hero-tit,.chf-hero-a,.chf-hero-b{grid-column:1}
  .chf-h1{max-width:11ch}
  .chf-agenda{grid-column:2;grid-row:1 / span 3;margin-top:calc(var(--chf-kicker) * 1.55 + 16px)}
  /* La columna derecha es angosta: «Reservar» va en su renglón; al lado de la hora la tapaba («Mañana 09:0»). */
  .chf-hero .chf-hueco{grid-template-columns:96px minmax(0,1fr);grid-template-areas:"foto nom" "foto hora" "foto acc"}
  .chf-hero .chf-hueco-acc{justify-content:flex-start;height:auto}
}

/* Entrada: sólo transform y clip-path (el H1 es el LCP: nunca su opacidad). */
.chf-entra{animation:chf-sube 760ms var(--ch-transicion-curva) both;animation-delay:var(--d,0ms)}
@keyframes chf-sube{from{transform:translateY(20px)}to{transform:none}}
@keyframes chf-acerca{from{transform:scale(1.14)}to{transform:none}}

/* ── La agenda viva: plano petróleo con las fotos del equipo ───────────── */
.chf-panel{--chf-claro:color-mix(in srgb,var(--text-on-accent) 88%,var(--accent));background:var(--accent);color:var(--text-on-accent);padding:clamp(20px,2.2vw,36px);border-radius:2px;animation:chf-sube 640ms var(--ch-transicion-curva) both}
.chf-panel .chf-kicker{color:var(--chf-claro)}
.chf-panel :focus-visible{outline-color:var(--text-on-accent)}
.chf-hueco-tit{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:14px;border-bottom:1px solid color-mix(in srgb,var(--text-on-accent) 35%,transparent)}
.chf-huecos{display:grid}
.chf-hueco{display:grid;grid-template-columns:96px minmax(0,1fr) auto;grid-template-areas:"foto nom nom" "foto hora acc";column-gap:20px;row-gap:4px;align-items:center;padding:18px 0;border-bottom:1px solid color-mix(in srgb,var(--text-on-accent) 22%,transparent);animation:chf-sube 640ms var(--ch-transicion-curva) both;animation-delay:calc(260ms + var(--i,0) * 110ms)}
.chf-hueco:last-child{border-bottom:0;padding-bottom:0}
.chf-foto-hueco{grid-area:foto;width:96px;height:96px;border-radius:2px;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--text-on-accent) 14%,var(--accent));font-family:var(--font-display),Georgia,serif;font-size:1.75rem;color:var(--text-on-accent)}
.chf-foto-hueco img{width:100%;height:100%;object-fit:cover;display:block;animation:chf-acerca 1100ms var(--ch-transicion-curva) both;animation-delay:calc(260ms + var(--i,0) * 110ms)}
.chf-hueco-nom{grid-area:nom;display:grid;line-height:1.2;align-self:end;min-width:0}
.chf-hueco-nom b{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:1.625rem}
.chf-hueco-nom span{font-size:.9375rem;color:var(--chf-claro)}
.chf-hueco-nom .chf-ocupada{font-weight:600;color:var(--text-on-accent)}
.chf-hueco-hora{grid-area:hora;min-height:56px;display:flex;align-items:center;align-self:start}
.chf-hueco-acc{grid-area:acc;align-self:start;height:56px;display:flex;align-items:center;justify-content:flex-end}
.chf-hora{appearance:none;border:0;background:none;padding:0;min-height:48px;cursor:pointer;color:var(--text-on-accent);font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:clamp(1.75rem,1.3rem + 1vw,2.25rem);line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:left;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--text-on-accent) 45%,transparent);text-underline-offset:8px;text-decoration-thickness:1px;transition:text-decoration-color var(--ch-transicion)}
.chf-hora:hover{text-decoration-color:var(--text-on-accent)}
.chf-llega{animation:chf-llega var(--ch-transicion) both}
@keyframes chf-llega{from{transform:translateY(12px);clip-path:inset(0 0 100% 0)}to{transform:none;clip-path:inset(0)}}
.chf-esqueleto{display:block;width:min(220px,70%);height:36px;border-radius:2px;background:linear-gradient(90deg,color-mix(in srgb,var(--text-on-accent) 14%,transparent),color-mix(in srgb,var(--text-on-accent) 28%,transparent),color-mix(in srgb,var(--text-on-accent) 14%,transparent));background-size:200% 100%;animation:chf-brillo 1.4s linear infinite}
@keyframes chf-brillo{to{background-position:-200% 0}}
.chf-sinlugar{display:grid;gap:0;color:var(--chf-claro);line-height:1.3}
.chf-sinlugar button{appearance:none;border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--text-on-accent);text-decoration:underline;text-underline-offset:5px;cursor:pointer;text-align:left;min-height:48px;line-height:1.2}
.chf-btn-claro{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;min-height:48px;padding:0 18px;border-radius:2px;font:600 .9375rem/1.2 var(--font-body),system-ui,sans-serif;cursor:pointer;background:var(--text-on-accent);color:var(--chf-tinta);border:1px solid var(--text-on-accent);transition:transform var(--ch-transicion),background-color var(--ch-transicion),color var(--ch-transicion)}
.chf-btn-claro:hover{background:transparent;color:var(--text-on-accent);transform:translateY(-1px)}
.chf-cara{width:56px;height:56px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:var(--surface-sunken);font-family:var(--font-display),Georgia,serif;font-size:1.25rem;color:var(--chf-tinta);flex-shrink:0}
.chf-cara img{width:100%;height:100%;object-fit:cover;display:block}

/* ── Renglones de la carta (home, carta y ficha) ───────────────────────── */
.chf-renglones{margin-top:40px;border-top:1px solid var(--line-strong)}
.chf-serv{display:grid;grid-template-columns:minmax(0,1fr) 88px minmax(120px,auto) auto;gap:8px 28px;align-items:center;min-height:88px;padding:16px 0;border-bottom:1px solid var(--line);transition:border-color var(--ch-transicion)}
.chf-serv:hover{border-bottom-color:var(--line-strong)}
.chf-serv-txt{display:grid;gap:4px;min-width:0}
.chf-serv-nom{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:var(--chf-nombre);line-height:1.15;color:var(--text-strong);overflow-wrap:anywhere;text-decoration:none}
a.chf-serv-nom{display:flex;align-items:center;min-height:48px}
a.chf-serv-nom:hover{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:6px}
.chf-serv-meta{font-size:.9375rem;color:var(--text-muted)}
.chf-dur{color:var(--text-muted);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.chf-plata{display:grid;justify-items:end;text-align:right;font-weight:600;font-size:var(--chf-precio);font-variant-numeric:tabular-nums;line-height:1.15;white-space:nowrap;transition:transform var(--ch-transicion)}
.chf-serv:hover .chf-plata{transform:translateX(-4px)}
.chf-plata small{font-weight:600;font-size:clamp(.875rem,.8rem + .2vw,1rem);color:var(--chf-tinta)}
.chf-mas{margin-top:24px}

/* ── Equipo ─────────────────────────────────────────────────────────────── */
.chf-equipo{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(32px,4vw,64px) clamp(16px,2vw,32px);margin-top:56px}
.chf-equipo li{display:grid;justify-items:start;align-content:start;gap:10px}
.chf-foto-eq{width:200px;height:200px;border-radius:50%;overflow:hidden;background:var(--surface-sunken);display:grid;place-items:center;font-family:var(--font-display),Georgia,serif;font-size:3.5rem;color:var(--chf-tinta);margin-bottom:14px}
.chf-foto-eq img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 600ms var(--ch-transicion-curva)}
.chf-equipo li:hover .chf-foto-eq img{transform:scale(1.04)}
.chf-eq-nom{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:var(--chf-nombre);line-height:1.15}

/* Banda «Antes de venir»: un plano hundido a todo el ancho corta el ritmo de renglones. */
.chf-banda{margin-top:var(--chf-ritmo);padding-block:clamp(64px,6vw + 32px,128px);background:var(--surface-sunken)}
.chf-banda-env{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:clamp(16px,2vw,32px);align-items:start}
.chf-banda-env > div{grid-column:1 / span 5}
.chf-banda-env .chf-lista{grid-column:7 / -1;margin-top:8px}

/* ── Antes de venir, novedades, reseñas ─────────────────────────────────── */
.chf-lista{margin-top:40px;border-top:1px solid var(--line-strong);max-width:52rem}
.chf-lista li{padding:22px 0;border-bottom:1px solid var(--line);font-size:var(--chf-lede);line-height:1.4}
.chf-lista .chf-folio{display:block;font-size:var(--chf-kicker);letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;font-weight:600}
.chf-lista blockquote{font-family:var(--font-display),Georgia,serif;font-weight:400}

/* ── Dónde ──────────────────────────────────────────────────────────────── */
.chf-donde{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(16px,2vw,32px);align-items:start}
.chf-donde-txt{grid-column:1 / span 6}
.chf-donde-foto{grid-column:8 / span 5}
.chf-tabla{margin-top:40px;border-top:1px solid var(--line-strong)}
.chf-tabla div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--line)}
.chf-tabla dt{color:var(--text-muted)}
.chf-tabla a{color:inherit;display:inline-flex;align-items:center;min-height:48px}
.chf-donde-foto img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:4px;background:var(--surface-sunken)}
.chf-donde-foto figcaption{margin-top:8px;font-size:.8125rem;color:var(--text-muted)}

/* ── La carta (/servicios) ──────────────────────────────────────────────── */
.chf-carta{display:grid;grid-template-columns:260px minmax(0,1fr);gap:clamp(32px,4vw,72px);align-items:start;margin-top:56px}
.chf-indice{position:sticky;top:100px;display:grid;border-top:1px solid var(--line-strong)}
.chf-indice a{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:48px;border-bottom:1px solid var(--line);color:var(--text-strong);text-decoration:none;font-size:1.0625rem;transition:color var(--ch-transicion)}
.chf-indice a:hover{color:var(--chf-tinta)}
.chf-indice span{color:var(--text-muted);font-variant-numeric:tabular-nums}
.chf-familia + .chf-familia{margin-top:clamp(56px,5vw,96px)}
.chf-familia-tit{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:clamp(1.75rem,1.3rem + 1.6vw,2.75rem);line-height:1.1;display:flex;align-items:baseline;gap:14px;padding-block:8px;background:var(--surface)}
.chf-familia-tit span{font-family:var(--font-body),system-ui,sans-serif;font-size:1rem;color:var(--text-muted);font-variant-numeric:tabular-nums}
.chf-familia .chf-renglones{margin-top:16px}
.chf-chips{display:none}
.chf-pie-carta{margin-top:clamp(56px,6vw,96px);padding-top:32px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:16px 28px}

/* ── La ficha (/servicios/[id]) ─────────────────────────────────────────── */
.chf-ficha{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(16px,2vw,32px);align-items:start;padding-block:clamp(40px,5vw,88px) clamp(72px,6vw + 40px,144px)}
.chf-ficha-txt{grid-column:1 / span 8}
.chf-ficha-ilu{grid-column:10 / span 3;padding-top:24px}
.chf-ficha-ilu img{display:block;width:100%;height:auto;border-radius:4px}
.chf-volver{display:inline-flex;align-items:center;min-height:48px;color:var(--chf-tinta);text-decoration:underline;text-underline-offset:5px;margin-bottom:24px}
.chf-cifras{display:flex;flex-wrap:wrap;gap:20px clamp(28px,4vw,56px);margin-top:40px;padding-block:24px;border-block:1px solid var(--line-strong)}
.chf-cifras div{display:grid;gap:4px}
.chf-cifras dt{font-size:var(--chf-kicker);letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--text-muted)}
.chf-cifras dd{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:clamp(1.75rem,1.4rem + 1.6vw,2.75rem);line-height:1.05;font-variant-numeric:tabular-nums}
.chf-lohacen{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin-top:32px}
.chf-lohacen ul{display:flex;gap:8px}
.chf-regla{margin-top:24px;color:var(--text-muted);max-width:40rem}
.chf-ficha-hueco{margin-top:56px;max-width:560px}

/* ── Barra fija del celular ─────────────────────────────────────────────── */
.chf-barra{display:none}
.chf-barra[hidden]{display:none!important}

@media (max-width:1000px){
  .chf-hero-tit,.chf-hero-a,.chf-hero-b,.chf-agenda{grid-column:1 / -1;grid-row:auto}
  .chf-agenda{margin-top:32px;max-width:640px}
  .chf-banda-env > div,.chf-banda-env .chf-lista{grid-column:1 / -1}
  .chf-banda-env .chf-lista{margin-top:32px}
  .chf-donde-txt{grid-column:1 / span 7}
  .chf-donde-foto{grid-column:8 / span 5}
  .chf-ficha-txt{grid-column:1 / span 9}
}
@media (max-width:800px){
  .chf{--chf-boton:56px}
  .chf-cab-env{height:56px}
  .chf-nav a{display:none}
  .chf-cab .chf-btn{min-height:48px;padding:0 16px;font-size:.9375rem;background:transparent;color:var(--text-strong);border-color:var(--line-strong)}
  .chf-hero{padding-top:28px}
  .chf-acc .chf-btn{flex:1 1 auto}
  .chf-lede{margin-top:16px}
  .chf-agenda{margin-top:24px}
  .chf-panel{padding:16px 18px 18px;margin-inline:calc(-1 * min(var(--chf-margen),18px))}
  .chf-hueco{grid-template-columns:72px minmax(0,1fr);grid-template-areas:"foto nom" "foto hora";column-gap:16px;padding:14px 0}
  .chf-foto-hueco{width:72px;height:72px;font-size:1.375rem}
  .chf-hueco-nom b{font-size:1.375rem}
  .chf-hueco-hora{height:auto;min-height:48px}
  .chf-hora{font-size:1.75rem}
  .chf-hueco-acc{display:none}
  .chf-serv{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"txt plata" "dur boton";gap:10px 16px}
  .chf-serv-txt{grid-area:txt}.chf-plata{grid-area:plata;align-self:start}.chf-dur{grid-area:dur;text-align:left}
  .chf-serv > :last-child{grid-area:boton;justify-self:end}
  .chf-equipo{grid-template-columns:repeat(3,minmax(0,1fr));gap:28px 12px;margin-top:36px}
  .chf-foto-eq{width:96px;height:96px;font-size:1.75rem;margin-bottom:4px}
  .chf-eq-nom{font-size:1.125rem}
  .chf-equipo .chf-serv-meta{font-size:.8125rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .chf-donde-txt,.chf-donde-foto{grid-column:1 / -1}
  .chf-tabla div{grid-template-columns:110px minmax(0,1fr)}
  .chf-carta{grid-template-columns:1fr;margin-top:24px}
  .chf-indice{display:none}
  .chf-chips{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;margin:24px calc(-1 * var(--chf-margen)) 0;padding:4px var(--chf-margen) 8px;scrollbar-width:none}
  .chf-chips::-webkit-scrollbar{display:none}
  .chf-chips a{scroll-snap-align:start;flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:48px;padding:0 16px;border:1px solid var(--line-strong);border-radius:999px;color:var(--text-strong);text-decoration:none;font-size:.9375rem;white-space:nowrap}
  .chf-chips a span{color:var(--text-muted);font-variant-numeric:tabular-nums}
  .chf-familia-tit{position:sticky;top:56px;z-index:2;border-bottom:1px solid var(--line)}
  .chf-familia + .chf-familia{margin-top:48px}
  .chf-ficha-txt{grid-column:1 / -1}
  .chf-ficha-ilu{display:none}
  .chf-barra{display:block;position:fixed;left:0;right:0;bottom:0;z-index:45;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--line)}
  .chf-barra .chf-btn{width:100%;min-height:56px}
  body:has(.chf-barra) footer{padding-bottom:calc(80px + env(safe-area-inset-bottom))}
}

/* ── Piel del modal de reserva (BookingModal con useDiseno()) ───────────── */
.chm-fondo{animation:chm-fondo 240ms ease-out both}
@keyframes chm-fondo{from{backdrop-filter:blur(0)}to{backdrop-filter:blur(2px)}}
.chm{max-width:560px!important;display:flex;flex-direction:column;animation:chm-entra 240ms var(--ch-transicion-curva) both;font-size:1.0625rem}
@keyframes chm-entra{from{transform:translateY(16px) scale(.98)}to{transform:none}}
.chm-cab{padding:20px 28px 0!important}
.chm-marca{font-family:var(--font-display),Georgia,serif;font-size:1.375rem;color:var(--chf-tinta)}
.chm-progreso{padding:16px 28px 0}
.chm-segmentos{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.chm-segmentos span{height:4px;border-radius:2px;background:var(--line);transition:background-color var(--ch-transicion)}
.chm-segmentos span[data-hecho]{background:var(--accent)}
.chm-paso{margin:10px 0 0;font-size:.875rem;color:var(--text-muted)}
.chm-cuerpo{padding:24px 28px!important;flex:1 1 auto}
.chm-titulo{font-size:clamp(1.75rem,1.5rem + 1vw,2.25rem)!important;font-weight:400!important;line-height:1.1;margin-bottom:20px!important}
.chm-fila{min-height:56px;padding:12px 10px!important;font-size:1.0625rem!important;gap:16px}
.chm-fila > span:last-child{font-size:1rem!important;opacity:1!important;font-variant-numeric:tabular-nums;font-weight:600}
.chm-fila[aria-pressed="false"] > span:last-child{color:var(--text-strong)}
.chm-grupo{font-size:.8125rem!important;letter-spacing:.16em!important;font-weight:600;margin-top:20px!important}
.chm-pros{grid-template-columns:1fr!important;gap:0!important;border-top:1px solid var(--line)}
.chm-pro{min-height:56px;text-align:left;font-size:1.125rem!important;padding:12px 14px!important;border-width:0 0 1px!important;border-color:var(--line)!important}
.chm-pro[aria-pressed="true"]{border-color:var(--accent)!important}
.chm-dias{grid-template-columns:repeat(auto-fill,minmax(76px,1fr))!important;gap:8px!important}
.chm-dia{min-height:56px;display:grid!important;justify-items:center;align-content:center;gap:4px;font-size:.9375rem!important;background:transparent!important;border-color:var(--line-strong)!important;color:var(--text-strong)!important;opacity:1!important}
.chm-dia[aria-pressed="true"]{background:var(--accent)!important;border-color:var(--accent)!important;color:var(--text-on-accent)!important}
.chm-punto{width:7px;height:7px;border-radius:50%;background:var(--line-strong)}
.chm-punto[data-hay="si"]{background:var(--success)}
.chm-dia[aria-pressed="true"] .chm-punto{background:var(--text-on-accent)}
.chm-hora{min-height:52px;min-width:84px;font-size:1.0625rem!important;font-variant-numeric:tabular-nums}
.chm-cerrar{width:48px!important;height:48px!important}
.chm-buscar{min-height:48px!important}
.chm-volver{min-height:48px!important}
.chm-sino button{min-height:48px;min-width:48px}
.chm-cupon input,.chm-cupon button{min-height:48px}
.chm-salidas a,.chm-salidas button{display:inline-flex;align-items:center;min-height:48px}
.chm-campo input{min-height:52px;font-size:1.0625rem!important;padding:10px 14px!important;background:var(--surface-raised)!important}
.chm-pie{position:sticky;bottom:0;padding:14px 28px calc(14px + env(safe-area-inset-bottom))!important}
.chm-seguir{min-height:52px!important;padding:0 32px!important;font-size:1.0625rem!important;font-weight:600;border-radius:2px;background:var(--accent)!important}
.chm-seguir:disabled{background:var(--line-strong)!important}
.chm-tarjeta{border-left:3px solid var(--accent)}
.chm-codigo{font-family:var(--font-display),Georgia,serif;font-size:2rem;line-height:1;font-variant-numeric:tabular-nums;margin-bottom:8px!important}
@media (max-width:640px){
  .chm-fondo{padding:0!important;align-items:stretch!important}
  .chm{max-width:none!important;max-height:none!important;height:100dvh;border-radius:0!important;box-shadow:none!important}
  .chm-cab{padding:12px 16px 0!important}
  .chm-progreso{padding:12px 16px 0}
  .chm-cuerpo{padding:20px 16px!important}
  .chm-pie{padding:12px 16px calc(12px + env(safe-area-inset-bottom))!important}
  .chm-seguir{flex:1 1 auto;margin-left:16px;min-height:56px!important}
  /* Las horas en 4 columnas: con mínimo de 84 px entraban 3 y quedaba un cuarto vacío (QA). */
  .chm-horas{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))}
  .chm-hora{min-width:0;padding-inline:0!important}
}

/* ── Piel de /reserva (página compartida: sólo escala y tokens) ─────────── */
.chr{max-width:640px!important;font-size:1.0625rem}
.chr-h1{font-family:var(--font-display),Georgia,serif;font-weight:400;font-size:var(--chf-h2);line-height:1.04;letter-spacing:-.01em;margin:0 0 16px;text-wrap:balance}
.chr select,.chr input:not([type=checkbox]):not([type=hidden]){min-height:52px;font-size:1.0625rem;border-color:var(--line-strong)!important}
.chr button[aria-pressed]{min-height:52px;font-size:1.0625rem;font-variant-numeric:tabular-nums}
.chr button[type=submit]{min-height:56px;font-size:1rem}
.chr-tarjeta{margin-top:32px;padding:24px 0;border-block:1px solid var(--line-strong);display:grid;gap:10px}
.chr-tarjeta div{display:grid;grid-template-columns:130px minmax(0,1fr);gap:16px}
.chr-tarjeta dt{color:var(--text-muted)}
.chr-codigo{font-family:var(--font-display),Georgia,serif;font-size:clamp(2rem,1.6rem + 1.6vw,3rem);line-height:1;font-variant-numeric:tabular-nums}
.chr-estado{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.875rem;font-weight:600;background:var(--surface-sunken);color:var(--text-strong)}
.chr-acc{display:flex;flex-wrap:wrap;gap:12px 28px;align-items:center;margin-top:32px}
.chr-acc a:not(.chf-btn){color:var(--chf-tinta);text-decoration:underline;text-underline-offset:5px;min-height:48px;display:inline-flex;align-items:center}

@media (prefers-reduced-motion:reduce){
  .chf *,.chf-cab,.chf-cab *,.chf-barra *,.chm-fondo,.chm-fondo *{animation:none!important;transition:none!important}
  .chf-btn:hover,.chf-btn-borde:hover,.chf-serv:hover .chf-plata{transform:none}
}
`;
