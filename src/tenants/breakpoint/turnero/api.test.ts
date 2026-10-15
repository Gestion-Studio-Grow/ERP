// Tests de integración del CONTRATO front ↔ back del turnero (docs/tenants/breakpoint/TURNERO-API.md):
// se levanta el back de verdad en un puerto libre y se le habla por HTTP, como el front.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as servidorMod from "./back/servidor.mjs";
import * as waMod from "./back/whatsapp.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- módulos JS planos (Node los carga sin build); se usan sin tipar */
const S: any = servidorMod;
const W: any = waMod;

const ORIGEN = "http://localhost:5173";
let app: any, base = "";
before(async () => {
  app = S.crearApp({ entorno: { TURNERO_ORIGENES: ORIGEN, TURNERO_STAFF_CLAVE: "clave-del-club", WHATSAPP_VERIFY_TOKEN: "tk-verif" }, tickMs: 0, log: () => {} });
  await new Promise<void>((ok) => app.servidor.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${app.servidor.address().port}`;
});
after(() => app.cerrar());

/** Un "navegador": guarda la cookie y manda el Origin del front. */
function cliente(origen: string | null = ORIGEN) {
  let cookie = "";
  return async (metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(origen && { Origin: origen }), ...(cuerpo !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }), ...extra },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const texto = await r.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { /* texto plano */ }
    return { status: r.status, json, headers: r.headers, setCookie: sc, texto };
  };
}
let n = 40000000;
async function jugador(nombre = "Ana Test") {
  const c = cliente();
  const r = await c("POST", "/api/auth/registro", { nombre, tel: `11${++n}`, clave: "canchaazul9" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return c;
}
async function huecoLibre(c: any, offset = 1) {
  const cfg = (await c("GET", "/api/turnero/config")).json;
  const fecha = cfg.dias[offset].fecha;
  const d = (await c("GET", `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90`)).json;
  return { fecha, s: d.slots.at(-1) };
}

test("GET /api/turnero/config: datos públicos del club, cuentas ficticias rotuladas, Google y WhatsApp en modo demo", async () => {
  const r = await cliente()("GET", "/api/turnero/config");
  assert.equal(r.status, 200);
  assert.equal(r.json.dias.length, 14);
  assert.match(r.json.cuentas.titular, /DEMO/);
  assert.deepEqual(r.json.google, { clientId: null, demo: true });
  assert.equal(r.json.whatsapp.numero, null); // DX-4: sin número inventado
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("CORS: sólo el origen del front recibe permiso con credenciales; un origen ajeno no puede escribir", async () => {
  const ok = await cliente()("GET", "/api/salud");
  assert.equal(ok.headers.get("access-control-allow-origin"), ORIGEN);
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
  const ajeno = cliente("https://evil.example");
  assert.equal((await ajeno("GET", "/api/salud")).headers.get("access-control-allow-origin"), null);
  assert.equal((await ajeno("POST", "/api/auth/registro", { nombre: "x", tel: "1144445555", clave: "canchaazul9" })).status, 403);
  assert.equal((await cliente(null)("POST", "/api/auth/salir", {})).status, 403); // sin Origin tampoco (CSRF)
  const pre = await fetch(`${base}/api/turnero/reservas`, { method: "OPTIONS", headers: { Origin: ORIGEN, "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/);
});

test("POST sin JSON → 415; JSON roto → 400; ruta inexistente → 404 (sin detalles internos)", async () => {
  const r = await fetch(`${base}/api/auth/ingresar`, { method: "POST", headers: { Origin: ORIGEN, "Content-Type": "text/plain" }, body: "x" });
  assert.equal(r.status, 415);
  const roto = await fetch(`${base}/api/auth/ingresar`, { method: "POST", headers: { Origin: ORIGEN, "Content-Type": "application/json" }, body: "{" });
  assert.equal(roto.status, 400);
  assert.equal((await cliente()("GET", "/api/nada")).status, 404);
});

test("registro → cookie de sesión HttpOnly/SameSite=Lax; /api/auth/yo la reconoce; salir la invalida", async () => {
  const c = cliente();
  const r = await c("POST", "/api/auth/registro", { nombre: "Caro Sesión", tel: "1155556666", clave: "canchaazul9" });
  assert.equal(r.status, 201);
  assert.match(String(r.setCookie), /bp_sesion=.+; Path=\/; HttpOnly; SameSite=Lax/);
  assert.ok(!JSON.stringify(r.json).includes("canchaazul9") && !JSON.stringify(r.json).includes("scrypt"));
  assert.equal((await c("GET", "/api/auth/yo")).json.usuario.nombre, "Caro Sesión");
  await c("POST", "/api/auth/salir", {});
  assert.equal((await c("GET", "/api/auth/yo")).json.usuario, null);
});

test("ingreso con contraseña: error genérico (no dice si existe) y bloqueo al 5.º intento fallido", async () => {
  await jugador("Lu Bloqueo");
  const c = cliente();
  const usuario = `11${n}`;
  const inexistente = await c("POST", "/api/auth/ingresar", { usuario: "1199990000", clave: "lo-que-sea" });
  const malaClave = await c("POST", "/api/auth/ingresar", { usuario, clave: "otra-clave" });
  assert.equal(inexistente.json.motivo, malaClave.json.motivo);
  for (let i = 0; i < 4; i++) await c("POST", "/api/auth/ingresar", { usuario, clave: "otra-clave" });
  const bloqueado = await c("POST", "/api/auth/ingresar", { usuario, clave: "canchaazul9" });
  assert.equal(bloqueado.status, 429);
  assert.match(bloqueado.json.motivo, /Demasiados intentos/);
});

test("Google en demo: entra con la cuenta simulada (sin client id no se acepta ningún token real)", async () => {
  const c = cliente();
  const r = await c("POST", "/api/auth/google", { cuentaDemo: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.json.usuario.google, true);
});

test("reservar exige sesión; disponibilidad pública no", async () => {
  const anonimo = cliente();
  const { fecha, s } = await huecoLibre(anonimo);
  assert.ok(s);
  assert.equal((await anonimo("POST", "/api/turnero/reservas", { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 })).status, 401);
  assert.equal((await anonimo("GET", "/api/turnero/reservas")).status, 401);
});

test("concurrencia (DB-4): 20 jugadores tocan el mismo turno a la vez → exactamente 1 reserva", async () => {
  const jugadores = await Promise.all(Array.from({ length: 20 }, (_, i) => jugador(`Jugador ${i}`)));
  const { fecha, s } = await huecoLibre(jugadores[0], 2);
  const res = await Promise.all(jugadores.map((c) => c("POST", "/api/turnero/reservas", { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 })));
  assert.equal(res.filter((r) => r.status === 201).length, 1);
  assert.ok(res.filter((r) => r.status === 409).every((r) => Array.isArray(r.json.alternativas) && !/Jugador/.test(r.json.motivo)));
});

test("Idempotency-Key: el reintento devuelve la misma reserva, no crea otra", async () => {
  const c = await jugador("Idem Potente");
  const { fecha, s } = await huecoLibre(c, 3);
  const cuerpo = { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 };
  const a = await c("POST", "/api/turnero/reservas", cuerpo, { "Idempotency-Key": "k-123" });
  const b = await c("POST", "/api/turnero/reservas", cuerpo, { "Idempotency-Key": "k-123" });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(b.headers.get("idempotent-replay"), "true");
  assert.equal(a.json.reserva.id, b.json.reserva.id);
  assert.equal((await c("GET", "/api/turnero/reservas")).json.reservas.length, 1);
});

test("webhook de WhatsApp: sin firma o con firma de otro secreto → 401; verificación de suscripción con token", async () => {
  const cuerpo = JSON.stringify(W.payloadCloud({ de: "5491100000000", id: "wamid.x1", texto: "Monto $ 1.000" }));
  const sin = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo });
  assert.equal(sin.status, 401);
  const mal = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": W.firmar(Buffer.from(cuerpo), "otro") }, body: cuerpo });
  assert.equal(mal.status, 401);
  const ok = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": W.firmar(Buffer.from(cuerpo), app.secretoWhatsApp) }, body: cuerpo });
  assert.equal(ok.status, 200);
  const v = await fetch(`${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=tk-verif&hub.challenge=777`);
  assert.equal(await v.text(), "777");
  assert.equal((await fetch(`${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=1`)).status, 403);
});

/** Lee eventos SSE hasta que `hasta` diga basta (o se agote el tiempo). */
async function escuchar(ruta: string, cookie: string, hasta: (eventos: { tipo: string; datos: any }[]) => boolean, ms = 4000) {
  const ctl = new AbortController();
  const r = await fetch(base + ruta, { headers: { Origin: ORIGEN, ...(cookie && { Cookie: cookie }) }, signal: ctl.signal });
  assert.match(r.headers.get("content-type") ?? "", /text\/event-stream/);
  const eventos: { tipo: string; datos: any }[] = [];
  const lector = r.body!.getReader();
  const fin = setTimeout(() => ctl.abort(), ms);
  let buf = "";
  try {
    while (!hasta(eventos)) {
      const { value, done } = await lector.read();
      if (done) break;
      buf += Buffer.from(value).toString("utf8");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
        const tipo = /^event: (.+)$/m.exec(bloque)?.[1], datos = /^data: (.+)$/m.exec(bloque)?.[1];
        if (tipo && datos) eventos.push({ tipo, datos: JSON.parse(datos) });
      }
    }
  } catch { /* abortado */ } finally { clearTimeout(fin); ctl.abort(); }
  return eventos;
}

test("tiempo real + WhatsApp de punta a punta: reservar → SSE público y del backoffice; comprobante simulado por el webhook → turno firme en vivo", async () => {
  // Backoffice: ingresa con la clave del club (cookie de staff aparte).
  const staff = cliente();
  assert.equal((await staff("POST", "/api/staff/ingresar", { clave: "mala" })).status, 401);
  const ing = await staff("POST", "/api/staff/ingresar", { clave: "clave-del-club" });
  assert.equal(ing.status, 200);
  const cookieStaff = String(ing.setCookie).split(";")[0];
  assert.equal((await cliente()("GET", "/api/staff/estado")).status, 401); // un jugador no ve la agenda completa

  const c = cliente();
  const reg = await c("POST", "/api/auth/registro", { nombre: "Vivo Test", tel: "1177778888", clave: "canchaazul9" });
  const cookieJugador = String(reg.setCookie).split(";")[0];
  const { fecha, s } = await huecoLibre(c, 4);

  const publico = escuchar("/api/turnero/eventos", "", (ev) => ev.some((e) => e.tipo === "disponibilidad"));
  const delStaff = escuchar("/api/staff/eventos", cookieStaff, (ev) => ev.some((e) => e.tipo === "reserva" && e.datos.motivo === "sena-confirmada"), 6000);
  const delJugador = escuchar("/api/turnero/eventos", cookieJugador, (ev) => ev.some((e) => e.tipo === "mi-reserva" && e.datos.reserva.estado === "firme"), 6000);
  await new Promise((ok) => setTimeout(ok, 150));

  const r = await c("POST", "/api/turnero/reservas", { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 });
  assert.equal(r.json.reserva.estado, "pendiente");
  const pub = await publico;
  const disp = pub.find((e) => e.tipo === "disponibilidad");
  assert.equal(disp?.datos.fecha, fecha);
  assert.ok(!JSON.stringify(pub).includes("Vivo Test")); // el canal público no lleva nombres

  const sim = await c("POST", `/api/turnero/reservas/${r.json.reserva.id}/simular-comprobante`, { variante: "ok" });
  assert.equal(sim.json.resultados[0].decision, "confirmar");
  const evStaff = await delStaff, evJug = await delJugador;
  assert.ok(evStaff.some((e) => e.tipo === "reserva" && e.datos.reserva.origen === "web"));
  assert.ok(evJug.some((e) => e.tipo === "mi-reserva" && e.datos.reserva.estado === "firme"));
  const buzon = (await staff("GET", "/api/staff/buzon")).json.mensajes;
  assert.ok(buzon.some((m: any) => /quedó firme/.test(m.texto) && /^••• \d{4}$/.test(m.a)));
});

test("comprobante simulado a una cuenta ajena → rechazado; en imagen (OCR simulado) → confirmado", async () => {
  const c = await jugador("Varios Comprobantes");
  const { fecha, s } = await huecoLibre(c, 5);
  const r = (await c("POST", "/api/turnero/reservas", { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 })).json.reserva;
  assert.equal((await c("POST", `/api/turnero/reservas/${r.id}/simular-comprobante`, { variante: "ajeno" })).json.resultados[0].decision, "rechazar");
  assert.equal((await c("POST", `/api/turnero/reservas/${r.id}/simular-comprobante`, { variante: "imagen" })).json.resultados[0].decision, "confirmar");
});

test("backoffice conectado: lo que el mostrador sincroniza aparece en el turnero; lo que pisa una reserva web vuelve 409", async () => {
  const staff = cliente();
  await staff("POST", "/api/staff/ingresar", { clave: "clave-del-club" });
  const { estado } = (await staff("GET", "/api/staff/estado")).json;
  const c = await jugador("Choque Web");
  const { fecha, s } = await huecoLibre(c, 6);
  const web = (await c("POST", "/api/turnero/reservas", { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 })).json.reserva;
  const otro = (await c("GET", `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90`)).json.slots[0];
  const base0 = { fecha, duracion: 90, tipo: "turno", titular: "Por teléfono", origen: "mostrador", jugadores: [], pagos: [], sena: { monto: 0, pagada: false }, precio: 30000, estado: "reservada" };
  const ok = await staff("POST", "/api/staff/sync", { puesto: "p1", reservas: [{ ...base0, id: "bt-1", canchaId: otro.canchaId, inicio: otro.inicio }] });
  assert.equal(ok.status, 200);
  assert.ok(!(await c("GET", `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90`)).json.slots.some((x: any) => x.canchaId === otro.canchaId && x.inicio === otro.inicio));
  const choque = await staff("POST", "/api/staff/sync", { reservas: [{ ...base0, id: "bt-2", canchaId: web.canchaId, inicio: web.inicio }] });
  assert.equal(choque.status, 409);
  assert.match(choque.json.rechazadas[0].motivo, /web/);
  assert.ok(Array.isArray(estado.reservas));
});

test("Gate 4: TURNERO_MODO=real sin los secretos no arranca (nada de «medio demo» en silencio)", () => {
  assert.throws(() => S.crearApp({ entorno: { TURNERO_MODO: "real", WHATSAPP_TOKEN: "x" }, tickMs: 0, log: () => {} }), /TURNERO_MODO=real sin: GOOGLE_CLIENT_ID/);
});

test("Gate (menor): una cookie mal formada no tira un 500", async () => {
  const r = await fetch(`${base}/api/auth/yo`, { headers: { Cookie: "bp_sesion=%E0%A4%A" } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).usuario, null);
});

test("D22: en modo real el número de WhatsApp del club es obligatorio (si no, el comprobante no tiene destinatario)", () => {
  const entorno = { TURNERO_MODO: "real", GOOGLE_CLIENT_ID: "x", WHATSAPP_APP_SECRET: "x", WHATSAPP_VERIFY_TOKEN: "x", WHATSAPP_TOKEN: "x", WHATSAPP_PHONE_ID: "x", TURNERO_STAFF_CLAVE: "x", TURNERO_ORIGENES: "https://club.example" };
  assert.throws(() => S.crearApp({ entorno, tickMs: 0, log: () => {} }), /TURNERO_WHATSAPP_CLUB/);
});
