// Tests de "una clienta, una ficha". EJECUTAN la búsqueda contra una base de mentira que
// responde como Prisma (filtra por tenant y por id), con los formatos reales de telefono.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filtrarOpciones } from "@/components/ui/buscador-filtro";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { montoDelCobro, quedaSaldado } from "@/lib/turnos/cobro-alta";
import { validarCobroTurno } from "@/lib/turnos/cobros";
import {
  alCambiarTelefono,
  alElegirFicha,
  buscarFichaPorTelefono,
  DATOS_CLIENTA_VACIOS,
  detalleFicha,
  elegirFicha,
  entradaAuditoriaEmpate,
  fichaParaTelefono,
  resumirFichasParaAlta,
  type DatosClientaAlta,
  type LectorFichas,
} from "./ficha-por-telefono";

type Fila = { id: string; tenantId: string; phone: string; createdAt: Date; turnos: number };

function baseDeMentira(filas: Fila[]) {
  const consultas: unknown[] = [];
  const db: LectorFichas = {
    client: {
      async findMany(args) {
        consultas.push(args);
        const ids = args.where.id?.in;
        return filas
          .filter((f) => f.tenantId === args.where.tenantId && (!ids || ids.includes(f.id)))
          .map((f) =>
            "phone" in args.select
              ? { id: f.id, phone: f.phone }
              : { id: f.id, createdAt: f.createdAt, _count: { appointments: f.turnos } },
          );
      },
    },
  };
  return { db, consultas };
}

const ANA: Fila = { id: "ana", tenantId: "ch", phone: "11 4000-7919", createdAt: new Date("2025-01-10"), turnos: 7 };
const OTRA: Fila = { id: "otra", tenantId: "ch", phone: "11 4300-1234", createdAt: new Date("2025-02-01"), turnos: 2 };
// El MISMO número en otro tenant: nunca puede aparecer.
const AJENA: Fila = { id: "ajena", tenantId: "magra", phone: "1140007919", createdAt: new Date("2024-01-01"), turnos: 40 };

test("'11 4000-7919', '1140007919' y '+54 9 11 4000-7919' encuentran la misma ficha", async () => {
  const { db } = baseDeMentira([ANA, OTRA, AJENA]);
  for (const tel of ["11 4000-7919", "1140007919", "+54 9 11 4000-7919", "011 15-4000-7919", "5491140007919"]) {
    const r = await buscarFichaPorTelefono(db, "ch", tel);
    assert.deepEqual(r, { id: "ana", empate: null }, tel);
  }
});

test("la búsqueda no cruza de tenant: el mismo número en MAGRA no es la ficha de CH", async () => {
  const { db, consultas } = baseDeMentira([OTRA, AJENA]);
  assert.equal(await buscarFichaPorTelefono(db, "ch", "1140007919"), null);
  assert.ok(consultas.every((c) => (c as { where: { tenantId: string } }).where.tenantId === "ch"));
});

test("un teléfono sin dígitos no busca nada (ni toca la base)", async () => {
  const { db, consultas } = baseDeMentira([ANA]);
  assert.equal(await buscarFichaPorTelefono(db, "ch", "   "), null);
  assert.equal(consultas.length, 0);
});

test("empate: dos fichas del mismo número → gana la de más turnos y se informa el empate", async () => {
  const duplicada: Fila = { id: "ana-dup", tenantId: "ch", phone: "1140007919", createdAt: new Date("2024-06-01"), turnos: 1 };
  const { db } = baseDeMentira([duplicada, ANA, OTRA]);
  const r = await buscarFichaPorTelefono(db, "ch", "+54 9 11 4000-7919");
  assert.equal(r?.id, "ana");
  assert.deepEqual(r?.empate, {
    clave: "1140007919",
    elegida: "ana",
    candidatas: [
      { id: "ana-dup", turnos: 1 },
      { id: "ana", turnos: 7 },
    ],
  });
  const fila = entradaAuditoriaEmpate(r!.empate!);
  assert.equal(fila.entity, "Client");
  assert.equal(fila.entityId, "ana");
});

