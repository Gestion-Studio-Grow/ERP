// BACK DEL TURNERO — Break Point Pádel. Node puro (sin dependencias), separado del front.
//
//   node src/tenants/breakpoint/turnero/back/servidor.mjs        → http://localhost:8787
//
// Contrato de la API: docs/tenants/breakpoint/TURNERO-API.md (cada ruta de acá está ahí, con sus errores).
// Variables (todas opcionales en DEMO; las reales las carga el dueño post-venta, nunca el agente):
//   PORT · TURNERO_ORIGENES (orígenes del front, separados por coma) · TURNERO_STAFF_CLAVE (clave del backoffice;
//   si falta se genera una al azar y se imprime UNA vez en la consola) · GOOGLE_CLIENT_ID · WHATSAPP_APP_SECRET ·
//   WHATSAPP_VERIFY_TOKEN · WHATSAPP_TOKEN · WHATSAPP_PHONE_ID · TURNERO_WHATSAPP_CLUB (número del club) ·
//   TURNERO_URL (link público del turnero, para los mensajes) · TURNERO_SEGURO=1 (cookies Secure, detrás de HTTPS).
//   TURNERO_MODO=demo|real (por defecto demo). En REAL el back NO arranca si falta un secreto (nada de "medio demo"
//   en silencio) y ningún comprobante confirma solo: todo va a la bandeja hasta verlo acreditado.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { crearTurnero } from "../../../../../public/previews/breakpoint/turnero/dominio/nucleo.mjs";
import { crearLimitador, crearSesiones, leerCookies, cookieSesion, verificarIdTokenGoogle, jwksDeGoogle, hashClave, verificarClave } from "./auth.mjs";
import { verificarFirma, verificarSuscripcion, extraerMensajes, payloadCloud, firmar, crearCanalDemo, crearCanalCloud, crearLectorDemo } from "./whatsapp.mjs";

const json = (res, status, cuerpo, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(cuerpo));
};
const igualSeguro = (a, b) => { const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? "")); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Arma la app HTTP. Todo inyectable (los tests levantan una instancia con reloj y secretos propios).
 * Devuelve { servidor, turnero, cerrar, staffClave, secretoWhatsApp }.
 */
