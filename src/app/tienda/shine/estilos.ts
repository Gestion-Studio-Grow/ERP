// La piel de Shine: CSS acotado bajo `.shine`, escrito en el HTML por un componente de SERVIDOR
// (ShineVidriera.tsx) para que no viaje dos veces (en el HTML y adentro del JS; SKILL vidriera-de-autor §5).
//
// Marca real (manual 2026, docs/diseno/marca-shine-spec.md): crema #f3ebe1, papel #fdf8f2, rosa pálido
// #e1cdca, nude #d0aeac, malva #b88a89 (firma; nunca como texto), malva oscuro #835c5b (texto ≥ 16 px),
// burdeos #671128 (acento y CTA). Tinta #3a2429 (cuerpo, ≈11:1 sobre crema): derivada del front anterior,
// no está en el manual. Las letras (Cormorant y Kumbh Sans) llegan por next/font en fuentes.ts, como
// variables CSS en la raíz `.shine` (--sh-cormorant, --sh-cormorant-it, --sh-kumbh).

const B = "/tenants/shinevelas/brand";

export const CSS = `
html:has(.shine),body:has(.shine){background:#f3ebe1}
.shine{
  --crema:#f3ebe1;--papel:#fdf8f2;--rosa:#e1cdca;--nude:#d0aeac;--malva:#b88a89;--malva-d:#835c5b;
  --vino:#671128;--vino-hi:#7e1a35;--tinta:#3a2429;
  --serif:var(--sh-cormorant),"Cormorant Garamond",Georgia,serif;
  --serif-it:var(--sh-cormorant-it),"Cormorant Garamond",Georgia,serif;
  --palo:var(--sh-kumbh),system-ui,-apple-system,sans-serif;
  --barra:72px;--riel:400px;--gutter:clamp(20px,5vw,88px);--gap:clamp(20px,2.4vw,36px);
  --sombra:0 24px 60px -30px rgba(103,17,40,.28);--curva:cubic-bezier(.2,.8,.2,1);
  background:var(--crema);color:var(--tinta);font-family:var(--palo);font-size:17px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:clip;min-height:100vh;
}
@media(max-width:900px){.shine{--barra:64px;--gutter:18px}}
.shine *,.shine *::before,.shine *::after{box-sizing:border-box}
.shine a{color:inherit}
.shine button{font:inherit;color:inherit}
.shine img{max-width:100%}
.shine :focus-visible{outline:2px solid var(--vino);outline-offset:2px}
.shine .sh-num{font-variant-numeric:lining-nums tabular-nums}
.shine .sh-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.shine .sh-saltar{position:fixed;left:12px;top:-60px;z-index:80;background:var(--vino);color:var(--papel);padding:12px 18px;border-radius:999px;text-decoration:none}
.shine .sh-saltar:focus{top:12px}

/* Tipografía (escala §4 del diseño) */
.shine .sh-eyebrow{margin:0;font:600 13px/1.4 var(--palo);letter-spacing:.28em;text-transform:uppercase;color:var(--vino)}
.shine .sh-h1{margin:18px 0 0;font:300 clamp(58px,19.5cqi,132px)/.96 var(--serif);letter-spacing:-.01em;color:var(--vino);max-width:12ch;text-wrap:balance}
.shine .sh-h2{margin:14px 0 0;font:400 clamp(40px,5.5vw,80px)/1 var(--serif);letter-spacing:-.005em;color:var(--vino);text-wrap:balance}
.shine .sh-h3{margin:0;font:400 clamp(26px,2.2vw,34px)/1.1 var(--serif);color:var(--vino)}
.shine .sh-lede{margin:18px 0 0;font-size:clamp(17px,1.15vw,20px);line-height:1.6;max-width:56ch;color:var(--tinta)}
.shine .sh-pitch{margin:18px 0 0;font:400 clamp(22px,1.8vw,28px)/1.3 var(--serif);color:var(--malva-d);max-width:30ch}
.shine .sh-cab{max-width:760px;margin-bottom:clamp(32px,4vw,56px)}

/* Botones: 16 px / 56 px, pill */
.shine .sh-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 32px;border-radius:999px;border:1px solid transparent;font:600 16px/1.2 var(--palo);letter-spacing:.02em;text-decoration:none;cursor:pointer;transition:background-color .2s,border-color .2s,transform .2s var(--curva)}
.shine .sh-btn:active{transform:scale(.98)}
.shine .sh-btn-vino{background:var(--vino);color:var(--papel)}
.shine .sh-btn-vino:hover{background:var(--vino-hi)}
.shine .sh-btn-vino:disabled{background:#a98a8f;cursor:not-allowed}
.shine .sh-btn-ghost{background:transparent;border-color:var(--malva-d);color:var(--vino)}
.shine .sh-btn-ghost:hover{border-color:var(--vino);background:rgba(184,138,137,.12)}
.shine .sh-btn-ghost:disabled{opacity:.5;cursor:not-allowed}
.shine .sh-btn-ancho{width:100%}
.shine .sh-link{background:none;border:0;padding:8px 0;min-height:44px;color:var(--vino);text-decoration:underline;text-underline-offset:4px;cursor:pointer;font-size:16px}
.shine .sh-link-claro{color:var(--papel)}
.shine .sh-cerrar{min-height:48px;min-width:48px;padding:0 18px;border-radius:999px;border:1px solid var(--rosa);background:var(--papel);color:var(--vino);font-weight:600;cursor:pointer}
.shine .sh-error{margin:8px 0 0;padding:10px 14px;border-left:2px solid var(--vino);background:rgba(103,17,40,.06);color:var(--vino);font-size:15px}

/* Barra fija */
.shine .sh-barra{position:fixed;inset:0 0 auto 0;z-index:50;height:var(--barra);display:flex;align-items:center;gap:24px;padding:0 var(--gutter);background:rgba(243,235,225,.92);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--rosa)}
.shine .sh-marca{display:block;flex:none;line-height:0}
.shine .sh-logo{height:40px;width:auto}
.shine .sh-nav{display:flex;gap:28px;margin:0 auto;font-size:15px;font-weight:600;letter-spacing:.04em}
.shine .sh-nav a{color:var(--malva-d);text-decoration:none;padding:12px 0;border-bottom:1px solid transparent}
.shine .sh-nav a:hover{color:var(--vino);border-bottom-color:var(--vino)}
.shine .sh-barra-der{display:flex;align-items:center;gap:12px;margin-left:auto}
.shine .sh-chip-aroma{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--rosa);background:var(--papel);text-decoration:none;font-size:15px;color:var(--malva-d);white-space:nowrap}
.shine .sh-chip-aroma b{color:var(--vino);font-weight:600}
.shine .sh-barra-bolsa{min-height:48px;padding:0 24px}
@media(max-width:1119px){.shine .sh-barra-der{display:none}}
@media(max-width:900px){.shine .sh-nav{display:none}.shine .sh-logo{height:34px}}

/* Estructura: el riel de la bolsa ocupa la derecha desde 1120 px */
.shine .sh-main{padding-top:var(--barra)}
@media(min-width:1120px){.shine .sh-main{padding-right:var(--riel)}}
.shine .sh-sec{padding:clamp(80px,11vh,176px) var(--gutter)}

/* Hero 52/48 */
.shine .sh-hero{display:grid;grid-template-columns:minmax(0,52fr) minmax(0,48fr);gap:var(--gap);align-items:center;min-height:min(calc(92vh - var(--barra)),980px);padding:clamp(32px,6vh,72px) var(--gutter)}
.shine .sh-hero-texto{container-type:inline-size;min-width:0}
.shine .sh-ctas{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px}
.shine .sh-hero-vela{position:relative;aspect-ratio:1;width:100%;min-width:0}
.shine .sh-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:6px;background:var(--rosa)}
.shine .sh-hero-vela .shv{border-radius:6px;overflow:hidden}
.shine .sh-sello{position:absolute;left:-40px;bottom:-28px;z-index:7;transform-origin:50% 50%;filter:drop-shadow(0 10px 24px rgba(103,17,40,.2))}
.shine .sh-sello-disco{fill:var(--papel)}
.shine .sh-sello-txt{font:600 6px var(--palo);letter-spacing:.1em;fill:var(--vino)}
.shine .sh-sello-estrella{fill:var(--vino)}
@media(prefers-reduced-motion:no-preference){
  .shine .sh-sello{animation:sh-gira 30s linear infinite}
  .shine .sh-h1{animation:sh-telon .7s var(--curva) both}
}
@keyframes sh-gira{to{transform:rotate(360deg)}}
@keyframes sh-telon{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@media(max-width:900px){
  .shine .sh-hero{grid-template-columns:minmax(0,1fr);min-height:0;padding-top:28px}
  .shine .sh-sello{left:auto;right:10px;top:10px;bottom:auto;width:76px;height:76px}
}

/* Tira de valor */
.shine .sh-valores{list-style:none;margin:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--gap);padding:clamp(36px,5vh,56px) var(--gutter);background:var(--papel);border-block:1px solid var(--rosa)}
.shine .sh-valores li{display:grid;gap:6px;align-content:start}
.shine .sh-valores b{font:400 22px/1.15 var(--serif);color:var(--vino)}
.shine .sh-valores span{font-size:15px;line-height:1.5;color:var(--malva-d)}
.shine .sh-valor-icono{width:40px;height:40px;object-fit:contain;object-position:left;margin-bottom:8px}
@media(max-width:1000px){.shine .sh-valores{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* Carta de aromas */
.shine .sha-cartas{display:grid;gap:36px}
.shine .sha-carta-t{margin:0 0 14px;font:600 13px/1.4 var(--palo);letter-spacing:.2em;text-transform:uppercase;color:var(--malva-d)}
.shine .sha-carta-t span{letter-spacing:.04em;text-transform:none;font-weight:400}
.shine .sha-chips{display:flex;flex-wrap:wrap;gap:12px}
.shine .sha-chip{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 22px 0 16px;border-radius:999px;border:1px solid var(--rosa);background:var(--papel);color:var(--tinta);font:400 17px/1 var(--palo);cursor:pointer;transition:background-color .2s,border-color .2s,transform .15s var(--curva)}
.shine .sha-chip:hover{border-color:var(--malva)}
.shine .sha-chip:active{transform:scale(.98)}
.shine .sha-chip[aria-pressed="true"]{background:var(--vino);border-color:var(--vino);color:var(--papel)}
.shine .sha-gota{width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:inset 0 0 0 1px rgba(58,36,41,.18);transition:transform .2s var(--curva)}
.shine .sha-chip[aria-pressed="true"] .sha-gota{transform:rotate(-45deg) scale(1.25);box-shadow:0 0 0 2px var(--papel)}
.shine .sha-chips-chicos{gap:8px}
.shine .sha-chips-chicos .sha-chip{min-height:44px;font-size:15px;padding:0 14px 0 12px}
.shine .sha-nota{margin:0;font-size:14px;color:var(--malva-d)}
.shine .sha-estado{margin:28px 0 0;font:400 24px/1.3 var(--serif);color:var(--malva-d)}
.shine .sha-estado b{font-style:normal;color:var(--vino);font-weight:500}
@media(prefers-reduced-motion:reduce){.shine .sha-chip,.shine .sha-gota{transition:none}}

/* Colección */
.shine .sh-pestanas{position:sticky;top:var(--barra);z-index:20;display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;margin:0 calc(var(--gutter) * -1) clamp(24px,3vw,40px);padding:12px var(--gutter);background:rgba(243,235,225,.94)}
.shine .sh-pestanas::-webkit-scrollbar{display:none}
.shine .sh-pestanas button{flex:none;min-height:44px;padding:0 20px;border-radius:999px;border:1px solid var(--rosa);background:var(--papel);cursor:pointer;font-size:15px;font-weight:600;color:var(--malva-d);white-space:nowrap}
.shine .sh-pestanas button[aria-pressed="true"]{background:var(--tinta);border-color:var(--tinta);color:var(--papel)}
.shine .sh-grilla,.shine .shr-grilla{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(28px,3vw,48px) var(--gap)}
@media(max-width:1300px){.shine .sh-grilla{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:680px){.shine .sh-grilla{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 14px}}
.shine .shc{position:relative;min-width:0;content-visibility:auto;contain-intrinsic-size:auto 480px}
.shine .shc-foto{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--rosa)}
.shine .shc-abrir{position:absolute;inset:0;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer}
.shine .shc-img{object-fit:cover;transition:transform .5s var(--curva),opacity .4s ease}
.shine .shc-img-2{opacity:0}
.shine .shc:hover .shc-img{transform:scale(1.03)}
.shine .shc:hover .shc-img-2,.shine .shc-abrir:focus-visible .shc-img-2{opacity:1}
.shine .shc.agotado .shc-img{opacity:.6}
.shine .shc.agotado .shc-foto{background:var(--crema)}
.shine .shc-etiquetas{position:absolute;left:10px;top:10px;right:10px;display:flex;flex-wrap:wrap;gap:6px;pointer-events:none}
.shine .sh-dispo{display:inline-block;padding:6px 12px;border-radius:999px;background:var(--vino);color:var(--papel);font-size:13px;font-weight:600;letter-spacing:.02em}
.shine .sh-dispo.off{background:var(--tinta)}
.shine .sh-dispo.suave{background:rgba(253,248,242,.94);color:var(--malva-d)}
.shine .shf-texto .sh-dispo{margin:10px 0 0}
.shine .shc-mas{position:absolute;right:10px;bottom:10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 20px 0 16px;border-radius:999px;border:1px solid var(--malva-d);background:rgba(253,248,242,.95);color:var(--vino);font-size:16px;font-weight:600;cursor:pointer;box-shadow:var(--sombra);transition:transform .15s var(--curva),background-color .2s}
.shine .shc-mas span[aria-hidden]{font-size:22px;line-height:1}
.shine .shc-mas:hover{background:var(--vino);color:var(--papel);border-color:var(--vino)}
.shine .shc-mas:active{transform:scale(.96)}
.shine .shc-mas:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.shine .shc-mas:disabled:hover{background:rgba(253,248,242,.95);color:var(--vino)}
.shine .shc-nombre{margin:16px 0 0;font:400 clamp(22px,1.6vw,28px)/1.15 var(--serif);color:var(--tinta)}
.shine .shc-detalle{margin:6px 0 0;font-size:15px;line-height:1.45;color:var(--malva-d)}
.shine .shc-precio{margin:8px 0 0;font:600 clamp(18px,1.3vw,22px)/1.3 var(--palo);color:var(--tinta)}
.shine .shc-en{font-size:15px;font-weight:400;color:var(--vino)}
@media(max-width:680px){
  .shine .shc-mas{width:48px;padding:0}
  .shine .shc-mas-t{display:none}
  .shine .shc-nombre{font-size:20px;margin-top:12px}
  .shine .shc-precio{font-size:17px}
  .shine .shc-detalle{font-size:14px}
}
.shine .sh-sinfoto{position:absolute;inset:0;display:block;background:var(--rosa) url(${B}/icon-candle-128.webp) center/64px no-repeat}
.shine .sh-rotulo{position:absolute;left:10px;bottom:10px;padding:6px 12px;border-radius:999px;background:rgba(253,248,242,.94);color:var(--malva-d);font-size:13px}
.shine .sh-vacio{display:grid;justify-items:center;gap:18px;padding:56px 24px;border-radius:12px;background:var(--papel);text-align:center;box-shadow:var(--sombra)}
.shine .sh-llama{width:30px;height:52px;background:var(--malva-d);-webkit-mask:url(${B}/flame-mask-160.webp) center/contain no-repeat;mask:url(${B}/flame-mask-160.webp) center/contain no-repeat}

/* Para regalar */
.shine .sh-regalar{background:var(--papel);border-block:1px solid var(--rosa)}
.shine .shr-grilla{grid-template-columns:repeat(3,minmax(0,1fr))}
@media(max-width:900px){.shine .shr-grilla{grid-template-columns:minmax(0,1fr)}}
.shine .shr{display:grid;align-content:start;justify-items:start}
.shine .shr-foto{position:relative;width:100%;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--rosa)}
.shine .shr .sh-btn{margin-top:16px}

/* Manifiesto sobre trama. content-visibility: ni la trama ni la itálica bajan hasta acercarse (peso de la portada). */
.shine .sh-manifiesto{content-visibility:auto;contain-intrinsic-size:auto 520px;position:relative;padding:clamp(80px,11vh,176px) var(--gutter);overflow:hidden}
.shine .sh-manifiesto::before{content:"";position:absolute;inset:0;background:url(${B}/trama.webp) 0 0/380px repeat;opacity:.07;pointer-events:none}
.shine .sh-manifiesto blockquote{position:relative;margin:0 auto;max-width:30em;text-align:center}
.shine .sh-manifiesto p{margin:0;font:400 italic clamp(26px,2.4vw,34px)/1.35 var(--serif-it);color:var(--vino)}
.shine .sh-manifiesto footer{margin-top:24px;font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:var(--malva-d)}

/* Pie burdeos */
.shine .sh-pie{background:var(--vino);color:var(--papel);padding:clamp(64px,9vh,120px) var(--gutter) 32px}
.shine .sh-pie-lema{margin:0;font:300 clamp(44px,6vw,96px)/1 var(--serif);max-width:12ch}
.shine .sh-pie-cierre{margin:20px 0 0;max-width:46ch;font-size:18px;color:#f0dcd8}
.shine .sh-pie-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap);margin-top:48px;padding-top:28px;border-top:1px solid rgba(253,248,242,.24)}
.shine .sh-pie-cols h2{margin:0 0 8px;font:600 13px/1.4 var(--palo);letter-spacing:.24em;text-transform:uppercase;color:var(--nude)}
.shine .sh-pie-cols p{margin:0}
.shine .sh-pie-legal{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:48px;font-size:14px;color:#ead2cf}
.shine .sh-admin{display:inline-flex;align-items:center;min-height:44px;color:var(--papel)}
.shine .sh-pie :focus-visible{outline-color:var(--papel)}
@media(max-width:900px){.shine .sh-pie-cols{grid-template-columns:minmax(0,1fr)}}
@media(max-width:1119px){.shine .sh-pie{padding-bottom:calc(32px + 88px + env(safe-area-inset-bottom))}}

/* Barra de abajo (celular y tableta): siempre visible, un toque */
.shine .sh-abajo{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;align-items:center;gap:10px;min-height:calc(64px + env(safe-area-inset-bottom));padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:var(--vino);color:var(--papel);box-shadow:0 -12px 30px -18px rgba(58,36,41,.5)}
.shine .sh-abajo button{min-height:48px;border-radius:999px;cursor:pointer;font-size:15px;white-space:nowrap}
.shine .sh-abajo-aroma{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;padding:0 16px;border:1px solid rgba(253,248,242,.5);background:transparent;color:var(--papel);text-align:left}
.shine .sh-abajo-bolsa{flex:none;display:inline-flex;align-items:center;gap:2px;padding:0 18px;border:0;background:var(--papel);color:var(--vino);font-weight:600}
.shine .sh-abajo :focus-visible{outline-color:var(--papel)}
@media(prefers-reduced-motion:no-preference){.shine .sh-abajo-total{display:inline-block;animation:sh-sube-poco .2s var(--curva)}}
@keyframes sh-sube-poco{from{transform:translateY(-2px)}to{transform:none}}
@media(min-width:1120px){.shine .sh-abajo{display:none}}

/* Hojas: ficha y carta de aromas (modales nativos) */
.shine .sh-hoja{width:min(1100px,calc(100vw - 48px));max-width:none;max-height:min(90vh,900px);padding:0;border:0;border-radius:12px;background:var(--papel);color:var(--tinta);box-shadow:var(--sombra);overflow:auto}
.shine .sh-hoja::backdrop{background:rgba(58,36,41,.45)}
.shine .sh-hoja-caja{position:relative;padding:clamp(20px,3vw,40px)}
.shine .sh-hoja-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}
.shine .sh-hoja-pie{position:sticky;bottom:0;margin:24px calc(clamp(20px,3vw,40px) * -1) calc(clamp(20px,3vw,40px) * -1);padding:14px clamp(20px,3vw,40px) calc(14px + env(safe-area-inset-bottom));background:var(--papel);border-top:1px solid var(--rosa)}
.shine .sha-hoja{width:min(760px,calc(100vw - 48px))}
@media(max-width:820px){
  .shine .sh-hoja,.shine .sha-hoja{width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}
}
@media(prefers-reduced-motion:no-preference){.shine .sh-hoja[open]{animation:sh-entra .32s var(--curva)}}
@keyframes sh-entra{from{transform:translateY(24px)}to{transform:none}}

/* Ficha 55/45 */
.shine .shf-caja{display:grid;grid-template-columns:minmax(0,55fr) minmax(0,45fr);gap:clamp(24px,3vw,48px)}
.shine .shf-cerrar{position:absolute;top:14px;right:14px;z-index:2}
.shine .shf-foto{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--rosa)}
.shine .shf-img{object-fit:cover}
.shine .shf-minis{display:flex;gap:10px;margin-top:12px}
.shine .shf-minis button{padding:0;border:1px solid var(--rosa);border-radius:6px;overflow:hidden;cursor:pointer;line-height:0;background:none}
.shine .shf-minis button[aria-pressed="true"]{border-color:var(--vino);box-shadow:0 0 0 1px var(--vino)}
.shine .shf-minis img{width:64px;height:80px;object-fit:cover}
.shine .shf-texto{padding-top:44px;min-width:0}
.shine .shf-nombre{margin:12px 0 0;font:400 clamp(36px,3.6vw,56px)/1.02 var(--serif);color:var(--vino)}
.shine .shf-precio{margin:14px 0 0;font:600 26px/1.2 var(--palo)}
.shine .shf-detalle{margin:12px 0 0;font-size:17px;color:var(--malva-d)}
.shine .shf-aromas{margin-top:26px;display:grid;gap:12px}
.shine .shf-sub{margin:0;font-weight:600;font-size:15px;letter-spacing:.04em}
.shine .shf-sub b{color:var(--vino)}
.shine .shf-sub span{font-weight:400;color:var(--malva-d)}
.shine .shf-nota{margin:14px 0 0;font-size:15px;color:var(--vino)}
.shine .shf-acciones{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;margin-top:24px;padding:12px 0 calc(12px + env(safe-area-inset-bottom));background:var(--papel)}
.shine .shf-agregar{flex:1}
@media(max-width:820px){
  .shine .shf-caja{grid-template-columns:minmax(0,1fr);padding-bottom:0}
  .shine .shf-texto{padding-top:0}
  .shine .shf-cerrar{position:fixed}
}

/* Stepper */
.shine .sh-stepper{display:inline-flex;align-items:center;border:1px solid var(--rosa);border-radius:999px;background:#fff}
.shine .sh-stepper button{width:48px;height:52px;border:0;background:none;cursor:pointer;font-size:22px;color:var(--vino);border-radius:999px}
.shine .sh-stepper button:disabled{color:#c9b3b1;cursor:not-allowed}
.shine .sh-stepper span{min-width:26px;text-align:center;font-weight:600}
.shine .sh-stepper-chico button{width:44px;height:44px;font-size:19px}

/* Bolsa: riel (≥ 1120) u hoja modal (celular) */
.shine .shb{position:fixed;top:var(--barra);right:0;bottom:0;left:auto;z-index:40;width:var(--riel);max-width:none;height:auto;max-height:none;margin:0;padding:0;border:0;border-left:1px solid var(--rosa);background:var(--papel);color:var(--tinta);display:flex}
.shine .shb:not([open]){display:none}
.shine .shb::backdrop{background:rgba(58,36,41,.45)}
.shine .shb-caja{display:flex;flex-direction:column;width:100%;min-height:0}
.shine .shb-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 24px;border-bottom:1px solid var(--rosa)}
.shine .shb-cab h2:focus{outline:none}
.shine .shb-cab h2:focus-visible{outline:2px solid var(--vino);outline-offset:4px}
.shine .shb-cerrar{display:none}
.shine .shb-cuerpo{flex:1;min-height:0;overflow:auto;padding:8px 24px 20px;overscroll-behavior:contain}
.shine .shb-vacia{display:grid;gap:16px;justify-items:start;padding:24px 0;color:var(--malva-d)}
.shine .shb-vacia p{margin:0;font:400 24px/1.3 var(--serif)}
.shine .shb-renglones{list-style:none;margin:0;padding:0}
.shine .shb-r{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:6px 14px;padding:16px 0;border-bottom:1px solid var(--rosa)}
.shine .shb-mini{position:relative;display:block;width:56px;height:70px;border-radius:6px;overflow:hidden;background:var(--rosa)}
.shine .shb-mini img{width:56px;height:70px;object-fit:cover}
.shine .shb-r-info{display:grid;gap:6px;justify-items:start;min-width:0}
.shine .shb-r-nombre{margin:0;font:400 20px/1.15 var(--serif)}
.shine .shb-r-aroma{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--rosa);background:var(--crema);font-size:14px;color:var(--vino);cursor:pointer}
.shine .shb-r-importe{font-weight:600}
.shine .shb-r-cambiar{color:var(--malva-d);font-size:13px}
.shine .sh-flecha{vertical-align:-1px;margin-left:4px}
.shine .shb-r-editor,.shine .shb-r-aviso{grid-column:1/-1}
.shine .shb-datos{display:grid;gap:14px;margin-top:20px}
.shine .sh-campo{display:grid;gap:6px;font-size:14px;font-weight:600;color:var(--malva-d)}
.shine .sh-campo input,.shine .sh-campo select,.shine .sh-campo textarea{width:100%;min-height:48px;padding:10px 14px;border:1px solid #cdb4b0;border-radius:10px;background:#fff;color:var(--tinta);font:400 16px/1.4 var(--palo)}
.shine .shb-cupon{display:flex;gap:8px}
.shine .shb-cupon .sh-btn{min-height:48px;padding:0 18px}
.shine .shb-franjas{display:flex;flex-wrap:wrap;gap:8px}
.shine .shb-franja{min-height:44px}
.shine .shb-tenue{margin:0;font-size:14px;color:var(--malva-d)}
.shine .shb-pie{display:grid;gap:10px;padding:16px 24px calc(16px + env(safe-area-inset-bottom));border-top:1px solid var(--rosa);background:var(--papel)}
.shine .shb-cuentas{display:grid;gap:4px;margin:0}
.shine .shb-cuentas div{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.shine .shb-cuentas dd{margin:0}
.shine .shb-total{font-weight:600;font-size:19px!important;padding-top:6px;border-top:1px solid var(--rosa)}
.shine .shb-ok{padding:12px 14px;border-left:2px solid #1f6b45;background:rgba(31,107,69,.07);font-size:15px}
.shine .shb-ok p{margin:0}
@media(max-width:1119px){
  .shine .shb:not(:modal){display:none}
  .shine .shb:modal{inset:0;width:100vw;height:100dvh;max-height:100dvh;border:0}
  .shine .shb-cerrar{display:inline-flex;align-items:center}
}
@media(prefers-reduced-motion:no-preference){.shine .shb:modal{animation:sh-entra .32s var(--curva)}}

/* Aparición al scroll: sólo transform, nunca opacidad (y nada de esto con movimiento reducido) */
@media(prefers-reduced-motion:no-preference){
  .shine.sh-revela [data-revelar]{transition:transform .7s var(--curva)}
  .shine.sh-revela [data-revelar]:not(.sh-visto){transform:translateY(16px)}
}
`;