test("empate con los mismos turnos: la ficha más vieja, y si no, el id menor (no el orden de la base)", () => {
  const a = { id: "b", turnos: 3, createdAt: new Date("2025-05-01") };
  const b = { id: "a", turnos: 3, createdAt: new Date("2025-01-01") };
  assert.equal(elegirFicha([a, b])?.id, "a");
  assert.equal(elegirFicha([b, a])?.id, "a");
  assert.equal(elegirFicha([{ id: "z", turnos: 0 }, { id: "y", turnos: 0 }])?.id, "y");
  assert.equal(elegirFicha([]), null);
});

// ── Lo que ve el alta ─────────────────────────────────────────────────────────

const clientes = [
  { id: "ana", name: "Ana", phone: "11 4000-7919", notes: "Alérgica al látex", isResident: true, createdAt: new Date("2025-01-10"), _count: { appointments: 3 } },
  { id: "bea", name: "Bea", phone: "11 4300-1234", notes: null, isResident: null, createdAt: new Date("2025-03-10"), _count: { appointments: 0 } },
];

test("el resumen trae la última visita completada y el saldo de lo prestado sin cobrar", () => {
  const [ana, bea] = resumirFichasParaAlta(clientes, [
    { clientId: "ana", status: "COMPLETED", startsAt: new Date("2026-08-01T13:00:00Z"), precio: 20000, servicio: "Facial", profesional: "Vero", cobros: [{ amount: 20000, method: "EFECTIVO" }] },
    { clientId: "ana", status: "COMPLETED", startsAt: new Date("2026-09-01T13:00:00Z"), precio: 18000, servicio: "Masaje", profesional: "Caro", cobros: [{ amount: 5000, method: "MP" }] },
  ]);
  assert.deepEqual(ana.ultimaVisita, { fecha: "2026-09-01T13:00:00.000Z", servicio: "Masaje", profesional: "Caro" });
  assert.equal(ana.saldo, 13000);
  assert.equal(ana.notas, "Alérgica al látex");
  assert.equal(bea.ultimaVisita, null);
  assert.equal(bea.saldo, 0);
});

test("el pago previo a los cobros parciales cuenta como cobrado: no aparece como deuda", () => {
  const [ana] = resumirFichasParaAlta(clientes, [
    { clientId: "ana", status: "COMPLETED", startsAt: new Date("2026-08-01T13:00:00Z"), precio: 20000, servicio: "Facial", profesional: "Vero", cobros: [], pagoLegado: { status: "APPROVED", amount: 20000 } },
  ]);
  assert.equal(ana.saldo, 0);
});

test("las notas largas se recortan para no inflar la página", () => {
  const [ana] = resumirFichasParaAlta([{ ...clientes[0], notes: "x".repeat(500) }], []);
  assert.equal(ana.notas!.length, 160);
  assert.ok(ana.notas!.endsWith("…"));
});

test("tipear '1140007919' en el alta reconoce la ficha cargada como '11 4000-7919'", () => {
  const fichas = resumirFichasParaAlta(clientes, []);
  assert.equal(fichaParaTelefono(fichas, "1140007919")?.id, "ana");
  assert.equal(fichaParaTelefono(fichas, "+54 9 11 4000-7919")?.id, "ana");
  assert.equal(fichaParaTelefono(fichas, "1150001111"), null);
});

test("en el buscador 'Clienta', tipear '1140007919' encuentra a la cargada como '11 4000-7919'", () => {
  // Ejecuta el filtro REAL del BuscadorCombo con las opciones tal como las arma el alta.
  const fichas = resumirFichasParaAlta(clientes, []);
  const opciones = fichas.map((f) => ({ id: f.id, etiqueta: f.nombre, detalle: detalleFicha(f) }));
  assert.deepEqual(filtrarOpciones(opciones, "1140007919").map((o) => o.id), ["ana"]);
  assert.deepEqual(filtrarOpciones(opciones, "4000-7919").map((o) => o.id), ["ana"]);
  assert.deepEqual(filtrarOpciones(opciones, "ana").map((o) => o.id), ["ana"]);
});

