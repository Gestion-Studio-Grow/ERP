// BUS ENTRE PESTAÑAS de la demo pública — Turnero + gestión del club, en vivo, SIN servidor.
//
// Con el turnero en una pestaña y la gestión del club en otra (mismo navegador, mismo sitio), UNA pestaña del turnero
// hace de "servidor" (corre el núcleo con crearServidorDemo) y las demás le hablan por BroadcastChannel con el mismo
// contrato de la API. La que hace de servidor se elige con Web Locks; si se cierra, otra pestaña del turnero toma la
// posta desde la última foto de la demo que reparte el servidor (D36); las demás pantallas se re-sincronizan solas.
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
  let ultimaFoto = null; // la última foto de la demo que repartió el servidor (para tomar la posta sin perderla)
  const versionDe = (f) => Number(f?.turnero?.version) || 0;

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
    // Vale la foto del servidor vigente o una más nueva (un servidor viejo descongelado no pisa la buena).
    if (m.t === "foto" && !servidor) {
      if (m.para && m.para !== tab) return;
      if (m.tab === lider || !ultimaFoto || versionDe(m.foto) > versionDe(ultimaFoto)) ultimaFoto = m.foto;
      return;
    }
    // Se entrega aunque ésta se haya vuelto servidor en el medio (si no, el reintento chocaría con su propio pedido).
    if (m.t === "respuesta") { if (m.para === tab && pendientes.has(m.id)) { pendientes.get(m.id)(m.res); pendientes.delete(m.id); } return; }
    if (m.t === "pidoFoto") {
      const f = servidor ? servidor.exportar() : ultimaFoto;
      if (f) bc.postMessage({ t: "foto", foto: f, para: m.de, tab: servidor ? tab : null });
      return;
    }
    if (servidor) {
      if (m.t === "hola") bc.postMessage({ t: "lider", tab });
      else if (m.t === "pedido") {
        const res = await servidor.atender({ tab: m.de, metodo: m.metodo, ruta: m.ruta, cuerpo: m.cuerpo });
        bc.postMessage({ t: "respuesta", id: m.id, para: m.de, res });
        if (m.metodo !== "GET") repartirFoto();
      }
      else if (m.t === "sub") {
        subsRemotas.get(m.sid)?.();
        subsRemotas.set(m.sid, servidor.suscribir(m.de, m.ruta, (tipo, datos) => bc.postMessage({ t: "ev", sid: m.sid, tipo, datos })));
      } else if (m.t === "unsub") { subsRemotas.get(m.sid)?.(); subsRemotas.delete(m.sid); }
      return;
    }
    // ── lo que recibe una pestaña cliente ──
    if (m.t === "adios" && m.tab === lider) {
      // El servidor se cerró y ya mandó su última foto: lo que se pida ahora espera al nuevo.
      lider = null;
      reiniciarEspera();
      for (const [, s] of fuentes) s.f.cortar();
      // Si quedó en la caché del navegador con el lock, se le roba a los 3 s.
      if (!soloCliente) setTimeout(() => { if (!lider && !servidor) postularse(true); }, 3000);
      return;
    }
    if ((m.t === "lider" || m.t === "latido") && m.tab !== lider) tomarLider(m.tab);
    else if (m.t === "latido") ultimoLatido = Date.now();
    else if (m.t === "ev") fuentes.get(m.sid)?.f.entregar(m.tipo, m.datos);
  };

  // Si el servidor deja de latir (se cerró la última pestaña del turnero, o el navegador la suspendió), se lo da por
  // caído; una pestaña del turnero le "roba" el lock y toma la posta (Safari en el celu suspende pestañas de fondo).
  let latiendo = null, verificando = false, generacion = 0;
  const vigia = setInterval(() => {
    if (servidor || !lider || verificando || Date.now() - ultimoLatido < CAIDO_MS) return;
    // Un latido tarde puede ser una pestaña FRENADA (Chrome espacia los timers de fondo), no muerta: antes de darla
    // por caída se le pregunta (los mensajes no se frenan como los timers). Sólo si nadie contesta, se toma la posta.
    verificando = true;
    lider = null;
    bc.postMessage({ t: "hola", de: tab });
    setTimeout(() => {
      verificando = false;
      if (lider || servidor) return; // contestó (tomarLider ya la volvió a registrar)
      reiniciarEspera();
      for (const [, s] of fuentes) s.f.cortar();
      if (!soloCliente) postularse(true);
    }, 1500);
  }, LATIDO_MS);

  /** Hacer de servidor mientras se tenga el lock. Si otra pestaña lo roba (porque ésta quedó suspendida), se baja. */
  function postularse(robar = false) {
    const mia = ++generacion;
    navigator.locks.request(LOCK, robar ? { steal: true } : {}, async () => {
      // Se sigue desde la foto más nueva que haya (D36); sin foto, demo nueva.
      const pedida = await pedirFoto();
      if (mia !== generacion) return; // le robaron el lock mientras esperaba la foto: no hay dos servidores
      const foto = versionDe(pedida) > versionDe(ultimaFoto) ? pedida : ultimaFoto ?? pedida;
      servidor = crearServidorDemo({ reloj, foto });
      ultimaFoto = null;
      const habia = lider;
      lider = tab;
      clearInterval(latiendo);
      latiendo = setInterval(() => { bc.postMessage({ t: "latido", tab }); repartirFoto(); }, LATIDO_MS);
      // Las suscripciones de esta pestaña pasan a ser locales.
      for (const [, s] of fuentes) { s.baja?.(); s.baja = servidor.suscribir(tab, s.ruta, (tipo, datos) => s.f.entregar(tipo, datos)); if (habia) s.f.cortar(); s.f.abrir(); }
      avisarLider();
      bc.postMessage({ t: "lider", tab });
      await new Promise(() => {}); // el lock se tiene mientras viva la pestaña
    }).catch((e) => {
      // Sólo si le ROBARON el lock (esta pestaña estaba suspendida). Otro error (p. ej. iframe con sandbox) no se
      // reintenta: sería un bucle.
      if (e?.name !== "AbortError") return;
      generacion++; // el callback de esta postulación, si sigue esperando la foto, ya no arma servidor
      // Deja de ser servidor y pasa a cliente del nuevo.
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
  function pedirFoto() {
    return new Promise((ok) => {
      const fin = setTimeout(() => { bc.removeEventListener("message", oir); ok(null); }, 400);
      function oir({ data: m }) { if (m?.t === "foto" && m.para === tab) { clearTimeout(fin); bc.removeEventListener("message", oir); ok(m.foto); } }
      bc.addEventListener("message", oir);
      bc.postMessage({ t: "pidoFoto", de: tab });
    });
  }
  function repartirFoto(siempre = false) {
    if (!servidor || (!servidor.huboCambios() && !siempre)) return;
    try { bc.postMessage({ t: "foto", foto: servidor.exportar(), tab }); } catch { /* sin clonado estructurado: se pierde sólo esta foto */ }
  }

  if (!soloCliente) postularse();
  bc.postMessage({ t: "hola", de: tab });
  addEventListener("pagehide", () => {
    for (const sid of fuentes.keys()) bc.postMessage({ t: "unsub", sid });
    if (servidor) { repartirFoto(true); bc.postMessage({ t: "adios", tab }); }
  });
  // Volver desde la caché de navegación (atrás/adelante): las suscripciones se rehacen y la pantalla se re-sincroniza.
  addEventListener("pageshow", (e) => {
    if (!e.persisted || servidor) return;
    for (const [sid, s] of fuentes) { bc.postMessage({ t: "sub", sid, de: tab, ruta: s.ruta }); s.f.cortar(); s.f.abrir(); }
  });

  async function api(ruta, { metodo = "GET", cuerpo, reintento = false } = {}) {
    await Promise.race([liderListo, new Promise((ok) => setTimeout(ok, 2500))]);
    if (servidor) {
      const res = await servidor.atender({ tab, metodo, ruta, cuerpo });
      if (metodo !== "GET") repartirFoto();
      return res;
    }
    if (!lider) return { status: 0, ok: false, motivo: "La demo se está iniciando. Probá de nuevo en un segundo." };
    const pid = id(), destino = lider;
    const res = await new Promise((ok) => {
      pendientes.set(pid, ok);
      bc.postMessage({ t: "pedido", id: pid, de: tab, metodo, ruta, cuerpo });
      setTimeout(() => { if (pendientes.delete(pid)) ok(null); }, 4000);
    });
    if (res) return res;
    // Sin respuesta: si cambió el servidor, el pedido no se procesó y va una vez al NUEVO (D37). Al mismo no: duplicaría.
    if (!reintento) {
      if (!servidor && !lider) await Promise.race([liderListo, new Promise((ok) => setTimeout(ok, 3000))]);
      if (servidor || (lider && lider !== destino)) return api(ruta, { metodo, cuerpo, reintento: true });
    }
    return { status: 0, ok: false, motivo: "La demo se está reconectando. Probá de nuevo." };
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
