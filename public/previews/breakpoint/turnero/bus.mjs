// BUS ENTRE PESTAÑAS de la demo pública — Turnero + gestión del club, en vivo, SIN servidor.
//
// Con el turnero en una pestaña y la gestión del club en otra (mismo navegador, mismo sitio), UNA pestaña hace de
// "servidor" (corre el núcleo con crearServidorDemo) y las demás le hablan por BroadcastChannel con el mismo
// contrato de la API. La que hace de servidor se elige con Web Locks: si se cierra, otra toma la posta (con una demo
// nueva; las demás pestañas se re-sincronizan solas, como cuando vuelve la conexión).
//
// Sin BroadcastChannel o sin Web Locks (navegadores viejos), cada pestaña corre su propio servidor: anda igual,
// pero sin sync entre pestañas. Nada sale del navegador.
import { crearServidorDemo, fuenteFalsa } from "./local.mjs";

const CANAL = "bp-demo-turnero-v1";
const LOCK = "bp-demo-turnero-servidor";
const id = () => Math.random().toString(36).slice(2, 10);

export function unirseAlBus({ reloj } = {}) {
  const tab = `t${id()}`;
  const hayBus = typeof BroadcastChannel !== "undefined" && typeof navigator !== "undefined" && navigator.locks?.request;
  let servidor = null; // si ESTA pestaña es la que hace de servidor
  let lider = null; // id de la pestaña servidor
  let avisarLider;
  let liderListo = new Promise((ok) => { avisarLider = ok; });
  const pendientes = new Map(); // id de pedido → resolver
  const fuentes = new Map(); // sid → { ruta, f, baja }

  // ───── sin bus: servidor propio ─────
  if (!hayBus) {
    servidor = crearServidorDemo({ reloj });
    return transporteDirecto();
  }

  const bc = new BroadcastChannel(CANAL);
  const subsRemotas = new Map(); // (en el servidor) sid → baja

  bc.onmessage = async ({ data: m }) => {
    if (!m || typeof m !== "object") return;
    // ── lo que atiende la pestaña servidor ──
    if (servidor) {
      if (m.t === "hola") bc.postMessage({ t: "lider", tab });
      else if (m.t === "pedido") bc.postMessage({ t: "respuesta", id: m.id, para: m.de, res: await servidor.atender({ tab: m.de, metodo: m.metodo, ruta: m.ruta, cuerpo: m.cuerpo }) });
      else if (m.t === "sub") {
        subsRemotas.get(m.sid)?.();
        subsRemotas.set(m.sid, servidor.suscribir(m.de, m.ruta, (tipo, datos) => bc.postMessage({ t: "ev", sid: m.sid, tipo, datos })));
      } else if (m.t === "unsub") { subsRemotas.get(m.sid)?.(); subsRemotas.delete(m.sid); }
      return;
    }
    // ── lo que recibe una pestaña cliente ──
    if (m.t === "lider" && m.tab !== lider) {
      const habia = lider;
      lider = m.tab;
      avisarLider();
      // Servidor nuevo (el anterior se cerró): las suscripciones se renuevan y cada pantalla se re-sincroniza.
      for (const [sid, s] of fuentes) { bc.postMessage({ t: "sub", sid, de: tab, ruta: s.ruta }); if (habia) { s.f.cortar(); s.f.abrir(); } }
    } else if (m.t === "respuesta" && m.para === tab) { pendientes.get(m.id)?.(m.res); pendientes.delete(m.id); }
    else if (m.t === "ev") fuentes.get(m.sid)?.f.entregar(m.tipo, m.datos);
  };

  // Elección de la pestaña servidor: la primera que toma el lock lo retiene mientras viva.
  navigator.locks.request(LOCK, () => new Promise(() => {
    servidor = crearServidorDemo({ reloj });
    const habia = lider;
    lider = tab;
    // Las suscripciones de esta pestaña pasan a ser locales.
    for (const [, s] of fuentes) { s.baja?.(); s.baja = servidor.suscribir(tab, s.ruta, (tipo, datos) => s.f.entregar(tipo, datos)); if (habia) { s.f.cortar(); s.f.abrir(); } }
    avisarLider();
    bc.postMessage({ t: "lider", tab });
  }));
  bc.postMessage({ t: "hola", de: tab });
  addEventListener("pagehide", () => { for (const sid of fuentes.keys()) bc.postMessage({ t: "unsub", sid }); });

  async function api(ruta, { metodo = "GET", cuerpo } = {}) {
    await Promise.race([liderListo, new Promise((ok) => setTimeout(ok, 2500))]);
    if (servidor) return servidor.atender({ tab, metodo, ruta, cuerpo });
    if (!lider) return { status: 0, ok: false, motivo: "La demo se está iniciando. Probá de nuevo en un segundo." };
    const pid = id();
    return new Promise((ok) => {
      pendientes.set(pid, ok);
      bc.postMessage({ t: "pedido", id: pid, de: tab, metodo, ruta, cuerpo });
      setTimeout(() => { if (pendientes.delete(pid)) ok({ status: 0, ok: false, motivo: "La demo se está reconectando. Probá de nuevo." }); }, 4000);
    });
  }

  function fuente(ruta) {
    const sid = `s${id()}`;
    const s = { ruta, f: null, baja: null };
    s.f = fuenteFalsa(() => { s.baja?.(); if (!servidor) bc.postMessage({ t: "unsub", sid }); fuentes.delete(sid); });
    fuentes.set(sid, s);
    liderListo.then(() => {
      if (servidor) s.baja = servidor.suscribir(tab, ruta, (tipo, datos) => s.f.entregar(tipo, datos));
      else bc.postMessage({ t: "sub", sid, de: tab, ruta });
      s.f.abrir();
    });
    return s.f;
  }

  return { api, fuente, tab, esServidor: () => Boolean(servidor), cerrar: () => { bc.close(); servidor?.cerrar(); } };

  function transporteDirecto() {
    return {
      tab,
      esServidor: () => true,
      cerrar: () => servidor.cerrar(),
      api: async (ruta, { metodo = "GET", cuerpo } = {}) => servidor.atender({ tab, metodo, ruta, cuerpo }),
      fuente(ruta) { let baja; const f = fuenteFalsa(() => baja?.()); baja = servidor.suscribir(tab, ruta, (tipo, datos) => f.entregar(tipo, datos)); f.abrir(); return f; },
    };
  }
}
