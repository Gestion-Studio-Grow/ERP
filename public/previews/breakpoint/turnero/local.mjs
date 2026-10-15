// SERVIDOR DE DEMO EN EL NAVEGADOR — Turnero de Break Point (demo pública a costo cero, SIN servidor).
//
// El host público es estático: no hay back. Este módulo corre el MISMO núcleo de dominio (dominio/nucleo.mjs sobre el
// motor del club) dentro del navegador y responde el MISMO contrato que el back (docs/tenants/breakpoint/TURNERO-API.md):
// las rutas del jugador y las del club (staff). Nada sale del navegador: ni datos, ni contraseñas, ni comprobantes.
//
// Con varias pestañas abiertas (el turnero en una, la gestión del club en otra), bus.mjs elige UNA que hace de
// servidor y las demás le hablan por BroadcastChannel: así la demo muestra la integración en vivo sin servidor.
import { crearTurnero } from "./dominio/nucleo.mjs";

/**
 * El "back" de la demo. `atender({ tab, metodo, ruta, cuerpo })` devuelve `{ status, ...cuerpo }`.
 * `suscribir(tab, ruta, enviar)` es el SSE: devuelve la función para darse de baja. Las sesiones van por pestaña.
 */
export function crearServidorDemo({ reloj = () => Date.now() } = {}) {
  const buzon = [];
  const medios = new Map();
  const canal = { tipo: "demo", async enviar(tel, texto) { buzon.unshift({ a: `••• ${String(tel).slice(-4)}`, texto, cuando: reloj() }); if (buzon.length > 30) buzon.length = 30; return { ok: true }; } };
  const lector = {
    async leer(m) {
      if (m.mediaId) { const x = medios.get(m.mediaId); medios.delete(m.mediaId); return x ?? { texto: "", confianzaOcr: 0.3 }; }
      return { texto: m.texto ?? "", confianzaOcr: 1 };
    },
  };
  const tn = crearTurnero({ reloj, canal, lector });
  const reloj30 = setInterval(() => tn.tick(), 30000);
  reloj30.unref?.(); // en Node (tests) no mantiene vivo el proceso; en el navegador no existe y no hace falta
  const sesiones = new Map(); // pestaña → id de usuario
  let secMsg = 0;

  const r = (status, cuerpo) => ({ status, ...cuerpo });
  const usuarioDe = (tab) => (sesiones.has(tab) ? tn.usuario(sesiones.get(tab)) : null);
  const conSesion = (tab, fn) => { const u = usuarioDe(tab); return u ? fn(u) : r(401, { ok: false, motivo: "Ingresá para seguir." }); };
  const entrar = (tab, res, status = 200) => { if (!res.ok) return r(400, res); sesiones.set(tab, res.usuario.id); return r(status, { ok: true, usuario: tn.perfil(res.usuario) }); };

  async function atender({ tab, metodo = "GET", ruta, cuerpo = {} }) {
    const url = new URL(ruta, "http://demo");
    const p = url.searchParams, camino = url.pathname;
    let m;
    cuerpo ??= {};
    // ───── jugador ─────
    if (metodo === "GET" && camino === "/api/turnero/config") return r(200, { ...tn.config(), demo: true, local: true, google: { clientId: null, demo: true }, whatsapp: { numero: null, demo: true } });
    if (metodo === "GET" && camino === "/api/auth/yo") { const u = usuarioDe(tab); return r(200, { ok: true, usuario: u ? tn.perfil(u) : null }); }
    if (metodo === "GET" && camino === "/api/turnero/disponibilidad") { const d = tn.disponibilidad({ fecha: p.get("fecha"), duracion: Number(p.get("duracion") ?? 90), techadas: p.get("techadas") === "1" }); return r(d.ok ? 200 : 400, d); }
    if (metodo === "POST" && camino === "/api/auth/registro") return entrar(tab, await tn.registrar(cuerpo), 201);
    if (metodo === "POST" && camino === "/api/auth/ingresar") { const x = await tn.ingresar(cuerpo); return x.ok ? entrar(tab, x) : r(401, x); }
    if (metodo === "POST" && camino === "/api/auth/google") return entrar(tab, tn.ingresarGoogleDemo(Number(cuerpo.cuentaDemo ?? 0)));
    if (metodo === "POST" && camino === "/api/auth/salir") { sesiones.delete(tab); return r(200, { ok: true }); }
    if (metodo === "POST" && camino === "/api/auth/celular") return conSesion(tab, (u) => { const x = tn.cargarCelular(u.id, cuerpo.tel); return x.ok ? r(200, { ok: true, usuario: tn.perfil(x.usuario) }) : r(400, x); });
    if (metodo === "GET" && camino === "/api/turnero/reservas") return conSesion(tab, (u) => r(200, { ok: true, reservas: tn.misReservas(u.id) }));
    if (metodo === "POST" && camino === "/api/turnero/reservas") return conSesion(tab, (u) => { const x = tn.reservar(u.id, cuerpo); return r(x.ok ? 201 : x.codigo ?? 400, x); });
    if (metodo === "POST" && camino === "/api/turnero/espera") return conSesion(tab, (u) => { const x = tn.anotarEnEspera(u.id, cuerpo); return r(x.ok ? 201 : x.codigo ?? 400, x); });
    if (metodo === "DELETE" && (m = camino.match(/^\/api\/turnero\/reservas\/([\w-]{1,40})$/))) return conSesion(tab, (u) => { const x = tn.cancelarReserva(u.id, m[1]); return r(x.ok ? 200 : x.codigo ?? 400, x); });
    if (metodo === "POST" && (m = camino.match(/^\/api\/turnero\/reservas\/([\w-]{1,40})\/simular-comprobante$/))) {
      const u = usuarioDe(tab);
      if (!u) return r(401, { ok: false, motivo: "Ingresá para seguir." });
      const c = tn.comprobanteDemo(u.id, m[1], cuerpo.variante);
      if (!c.ok) return r(404, c);
      const id = `wamid.LOCAL${++secMsg}`;
      let msj = { id, de: c.de, tipo: "text", texto: c.texto };
      if (c.imagen) { medios.set(`md${secMsg}`, { texto: c.texto, confianzaOcr: 0.9 }); msj = { id, de: c.de, tipo: "image", mediaId: `md${secMsg}`, texto: "" }; }
      // Sin red no hay firma que verificar: el mensaje entra directo al mismo procesador del webhook.
      return r(200, { ok: true, resultados: [await tn.procesarMensaje(msj)] });
    }
    // ───── club (backoffice conectado a la demo): en el mismo navegador, sin clave ─────
    if (metodo === "GET" && camino === "/api/staff/sesion") return r(200, { ok: true, staff: true });
    if (metodo === "GET" && camino === "/api/staff/estado") return r(200, { ok: true, estado: tn.snapshot(), version: tn.version(), ahora: tn.ahora() });
    if (metodo === "POST" && camino === "/api/staff/sync") { const x = tn.sincronizar(cuerpo); return r(x.rechazadas.length ? 409 : 200, x); }
    if (metodo === "GET" && camino === "/api/staff/revisiones") return r(200, { ok: true, revisiones: tn.revisiones() });
    if (metodo === "POST" && (m = camino.match(/^\/api\/staff\/revisiones\/(rv\d{1,6})$/))) { const x = await tn.resolverRevision(m[1], { aprobar: Boolean(cuerpo.aprobar), reservaId: cuerpo.reservaId }); return r(x.ok ? 200 : x.codigo ?? 400, x); }
    if (metodo === "GET" && camino === "/api/staff/buzon") return r(200, { ok: true, mensajes: buzon.slice() });
    return r(404, { ok: false, motivo: "No existe." });
  }

  /** SSE de la demo: los mismos eventos que el back (público + del jugador, o los del club). */
  function suscribir(tab, ruta, enviar) {
    const canales = ruta.startsWith("/api/staff/") ? ["staff"] : ["publico", ...(sesiones.has(tab) ? [`usuario:${sesiones.get(tab)}`] : [])];
    const bajas = canales.map((c) => tn.suscribir(c, enviar));
    return () => bajas.forEach((b) => b());
  }

  return { atender, suscribir, turnero: tn, buzon: () => buzon.slice(), cerrar: () => clearInterval(reloj30) };
}

/** Un "EventSource" que entrega lo que le pasen. `abrir()`/`cortar()` simulan conexión y corte. */
export function fuenteFalsa(alCerrar = () => {}) {
  const oyentes = new Map();
  const f = {
    onopen: null, onerror: null,
    addEventListener(tipo, fn) { (oyentes.get(tipo) ?? oyentes.set(tipo, []).get(tipo)).push(fn); },
    close() { alCerrar(); },
    entregar(tipo, datos) { queueMicrotask(() => { for (const fn of oyentes.get(tipo) ?? []) fn({ data: JSON.stringify(datos) }); }); },
    abrir() { queueMicrotask(() => f.onopen?.()); },
    cortar() { queueMicrotask(() => f.onerror?.()); },
  };
  return f;
}

/**
 * El transporte que usa el front en la demo pública: con varias pestañas, el bus (una hace de servidor); en un
 * navegador sin BroadcastChannel o sin Web Locks, un servidor propio de esta pestaña (como antes, sin sync).
 */
export async function crearLocal() {
  const { unirseAlBus } = await import("./bus.mjs");
  return unirseAlBus();
}
