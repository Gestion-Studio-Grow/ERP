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