export function crearApp({
  entorno = process.env,
  reloj = () => Date.now(),
  turnero: turneroInyectado,
  obtenerJwks,
  tickMs = 30000,
  log = (...a) => console.log(...a),
} = {}) {
  const real = entorno.TURNERO_MODO === "real";
  if (real) {
    const faltan = ["GOOGLE_CLIENT_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "TURNERO_STAFF_CLAVE", "TURNERO_ORIGENES", "TURNERO_WHATSAPP_CLUB"].filter((k) => !entorno[k]);
    if (faltan.length) throw new Error(`TURNERO_MODO=real sin: ${faltan.join(", ")}. Las credenciales las carga el dueño.`);
  }
  const demo = !real; // en demo todo WhatsApp y Google son simulados
  const canal = demo ? crearCanalDemo({ ahora: reloj }) : crearCanalCloud({ token: entorno.WHATSAPP_TOKEN, phoneId: entorno.WHATSAPP_PHONE_ID });
  const lector = crearLectorDemo();
  const turnero = turneroInyectado ?? crearTurnero({ reloj, canal, lector, urlTurnero: entorno.TURNERO_URL ?? "", claves: { hash: hashClave, verificar: verificarClave }, autoConfirmar: demo });
  const origenes = new Set(String(entorno.TURNERO_ORIGENES ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim()).filter(Boolean));
  const staffClave = entorno.TURNERO_STAFF_CLAVE || randomBytes(9).toString("base64url");
  const secretoWhatsApp = entorno.WHATSAPP_APP_SECRET || randomBytes(32).toString("hex"); // demo: secreto efímero
  const tokenVerificacion = entorno.WHATSAPP_VERIFY_TOKEN || null;
  const googleClientId = entorno.GOOGLE_CLIENT_ID || null;
  const jwks = obtenerJwks ?? (googleClientId ? jwksDeGoogle() : null);
  const seguro = entorno.TURNERO_SEGURO === "1";
  const ahoraMs = reloj;

  const sesiones = crearSesiones({ ahora: ahoraMs });
  const sesionesStaff = crearSesiones({ duracionMs: 12 * 3600000, ahora: ahoraMs });
  const limIpAuth = crearLimitador({ maximo: 30, ventanaMs: 15 * 60000, ahora: ahoraMs });
  const limUsuario = crearLimitador({ maximo: 5, ventanaMs: 15 * 60000, ahora: ahoraMs });
  // General por IP con techo alto: en el Wi-Fi del club decenas de jugadores salen por la misma IP (como SEC-4).
  const limApi = crearLimitador({ maximo: 1200, ventanaMs: 60000, ahora: ahoraMs });
  const limStaff = crearLimitador({ maximo: 5, ventanaMs: 15 * 60000, ahora: ahoraMs });

  const ipDe = (req) => req.socket.remoteAddress ?? "?";
  const usuarioDe = (req) => { const s = sesiones.leer(leerCookies(req.headers.cookie).bp_sesion); return s ? turnero.usuario(s.usuarioId) : null; };
  const esStaff = (req) => Boolean(sesionesStaff.leer(leerCookies(req.headers.cookie).bp_staff));

  async function leerCuerpo(req, maximo = 64 * 1024) {
    const partes = [];
    let total = 0;
    for await (const p of req) { total += p.length; if (total > maximo) throw Object.assign(new Error("grande"), { status: 413 }); partes.push(p); }
    return Buffer.concat(partes);
  }
  async function leerJson(req) {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw Object.assign(new Error("tipo"), { status: 415 });
    const crudo = await leerCuerpo(req);
    try { return crudo.length ? JSON.parse(crudo.toString("utf8")) : {}; } catch { throw Object.assign(new Error("json"), { status: 400 }); }
  }

  const ssePorIp = new Map();
  function sse(req, res, canales) {
    const ip = ipDe(req);
    if ((ssePorIp.get(ip) ?? 0) >= 30) return json(res, 429, { ok: false, motivo: "Demasiadas pestañas abiertas." });
    ssePorIp.set(ip, (ssePorIp.get(ip) ?? 0) + 1);
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(`retry: 3000\n: hola\n\n`);
    const enviar = (tipo, datos) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`);
    const bajas = canales.map((c) => turnero.suscribir(c, enviar));
    enviar("version", { version: turnero.version() });
    const latido = setInterval(() => res.write(`: latido\n\n`), 25000);
    req.on("close", () => { clearInterval(latido); bajas.forEach((b) => b()); const n = (ssePorIp.get(ip) ?? 1) - 1; if (n > 0) ssePorIp.set(ip, n); else ssePorIp.delete(ip); });
  }

  function iniciarSesion(res, usuario, status = 200) {
    const id = sesiones.crear(usuario.id);
    json(res, status, { ok: true, usuario: turnero.perfil(usuario) }, { "Set-Cookie": cookieSesion("bp_sesion", id, { maxAge: sesiones.duracionSeg, seguro }) });
  }

  /** Entrada de un webhook de WhatsApp (real o simulado): firma → mensajes → conciliación. */
  async function procesarWebhook(crudo, firma) {
    if (!verificarFirma(crudo, firma, secretoWhatsApp)) return { status: 401, cuerpo: { ok: false, motivo: "Firma inválida." } };
    let payload;
    try { payload = JSON.parse(crudo.toString("utf8")); } catch { return { status: 400, cuerpo: { ok: false } }; }
    const resultados = [];
    for (const m of extraerMensajes(payload)) resultados.push(await turnero.procesarMensaje(m));
    return { status: 200, cuerpo: { ok: true, resultados } };
  }

  const rutas = [];
  const ruta = (metodo, patron, fn, opciones = {}) => rutas.push({ metodo, patron: new RegExp(`^${patron}$`), fn, ...opciones });

  // ───────────── públicas ─────────────
  ruta("GET", "/api/salud", (req, res) => json(res, 200, { ok: true, demo, version: turnero.version() }));
  ruta("GET", "/api/turnero/config", (req, res) => json(res, 200, {
    ...turnero.config(), demo,
    google: { clientId: demo ? null : googleClientId, demo },
    whatsapp: { numero: entorno.TURNERO_WHATSAPP_CLUB || null, demo },
  }));
  ruta("GET", "/api/turnero/disponibilidad", (req, res, { url }) => {
    const p = url.searchParams;
    const r = turnero.disponibilidad({ fecha: p.get("fecha"), duracion: Number(p.get("duracion") ?? 90), techadas: p.get("techadas") === "1" });
    json(res, r.ok ? 200 : 400, r);
  });
  ruta("GET", "/api/turnero/eventos", (req, res) => {
    const u = usuarioDe(req);
    sse(req, res, u ? ["publico", `usuario:${u.id}`] : ["publico"]);
  });

  // ───────────── ingreso ─────────────
  ruta("POST", "/api/auth/registro", async (req, res, { cuerpo }) => {
    const r = await turnero.registrar(cuerpo);
    if (!r.ok) return json(res, 400, r);
    iniciarSesion(res, r.usuario, 201);
  }, { auth: true });
  ruta("POST", "/api/auth/ingresar", async (req, res, { cuerpo }) => {
    const clave = String(cuerpo.usuario ?? "").trim().toLowerCase().replace(/\s/g, "");
    if (limUsuario.bloqueado(clave)) return json(res, 429, { ok: false, motivo: `Demasiados intentos. Probá de nuevo en ${Math.ceil(limUsuario.espera(clave) / 60)} minutos.` });
    const r = await turnero.ingresar(cuerpo);
    if (!r.ok) { limUsuario.golpe(clave); return json(res, 401, r); }
    limUsuario.reiniciar(clave);
    iniciarSesion(res, r.usuario);
  }, { auth: true });
  ruta("POST", "/api/auth/google", async (req, res, { cuerpo }) => {
    if (demo) {
      // DEMO: Google simulado (no hay client id). Se dice en la respuesta para que el front lo muestre.
      const r = turnero.ingresarGoogleDemo(Number(cuerpo.cuentaDemo ?? 0));
      return iniciarSesion(res, r.usuario);
    }
    const v = await verificarIdTokenGoogle(cuerpo.credential, { clientId: googleClientId, obtenerJwks: jwks, ahoraSeg: () => Math.floor(ahoraMs() / 1000) });
    if (!v.ok) return json(res, 401, { ok: false, motivo: "No pudimos validar tu cuenta de Google. Probá de nuevo." });
    iniciarSesion(res, turnero.ingresarConGoogle(v.perfil).usuario);
  }, { auth: true });
  ruta("POST", "/api/auth/salir", (req, res) => {
    sesiones.cerrar(leerCookies(req.headers.cookie).bp_sesion);
    json(res, 200, { ok: true }, { "Set-Cookie": cookieSesion("bp_sesion", "", { maxAge: 0, seguro }) });
  });
  ruta("GET", "/api/auth/yo", (req, res) => { const u = usuarioDe(req); json(res, 200, { ok: true, usuario: turnero.perfil(u) }); });
  ruta("POST", "/api/auth/celular", (req, res, { cuerpo, usuario }) => {
    const r = turnero.cargarCelular(usuario.id, cuerpo.tel);
    json(res, r.ok ? 200 : 400, r.ok ? { ok: true, usuario: turnero.perfil(r.usuario) } : r);
  }, { sesion: true });

  // ───────────── reservas del cliente ─────────────
  ruta("GET", "/api/turnero/reservas", (req, res, { usuario }) => json(res, 200, { ok: true, reservas: turnero.misReservas(usuario.id) }), { sesion: true });
  // Idempotency-Key: si el celu reintenta (red mala, doble toque), se devuelve la MISMA respuesta y no se crea otro
  // turno (dolor "me cobraron dos veces"). Se guarda 24 h por usuario + clave.
  const idem = new Map();
  ruta("POST", "/api/turnero/reservas", (req, res, { cuerpo, usuario }) => {
    const k = String(req.headers["idempotency-key"] ?? "").slice(0, 80);
    const ki = k ? `${usuario.id}:${k}` : null;
    const previa = ki ? idem.get(ki) : null;
    if (previa && previa.vence > ahoraMs()) return json(res, previa.status, previa.cuerpo, { "Idempotent-Replay": "true" });
    const r = turnero.reservar(usuario.id, cuerpo);
    const status = r.ok ? 201 : r.codigo ?? 400;
    if (ki && status < 500) { idem.set(ki, { status, cuerpo: r, vence: ahoraMs() + 86400000 }); if (idem.size > 10000) idem.delete(idem.keys().next().value); }
    json(res, status, r);
  }, { sesion: true });
  ruta("DELETE", "/api/turnero/reservas/([\\w-]{1,40})", (req, res, { usuario, m }) => {
    const r = turnero.cancelarReserva(usuario.id, m[1]);
    json(res, r.ok ? 200 : r.codigo ?? 400, r);
  }, { sesion: true });
  ruta("POST", "/api/turnero/espera", (req, res, { cuerpo, usuario }) => {
    const r = turnero.anotarEnEspera(usuario.id, cuerpo);
    json(res, r.ok ? 201 : r.codigo ?? 400, r);
  }, { sesion: true });

  // DEMO: el cliente "manda" un comprobante. Entra por el MISMO webhook firmado que usará WhatsApp de verdad.
  ruta("POST", "/api/turnero/reservas/([\\w-]{1,40})/simular-comprobante", async (req, res, { cuerpo, usuario, m }) => {
    if (!demo) return json(res, 404, { ok: false });
    const c = turnero.comprobanteDemo(usuario.id, m[1], cuerpo.variante);
    if (!c.ok) return json(res, 404, c);
    const { texto, de } = c;
    const id = `wamid.DEMO${randomBytes(8).toString("hex")}`;
    let payload;
    if (c.imagen) {
      const mediaId = `media-demo-${randomBytes(6).toString("hex")}`;
      lector.guardarMedio(mediaId, texto, 0.9);
      payload = payloadCloud({ de, id, mediaId, texto: "" });
    } else payload = payloadCloud({ de, id, texto });
    const crudo = Buffer.from(JSON.stringify(payload));
    const out = await procesarWebhook(crudo, firmar(crudo, secretoWhatsApp));
    json(res, out.status, out.cuerpo);
  }, { sesion: true });

  // ───────────── webhook de WhatsApp Cloud ─────────────
  ruta("GET", "/api/whatsapp/webhook", (req, res, { url }) => {
    const v = verificarSuscripcion(url.searchParams, tokenVerificacion);
    if (!v.ok) return json(res, 403, { ok: false });
    res.writeHead(200, { "Content-Type": "text/plain" }); res.end(v.challenge);
  }, { sinOrigen: true });
  ruta("POST", "/api/whatsapp/webhook", async (req, res) => {
    const crudo = await leerCuerpo(req, 256 * 1024);
    const out = await procesarWebhook(crudo, req.headers["x-hub-signature-256"]);
    json(res, out.status, out.cuerpo);
  }, { sinOrigen: true, crudo: true });

  // ───────────── backoffice conectado (staff) ─────────────
  ruta("POST", "/api/staff/ingresar", (req, res, { cuerpo }) => {
    const ip = ipDe(req);
    if (limStaff.bloqueado(ip)) return json(res, 429, { ok: false, motivo: "Demasiados intentos. Esperá unos minutos." });
    if (!igualSeguro(cuerpo.clave, staffClave)) { limStaff.golpe(ip); return json(res, 401, { ok: false, motivo: "Clave del club incorrecta." }); }
    limStaff.reiniciar(ip);
    const id = sesionesStaff.crear("staff");
    json(res, 200, { ok: true }, { "Set-Cookie": cookieSesion("bp_staff", id, { maxAge: sesionesStaff.duracionSeg, seguro }) });
  });
  ruta("GET", "/api/staff/sesion", (req, res) => json(res, 200, { ok: true, staff: esStaff(req) }));
  ruta("GET", "/api/staff/estado", (req, res) => json(res, 200, { ok: true, estado: turnero.snapshot(), version: turnero.version(), ahora: turnero.ahora() }), { staff: true });
  ruta("GET", "/api/staff/eventos", (req, res) => sse(req, res, ["staff"]), { staff: true });
  ruta("POST", "/api/staff/sync", (req, res, { cuerpo }) => { const r = turnero.sincronizar(cuerpo); json(res, r.rechazadas.length ? 409 : 200, r); }, { staff: true, limite: 4 * 1024 * 1024 });
  ruta("GET", "/api/staff/revisiones", (req, res) => json(res, 200, { ok: true, revisiones: turnero.revisiones() }), { staff: true });
  ruta("POST", "/api/staff/revisiones/(rv\\d{1,6})", async (req, res, { cuerpo, m }) => {
    const r = await turnero.resolverRevision(m[1], { aprobar: Boolean(cuerpo.aprobar), reservaId: cuerpo.reservaId });
    json(res, r.ok ? 200 : r.codigo ?? 400, r);
  }, { staff: true });
  ruta("GET", "/api/staff/buzon", (req, res) => json(res, 200, { ok: true, mensajes: canal.buzon?.() ?? [] }), { staff: true });

  // ───────────── despacho ─────────────
  const servidor = createServer(async (req, res) => {
    const origen = req.headers.origin;
    const permitido = origen && origenes.has(origen);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Vary", "Origin");
    if (permitido) {
      res.setHeader("Access-Control-Allow-Origin", origen);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    try {
      const url = new URL(req.url, "http://x");
      if (req.method === "OPTIONS") {
        if (!permitido) return json(res, 403, { ok: false });
        res.writeHead(204, { "Access-Control-Allow-Methods": "GET,POST,DELETE", "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key", "Access-Control-Max-Age": "600" });
        return res.end();
      }
      const ip = ipDe(req);
      if (limApi.golpe(ip) > 1200) return json(res, 429, { ok: false, motivo: "Demasiadas consultas seguidas. Esperá un minuto." }, { "Retry-After": "60" });
      const r = rutas.find((x) => x.metodo === req.method && x.patron.test(url.pathname));
      if (!r) return json(res, 404, { ok: false, motivo: "No existe." });
      // CSRF: todo lo que escribe (menos el webhook, que trae firma) tiene que venir de un origen permitido.
      if (req.method !== "GET" && !r.sinOrigen && !permitido) return json(res, 403, { ok: false, motivo: "Origen no permitido." });
      // Por IP cuentan sólo los FALLOS: en el Wi-Fi del club muchos jugadores salen por la misma IP.
      if (r.auth && limIpAuth.bloqueado(ip)) return json(res, 429, { ok: false, motivo: "Demasiados intentos desde esta conexión. Probá en unos minutos." });
      const ctx = { url, m: url.pathname.match(r.patron) };
      if (r.sesion) { ctx.usuario = usuarioDe(req); if (!ctx.usuario) return json(res, 401, { ok: false, motivo: "Ingresá para seguir." }); }
      if (r.staff && !esStaff(req)) return json(res, 401, { ok: false, motivo: "Sólo para el club." });
      if (!r.crudo && (req.method === "POST" || req.method === "DELETE") && req.headers["content-type"]) {
        if (r.limite) { const crudo = await leerCuerpo(req, r.limite); ctx.cuerpo = crudo.length ? JSON.parse(crudo.toString("utf8")) : {}; }
        else ctx.cuerpo = await leerJson(req);
      } else ctx.cuerpo ??= {};
      if (req.method === "POST" && !r.crudo && !req.headers["content-type"]) return json(res, 415, { ok: false, motivo: "Mandá JSON." });
      await r.fn(req, res, ctx);
      if (r.auth && res.statusCode >= 400) limIpAuth.golpe(ip);
    } catch (e) {
      const status = e.status ?? (e instanceof SyntaxError ? 400 : 500);
      if (status === 500) log("[turnero] error:", e.message); // sin cuerpos ni datos personales en el log
      if (!res.headersSent) json(res, status, { ok: false, motivo: status === 500 ? "Algo falló de nuestro lado. Probá de nuevo." : "Pedido inválido." });
      else res.end();
    }
  });

  const reloj30 = tickMs > 0 ? setInterval(() => turnero.tick(), tickMs) : null;
  reloj30?.unref?.();
  return {
    servidor, turnero, staffClave, secretoWhatsApp, canal, lector,
    cerrar: () => new Promise((ok) => { if (reloj30) clearInterval(reloj30); servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
  };
}

// Arranque directo: `node servidor.mjs`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const puerto = Number(process.env.PORT ?? 8787);
  const app = crearApp();
  app.servidor.listen(puerto, () => {
    console.log(`Turnero Break Point — back en http://localhost:${puerto} (${app.canal.tipo === "demo" ? "DEMO: WhatsApp y Google simulados, nada se guarda" : "WhatsApp Cloud"})`);
    if (!process.env.TURNERO_STAFF_CLAVE) console.log(`Clave del backoffice para esta corrida (no se guarda): ${app.staffClave}`);
  });
}
