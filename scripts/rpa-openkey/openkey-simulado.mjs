#!/usr/bin/env node
// OpenKey SIMULADO: servidor HTTP en node puro (sin dependencias) para desarrollar y probar el RPA de
// bajas de vouchers sin tocar el OpenKey real (no hay acceso ni autorización de CH todavía).
// ============================================================================
// Imita lo mínimo que el RPA usa: login usuario/clave con cookie de sesión, listado de vouchers con
// estado, búsqueda por número, «Dar de baja» con pantalla de confirmación. Estado EN MEMORIA, sembrado
// desde un JSON. Puede inyectar fallas para probar reintentos y relogin:
//   tipo  : 500 | timeout | sesion | timeout-tras-aplicar (aplica la baja y no responde)
//   ruta  : login | listado | confirmar | baja | *
//   veces : n | siempre      numero (opcional): sólo para ese voucher
// Por env  OPENKEY_SIM_FALLAS="500:listado:1,timeout-tras-aplicar:baja:1:V002"
// Por query GET /__sim/fallar?tipo=500&ruta=baja&veces=siempre&numero=V002
// Estado y contadores (para los tests): GET /__sim/estado
//
// Uso local:  node scripts/rpa-openkey/openkey-simulado.mjs --puerto 4010 --semilla scripts/rpa-openkey/semilla-simulado.json
// Credenciales del simulado: OPENKEY_SIM_USUARIO / OPENKEY_SIM_CLAVE (por defecto «simulado» / «simulado»).

import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TIPOS = new Set(["500", "timeout", "sesion", "timeout-tras-aplicar"]);
const RUTAS = new Set(["login", "listado", "confirmar", "baja", "*"]);