// ── La precarga del alta: "de la zona" decide el precio que se congela ────────
//
// Se prueba la regla con la secuencia que hace la recepción en el formulario, llamada por
// llamada, como la llama el componente (`setDatos((d) => alCambiarTelefono(d, tel, lista))`).

const FICHAS = resumirFichasParaAlta(
  [
    ...clientes,
    { id: "caro", name: "Caro", phone: "11 4555-0000", notes: null, isResident: false, createdAt: new Date("2025-04-01"), _count: { appointments: 1 } },
  ],
  [],
);
const tipear = (d: DatosClientaAlta, tel: string) => alCambiarTelefono(d, tel, FICHAS);

test("tipear el teléfono de una vecina completa el nombre y tilda 'de la zona' como dice su ficha", () => {
  const d = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  assert.equal(d.nombre, "Ana");
  assert.equal(d.vecina, true);
  assert.equal(d.precarga?.fichaId, "ana");
});

test("corregir el teléfono a uno sin ficha DESTILDA y borra el nombre que había puesto la precarga", () => {
  // El caso de la revisión: antes quedaban "Ana" y el tilde, y el servidor creaba una ficha
  // NUEVA con ese nombre, "de la zona", y el turno congelado con el precio local.
  let d = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  d = tipear(d, "1140007918");
  assert.deepEqual(d, { nombre: "", telefono: "1140007918", vecina: false, precarga: null });
});

test("tecla por tecla: reconoce al completar el número y deshace al borrar un dígito", () => {
  let d = DATOS_CLIENTA_VACIOS;
  for (const c of "11 4000-7919") d = tipear(d, d.telefono + c);
  assert.equal(d.vecina, true);
  assert.equal(d.nombre, "Ana");
  d = tipear(d, d.telefono.slice(0, -1));
  assert.equal(d.vecina, false);
  assert.equal(d.nombre, "");
});

test("lo que la recepción escribió o tildó a mano no se pisa, ni al precargar ni al deshacer", () => {
  // Nombre tipeado antes del teléfono: la precarga no lo pisa y al deshacer queda.
  let a: DatosClientaAlta = { ...DATOS_CLIENTA_VACIOS, nombre: "Ana María" };
  a = tipear(a, "1140007919");
  assert.equal(a.nombre, "Ana María");
  assert.equal(a.vecina, true);
  a = tipear(a, "11400079");
  assert.equal(a.nombre, "Ana María");
  assert.equal(a.vecina, false);

  // Destildada a mano después de la precarga: al perder la ficha sigue destildada.
  let b = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  b = { ...b, vecina: false };
  b = tipear(b, "1150001111");
  assert.equal(b.vecina, false);

  // Tildada a mano ANTES, y la ficha dice que no es vecina: manda la ficha (es la que el
  // servidor va a usar); si la ficha deja de corresponder, vuelve el tilde de la recepción.
  let c: DatosClientaAlta = { ...DATOS_CLIENTA_VACIOS, vecina: true };
  c = tipear(c, "11 4555-0000");
  assert.equal(c.vecina, false);
  assert.equal(c.nombre, "Caro");
  c = tipear(c, "11 4555-000");
  assert.equal(c.vecina, true);
  assert.equal(c.nombre, "");
});

test("de una ficha a otra: se deshace la primera y se aplica la segunda", () => {
  let d = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  d = tipear(d, "11 4555-0000");
  assert.equal(d.nombre, "Caro");
  assert.equal(d.vecina, false);
  assert.equal(d.precarga?.fichaId, "caro");
});

test("el mismo número escrito de otra forma no toca nada, ni lo corregido a mano", () => {
  let d = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  d = { ...d, nombre: "Ana P." };
  d = tipear(d, "+54 9 11 4000-7919");
  assert.equal(d.nombre, "Ana P.");
  assert.equal(d.vecina, true);
  assert.equal(d.precarga?.fichaId, "ana");
});

test("una ficha sin el dato (isResident null) no tilda: el beneficio se otorga, no se presume", () => {
  const d = tipear(DATOS_CLIENTA_VACIOS, "1143001234");
  assert.equal(d.nombre, "Bea");
  assert.equal(d.vecina, false);
});

