// El buscador «/» de clientas y turnos, sin base (reingeniería CH, Tanda 2): orden, deuda, seña
// pendiente, permisos y lo que se pinta. CH-022 (la seña pendiente sale con su hueco), CH-028 (Laura
// con próximo turno, «Debe $9.000», faltazos y las 4 teclas; [Dar turno] abre el alta con ella).

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerBusqueda } from "@/lib/buscador/registros-core";
import { hrefNuevoTurno } from "@/app/admin/(dashboard)/turnos/pasos";
import {
  LIMITE_CLIENTAS,
  LIMITE_TURNOS,
  armarFichas,
  cuandoEs,
  deudaDe,
  hrefDarTurno,
  ordenarClientas,
  saludoDeWhatsApp,
  seniaPendiente,
  type LecturaDelBuscador,
  type PermisosDelBuscador,
  type TurnoLeido,
} from "./buscar-core";

const b = (q: string) => {
  const r = leerBusqueda(q);
  if (!r.ok) throw new Error(r.mensaje);
  return r;
};
// Jueves 22/10/2026, 11:00 en Buenos Aires (UTC−3).
const AHORA = new Date("2026-10-22T14:00:00.000Z");
const H = 3_600_000;

const RECEPCION: PermisosDelBuscador = { verClientas: true, darTurno: true, cobrar: true };
const PROFESIONAL: PermisosDelBuscador = { verClientas: false, darTurno: false, cobrar: true };

const turno = (id: string, clienteId: string, o: Partial<TurnoLeido> = {}): TurnoLeido => ({
  id,
  clienteId,
  clienta: "Laura Gómez",
  inicio: new Date(AHORA.getTime() + 50 * H),
  estado: "PENDING",
  servicio: "Piernas completas",
  profesional: "Caro",
  precio: 14000,
  depositAmount: 5000,
  pagoLegado: null,
  cobrable: true,
  ...o,
});

function lecturaDeLaura(): LecturaDelBuscador {
  return {
    clientas: [{ id: "laura", nombre: "Laura Gómez", telefono: "11 5566-7788" }],
    proximos: [turno("t-jue", "laura")],
    completados: [
      { id: "c-vieja", clienteId: "laura", inicio: new Date(AHORA.getTime() - 40 * 24 * H), precio: 9000, pagoLegado: null },
      { id: "c-pagada", clienteId: "laura", inicio: new Date(AHORA.getTime() - 30 * 24 * H), precio: 6000, pagoLegado: null },
    ],
    faltazos: ["laura"],
    cobros: new Map([["c-pagada", [{ amount: 6000, method: "EFECTIVO" }]]]),
  };
}

test("orden: por el nombre primero, después las que coinciden sólo por el teléfono; tope 8", () => {
  const filas = [
    { id: "1", nombre: "Ana Paz", telefono: "11 5566-0001" },
    { id: "2", nombre: "Paula Laurenti", telefono: "11 4444-0002" },
    { id: "3", nombre: "Laura Gómez", telefono: "11 5566-7788" },
  ];
  assert.deepEqual(ordenarClientas(filas, b("laur")).map((f) => f.id), ["3", "2"]);
  // «5566»: por el teléfono (Ana y Laura), en orden alfabético.
  assert.deepEqual(ordenarClientas(filas, b("5566")).map((f) => f.id), ["1", "3"]);
  // De corrido también: «1155667788» encuentra «11 5566-7788».
  assert.deepEqual(ordenarClientas(filas, b("1155667788")).map((f) => f.id), ["3"]);
  const muchas = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, nombre: `Laura ${String(i).padStart(2, "0")}`, telefono: "" }));
  assert.equal(ordenarClientas(muchas, b("laura")).length, LIMITE_CLIENTAS);
});

