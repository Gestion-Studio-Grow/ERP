// PUBLICACIÓN de la demo pública de Break Point (turnero + gestión del club) — estático, a costo cero.
//
//   npm run turnero:publicar        → dist/breakpoint-erp/  (se sube tal cual a un proyecto de Vercel aparte)
//
// Qué arma:
//   index.html           portada con la marca: «Reservá tu cancha» (/turnero/) y «Gestión del club» (/club/)
//   turnero/             el turnero, con <meta name="turnero-modo" content="demo"> (corre en el navegador: local.mjs)
//   club/index.html      el backoffice empaquetado (src/tenants/breakpoint/sitio/index.html) + la marca bp-demo-bus,
//                        y conectado.mjs al lado: con el turnero abierto en otra pestaña, se sincronizan en vivo
//   club/motor.mjs       el motor del club (lo importa el núcleo del turnero)
//   vercel.json          cabeceras de seguridad (CSP, nosniff, frame-ancestors, noindex) y barra final en las rutas
//   robots.txt           no indexar (es una demo)
// Es DEMO: datos de ejemplo, nada se guarda, sin back, sin credenciales (ciclo DEMO → VENTA → INVERSIÓN).
// El deploy lo hace quien publica (Gate 1); este script sólo arma la carpeta y la verifica.
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { empaquetar, leerFuente } from "../empaquetar.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../../..");
const PUB = path.join(RAIZ, "public/previews/breakpoint");
export const SALIDA_PUBLICADA = path.join(RAIZ, "dist/breakpoint-erp");

/** CSP de cada parte. El turnero y la portada sin scripts inline; el backoffice trae su <script> inline propio. */
export function politicas() {
  const base = ["default-src 'self'", "connect-src 'self'", "img-src 'self' data:", "font-src https://fonts.gstatic.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"];
  return {
    estricta: [...base, "script-src 'self'"].join("; "),
    club: [...base, "script-src 'self' 'unsafe-inline'"].join("; "),
  };
}

export function vercelJson() {
  const { estricta, club } = politicas();
  const comunes = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    trailingSlash: true, // /turnero → /turnero/: si no, los "./app.mjs" relativos apuntarían a la raíz
    headers: [
      { source: "/((?!club(?:/|$)).*)", headers: [...comunes, { key: "Content-Security-Policy", value: estricta }] },
      { source: "/club", headers: [...comunes, { key: "Content-Security-Policy", value: club }] },
      { source: "/club/(.*)", headers: [...comunes, { key: "Content-Security-Policy", value: club }] },
    ],
  };
}

const LOGO = `<svg viewBox="0 0 120 120" role="img" aria-label="Break Point Pádel" width="96" height="96"><rect width="120" height="120" fill="#035BA8"/><g transform="translate(8 20)" color="#fff"><rect x="0.5" y="3.5" width="3.6" height="73" fill="currentColor"/><g fill="currentColor" font-family="Montserrat,'Century Gothic','Avenir Next',sans-serif" font-weight="500" font-size="24.5"><text x="9.5" y="25" textLength="92" lengthAdjust="spacingAndGlyphs">BREAK</text><text x="9.5" y="51" textLength="15.5" lengthAdjust="spacingAndGlyphs">P</text><text x="45" y="51" textLength="56.5" lengthAdjust="spacingAndGlyphs">INT</text><text x="9.5" y="77" textLength="92" lengthAdjust="spacingAndGlyphs">PADEL</text></g><g fill="none" stroke="#DC6E22" stroke-width="3.3" stroke-linecap="round"><circle cx="35" cy="42.4" r="8.1"/><path d="M34.2 35.6a7.6 7.6 0 0 0 0 13.6"/></g></g></svg>`;

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
    <a class="btn pri" href="./turnero/">Reservá tu cancha<small>el turnero para los jugadores</small></a>
    <a class="btn sec" href="./club/">Gestión del club<small>agenda, buffet, caja y más</small></a>
  </nav>
  <p class="nota"><b>Para ver la integración:</b> abrí las dos en pestañas del mismo navegador. Lo que reserves en el turnero aparece solo en la agenda del club, y lo que cargues en el club se ocupa en el turnero. Es una demo: Google, WhatsApp y los pagos están simulados.</p>
