// Tests del servidor de demo que corre en el navegador (public/previews/breakpoint/turnero/local.mjs): el mismo
// contrato que el back, con sesiones por pestaña y las rutas del club, para la demo pública sin servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as localMod from "../../../../public/previews/breakpoint/turnero/local.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- módulo JS plano (lo carga el navegador sin build) */
const L: any = localMod;

test("demo local: jugador y club en pestañas distintas comparten la agenda; las sesiones son por pestaña", async () => {
  const srv = L.crearServidorDemo();
  const eventosClub: any[] = [];
  const baja = srv.suscribir("club", "/api/staff/eventos", (tipo: string, datos: any) => eventosClub.push({ tipo, datos }));
  const cfg = await srv.atender({ tab: "t1", ruta: "/api/turnero/config" });
  const fecha = cfg.dias[1].fecha;
  const reg = await srv.atender({ tab: "t1", metodo: "POST", ruta: "/api/auth/registro", cuerpo: { nombre: "Tab Uno", tel: "1150001111", clave: "canchaazul9" } });
  assert.equal(reg.status, 201);
  assert.equal((await srv.atender({ tab: "t2", ruta: "/api/auth/yo" })).usuario, null, "otra pestaña no hereda la sesión");
  const s = (await srv.atender({ tab: "t1", ruta: `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90` })).slots.at(-1);
  const r = await srv.atender({ tab: "t1", metodo: "POST", ruta: "/api/turnero/reservas", cuerpo: { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 } });
  assert.equal(r.status, 201);
  assert.ok(eventosClub.some((e) => e.tipo === "reserva" && e.datos.reserva.titular === "Tab Uno"), "el club lo ve en vivo");
  assert.ok(eventosClub.some((e) => e.tipo === "clientes"), "y la ficha nueva");
  const sim = await srv.atender({ tab: "t1", metodo: "POST", ruta: `/api/turnero/reservas/${r.reserva.id}/simular-comprobante`, cuerpo: { variante: "ok" } });
  assert.equal(sim.resultados[0].decision, "confirmar");
  const est = await srv.atender({ tab: "club", ruta: "/api/staff/estado" });
  assert.equal(est.estado.reservas.find((x: any) => x.id === r.reserva.id).sena.pagada, true);
  // El club carga un turno por teléfono → desaparece del turnero.
  const otro = (await srv.atender({ tab: "t1", ruta: `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90` })).slots[0];
  const sync = await srv.atender({ tab: "club", metodo: "POST", ruta: "/api/staff/sync", cuerpo: { reservas: [{ id: "bq-1", fecha, inicio: otro.inicio, duracion: 90, canchaId: otro.canchaId, tipo: "turno", titular: "Tel", origen: "teléfono", jugadores: [], pagos: [], sena: { monto: 0, pagada: false }, precio: 0, estado: "reservada" }] } });
  assert.equal(sync.status, 200);
  const despues = (await srv.atender({ tab: "t1", ruta: `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90` })).slots;
  assert.ok(!despues.some((x: any) => x.inicio === otro.inicio && x.canchaId === otro.canchaId));
  baja();
  srv.cerrar();
});

test("bus: sin Web Locks (como Node o un navegador viejo) cae a un servidor propio y responde igual", async () => {
  const { unirseAlBus } = await import("../../../../public/previews/breakpoint/turnero/bus.mjs");
  const bus: any = unirseAlBus();
  const cfg = await bus.api("/api/turnero/config");
  assert.equal(cfg.status, 200);
  assert.equal(cfg.local, true);
  const f = bus.fuente("/api/turnero/eventos");
  const abierto = await new Promise((ok) => { f.onopen = () => ok(true); setTimeout(() => ok(false), 500); });
  assert.equal(abierto, true);
  f.close();
  bus.cerrar();
});