test("deuda: Σ saldo de los turnos ya prestados con la regla de «Saldos a cobrar»; desde el más viejo", () => {
  const l = lecturaDeLaura();
  const d = deudaDe(l.completados, l.cobros);
  assert.equal(d.monto, 9000);
  assert.deepEqual(d.turnoIds, ["c-vieja"]);
  assert.equal(d.desde, "2026-09-12");
  // Un pago viejo (Payment aprobado sin cobros) cuenta como cobrado: no es deuda.
  assert.equal(deudaDe([{ ...l.completados[0], pagoLegado: { status: "APPROVED", amount: 9000 } }], new Map()).monto, 0);
});

test("seña pendiente: sólo un Reservado con seña en el catálogo y nada cobrado", () => {
  const t = turno("t", "laura");
  assert.equal(seniaPendiente(t, []), 5000);
  assert.equal(seniaPendiente(t, [{ amount: 5000, method: "TRANSFERENCIA" }]), 0, "ya entró");
  assert.equal(seniaPendiente({ ...t, estado: "CONFIRMED" }, []), 0);
  assert.equal(seniaPendiente({ ...t, depositAmount: null }, []), 0);
  // Una seña cobrada y devuelta (contrapartida): vuelve a faltar.
  assert.equal(seniaPendiente(t, [{ amount: 5000, method: "TRANSFERENCIA" }, { amount: -5000, method: "TRANSFERENCIA" }]), 5000);
});

test("CH-028 · Laura: próximo turno, «Debe $9.000», faltazos, última vez y las 4 teclas; Dar turno la trae elegida", () => {
  const grupos = armarFichas(lecturaDeLaura(), RECEPCION, AHORA);
  assert.deepEqual(grupos.map((g) => g.grupo), ["clientas", "turnos"]);
  const laura = grupos[0].items[0];
  assert.equal(laura.nombre, "Laura Gómez");
  assert.match(laura.segunda ?? "", /11 5566-7788 · turno sáb 24 13:00 · debe \$9\.000 · 1 faltazo/);
  assert.deepEqual(laura.resumen, [
    "Próximo turno: sáb 24 13:00 · Piernas completas con Caro",
    "Seña de $5.000 sin cobrar",
    "Debe $9.000",
    "1 faltazo",
    "Última vez: 22 sept",
  ]);
  assert.deepEqual(
    laura.teclas?.map((t) => t.id),
    ["dar-turno", "whatsapp", "cobrar-deuda", "ver-ficha"],
  );
  assert.equal(laura.teclas?.[0].href, hrefNuevoTurno(null, "laura"), "el mismo enlace que «Darle un turno» de la ficha");
  assert.equal(laura.href, hrefDarTurno("laura"), "Enter = Dar turno");
  const wa = laura.teclas?.find((t) => t.id === "whatsapp");
  assert.equal(wa?.externo, true);
  assert.equal(wa?.href, "https://wa.me/5491155667788?text=%C2%A1Hola%20Laura!");
  assert.equal(laura.teclas?.find((t) => t.id === "cobrar-deuda")?.href, "/admin/turnos/lista?desde=2026-09-12");
  // Los huecos de plata (2-B): la deuda con sus turnos y la seña del próximo.
  assert.deepEqual(laura.huecos, [
    { tipo: "cobrar-deuda", clienteId: "laura", monto: 9000, turnoIds: ["c-vieja"] },
    { tipo: "llego-la-senia", turnoId: "t-jue", monto: 5000 },
  ]);
  // CH-022: el turno también sale en «Turnos», con «Llegó la seña» como hueco.
  const t = grupos[1].items[0];
  assert.equal(t.nombre, "Laura Gómez · sáb 24 13:00");
  assert.deepEqual(t.huecos, [{ tipo: "llego-la-senia", turnoId: "t-jue", monto: 5000 }]);
  assert.equal(t.teclas?.[0].href, "/admin/turnos?date=2026-10-24&turno=t-jue");
});