</main>
</body>
</html>
`;
}

function copiarCarpeta(origen, destino, filtro = () => true) {
  mkdirSync(destino, { recursive: true });
  for (const nombre of readdirSync(origen)) {
    const o = path.join(origen, nombre), d = path.join(destino, nombre);
    if (statSync(o).isDirectory()) copiarCarpeta(o, d, filtro);
    else if (filtro(nombre)) copyFileSync(o, d);
  }
}

/** Lista de archivos (relativos) de una carpeta. */
export function archivos(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? archivos(p, base) : [path.relative(base, p)]; });
}

/** Problemas que impiden publicar (vacío = listo). */
export function verificar(dir) {
  const problemas = [];
  for (const rel of archivos(dir)) {
    if (!/\.(html|mjs|js|css|json|txt)$/.test(rel)) continue;
    const t = readFileSync(path.join(dir, rel), "utf8");
    if (/https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(t)) problemas.push(`${rel} apunta a localhost`);
  }
  const turnero = readFileSync(path.join(dir, "turnero/index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  if (!/<meta name="turnero-modo" content="demo">/.test(turnero)) problemas.push("el turnero no está marcado como demo");
  if (/<meta name="turnero-api"/.test(turnero)) problemas.push("el turnero apunta a un back (la demo pública no tiene)");
  if (!/<meta name="bp-demo-bus" content="1">/.test(readFileSync(path.join(dir, "club/index.html"), "utf8"))) problemas.push("el club no tiene la marca del bus de la demo");
  for (const f of ["index.html", "robots.txt", "vercel.json", "turnero/app.mjs", "turnero/bus.mjs", "turnero/local.mjs", "turnero/dominio/nucleo.mjs", "club/conectado.mjs", "club/motor.mjs"]) {
    try { statSync(path.join(dir, f)); } catch { problemas.push(`falta ${f}`); }
  }
  return problemas;
}

export function publicar(salida = SALIDA_PUBLICADA) {
  rmSync(salida, { recursive: true, force: true });
  mkdirSync(salida, { recursive: true });
  // Turnero: estático, en modo demo (sin back).
  copiarCarpeta(path.join(PUB, "turnero"), path.join(salida, "turnero"), (n) => /\.(html|css|mjs)$/.test(n));
  // Club: el backoffice empaquetado (el mismo que sirve el ERP) + la marca del bus + el modo conectado.
  mkdirSync(path.join(salida, "club"), { recursive: true });
  const club = empaquetar(leerFuente(RAIZ)).replace(/<meta charset="utf-8">/i, (m) => `${m}\n<meta name="bp-demo-bus" content="1">`);
  writeFileSync(path.join(salida, "club/index.html"), club);
  for (const f of ["conectado.mjs", "motor.mjs"]) copyFileSync(path.join(PUB, "club", f), path.join(salida, "club", f));
  writeFileSync(path.join(salida, "index.html"), portada());
  writeFileSync(path.join(salida, "robots.txt"), "User-agent: *\nDisallow: /\n");
  writeFileSync(path.join(salida, "vercel.json"), JSON.stringify(vercelJson(), null, 2) + "\n");
  const problemas = verificar(salida);
  const bytes = archivos(salida).reduce((s, f) => s + statSync(path.join(salida, f)).size, 0);
  return { salida, problemas, bytes, archivos: archivos(salida).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = publicar();
  if (r.problemas.length) { console.error(`✗ No está listo para publicar:\n  - ${r.problemas.join("\n  - ")}`); process.exit(1); }
  console.log(`✓ ${path.relative(RAIZ, r.salida)}: ${r.archivos} archivos, ${(r.bytes / 1024).toFixed(1)} KB. Listo para subir (estático).`);
}
