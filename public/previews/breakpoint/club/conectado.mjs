// MODO CONECTADO del backoffice — Break Point Pádel.
//
// Sin `?api=` (y fuera de la demo publicada) el backoffice sigue siendo la demo de siempre: estado en memoria, nada
// sale del navegador. Conectado, se engancha al turnero por uno de dos transportes con el MISMO contrato:
//   · HTTP: `?api=<URL del back>` (sólo en desarrollo local; clave del club en `#clave=…` o pedida una vez).
//   · "bus": la demo pública sin servidor (breakpoint-erp) → la pestaña que hace de servidor (turnero/bus.mjs).
// Carga la agenda y las fichas de clientes, recibe en vivo las reservas web, las señas por WhatsApp y los clientes
// nuevos, y manda cada cambio de agenda y de fichas que se hace en el mostrador. El back rechaza lo que pise un turno
// ya vendido online o una copia vieja (lección DB-4) y acá se deshace con aviso.
//
// Se sincronizan la AGENDA (reservas, bloqueos, canchas, fijos, lluvia, reglas) y las FICHAS de clientes (altas,
// créditos, deudas: hay plata en juego). Buffet, caja, stock y proveedores siguen locales al puesto.
// El motor llega por el puente (el mismo módulo que usa la app: así `prefijoIds` aplica a sus altas).
let M;

const json = (x) => JSON.stringify(x);
const azar = () => Math.random().toString(36).slice(2, 6);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Transporte HTTP (back real o local): pedidos con cookie de sesión del club y SSE. */
function transporteHttp(api) {
  const base = api.replace(/\/$/, "");
  return {
    pedir: (ruta, opciones = {}) => fetch(base + ruta, { credentials: "include", ...opciones, headers: opciones.body ? { "Content-Type": "application/json" } : undefined }),
    fuente: (ruta) => new EventSource(base + ruta, { withCredentials: true }),
  };
}

/** Transporte "bus": la demo pública, contra la pestaña que hace de servidor. Responde como fetch. */
async function transporteBus() {
  const { unirseAlBus } = await import("../turnero/bus.mjs");
  const bus = unirseAlBus();
  return {
    pedir: async (ruta, { method = "GET", body } = {}) => {
      const r = await bus.api(ruta, { metodo: method, cuerpo: body ? JSON.parse(body) : undefined });
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r };
    },
    fuente: (ruta) => bus.fuente(ruta),
  };
}