test("respuesta mínima: el teléfono sólo en la segunda línea y adentro del enlace de WhatsApp; nada de filas crudas", () => {
  const grupos = armarFichas(lecturaDeLaura(), RECEPCION, AHORA);
  const llaves = new Set(grupos.flatMap((g) => g.items.flatMap((i) => Object.keys(i))));
  for (const k of llaves) assert.ok(["id", "grupo", "nombre", "segunda", "href", "resumen", "teclas", "huecos"].includes(k), `campo de más: ${k}`);
  const json = JSON.stringify(grupos);
  assert.doesNotMatch(json, /precio|depositAmount|pagoLegado|cobrable|undefined|NaN/);
});

test("permisos: sin agenda:collect no hay huecos de plata ni «Cobrar lo que debe»; Vero (no cobrable) no ofrece la seña", () => {
  const sinCobrar = armarFichas(lecturaDeLaura(), { ...RECEPCION, cobrar: false }, AHORA);
  const laura = sinCobrar[0].items[0];
  assert.equal(laura.huecos, undefined);
  assert.ok(!laura.teclas?.some((t) => t.id === "cobrar-deuda"));
  assert.match(laura.resumen?.join(" ") ?? "", /Debe \$9\.000/, "la deuda se ve igual");

  const l = lecturaDeLaura();
  const conVero = armarFichas({ ...l, proximos: [turno("t-jue", "laura", { cobrable: false, profesional: "Vero" })] }, RECEPCION, AHORA);
  assert.ok(!conVero[0].items[0].huecos?.some((h) => h.tipo === "llego-la-senia"));
  assert.equal(conVero[1].items[0].huecos, undefined);

  const sinDarTurno = armarFichas(lecturaDeLaura(), { ...RECEPCION, darTurno: false }, AHORA);
  assert.equal(sinDarTurno[0].items[0].teclas?.[0].id, "whatsapp");
});

test("una profesional (sin clients:read): sólo turnos, sin ficha ni WhatsApp", () => {
  const l = lecturaDeLaura();
  const grupos = armarFichas(l, PROFESIONAL, AHORA);
  assert.deepEqual(grupos.map((g) => g.grupo), ["turnos"]);
  assert.deepEqual(grupos[0].items[0].teclas?.map((t) => t.id), ["abrir-turno"]);
  assert.doesNotMatch(JSON.stringify(grupos), /5566|wa\.me|clientes\//);
});

test("turnos: del más cercano al más lejano, como mucho 5; sin nada, sin grupos", () => {
  const l = lecturaDeLaura();
  const proximos = Array.from({ length: 8 }, (_, i) => turno(`t${i}`, "laura", { inicio: new Date(AHORA.getTime() + (8 - i) * H) }));
  const g = armarFichas({ ...l, proximos }, RECEPCION, AHORA);
  const ts = g.find((x) => x.grupo === "turnos")?.items ?? [];
  assert.equal(ts.length, LIMITE_TURNOS);
  assert.deepEqual(ts.map((t) => t.id), ["turno-t7", "turno-t6", "turno-t5", "turno-t4", "turno-t3"]);
  assert.deepEqual(armarFichas({ clientas: [], proximos: [], completados: [], faltazos: [], cobros: new Map() }, RECEPCION, AHORA), []);
});

test("cómo se dice: hoy, mañana o el día; el saludo sin nombre no dice undefined (CH-050)", () => {
  assert.equal(cuandoEs(new Date(AHORA.getTime() + 2 * H), AHORA), "hoy 13:00");
  assert.equal(cuandoEs(new Date(AHORA.getTime() + 24 * H), AHORA), "mañana 11:00");
  assert.equal(saludoDeWhatsApp("Laura Gómez"), "¡Hola Laura!");
  assert.equal(saludoDeWhatsApp("   "), "¡Hola!");
  const sinTel = armarFichas({ ...lecturaDeLaura(), clientas: [{ id: "laura", nombre: "Laura Gómez", telefono: "" }] }, RECEPCION, AHORA);
  assert.ok(!sinTel[0].items[0].teclas?.some((t) => t.id === "whatsapp"), "sin celular, sin WhatsApp");
  assert.match(sinTel[0].items[0].segunda ?? "", /^Sin teléfono/);
});
