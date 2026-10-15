// BUS ENTRE PESTAÑAS de la demo pública — Turnero + gestión del club, en vivo, SIN servidor.
//
// Con el turnero en una pestaña y la gestión del club en otra (mismo navegador, mismo sitio), UNA pestaña del turnero
// hace de "servidor" (corre el núcleo con crearServidorDemo) y las demás le hablan por BroadcastChannel con el mismo
// contrato de la API. La que hace de servidor se elige con Web Locks; si se cierra, otra pestaña del turnero toma la
// posta (con una demo nueva; las demás pantallas se re-sincronizan solas, como cuando vuelve la conexión).
//
// La gestión del club entra como `soloCliente`: nunca hace de servidor. Así, abierta sola (sin turnero), es la
// demo de siempre; cuando aparece un turnero, se conecta. El servidor late cada 4 s: si deja de latir, los
// clientes lo dan por caído (y muestran "reconectando") hasta que aparezca otro.
//
// Sin BroadcastChannel o sin Web Locks (navegadores viejos), cada pestaña corre su propio servidor: anda igual,
// pero sin sync entre pestañas. Nada sale del navegador.
import { crearServidorDemo, fuenteFalsa } from "./local.mjs";

const CANAL = "bp-demo-turnero-v1";
const LOCK = "bp-demo-turnero-servidor";
const LATIDO_MS = 4000, CAIDO_MS = 10000;
const id = () => Math.random().toString(36).slice(2, 10);

/** ¿Este navegador puede usar el bus? */
export const hayBus = () => typeof BroadcastChannel !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.locks?.request);

export function unirseAlBus({ reloj, soloCliente = false } = {}) {
  const tab = `t${id()}`;
  let servidor = null; // si ESTA pestaña es la que hace de servidor
  let lider = null, ultimoLatido = 0; // pestaña servidor y cuándo latió
  let avisarLider, liderListo;
  const reiniciarEspera = () => { liderListo = new Promise((ok) => { avisarLider = ok; }); };
  reiniciarEspera();
  const pendientes = new Map(); // id de pedido → resolver
  const fuentes = new Map(); // sid → { ruta, f, baja }

  // ───── sin bus: servidor propio (o, si es sólo cliente, nada que hacer) ─────
  if (!hayBus()) {
    if (soloCliente) return null;
    servidor = crearServidorDemo({ reloj });
    return transporteDirecto();
  }

  const bc = new BroadcastChannel(CANAL);
  const subsRemotas = new Map(); // (en el servidor) sid → baja

  const tomarLider = (nuevo) => {
    const habia = lider;
    lider = nuevo;
    ultimoLatido = Date.now();
    avisarLider();
    // Servidor nuevo: las suscripciones se renuevan y cada pantalla se re-sincroniza.
    for (const [sid, s] of fuentes) { bc.postMessage({ t: "sub", sid, de: tab, ruta: s.ruta }); if (habia) s.f.cortar(); s.f.abrir(); }
  };

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
    if ((m.t === "lider" || m.t === "latido") && m.tab !== lider) tomarLider(m.tab);
    else if (m.t === "latido") ultimoLatido = Date.now();
    else if (m.t === "respuesta" && m.para === tab) { pendientes.get(m.id)?.(m.res); pendientes.delete(m.id); }
    else if (m.t === "ev") fuentes.get(m.sid)?.f.entregar(m.tipo, m.datos);
  };

  // Si el servidor deja de latir (se cerró la última pestaña del turnero, o el navegador la suspendió), se lo da por
  // caído; una pestaña del turnero le "roba" el lock y toma la posta (Safari en el celu suspende pestañas de fondo).
  let latiendo = null;
  const vigia = setInterval(() => {
    if (servidor || !lider || Date.now() - ultimoLatido < CAIDO_MS) return;
    lider = null;
    reiniciarEspera();
    for (const [, s] of fuentes) s.f.cortar();
    if (!soloCliente) postularse(true);
  }, LATIDO_MS);

  /** Hacer de servidor mientras se tenga el lock. Si otra pestaña lo roba (porque ésta quedó suspendida), se baja. */
  function postularse(robar = false) {
    navigator.locks.request(LOCK, robar ? { steal: true } : {}, () => new Promise(() => {
      servidor = crearServidorDemo({ reloj });
      const habia = lider;
      lider = tab;
      clearInterval(latiendo);
      latiendo = setInterval(() => bc.postMessage({ t: "latido", tab }), LATIDO_MS);
      // Las suscripciones de esta pestaña pasan a ser locales.
      for (const [, s] of fuentes) { s.baja?.(); s.baja = servidor.suscribir(tab, s.ruta, (tipo, datos) => s.f.entregar(tipo, datos)); if (habia) s.f.cortar(); s.f.abrir(); }
      avisarLider();
      bc.postMessage({ t: "lider", tab });
    })).catch(() => {
      // Le robaron el lock (esta pestaña estaba suspendida): deja de ser servidor y pasa a cliente del nuevo.
      clearInterval(latiendo);
      servidor?.cerrar();
      servidor = null;
      lider = null;
      for (const [, s] of fuentes) { s.baja?.(); s.baja = null; s.f.cortar(); }
      reiniciarEspera();
      bc.postMessage({ t: "hola", de: tab });
      postularse();
    });
  }
  if (!soloCliente) postularse();
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

  return {
    api, fuente, tab,
    esServidor: () => Boolean(servidor),
    /** Promesa que se cumple cuando hay un servidor (para el club: "apareció un turnero"). */
    hayServidor: () => liderListo,
    cerrar: () => { clearInterval(vigia); clearInterval(latiendo); bc.close(); servidor?.cerrar(); },
  };

  function transporteDirecto() {
    return {
      tab,
      esServidor: () => true,
      hayServidor: () => Promise.resolve(),
      cerrar: () => servidor.cerrar(),
      api: async (ruta, { metodo = "GET", cuerpo } = {}) => servidor.atender({ tab, metodo, ruta, cuerpo }),
      fuente(ruta) { let baja; const f = fuenteFalsa(() => baja?.()); baja = servidor.suscribir(tab, ruta, (tipo, datos) => f.entregar(tipo, datos)); f.abrir(); return f; },
    };
  }
}