/** "500:listado:2,timeout:baja:1:V002" → reglas. Las mal escritas se ignoran (y se avisa). */
export function parsearFallas(texto) {
  const reglas = [];
  for (const parte of String(texto ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [tipo, ruta = "*", veces = "1", numero] = parte.split(":");
    const regla = crearRegla({ tipo, ruta, veces, numero });
    if (regla) reglas.push(regla);
    else console.error(`[simulado] falla ignorada (mal escrita): ${parte}`);
  }
  return reglas;
}

function crearRegla({ tipo, ruta = "*", veces = "1", numero }) {
  if (!TIPOS.has(String(tipo)) || !RUTAS.has(String(ruta))) return null;
  const n = veces === "siempre" || veces === Infinity ? Infinity : Number(veces);
  if (!(n > 0)) return null;
  return { tipo: String(tipo), ruta: String(ruta), veces: n, numero: numero ? normalizar(numero) : null };
}

function normalizar(n) {
  return String(n ?? "").replace(/\s+/g, "").toUpperCase();
}

function html(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function pagina(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${html(titulo)} · OpenKey (simulado)</title></head><body><header><strong>OpenKey</strong> <small>simulado</small></header><main>${cuerpo}</main></body></html>`;
}

/**
 * Crea el simulado (sin escuchar todavía). `vouchers`: [{ numero, estado: Disponible|Usado|Anulado }].
 * Devuelve { escuchar(puerto?) → url, cerrar(), estado(), agregarFalla(regla) }.
 */
export function crearOpenKeySimulado({ vouchers = [], usuario = "simulado", clave = "simulado", fallas = [] } = {}) {
  const datos = new Map();
  for (const v of vouchers) {
    const numero = normalizar(v.numero);
    if (numero) datos.set(numero, { numero, estado: v.estado ?? "Disponible" });
  }
  const sesiones = new Set();
  const reglas = [...fallas];
  const colgados = new Set();
  const stats = { pedidos: 0, logins: 0, loginsFallidos: 0, bajasAplicadas: {}, bajasRepetidas: 0, fallasInyectadas: 0 };

  function tomarFalla(ruta, numero) {
    const r = reglas.find((f) => f.veces > 0 && (f.ruta === "*" || f.ruta === ruta) && (!f.numero || f.numero === numero));
    if (!r) return null;
    r.veces -= 1;
    stats.fallasInyectadas += 1;
    return r.tipo;
  }

  function enviar(res, codigo, cuerpo, extra = {}) {
    res.writeHead(codigo, { "content-type": "text/html; charset=utf-8", ...extra });
    res.end(cuerpo);
  }
  const redirigir = (res, a, extra = {}) => enviar(res, 302, "", { location: a, ...extra });

  function sesionDe(req) {
    const m = /(?:^|;\s*)sesion=([a-f0-9]+)/.exec(req.headers.cookie ?? "");
    return m && sesiones.has(m[1]) ? m[1] : null;
  }

  /** Aplica la falla si la hay. true = ya se respondió (o se colgó) y no hay que seguir. */
  function aplicarFalla(tipo, req, res) {
    if (!tipo) return false;
    if (tipo === "500") {
      enviar(res, 500, pagina("Error", "<h1>Error interno</h1><p>Intentá de nuevo más tarde.</p>"));
      return true;
    }
    if (tipo === "timeout" || tipo === "timeout-tras-aplicar") {
      colgados.add(res);
      res.on("close", () => colgados.delete(res));
      return true; // no responde nunca
    }
    if (tipo === "sesion") {
      const s = sesionDe(req);
      if (s) sesiones.delete(s);
      redirigir(res, "/login?vencida=1");
      return true;
    }
    return false;
  }

  async function leerCuerpo(req) {
    let b = "";
    for await (const c of req) b += c;
    return new URLSearchParams(b);
  }

  const paginaLogin = (q) =>
    pagina(
      "Ingresar",
      `<h1>Ingresar</h1>${q.get("vencida") ? '<p class="aviso">Tu sesión venció. Ingresá de nuevo.</p>' : ""}${
        q.get("error") ? '<p class="error-login" role="alert">Usuario o clave incorrectos.</p>' : ""
      }<form id="login" method="post" action="/login"><label>Usuario <input id="usuario" name="usuario" autocomplete="username"></label><label>Clave <input id="clave" name="clave" type="password" autocomplete="current-password"></label><button id="ingresar" type="submit">Ingresar</button></form>`,
    );

  function filaHtml(v) {
    const accion =
      v.estado === "Disponible"
        ? `<form method="get" action="/vouchers/${encodeURIComponent(v.numero)}/confirmar"><button class="dar-de-baja" type="submit">Dar de baja</button></form>`
        : "";
    return `<tr data-numero="${html(v.numero)}"><td class="numero">${html(v.numero)}</td><td class="estado">${html(v.estado)}</td><td>${accion}</td></tr>`;
  }

  function paginaListado(q) {
    const busqueda = String(q.get("q") ?? "").trim();
    const hecho = q.get("hecho");
    const lista = busqueda ? [datos.get(normalizar(busqueda))].filter(Boolean) : [...datos.values()];
    const tabla = lista.length
      ? `<table><thead><tr><th>Número</th><th>Estado</th><th></th></tr></thead><tbody>${lista.map(filaHtml).join("")}</tbody></table>`
      : '<p class="sin-resultados">No hay vouchers con ese número.</p>';
    return pagina(
      "Vouchers",
      `<h1>Vouchers</h1>${hecho ? `<p id="baja-hecha" role="status">Voucher ${html(hecho)} dado de baja.</p>` : ""}<form id="form-buscar" method="get" action="/vouchers"><label>Número <input id="buscar" name="q" value="${html(busqueda)}"></label><button id="boton-buscar" type="submit">Buscar</button></form><section id="resultados" data-busqueda="${html(busqueda)}">${tabla}</section>`,
    );
  }

  async function manejar(req, res) {
    stats.pedidos += 1;
    const url = new URL(req.url ?? "/", "http://simulado");
    const q = url.searchParams;
    const ruta = url.pathname;

    // ── Control del simulado (sólo para pruebas) ──
    if (ruta === "/__sim/estado") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ vouchers: [...datos.values()], stats }));
    }
    if (ruta === "/__sim/fallar") {
      const r = crearRegla({ tipo: q.get("tipo"), ruta: q.get("ruta") ?? "*", veces: q.get("veces") ?? "1", numero: q.get("numero") });
      if (r) reglas.push(r);
      res.writeHead(r ? 200 : 400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: Boolean(r) }));
    }

    if (ruta === "/") return redirigir(res, "/vouchers");
    if (ruta === "/login" && req.method === "GET") return enviar(res, 200, paginaLogin(q));
    if (ruta === "/login" && req.method === "POST") {
      const cuerpo = await leerCuerpo(req);
      if (aplicarFalla(tomarFalla("login", null), req, res)) return;
      if (cuerpo.get("usuario") === usuario && cuerpo.get("clave") === clave) {
        const token = randomBytes(16).toString("hex");
        sesiones.add(token);
        stats.logins += 1;
        return redirigir(res, "/vouchers", { "set-cookie": `sesion=${token}; HttpOnly; Path=/; SameSite=Lax` });
      }
      stats.loginsFallidos += 1;
      return redirigir(res, "/login?error=1");
    }

    // ── Todo lo demás exige sesión ──
    if (!sesionDe(req)) return redirigir(res, "/login?vencida=1");

    if (ruta === "/vouchers" && req.method === "GET") {
      if (aplicarFalla(tomarFalla("listado", normalizar(q.get("q"))), req, res)) return;
      return enviar(res, 200, paginaListado(q));
    }

    const m = /^\/vouchers\/([^/]+)\/(confirmar|baja)$/.exec(ruta);
    if (m) {
      const numero = normalizar(decodeURIComponent(m[1]));
      const v = datos.get(numero);
      if (m[2] === "confirmar" && req.method === "GET") {
        if (aplicarFalla(tomarFalla("confirmar", numero), req, res)) return;
        if (!v) return enviar(res, 404, pagina("No encontrado", '<p class="sin-resultados">No existe ese voucher.</p>'));
        return enviar(
          res,
          200,
          pagina(
            "Confirmar baja",
            `<h1>¿Dar de baja el voucher ${html(numero)}?</h1><p>No se puede deshacer.</p><form method="post" action="/vouchers/${encodeURIComponent(numero)}/baja"><button id="confirmar-baja" type="submit">Sí, dar de baja</button></form><a href="/vouchers?q=${encodeURIComponent(numero)}">Cancelar</a>`,
          ),
        );
      }
      if (m[2] === "baja" && req.method === "POST") {
        await leerCuerpo(req);
        const falla = tomarFalla("baja", numero);
        if (falla === "timeout-tras-aplicar" && v?.estado === "Disponible") {
          v.estado = "Usado";
          stats.bajasAplicadas[numero] = (stats.bajasAplicadas[numero] ?? 0) + 1;
        }
        if (aplicarFalla(falla, req, res)) return;
        if (!v) return enviar(res, 404, pagina("No encontrado", '<p class="sin-resultados">No existe ese voucher.</p>'));
        if (v.estado !== "Disponible") {
          if (v.estado === "Usado") stats.bajasRepetidas += 1;
          return enviar(res, 409, pagina("Sin cambios", `<p class="error">El voucher ${html(numero)} ya estaba ${html(v.estado.toLowerCase())}.</p>`));
        }
        v.estado = "Usado";
        stats.bajasAplicadas[numero] = (stats.bajasAplicadas[numero] ?? 0) + 1;
        return redirigir(res, `/vouchers?q=${encodeURIComponent(numero)}&hecho=${encodeURIComponent(numero)}`);
      }
    }
    return enviar(res, 404, pagina("No encontrado", "<p>No encontrado.</p>"));
  }

  const server = http.createServer((req, res) => {
    manejar(req, res).catch(() => {
      if (!res.headersSent) enviar(res, 500, pagina("Error", "<p>Error interno.</p>"));
    });
  });

  return {
    /** Escucha en 127.0.0.1 (puerto 0 = uno libre). Devuelve la URL base. */
    escuchar(puerto = 0) {
      return new Promise((ok, mal) => {
        server.once("error", mal);
        server.listen(puerto, "127.0.0.1", () => ok(`http://127.0.0.1:${server.address().port}`));
      });
    },
    cerrar() {
      for (const res of colgados) res.destroy();
      server.closeAllConnections?.();
      return new Promise((ok) => server.close(() => ok()));
    },
    estado: () => ({ vouchers: [...datos.values()].map((v) => ({ ...v })), stats: structuredClone(stats) }),
    agregarFalla(regla) {
      const r = crearRegla(regla);
      if (r) reglas.push(r);
      return Boolean(r);
    },
  };
}

/** Lee la semilla: `[{numero, estado}]` o `{ vouchers: [...] }`. */
export function leerSemilla(ruta) {
  const j = JSON.parse(readFileSync(ruta, "utf8"));
  return Array.isArray(j) ? j : (j.vouchers ?? []);
}

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const semilla = argumento("semilla") ?? process.env.OPENKEY_SIM_SEMILLA;
  const sim = crearOpenKeySimulado({
    vouchers: semilla ? leerSemilla(semilla) : [],
    usuario: process.env.OPENKEY_SIM_USUARIO || "simulado",
    clave: process.env.OPENKEY_SIM_CLAVE || "simulado",
    fallas: parsearFallas(process.env.OPENKEY_SIM_FALLAS),
  });
  const url = await sim.escuchar(Number(argumento("puerto") ?? process.env.OPENKEY_SIM_PUERTO ?? 4010));
  console.log(`OpenKey SIMULADO escuchando en ${url}`);
  const salir = () => sim.cerrar().then(() => process.exit(0));
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
}