export async function conectar(puente, api) {
  M = puente.M;
  const bus = api === "bus";
  const tr = bus ? await transporteBus() : transporteHttp(api);
  const f = tr.pedir;
  const puesto = `p${azar()}`;
  M.prefijoIds(`b${azar()}-`); // ids propios de este puesto: nunca chocan con los del back ni con otro puesto

  // 1) Ingreso del puesto con la clave del club (va en el fragmento #, que nunca viaja en un pedido HTTP).
  // Primero se pregunta si este navegador ya es un puesto del club (200 siempre: sin 401 ruidosos en la consola).
  const sesion = await f("/api/staff/sesion").then((r) => r.json()).catch(() => null);
  if (!sesion) return puente.toast("No se pudo conectar con el turnero. Sigue en modo demo.", { error: true });
  if (!sesion.staff) {
    const clave = new URLSearchParams(location.hash.slice(1)).get("clave") ?? await pedirClave();
    if (!clave) return puente.toast("Sigue en modo demo (sin conectar).");
    history.replaceState(null, "", location.pathname + location.search); // la clave no queda en la barra
    const r = await f("/api/staff/ingresar", { method: "POST", body: json({ clave }) });
    if (!r.ok) return puente.toast("No se pudo conectar con el turnero: clave incorrecta.", { error: true });
  }
  const estado = await f("/api/staff/estado");
  if (!estado.ok) return puente.toast("No se pudo conectar con el turnero. Sigue en modo demo.", { error: true });
  const datos = await estado.json();
  let caido = false;

  // 2) La agenda y las fichas del back pasan a ser las del puesto; el reloj, el real del club.
  puente.E = datos.estado;
  puente.AHORA = { ...datos.ahora };
  const base0 = new Map(); // reservas tal cual las conoce el back
  const baseCli = new Map(); // fichas de clientes tal cual las conoce el back
  const fotoAgenda = () => ({ bloqueos: json(puente.E.bloqueos), canchas: json(puente.E.canchas), fijos: json(puente.E.fijos), clima: json(puente.E.clima), politica: json(puente.E.config.politica) });
  const bajarBase = () => {
    base0.clear(); baseCli.clear();
    for (const r of puente.E.reservas) base0.set(r.id, json(r));
    for (const c of puente.E.clientes) baseCli.set(c.id, json(c));
    return fotoAgenda();
  };
  let agenda = bajarBase();
  const panel = crearPanel(f, puente);
  panel.conectado(true);

  // 3) Puesto → back: después de cada pintada, lo que cambió se manda (agrupado, 80 ms).
  let pendiente = null, enviando = false;
  async function empujar() {
    pendiente = null;
    if (enviando) { pendiente = setTimeout(empujar, 80); return; }
    const E = puente.E;
    const cambiadas = E.reservas.filter((r) => base0.get(r.id) !== json(r));
    const clientes = E.clientes.filter((c) => baseCli.get(c.id) !== json(c));
    const ahora = fotoAgenda();
    const extra = {};
    for (const k of Object.keys(ahora)) if (ahora[k] !== agenda[k]) extra[k] = k === "politica" ? E.config.politica : E[k];
    if (!cambiadas.length && !clientes.length && !Object.keys(extra).length) return;
    for (const r of cambiadas) base0.set(r.id, json(r));
    for (const c of clientes) baseCli.set(c.id, json(c));
    agenda = ahora;
    enviando = true;
    try {
      const res = await f("/api/staff/sync", { method: "POST", body: json({ puesto, reservas: cambiadas, ...(clientes.length && { clientes }), ...extra }) });
      const out = await res.json().catch(() => ({}));
      let repintar = false;
      // El back devuelve la versión nueva de cada turno y su código de seña (D28): se adoptan para la próxima edición.
      for (const [rid, rev] of Object.entries(out.revs ?? {})) {
        const r = E.reservas.find((x) => x.id === rid);
        if (!r) continue;
        r.rev = rev;
        const ref = out.refs?.[rid];
        if (ref !== undefined && ref !== (r.ref ?? null)) { r.ref = ref; repintar = true; }
        base0.set(rid, json(r));
      }
      for (const x of out.rechazadas ?? []) {
        const i = E.reservas.findIndex((r) => r.id === x.id);
        if (x.actual) { E.reservas[i] = x.actual; base0.set(x.id, json(x.actual)); }
        else if (i >= 0) { E.reservas.splice(i, 1); base0.delete(x.id); }
      }
      if (out.rechazadas?.length) { puente.render(); puente.toast(`No se guardó: ${out.rechazadas[0].motivo}`, { error: true }); }
      else if (repintar) puente.render();
    } catch {
      panel.conectado(false);
    } finally { enviando = false; }
  }
  puente.despues = () => { if (!pendiente) pendiente = setTimeout(empujar, 80); };

  // 4) Back → puesto, en vivo.
  const upsert = (r) => {
    const E = puente.E;
    const i = E.reservas.findIndex((x) => x.id === r.id);
    if (i >= 0) E.reservas[i] = r; else E.reservas.push(r);
    base0.set(r.id, json(r));
  };
  const upsertCliente = (c) => {
    const E = puente.E;
    const i = E.clientes.findIndex((x) => x.id === c.id);
    if (i >= 0) E.clientes[i] = c; else E.clientes.push(c);
    baseCli.set(c.id, json(c));
  };
  const ev = tr.fuente("/api/staff/eventos");
  // Al volver de un corte se baja todo de nuevo: lo que pasó en el medio no queda como copia vieja (que el back,
  // además, rechazaría por versión).
  ev.onopen = async () => {
    panel.conectado(true);
    if (!caido) return;
    caido = false;
    const r = await f("/api/staff/estado").then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    for (const k of ["reservas", "bloqueos", "canchas", "fijos", "clima", "clientes"]) puente.E[k] = r.estado[k];
    puente.E.config.politica = r.estado.config.politica;
    agenda = bajarBase();
    puente.render();
  };
  ev.onerror = () => { caido = true; panel.conectado(false); };
  ev.addEventListener("reserva", (e) => {
    const { reserva: r, motivo } = JSON.parse(e.data);
    upsert(r);
    puente.render();
    const cancha = M.cancha(puente.E, r.canchaId)?.nombre ?? "";
    const avisos = {
      nueva: `🌐 Reserva web: ${r.titular} · ${cancha} ${M.hhmm(r.inicio)}${r.sena.monto && !r.sena.pagada ? " (falta la seña)" : ""}`,
      "sena-confirmada": `✅ Seña por WhatsApp: ${r.titular} quedó firme (${cancha} ${M.hhmm(r.inicio)})`,
      "sena-parcial": `💸 Seña parcial de ${r.titular} (${cancha} ${M.hhmm(r.inicio)})`,
      "sena-demorada": `⏳ No llegó la seña de ${r.titular} (${cancha} ${M.hhmm(r.inicio)}): decidí si lo liberás`,
      "sena-vencida": `⏱️ Se liberó ${cancha} ${M.hhmm(r.inicio)}: no llegó la seña de ${r.titular}`,
      cancelada: `🌐 ${r.titular} canceló online ${cancha} ${M.hhmm(r.inicio)}`,
      "desde-espera": `📋 Lista de espera: ${r.titular} tomó ${cancha} ${M.hhmm(r.inicio)}`,
    };
    if (avisos[motivo]) panel.novedad(avisos[motivo]);
  });
  ev.addEventListener("clientes", (e) => {
    const { clientes } = JSON.parse(e.data);
    for (const c of clientes ?? []) {
      const antes = puente.E.clientes.find((x) => x.id === c.id);
      upsertCliente(c);
      if (!antes) panel.novedad(`👤 Cliente nuevo por la web: ${c.nombre}`);
      else if ((c.monedero ?? 0) > (antes.monedero ?? 0)) panel.novedad(`💳 ${c.nombre} tiene ${M.pesos(c.monedero)} de crédito`);
    }
    puente.render();
  });
  ev.addEventListener("sync", (e) => {
    const d = JSON.parse(e.data);
    if (d.puesto === puesto) return; // es el eco de lo que mandó este puesto
    for (const r of d.reservas ?? []) upsert(r);
    for (const c of d.clientes ?? []) upsertCliente(c);
    for (const k of ["bloqueos", "canchas", "fijos", "clima"]) if (d[k]) puente.E[k] = d[k];
    if (d.politica) puente.E.config.politica = d.politica;
    agenda = fotoAgenda();
    puente.render();
  });
  ev.addEventListener("revision", (e) => panel.revision(JSON.parse(e.data).revision));
  ev.addEventListener("comprobante-rechazado", (e) => { const d = JSON.parse(e.data); panel.novedad(`⛔ Comprobante rechazado (op. ${d.operacion}): ${d.motivo}`); });

  // 5) Bandeja de comprobantes "a revisar" (lo que la conciliación no se animó a confirmar sola).
  const r0 = await f("/api/staff/revisiones").then((r) => r.json()).catch(() => ({}));
  for (const rv of (r0.revisiones ?? []).reverse()) panel.revision(rv);

  puente.render();
  panel.novedad(bus ? "Conectado con el turnero de esta demo (otra pestaña): lo que se reserve ahí entra solo acá." : "Conectado con el turnero web: las reservas online entran solas a la agenda.");
}