test("elegir en el buscador pisa el nombre y pone el teléfono; con duplicadas manda la ficha del servidor", () => {
  let d = alElegirFicha({ ...DATOS_CLIENTA_VACIOS, nombre: "otra cosa" }, FICHAS[0], FICHAS);
  assert.deepEqual([d.nombre, d.telefono, d.vecina], ["Ana", "11 4000-7919", true]);
  // Y si después se corrige el teléfono, vuelve lo que había antes de elegirla.
  d = tipear(d, "1150001111");
  assert.deepEqual([d.nombre, d.vecina], ["otra cosa", false]);

  // Dos fichas del mismo número: la elegida es la duplicada (0 turnos, no vecina), pero el
  // servidor va a usar la de más turnos. El formulario precarga ESA, no la elegida.
  const conDuplicada = resumirFichasParaAlta(
    [
      { id: "ana-dup", name: "Ana D", phone: "1140007919", notes: null, isResident: false, createdAt: new Date("2025-06-01"), _count: { appointments: 0 } },
      clientes[0],
    ],
    [],
  );
  const e = alElegirFicha(DATOS_CLIENTA_VACIOS, conDuplicada[0], conDuplicada);
  assert.equal(e.precarga?.fichaId, "ana");
  assert.equal(e.nombre, "Ana");
  assert.equal(e.vecina, true);
});

test("el precio del alta sigue al tilde: vecina reconocida → el local; ficha perdida → el general", () => {
  // La misma composición que hace el formulario: tilde → `precioCongeladoDeReserva` (lo que
  // congela `bookAppointment`) → "Total del servicio" (`montoDelCobro`).
  const servicio = { price: 20000, residentPrice: 16000 };
  let d = tipear(DATOS_CLIENTA_VACIOS, "1140007919");
  let precio = precioCongeladoDeReserva(servicio, d.vecina).priceAtBooking;
  assert.equal(precio, 16000);
  const total = montoDelCobro({ modo: "total", senia: 0, precio });
  assert.equal(total, 16000);
  assert.equal(quedaSaldado({ monto: total, precio }), true);
  // El servidor valida el cobro del alta contra el turno congelado (`validarCobroTurno`, la que
  // llama `aplicarCobroTurnoInTx` al reservar): el Total del precio local entra y lo salda; el
  // general —lo que proponía el formulario antes con "de la zona" tildado— se rechaza.
  const alta = { status: "PENDING", precio, cobros: [] };
  assert.deepEqual(validarCobroTurno({ ...alta, monto: total }), { ok: true, monto: 16000, saldoDespues: 0, quedaSaldado: true });
  assert.deepEqual(validarCobroTurno({ ...alta, monto: servicio.price }), { ok: false, motivo: "excede-saldo", saldo: 16000 });

  d = tipear(d, "1150001111");
  precio = precioCongeladoDeReserva(servicio, d.vecina).priceAtBooking;
  assert.equal(precio, 20000);
});

// ── Chequeo de FORMA: que los caminos de alta usen la regla ──────────────────
// Lo de arriba prueba la regla con datos. Esto sólo verifica que los llamadores la usen, que
// es lo único que no se puede ejecutar sin base: los cuatro caminos pasan por
// `buscarFichaPorTelefono`, ninguno volvió al match exacto por `phone`, y el camino PÚBLICO
// no escribe sobre una ficha existente.

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const actions = sinComentarios(readFileSync(new URL("../actions.ts", import.meta.url), "utf8"));
const espera = sinComentarios(readFileSync(new URL("../waitlist-actions.ts", import.meta.url), "utf8"));

function cuerpo(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i !== -1, `no encontré "${firma}"`);
  const j = src.indexOf("\nexport ", i + firma.length);
  return src.slice(i, j === -1 ? undefined : j);
}

