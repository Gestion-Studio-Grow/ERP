// MODO CONECTADO del backoffice — Break Point Pádel.
//
// Sin `?api=` el backoffice sigue siendo la demo de siempre (estado en memoria, nada sale del navegador).
// Con `?api=http://localhost:8787` (y la clave del club en `#clave=…` o pedida una vez) se engancha al back del
// turnero: carga la agenda del back, recibe en vivo las reservas web y los comprobantes de WhatsApp, y le manda
// cada cambio de agenda que se hace en el mostrador. El back rechaza lo que pise un turno ya vendido online
// (lección DB-4) y acá se deshace con aviso.
//
// Se sincroniza la AGENDA (reservas, bloqueos, canchas, fijos, lluvia y reglas). Buffet, caja, stock y
// proveedores siguen locales al puesto: en producción viven en la base del ERP (fuera de esta demo).
// El motor llega por el puente (el mismo módulo que usa la app: así `prefijoIds` aplica a sus altas).
let M;

const json = (x) => JSON.stringify(x);
const azar = () => Math.random().toString(36).slice(2, 6);

export async function conectar(puente, api) {
  M = puente.M;
  const base = api.replace(/\/$/, "");
  const puesto = `p${azar()}`;
  M.prefijoIds(`b${azar()}-`); // ids propios de este puesto: nunca chocan con los del back ni con otro puesto
  const f = (ruta, opciones = {}) => fetch(base + ruta, { credentials: "include", ...opciones, headers: opciones.body ? { "Content-Type": "application/json" } : undefined });

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

  // 2) La agenda del back pasa a ser la del puesto; el reloj, el real del club.
  puente.E = datos.estado;
  puente.AHORA = { ...datos.ahora };
  const base0 = new Map();
  const fotoAgenda = () => ({ bloqueos: json(puente.E.bloqueos), canchas: json(puente.E.canchas), fijos: json(puente.E.fijos), clima: json(puente.E.clima), politica: json(puente.E.config.politica) });
  const bajarBase = () => { base0.clear(); for (const r of puente.E.reservas) base0.set(r.id, json(r)); return fotoAgenda(); };
  let agenda = bajarBase();
  marcarConectado(true);

  // 3) Puesto → back: después de cada pintada, lo que cambió en la agenda se manda (agrupado, 80 ms).
  let pendiente = null, enviando = false;
  async function empujar() {
    pendiente = null;
    if (enviando) { pendiente = setTimeout(empujar, 80); return; }
    const E = puente.E;
    const cambiadas = E.reservas.filter((r) => base0.get(r.id) !== json(r));
    const ahora = fotoAgenda();
    const extra = {};
    for (const k of Object.keys(ahora)) if (ahora[k] !== agenda[k]) extra[k] = k === "politica" ? E.config.politica : E[k];
    if (!cambiadas.length && !Object.keys(extra).length) return;
    for (const r of cambiadas) base0.set(r.id, json(r));
    agenda = ahora;
    enviando = true;
    try {
      const res = await f("/api/staff/sync", { method: "POST", body: json({ puesto, reservas: cambiadas, ...extra }) });
      const out = await res.json().catch(() => ({}));
      for (const [id, rev] of Object.entries(out.revs ?? {})) {
        const r = E.reservas.find((x) => x.id === id);
        if (r) { r.rev = rev; base0.set(id, json(r)); }
      }
      for (const x of out.rechazadas ?? []) {
        const i = E.reservas.findIndex((r) => r.id === x.id);
        if (x.actual) { E.reservas[i] = x.actual; base0.set(x.id, json(x.actual)); }
        else if (i >= 0) { E.reservas.splice(i, 1); base0.delete(x.id); }
      }
      if (out.rechazadas?.length) { puente.render(); puente.toast(`No se guardó: ${out.rechazadas[0].motivo}`, { error: true }); }
    } catch {
      marcarConectado(false);
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
  const ev = new EventSource(`${base}/api/staff/eventos`, { withCredentials: true });
  // Al volver de un corte se baja la agenda entera: lo que pasó en el medio no queda como copia vieja (que el
  // back, además, rechazaría por versión).
  ev.onopen = async () => {
    marcarConectado(true);
    if (!caido) return;
    caido = false;
    const r = await f("/api/staff/estado").then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    for (const k of ["reservas", "bloqueos", "canchas", "fijos", "clima"]) puente.E[k] = r.estado[k];
    puente.E.config.politica = r.estado.config.politica;
    agenda = bajarBase();
    puente.render();
  };
  ev.onerror = () => { caido = true; marcarConectado(false); };
  ev.addEventListener("reserva", (e) => {
    const { reserva: r, motivo } = JSON.parse(e.data);
    upsert(r);
    puente.render();
    const cancha = M.cancha(puente.E, r.canchaId)?.nombre ?? "";
    const avisos = {
      nueva: `🌐 Reserva web: ${r.titular} · ${cancha} ${M.hhmm(r.inicio)}${r.sena.monto ? " (falta la seña)" : ""}`,
      "sena-confirmada": `✅ Seña por WhatsApp: ${r.titular} quedó firme (${M.hhmm(r.inicio)})`,
      "sena-parcial": `💸 Seña parcial de ${r.titular} (${M.hhmm(r.inicio)})`,
      "sena-vencida": `⏱️ Se liberó ${cancha} ${M.hhmm(r.inicio)}: no llegó la seña de ${r.titular}`,
      cancelada: `🌐 ${r.titular} canceló online ${cancha} ${M.hhmm(r.inicio)}`,
      "desde-espera": `📋 Lista de espera: ${r.titular} tomó ${cancha} ${M.hhmm(r.inicio)}`,
    };
    if (avisos[motivo]) puente.toast(avisos[motivo]);
  });
  ev.addEventListener("sync", (e) => {
    const d = JSON.parse(e.data);
    if (d.puesto === puesto) return; // es el eco de lo que mandó este puesto
    for (const r of d.reservas ?? []) upsert(r);
    for (const k of ["bloqueos", "canchas", "fijos", "clima"]) if (d[k]) puente.E[k] = d[k];
    if (d.politica) puente.E.config.politica = d.politica;
    agenda = fotoAgenda();
    puente.render();
  });
  ev.addEventListener("revision", (e) => pintarRevision(JSON.parse(e.data).revision));
  ev.addEventListener("comprobante-rechazado", (e) => { const d = JSON.parse(e.data); puente.toast(`Comprobante rechazado (${d.operacion}): ${d.motivo}`, { error: true }); });

  // 5) Bandeja de comprobantes "a revisar" (lo que la conciliación no se animó a confirmar sola).
  const r0 = await f("/api/staff/revisiones").then((r) => r.json()).catch(() => ({}));
  for (const rv of (r0.revisiones ?? []).reverse()) pintarRevision(rv);

  function bandeja() {
    let el = document.getElementById("bp-revisiones");
    if (el) return el;
    el = document.createElement("aside");
    el.id = "bp-revisiones";
    el.setAttribute("aria-label", "Comprobantes para revisar");
    el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:60;max-width:min(360px,calc(100vw - 24px));display:grid;gap:8px";
    el.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button[data-rv]");
      if (!b) return;
      b.disabled = true;
      const aprobar = b.dataset.op === "ok";
      const res = await f(`/api/staff/revisiones/${b.dataset.rv}`, { method: "POST", body: json({ aprobar, reservaId: b.dataset.reserva || undefined }) });
      const out = await res.json().catch(() => ({}));
      if (!out.ok) { b.disabled = false; puente.toast(out.motivo ?? "No se pudo.", { error: true }); }
    });
    document.body.append(el);
    return el;
  }
  function pintarRevision(rv) {
    const caja = bandeja();
    caja.querySelector(`[data-id="${rv.id}"]`)?.remove();
    if (rv.estado !== "pendiente") return;
    const destino = rv.reservaId ?? rv.sugerida;
    const r = destino ? M.reserva(puente.E, destino) : null;
    const tarjeta = document.createElement("div");
    tarjeta.dataset.id = rv.id;
    tarjeta.setAttribute("role", "status");
    tarjeta.style.cssText = "background:var(--paper,#fff);color:var(--ink,#111);border:2px solid #BF5A00;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13px";
    const t = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    tarjeta.innerHTML = `<strong>${rv.tipo === "excedente" ? "Pagó de más" : "Comprobante para revisar"}</strong> · WhatsApp ${t(rv.tel)}<br>
      ${rv.monto != null ? M.pesos(rv.monto) : "sin monto"} · op. ${t(rv.operacion)}${rv.ref ? ` · ${t(rv.ref)}` : ""}<br>
      <span>${t(rv.motivo)}</span>${r ? `<br>Turno: ${t(r.titular)} · ${M.hhmm(r.inicio)} ${t(M.cancha(puente.E, r.canchaId)?.nombre)}` : ""}
      <div style="display:flex;gap:8px;margin-top:8px">${rv.tipo === "excedente"
        ? `<button type="button" data-rv="${rv.id}" data-op="ok">Resuelto</button>`
        : `${r ? `<button type="button" data-rv="${rv.id}" data-op="ok" data-reserva="${t(destino)}">Aplicar a este turno</button>` : ""}<button type="button" data-rv="${rv.id}" data-op="no">Rechazar</button>`}</div>`;
    caja.prepend(tarjeta);
  }

  puente.render();
  puente.toast("Conectado con el turnero web: las reservas online entran solas a la agenda.");
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

function marcarConectado(on) {
  let el = document.getElementById("bp-conexion");
  if (!el) {
    el = document.createElement("span");
    el.id = "bp-conexion";
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;right:12px;top:8px;z-index:70;font:600 12px/1.2 system-ui,sans-serif;padding:4px 10px;border-radius:999px;color:#fff";
    document.body.append(el);
  }
  el.textContent = on ? "● Turnero en vivo" : "● Turnero: reconectando…";
  el.style.background = on ? "#035BA8" : "#8A4100";
}