/**
 * Panel fijo del turnero (abajo a la izquierda): estado de la conexión, NOVEDADES con historial y contador (D27: los
 * avisos no duran 2,5 s ni se meten en el diálogo abierto) y la bandeja de comprobantes para revisar.
 */
function crearPanel(f, puente) {
  const el = document.createElement("aside");
  el.id = "bp-turnero";
  el.setAttribute("aria-label", "Turnero web");
  el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:60;width:min(360px,calc(100vw - 24px));display:grid;gap:8px;font:13px/1.4 system-ui,sans-serif";
  el.innerHTML = `
    <div id="bp-revisiones" style="display:grid;gap:8px"></div>
    <section id="bp-novedades-lista" hidden style="background:var(--paper,#fff);color:var(--ink,#111);border:1px solid #767676;border-radius:10px;max-height:min(50vh,360px);overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.18)">
      <h2 style="font-size:13px;margin:0;padding:8px 12px;border-bottom:1px solid #ccc">Novedades del turnero</h2>
      <ol style="list-style:none;margin:0;padding:0"></ol>
    </section>
    <button type="button" id="bp-conexion" aria-expanded="false" aria-controls="bp-novedades-lista" style="justify-self:start;border:0;border-radius:999px;padding:6px 12px;color:#fff;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer;min-height:32px"></button>
    <p id="bp-anuncio" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;margin:0"></p>`;
  document.body.append(el);
  const boton = el.querySelector("#bp-conexion"), lista = el.querySelector("#bp-novedades-lista"), ol = lista.querySelector("ol");
  let on = false, sinLeer = 0;
  const pintarBoton = () => {
    boton.textContent = `● ${on ? "Turnero en vivo" : "Turnero: reconectando…"}${sinLeer ? ` · ${sinLeer} novedad${sinLeer > 1 ? "es" : ""}` : " · Novedades"}`;
    boton.style.background = on ? "#035BA8" : "#8A4100";
  };
  boton.addEventListener("click", () => {
    const abrir = lista.hidden;
    lista.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
    if (abrir) { sinLeer = 0; pintarBoton(); }
  });
  el.querySelector("#bp-revisiones").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-rv]");
    if (!b) return;
    b.disabled = true;
    const res = await f(`/api/staff/revisiones/${b.dataset.rv}`, { method: "POST", body: json({ aprobar: b.dataset.op === "ok", reservaId: b.dataset.reserva || undefined }) });
    const out = await res.json().catch(() => ({}));
    if (!out.ok) { b.disabled = false; puente.toast(out.motivo ?? "No se pudo.", { error: true }); }
  });
  return {
    conectado(v) { on = v; pintarBoton(); },
    novedad(texto) {
      const li = document.createElement("li");
      li.style.cssText = "padding:8px 12px;border-bottom:1px solid #eee";
      const h = new Date();
      li.innerHTML = `<time style="color:#555;font-variant-numeric:tabular-nums">${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}</time> ${esc(texto)}`;
      ol.prepend(li);
      while (ol.children.length > 30) ol.lastChild.remove();
      if (lista.hidden) sinLeer++;
      pintarBoton();
      el.querySelector("#bp-anuncio").textContent = texto; // se anuncia sin robar el foco ni meterse en un diálogo
    },
    revision(rv) {
      const caja = el.querySelector("#bp-revisiones");
      caja.querySelector(`[data-id="${CSS.escape(rv.id)}"]`)?.remove();
      if (rv.estado !== "pendiente") return;
      const destino = rv.reservaId ?? rv.sugerida;
      const r = destino ? M.reserva(puente.E, destino) : null;
      const tarjeta = document.createElement("div");
      tarjeta.dataset.id = rv.id;
      tarjeta.setAttribute("role", "status");
      tarjeta.style.cssText = "background:var(--paper,#fff);color:var(--ink,#111);border:2px solid #BF5A00;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.18)";
      tarjeta.innerHTML = `<strong>${rv.tipo === "excedente" ? "Pagó de más" : "Comprobante para revisar"}</strong> · WhatsApp ${esc(rv.tel)}<br>
        ${rv.monto != null ? M.pesos(rv.monto) : "sin monto"} · op. ${esc(rv.operacion)}${rv.ref ? ` · ${esc(rv.ref)}` : ""}<br>
        <span>${esc(rv.motivo)}</span>${r ? `<br>Turno: ${esc(r.titular)} · ${M.hhmm(r.inicio)} ${esc(M.cancha(puente.E, r.canchaId)?.nombre)}` : ""}
        <div style="display:flex;gap:8px;margin-top:8px">${rv.tipo === "excedente"
          ? `<button type="button" data-rv="${esc(rv.id)}" data-op="ok">Resuelto</button>`
          : `${r ? `<button type="button" data-rv="${esc(rv.id)}" data-op="ok" data-reserva="${esc(destino)}">Aplicar a este turno</button>` : ""}<button type="button" data-rv="${esc(rv.id)}" data-op="no">Rechazar</button>`}</div>`;
      caja.prepend(tarjeta);
    },
  };
}