test("ningún camino de alta busca la clienta por el teléfono tipeado tal cual", () => {
  for (const [nombre, src] of [["actions.ts", actions], ["waitlist-actions.ts", espera]] as const) {
    assert.doesNotMatch(src, /client\.findFirst\(\{\s*where:\s*\{[^}]*\bphone\b/, `${nombre} volvió al match exacto por phone`);
  }
});

test("los cuatro caminos de alta pasan por buscarFichaPorTelefono", () => {
  assert.match(cuerpo(actions, "export async function createAppointment("), /fichaDeReservaPublica\(/);
  assert.match(cuerpo(actions, "export async function createBookingFromModal("), /fichaDeReservaPublica\(/);
  assert.match(cuerpo(actions, "export async function createManualAppointment("), /buscarFichaPorTelefono\(/);
  assert.match(cuerpo(espera, "export async function bookFromWaitlist("), /buscarFichaPorTelefono\(/);
});

test("la reserva pública no modifica una ficha existente (ni isResident ni nada)", () => {
  const i = actions.indexOf("async function fichaDeReservaPublica(");
  assert.ok(i !== -1, "no encontré fichaDeReservaPublica");
  const helper = actions.slice(i, actions.indexOf("\nexport ", i));
  assert.match(helper, /buscarFichaPorTelefono\(/);
  assert.doesNotMatch(helper, /client\.(update|upsert|updateMany)\(/);
  // No exportada: en un archivo "use server" sería un endpoint.
  assert.doesNotMatch(actions, /export\s+async\s+function\s+fichaDeReservaPublica/);
  for (const firma of ["export async function createAppointment(", "export async function createBookingFromModal("]) {
    assert.doesNotMatch(cuerpo(actions, firma), /client\.(update|upsert|updateMany)\(/, firma);
  }
});

test("el alta usa la precarga pura y el precio del servidor, sin reglas propias", () => {
  const form = sinComentarios(
    readFileSync(new URL("../../app/admin/(dashboard)/turnos/NewAppointmentForm.tsx", import.meta.url), "utf8"),
  );
  assert.match(form, /alCambiarTelefono\(d, telefono, lista\)/);
  assert.match(form, /alElegirFicha\(d, f, lista\)/);
  // Ningún tilde sale de leer la ficha a mano en el componente (así quedaba colgado).
  assert.doesNotMatch(form, /\b(f|ficha|reconocida)\.vecina\b/);
  // "Total del servicio" y la seña salen del precio que se congela, no de `service.price`.
  assert.match(form, /precioCongeladoDeReserva\(service, datos\.vecina\)/);
  assert.doesNotMatch(form, /const precio = service\?\.price/);
});

// ── Pendiente AFUERA de este frente: las páginas públicas del turno ──────────
//
// Con la coincidencia normalizada, una reserva web anónima con el número de una clienta —en
// cualquier formato— queda colgada de la ficha de ella. Esta función no le devuelve nada de la
// ficha al visitante, pero las dos páginas públicas del turno leen `appointment.client` y
// muestran su NOMBRE: /reserva/confirmacion/[id] ("Gracias, <nombre de la ficha>") y
// /reserva/turno/[id] ("Hola <nombre de la ficha>", vía `getMyAppointment`, que además trae
// la ficha entera con `client: true`). Esos archivos no son de este frente: el cambio está
// pedido afuera y entró en el MISMO push: esto queda de guardia.
test(
  "las páginas públicas del turno no muestran datos de la ficha",
  () => {
    const leer = (ruta: string) => sinComentarios(readFileSync(new URL(ruta, import.meta.url), "utf8"));
    const confirmacion = leer("../../app/(site)/reserva/confirmacion/[id]/page.tsx");
    const miTurno = leer("../../app/(site)/reserva/turno/[id]/page.tsx");
    const clientActions = leer("../client-actions.ts");
    // `assert.ok` y no `doesNotMatch`: en rojo interesa el motivo, no volcar la página entera.
    for (const [nombre, src] of [["confirmacion", confirmacion], ["turno", miTurno]] as const) {
      assert.ok(!/\.client\.(name|phone|email|notes)\b/.test(src), `${nombre} muestra datos de la ficha`);
    }
    assert.ok(!/client:\s*true/.test(confirmacion), "confirmacion trae la ficha entera");
    assert.ok(
      !/client:\s*true/.test(cuerpo(clientActions, "export async function getMyAppointment(")),
      "getMyAppointment trae la ficha entera",
    );
  },
);