test("toma de posta (D36): otra pestaña sigue desde la foto con reservas, sesiones, turnos del club y comprobantes usados", async () => {
  const a = L.crearServidorDemo();
  const cfg = await a.atender({ tab: "t1", ruta: "/api/turnero/config" });
  const fecha = cfg.dias[1].fecha;
  await a.atender({ tab: "t1", metodo: "POST", ruta: "/api/auth/registro", cuerpo: { nombre: "Posta Uno", tel: "1150002222", clave: "canchaazul9" } });
  const libres = (await a.atender({ tab: "t1", ruta: `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90` })).slots;
  const s = libres.at(-1), otro = libres[0];
  const r = await a.atender({ tab: "t1", metodo: "POST", ruta: "/api/turnero/reservas", cuerpo: { fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 } });
  await a.atender({ tab: "t1", metodo: "POST", ruta: `/api/turnero/reservas/${r.reserva.id}/simular-comprobante`, cuerpo: { variante: "ok" } });
  await a.atender({ tab: "club", metodo: "POST", ruta: "/api/staff/sync", cuerpo: { reservas: [{ id: "bq-posta", fecha, inicio: otro.inicio, duracion: 90, canchaId: otro.canchaId, tipo: "turno", titular: "Mostrador", origen: "teléfono", jugadores: [], pagos: [], sena: { monto: 0, pagada: false }, precio: 0, estado: "reservada" }] } });
  assert.equal(a.huboCambios(), true);
  assert.equal(a.huboCambios(), false, "se consume: la próxima foto sale sólo si cambia algo");
  // La pestaña servidor se cierra: la foto viaja por el bus (clonado estructurado) y otra pestaña sigue desde ahí.
  const foto = structuredClone(a.exportar());
  a.cerrar();
  const b = L.crearServidorDemo({ foto });
  const est = (await b.atender({ tab: "club", ruta: "/api/staff/estado" })).estado;
  assert.equal(est.reservas.find((x: any) => x.id === r.reserva.id)?.sena.pagada, true, "la reserva web y su seña siguen");
  assert.ok(est.reservas.some((x: any) => x.id === "bq-posta"), "y el turno del mostrador");
  assert.equal((await b.atender({ tab: "t1", ruta: "/api/auth/yo" })).usuario?.nombre, "Posta Uno", "la sesión de la pestaña sigue abierta");
  const mias = (await b.atender({ tab: "t1", ruta: "/api/turnero/reservas" })).reservas;
  assert.ok(mias.some((x: any) => x.id === r.reserva.id));
  const despues = (await b.atender({ tab: "t1", ruta: `/api/turnero/disponibilidad?fecha=${fecha}&duracion=90` })).slots;
  assert.ok(!despues.some((x: any) => x.inicio === s.inicio && x.canchaId === s.canchaId), "el horario sigue ocupado");
  // El mismo usuario puede volver a entrar con su clave, y un usuario nuevo no pisa el id de uno anterior.
  assert.equal((await b.atender({ tab: "t3", metodo: "POST", ruta: "/api/auth/ingresar", cuerpo: { usuario: "1150002222", clave: "canchaazul9" } })).ok, true);
  const nuevo = await b.atender({ tab: "t4", metodo: "POST", ruta: "/api/auth/registro", cuerpo: { nombre: "Posta Dos", tel: "1150003333", clave: "canchaazul9" } });
  assert.notEqual(nuevo.usuario.id, (await b.atender({ tab: "t1", ruta: "/api/auth/yo" })).usuario.id);
  b.cerrar();
});