/** La clave del club en un diálogo de verdad (con label), no en un prompt() del navegador. */
function pedirClave() {
  return new Promise((listo) => {
    const d = document.createElement("dialog");
    d.setAttribute("aria-labelledby", "bp-clave-t");
    d.style.cssText = "border:0;border-radius:12px;padding:20px;max-width:min(380px,calc(100vw - 32px));font:14px/1.45 system-ui,sans-serif";
    d.innerHTML = `<form method="dialog" style="display:grid;gap:10px">
      <strong id="bp-clave-t" style="font-size:16px">Conectar con el turnero web</strong>
      <label for="bp-clave">Clave del club</label>
      <input id="bp-clave" type="password" autocomplete="current-password" required style="font:inherit;padding:10px;border:1px solid #767676;border-radius:8px">
      <div style="display:flex;gap:8px;justify-content:flex-end"><button value="no" formnovalidate style="font:inherit;padding:10px 14px">Seguir en demo</button><button value="si" style="font:inherit;padding:10px 14px;background:#035BA8;color:#fff;border:0;border-radius:8px">Conectar</button></div>
    </form>`;
    document.body.append(d);
    d.addEventListener("close", () => { const v = d.returnValue === "si" ? d.querySelector("#bp-clave").value : null; d.remove(); listo(v); });
    d.showModal();
  });
}
