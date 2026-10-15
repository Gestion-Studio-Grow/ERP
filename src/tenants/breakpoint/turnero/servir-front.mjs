// FRONT del turnero (y el backoffice del club) servidos como archivos estáticos — separado del back.
//
//   node src/tenants/breakpoint/turnero/servir-front.mjs      → http://localhost:5173/turnero/
//                                                               http://localhost:5173/club/?api=http://localhost:8787
//
// En producción el front es estático (CDN/Vercel/Netlify) y el back un servicio aparte: este servidor existe para
// la demo local y para los tests E2E. Comprime (brotli/gzip), cachea con ETag y manda cabeceras de seguridad.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../public/previews/breakpoint");
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webp": "image/webp", ".ico": "image/x-icon" };

export function crearFront({ api = "http://localhost:8787" } = {}) {
  const cache = new Map();
  // CSP: sólo nuestro origen, el back y Google (fuentes y Sign-In). Nada de inline salvo estilos (el diseño los usa).
  const csp = [
    "default-src 'self'", `connect-src 'self' ${api}`, "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com", "font-src https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com", "frame-src https://accounts.google.com", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") { res.writeHead(302, { Location: "/turnero/" }); return res.end(); }
      if (rel.endsWith("/")) rel += "index.html";
      const archivo = path.join(RAIZ, path.normalize(rel));
      if (!archivo.startsWith(RAIZ + path.sep)) { res.writeHead(403); return res.end(); }
      const st = await stat(archivo).catch(() => null);
      if (!st?.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No existe."); }
      const clave = `${archivo}:${st.mtimeMs}`;
      let e = cache.get(clave);
      if (!e) {
        const crudo = await readFile(archivo);
        const comprimible = /\.(html|mjs|js|css|svg|json)$/.test(archivo);
        e = { crudo, br: comprimible ? brotliCompressSync(crudo, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : null, gz: comprimible ? gzipSync(crudo, { level: 9 }) : null, etag: `"${createHash("sha1").update(crudo).digest("base64url").slice(0, 16)}"` };
        cache.set(clave, e);
      }
      const cab = {
        "Content-Type": TIPOS[path.extname(archivo)] ?? "application/octet-stream", ETag: e.etag, "Cache-Control": "no-cache", Vary: "Accept-Encoding",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", ...(archivo.endsWith(".html") && { "Content-Security-Policy": csp }),
      };
      if (req.headers["if-none-match"] === e.etag) { res.writeHead(304, cab); return res.end(); }
      const acepta = String(req.headers["accept-encoding"] ?? "");
      const [cuerpo, cod] = e.br && acepta.includes("br") ? [e.br, "br"] : e.gz && acepta.includes("gzip") ? [e.gz, "gzip"] : [e.crudo, null];
      res.writeHead(200, { ...cab, ...(cod && { "Content-Encoding": cod }), "Content-Length": cuerpo.length });
      res.end(req.method === "HEAD" ? undefined : cuerpo);
    } catch {
      res.writeHead(500); res.end();
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const puerto = Number(process.env.FRONT_PORT ?? 5173);
  crearFront({ api: process.env.TURNERO_API ?? "http://localhost:8787" }).listen(puerto, () => {
    console.log(`Turnero (front): http://localhost:${puerto}/turnero/`);
    console.log(`Backoffice conectado: http://localhost:${puerto}/club/?api=http://localhost:8787`);
  });
}