test("toma de posta en una pestaña NUEVA (Gate B1): los ids nuevos no chocan con los de la demo recibida", async () => {
  // Otra pestaña = otro módulo con el contador de ids en cero: se simula con un proceso de Node aparte.
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const a = L.crearServidorDemo();
  await a.atender({ tab: "t1", ruta: "/api/turnero/config" });
  const foto = a.exportar();
  a.cerrar();
  const idsDemo = new Set([...foto.turnero.estado.reservas.map((r: any) => r.id), ...foto.turnero.estado.cuentas.map((c: any) => c.id), ...foto.turnero.estado.caja.movimientos.map((m: any) => m.id)].filter(Boolean));
  const dir = mkdtempSync(join(tmpdir(), "bp-posta-"));
  writeFileSync(join(dir, "foto.json"), JSON.stringify(foto));
  const local = new URL("../../../../public/previews/breakpoint/turnero/local.mjs", import.meta.url).href;
  const guion = `
    import { readFileSync } from "node:fs";
    const { crearServidorDemo } = await import(${JSON.stringify(local)});
    const b = crearServidorDemo({ foto: JSON.parse(readFileSync(${JSON.stringify(join(dir, "foto.json"))}, "utf8")) });
    const cfg = await b.atender({ tab: "t9", ruta: "/api/turnero/config" });
    await b.atender({ tab: "t9", metodo: "POST", ruta: "/api/auth/registro", cuerpo: { nombre: "Pestaña Nueva", tel: "1150004444", clave: "canchaazul9" } });
    const hechas = [];
    for (const dia of cfg.dias.slice(2, 5)) {
      const s = (await b.atender({ tab: "t9", ruta: "/api/turnero/disponibilidad?fecha=" + dia.fecha + "&duracion=90" })).slots.at(-1);
      const r = await b.atender({ tab: "t9", metodo: "POST", ruta: "/api/turnero/reservas", cuerpo: { fecha: dia.fecha, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 } });
      const sim = await b.atender({ tab: "t9", metodo: "POST", ruta: "/api/turnero/reservas/" + r.reserva.id + "/simular-comprobante", cuerpo: { variante: "ok" } });
      hechas.push({ id: r.reserva.id, decision: sim.resultados?.[0]?.decision });
    }
    const baja = await b.atender({ tab: "t9", metodo: "DELETE", ruta: "/api/turnero/reservas/" + hechas[0].id });
    const est = (await b.atender({ tab: "club", ruta: "/api/staff/estado" })).estado;
    b.cerrar();
    console.log(JSON.stringify({ hechas, baja: baja.status, movs: est.caja.movimientos.map((m) => m.id), reservas: est.reservas.map((r) => r.id) }));
  `;
  let salida = "";
  try { salida = execFileSync(process.execPath, ["--input-type=module", "-e", guion], { encoding: "utf8" }); } finally { rmSync(dir, { recursive: true, force: true }); }
  const res = JSON.parse(salida.trim().split("\n").at(-1) ?? "{}");
  for (const h of res.hechas) {
    assert.ok(!idsDemo.has(h.id), `la reserva nueva ${h.id} no repite un id de la demo`);
    assert.equal(h.decision, "confirmar", `la seña de ${h.id} se concilia`);
  }
  assert.equal(res.baja, 200, "la cancelación encuentra su turno");
  assert.equal(new Set(res.reservas).size, res.reservas.length, "ningún id de reserva repetido");
  assert.equal(new Set(res.movs.filter(Boolean)).size, res.movs.filter(Boolean).length, "ningún movimiento de caja repetido");
});

test("bus: si le roban el lock mientras espera la foto, no quedan dos servidores (Gate S1)", async () => {
  // Web Locks simulado según la especificación: al robar, la promesa del dueño anterior se rechaza con AbortError,
  // pero su callback sigue corriendo (acá, esperando la foto).
  const g: any = globalThis;
  const antes = { add: g.addEventListener, locks: Object.getOwnPropertyDescriptor(g.navigator, "locks") };
  g.addEventListener ??= () => {};
  let dueno: any = null, forzarRobo = false;
  const cola: any[] = [];
  const otorgar = (r: any) => {
    dueno = r;
    Promise.resolve().then(() => r.cb()).then((v: any) => { if (dueno === r) { dueno = null; r.ok(v); const sig = cola.shift(); if (sig) otorgar(sig); } }, r.mal);
  };
  const locks = {
    request(_n: string, opts: any, cb: any) {
      return new Promise((ok, mal) => {
        const r = { cb, ok, mal };
        if (opts.steal || forzarRobo) {
          if (dueno) { const d = dueno; dueno = null; d.mal(Object.assign(new Error("robado"), { name: "AbortError" })); }
          otorgar(r);
        } else if (!dueno) otorgar(r); else cola.push(r);
      });
    },
  };
  Object.defineProperty(g.navigator, "locks", { value: locks, configurable: true });
  const { unirseAlBus } = await import("../../../../public/previews/breakpoint/turnero/bus.mjs");
  const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const A: any = unirseAlBus();
  await espera(100); // A tiene el lock y está esperando la foto (400 ms)
  forzarRobo = true;
  const B: any = unirseAlBus(); // B roba: como el vigía o el robo de 3 s después del «adiós»
  forzarRobo = false;
  await espera(1500);
  try {
    assert.equal([A, B].filter((x) => x.esServidor()).length, 1, "un solo servidor");
  } finally {
    A.cerrar(); B.cerrar();
    if (antes.locks) Object.defineProperty(g.navigator, "locks", antes.locks); else delete g.navigator.locks;
    g.addEventListener = antes.add;
  }
});

