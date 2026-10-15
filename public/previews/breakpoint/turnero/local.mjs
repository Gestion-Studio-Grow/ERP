// ADAPTADOR LOCAL del turnero — la demo pública a costo cero, SIN servidor.
//
// El host público del ERP es serverless: no sostiene SSE ni estado en memoria. Para mostrar el turnero en la URL
// gratuita del cliente, el front carga este adaptador, que corre el MISMO núcleo de dominio (dominio/nucleo.mjs
// sobre el motor del club) dentro del navegador y responde el MISMO contrato que el back
// (docs/tenants/breakpoint/TURNERO-API.md). Nada sale del navegador: ni datos, ni contraseñas, ni comprobantes.
// Se activa solo fuera de localhost (o con ?api=local). Con un back real (post-venta) no se carga nunca.
import { crearTurnero } from "./dominio/nucleo.mjs";

export function crearLocal({ reloj = () => Date.now() } = {}) {
  const buzon = [];
  const medios = new Map();
  const canal = { tipo: "demo", async enviar(tel, texto) { buzon.unshift({ a: `••• ${String(tel).slice(-4)}`, texto }); if (buzon.length > 30) buzon.length = 30; return { ok: true } } };
  const lector = {
    async leer(m) {
      if (m.mediaId) { const x = medios.get(m.mediaId); medios.delete(m.mediaId); return x ?? { texto: "", confianzaOcr: 0.3 }; }
      return { texto: m.texto ?? "", confianzaOcr: 1 };
    },
  };
  const tn = crearTurnero({ reloj, canal, lector });
  setInterval(() => tn.tick(), 30000);
  let sesion = null; // id del usuario: vive sólo en esta pestaña
  let secMsg = 0;

  const ok = (status, cuerpo) => ({ status, ...cuerpo });
  const conSesion = (fn) => (sesion && tn.usuario(sesion) ? fn(tn.usuario(sesion)) : ok(401, { ok: false, motivo: "Ingresá para seguir." }));
  const entrar = (r, status = 200) => { if (!r.ok) return ok(400, r); sesion = r.usuario.id; return ok(status, { ok: true, usuario: tn.perfil(r.usuario) }); };

  async function api(ruta, { metodo = "GET", cuerpo = {} } = {}) {
    await null; // misma asincronía que la red
    const url = new URL(ruta, "http://local");
    const p = url.searchParams, camino = url.pathname;
    let m;
    if (metodo === "GET" && camino === "/api/turnero/config") return ok(200, { ...tn.config(), demo: true, local: true, google: { clientId: null, demo: true }, whatsapp: { numero: null, demo: true } });
    if (metodo === "GET" && camino === "/api/auth/yo") return ok(200, { ok: true, usuario: sesion ? tn.perfil(tn.usuario(sesion)) : null });
    if (metodo === "GET" && camino === "/api/turnero/disponibilidad") { const r = tn.disponibilidad({ fecha: p.get("fecha"), duracion: Number(p.get("duracion") ?? 90), techadas: p.get("techadas") === "1" }); return ok(r.ok ? 200 : 400, r); }
    if (metodo === "POST" && camino === "/api/auth/registro") return entrar(await tn.registrar(cuerpo), 201);
    if (metodo === "POST" && camino === "/api/auth/ingresar") { const r = await tn.ingresar(cuerpo); return r.ok ? entrar(r) : ok(401, r); }
    if (metodo === "POST" && camino === "/api/auth/google") return entrar(tn.ingresarGoogleDemo(Number(cuerpo.cuentaDemo ?? 0)));
    if (metodo === "POST" && camino === "/api/auth/salir") { sesion = null; return ok(200, { ok: true }); }
    if (metodo === "POST" && camino === "/api/auth/celular") return conSesion((u) => { const r = tn.cargarCelular(u.id, cuerpo.tel); return r.ok ? ok(200, { ok: true, usuario: tn.perfil(r.usuario) }) : ok(400, r); });
    if (metodo === "GET" && camino === "/api/turnero/reservas") return conSesion((u) => ok(200, { ok: true, reservas: tn.misReservas(u.id) }));
    if (metodo === "POST" && camino === "/api/turnero/reservas") return conSesion((u) => { const r = tn.reservar(u.id, cuerpo); return ok(r.ok ? 201 : r.codigo ?? 400, r); });
    if (metodo === "POST" && camino === "/api/turnero/espera") return conSesion((u) => { const r = tn.anotarEnEspera(u.id, cuerpo); return ok(r.ok ? 201 : r.codigo ?? 400, r); });
    if (metodo === "DELETE" && (m = camino.match(/^\/api\/turnero\/reservas\/([\w-]{1,40})$/))) return conSesion((u) => { const r = tn.cancelarReserva(u.id, m[1]); return ok(r.ok ? 200 : r.codigo ?? 400, r); });
    if (metodo === "POST" && (m = camino.match(/^\/api\/turnero\/reservas\/([\w-]{1,40})\/simular-comprobante$/))) {
      if (!sesion) return ok(401, { ok: false, motivo: "Ingresá para seguir." });
      const c = tn.comprobanteDemo(sesion, m[1], cuerpo.variante);
      if (!c.ok) return ok(404, c);
      const id = `wamid.LOCAL${++secMsg}`;
      let msj = { id, de: c.de, tipo: "text", texto: c.texto };
      if (c.imagen) { medios.set(`md${secMsg}`, { texto: c.texto, confianzaOcr: 0.9 }); msj = { id, de: c.de, tipo: "image", mediaId: `md${secMsg}`, texto: "" }; }
      // Sin red no hay firma que verificar: el mensaje entra directo al mismo procesador del webhook.
      return ok(200, { ok: true, resultados: [await tn.procesarMensaje(msj)] });
    }
    return ok(404, { ok: false, motivo: "No existe." });
  }

  /** EventSource de mentira: los mismos eventos (disponibilidad, mi-reserva, espera) desde el núcleo local. */
  function fuente() {
    const oyentes = new Map();
    const f = {
      onopen: null, onerror: null,
      addEventListener(tipo, fn) { (oyentes.get(tipo) ?? oyentes.set(tipo, []).get(tipo)).push(fn); },
      close() { bajas.forEach((b) => b()); },
    };
    const enviar = (tipo, datos) => queueMicrotask(() => { for (const fn of oyentes.get(tipo) ?? []) fn({ data: JSON.stringify(datos) }); });
    const bajas = [tn.suscribir("publico", enviar), ...(sesion ? [tn.suscribir(`usuario:${sesion}`, enviar)] : [])];
    queueMicrotask(() => f.onopen?.());
    return f;
  }

  return { api, fuente, buzon: () => buzon.slice() };
}
