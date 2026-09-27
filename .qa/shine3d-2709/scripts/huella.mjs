// Huella del render de cada negocio: HTML con cada recurso /_next/static/... reemplazado por el sha256
// de su CONTENIDO (así un cambio de hash de nombre sin cambio de bytes no cuenta) y el buildId
// neutralizado. Uso: node huella.mjs <puerto> <salida.json>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
function pedir(puerto, host, ruta) {
  return new Promise((ok, mal) => {
    const q = http.request({ host: "127.0.0.1", port: puerto, path: ruta, headers: { host } }, (r) => {
      const partes = [];
      r.on("data", (c) => partes.push(c));
      r.on("end", () => ok({ status: r.statusCode, location: r.headers.location ?? null, body: Buffer.concat(partes) }));
    });
    q.on("error", mal);
    q.end();
  });
}

const [puerto, salida] = process.argv.slice(2);
const RUTAS = [
  ["chestetica", "/"],
  ["chestetica", "/tienda"],
  ["magra", "/tienda"],
  ["magra", "/"],
  ["adosmanos", "/tienda"],
  ["quebienoles", "/tienda"],
  ["wpe", "/"],
  ["wpe", "/tienda"],
];
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

async function traer(host, ruta) {
  return pedir(puerto, `${host}.localhost:${puerto}`, ruta);
}

const out = {};
for (const [host, ruta] of RUTAS) {
  const r = await traer(host, ruta);
  let html = r.body.toString("utf8");
  const urls = [...new Set(html.match(/\/_next\/static\/[A-Za-z0-9_\-./~%]+/g) ?? [])];
  const recursos = {};
  for (const u of urls.sort((a, b) => b.length - a.length)) {
    const limpio = u.replace(/[\\]+$/, "");
    const rr = await pedir(puerto, `${host}.localhost:${puerto}`, limpio);
    const h = rr.status === 200 ? sha(rr.body) : `HTTP${rr.status}`;
    recursos[limpio] = h;
    html = html.split(limpio).join(`<<${h}>>`);
  }
  // buildId y marcas de tiempo por request que no son render (nonce/fechas) quedan neutralizadas.
  html = html.replace(/"b":"[^"]+"/g, '"b":"BUILD"').replace(/\\"b\\":\\"[^\\"]+\\"/g, '\\"b\\":\\"BUILD\\"');
  // El RSC en línea (self.__next_f) sale en orden de streaming variable: se compara aparte, por DOM.
  html = html.replace(/<script>self\.__next_f\.push\([\s\S]*?<\/script>/g, "<RSC/>");
  // Clave de idempotencia por visita (uuid aleatorio): no es render.
  html = html.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "UUID");
  out[`${host}${ruta}`] = { status: r.status, location: r.location, bytes: r.body.length, huella: sha(html), recursos: Object.values(recursos).sort(), html };
}
writeFileSync(salida, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(24), v.status, String(v.bytes).padStart(7), v.huella, v.location ?? "");