test("bus: la semilla del club nunca pisa una demo real en la toma de posta (Gate B2)", { timeout: 40000 }, async () => {
  // S es el servidor con una reserva real; B, un turnero cliente con esa foto; C, el club abierto después de la última
  // foto (ofrece su estado como semilla). S muere sin «adiós»: B tiene que seguir con la reserva real.
  const g: any = globalThis;
  const antes = { add: g.addEventListener, locks: Object.getOwnPropertyDescriptor(g.navigator, "locks") };
  g.addEventListener ??= () => {};
  const colas = new Map<string, any>();
  Object.defineProperty(g.navigator, "locks", { configurable: true, value: { request(nombre: string, opts: any, cb: any) {
    const q = colas.get(nombre) ?? { holder: null, espera: [] as any[] }; colas.set(nombre, q);
    return new Promise((ok, mal) => {
      const correr = () => { q.holder = {}; Promise.resolve(cb()).then(ok, mal).finally(() => { q.holder = null; const sig = q.espera.shift(); if (sig) sig(); }); };
      if (opts?.steal || !q.holder) correr(); else q.espera.push(correr);
    });
  } } });
  const unirseAlBus: any = (await import("../../../../public/previews/breakpoint/turnero/bus.mjs")).unirseAlBus;
  const Mo: any = await import("../../../../public/previews/breakpoint/club/motor.mjs");
  const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const S: any = unirseAlBus({});
  await espera(1000);
  const B: any = unirseAlBus({});
  await espera(800);
  const est = (await S.api("/api/staff/estado")).estado;
  const fecha = Mo.sumarDias(est.reservas[0].fecha, 40);
  const nueva = (id: string, inicio: number) => ({ id, fecha, inicio, duracion: 90, canchaId: est.canchas[0].id, estado: "reservada", titular: id, jugadores: [], pagos: [], sena: { monto: 0, pagada: false } });
  await S.api("/api/staff/sync", { metodo: "POST", cuerpo: { reservas: [nueva("REAL1", 600)] } });
  await espera(300);
  const semilla = Mo.generarDemo(fecha); semilla.reservas.push(nueva("SEMILLA1", 900));
  const C: any = unirseAlBus({ soloCliente: true, fotoLocal: () => ({ semilla: true, turnero: { estado: structuredClone(semilla) } }) });
  await espera(500);
  S.cerrar(); // muere sin «adiós» ni última foto
  try {
    for (let i = 0; i < 40 && !B.esServidor(); i++) await espera(500);
    await espera(600);
    const ids = new Set((await B.api("/api/staff/estado")).estado.reservas.map((r: any) => r.id));
    assert.ok(B.esServidor(), "B tomó la posta");
    assert.ok(ids.has("REAL1"), "conserva la reserva real");
    assert.ok(!ids.has("SEMILLA1"), "no arrancó desde la semilla del club");
  } finally {
    B.cerrar(); C.cerrar();
    if (antes.locks) Object.defineProperty(g.navigator, "locks", antes.locks); else delete g.navigator.locks;
    g.addEventListener = antes.add;
  }
});
