// PORTADA del sitio de Break Point Pádel (breakpointpadel.gsgapp.com.ar): la marca del club y los dos accesos,
// «Reservá tu cancha» (/turnero) y «Gestión del club» (/club). Demo a costo cero, datos de ejemplo.
// La usa src/tenants/breakpoint/empaquetar.mjs para armar src/tenants/breakpoint/sitio/index.html.

const LOGO = `<svg viewBox="0 0 120 120" role="img" aria-label="Break Point Pádel" width="96" height="96"><rect width="120" height="120" fill="#035BA8"/><g transform="translate(8 20)" color="#fff"><rect x="0.5" y="3.5" width="3.6" height="73" fill="currentColor"/><g fill="currentColor" font-family="Montserrat,'Century Gothic','Avenir Next',sans-serif" font-weight="500" font-size="24.5"><text x="9.5" y="25" textLength="92" lengthAdjust="spacingAndGlyphs">BREAK</text><text x="9.5" y="51" textLength="15.5" lengthAdjust="spacingAndGlyphs">P</text><text x="45" y="51" textLength="56.5" lengthAdjust="spacingAndGlyphs">INT</text><text x="9.5" y="77" textLength="92" lengthAdjust="spacingAndGlyphs">PADEL</text></g><g fill="none" stroke="#DC6E22" stroke-width="3.3" stroke-linecap="round"><circle cx="35" cy="42.4" r="8.1"/><path d="M34.2 35.6a7.6 7.6 0 0 0 0 13.6"/></g></g></svg>`;

/** El HTML de la portada (estático, sin scripts). PURA. */
export function portada() {
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Break Point Pádel · demo del turnero y la gestión del club</title>
<meta name="description" content="Demo de Break Point Pádel (Ezeiza): turnero web para los jugadores y gestión del club, sincronizados en vivo.">
<meta name="generator" content="Gestión Studio Grow">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#035BA8">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23035BA8'/%3E%3Ccircle cx='16' cy='16' r='8' fill='none' stroke='%23DC6E22' stroke-width='3'/%3E%3C/svg%3E">
<style>
  :root{color-scheme:light dark;--azul:#035BA8;--pelota:#DC6E22;--tinta:#0F1A26;--papel:#F5F7FA;--panel:#fff;--suave:#4A5868}
  @media (prefers-color-scheme:dark){:root{--tinta:#EEF3F8;--papel:#0D1621;--panel:#15212E;--suave:#A9B6C4}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--papel);color:var(--tinta);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{width:min(560px,100%);display:grid;gap:20px;justify-items:center;text-align:center}
  h1{margin:0;font-size:clamp(28px,7vw,40px);line-height:1.1;font-style:italic;font-weight:900;text-transform:uppercase;letter-spacing:.01em}
  h1 span{color:var(--azul)} @media (prefers-color-scheme:dark){h1 span{color:#6FB2F2}}
  p{margin:0;color:var(--suave)}
  .botones{display:grid;gap:12px;width:100%}
  @media (min-width:520px){.botones{grid-template-columns:1fr 1fr}}
  a.btn{display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:center;min-height:72px;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:800;font-size:18px;border:2px solid var(--azul)}
  a.btn small{font-weight:500;font-size:13px}
  a.pri{background:var(--azul);color:#fff}
  a.sec{background:var(--panel);color:var(--tinta)}
  a.btn:focus-visible{outline:3px solid var(--pelota);outline-offset:3px}
  .nota{font-size:14px;padding:12px 14px;border-radius:10px;background:var(--panel);border-left:4px solid var(--pelota);text-align:left}
  .cinta{position:fixed;top:0;left:0;right:0;padding:6px 12px;background:#0F1A26;color:#fff;font-size:13px;text-align:center}
</style>
</head>
<body>
<p class="cinta" role="note">Demo: los datos son de ejemplo y no se guardan</p>
<main>
  ${LOGO}
  <h1>Break Point <span>Pádel</span></h1>
  <p>Reservá tu cancha en dos toques, y mirá cómo le llega al club en vivo.</p>
  <nav class="botones" aria-label="Elegí qué querés ver">
    <a class="btn pri" href="/turnero">Reservá tu cancha<small>el turnero para los jugadores</small></a>
    <a class="btn sec" href="/club">Gestión del club<small>agenda, buffet, caja y más</small></a>
  </nav>
  <p class="nota"><b>Para ver la integración:</b> abrí las dos en pestañas del mismo navegador. Lo que reserves en el turnero aparece solo en la agenda del club, y lo que cargues en el club se ocupa en el turnero. Es una demo: Google, WhatsApp y los pagos están simulados.</p>
</main>
</body>
</html>
`;
}

