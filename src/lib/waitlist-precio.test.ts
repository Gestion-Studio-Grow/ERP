// ============================================================================
// TEST DE INVARIANTE — los CUATRO caminos de alta congelan el MISMO precio
// ============================================================================
//
// El defecto que cierra este archivo no fue una cuenta mal hecha: fue una SEGUNDA
// función que hacía lo mismo por otro camino. Hay cuatro formas de dar de alta un
// turno —reserva pública, modal de la vidriera, alta manual de recepción y reservar
// desde la lista de espera— y tres pasaban por `bookAppointment` (src/lib/actions.ts),
// que congela el precio con la regla de vecino de ADR-013. La cuarta tenía su propio
// `appointment.create` y escribía `priceAtBooking: service.price` a secas: la vecina
// que esperó un hueco pagaba el precio de no-vecina, y la comisión se devengaba sobre
// ese precio inflado. El precio queda CONGELADO en el turno, así que el cobro
// posterior no lo corrige.
//
// Por eso el test no prueba una función: prueba la INVARIANTE de que las dos
// enunciaciones de la regla que quedan vivas en el árbol dan el MISMO número para la
// misma (clienta, servicio), y que no aparezca una tercera. No alcanza con comparar
// textos —dos redacciones distintas pueden ser correctas—, así que se extrae la regla
// de cada archivo y se la EJECUTA contra la misma tabla de casos.
//
// ACTUALIZADO: la regla YA NO está enunciada dos veces. Vive en `precio-reserva.ts`,
// que es puro y no importa nada, y los dos caminos la llaman. Así que este archivo
// dejó de extraer texto con expresiones regulares —eso podía quedar verde con la regla
// bien escrita y el resultado nunca llegando a `priceAtBooking`— y ahora hace dos cosas:
// EJECUTA la regla real contra la tabla de casos, y verifica que ningún archivo del
// árbol vuelva a enunciarla por su cuenta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// Los comentarios se sacan antes de mirar el texto: este mismo archivo, y el arreglo que
// cuida, CITAN el código viejo (`priceAtBooking: service.price`) para explicar qué pasaba.
// Sin esto, la cita dispararía la guarda y el test fallaría por hablar del bug.
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

const ACTIONS = "src/lib/actions.ts";
const WAITLIST = "src/lib/waitlist-actions.ts";
const fuente: Record<string, string> = {
  [ACTIONS]: sinComentarios(leer("./actions.ts")),
  [WAITLIST]: sinComentarios(leer("./waitlist-actions.ts")),
};

// --- La regla real, ejecutada -------------------------------------------------

type Servicio = { price: number; residentPrice: number | null };

// Una misma clienta y un mismo servicio, mirados desde cada camino de alta.
const CASOS: { que: string; servicio: Servicio; isResident: boolean | null; esperado: number; vecina: boolean }[] = [
  { que: "vecina, servicio con precio preferencial", servicio: { price: 20000, residentPrice: 16000 }, isResident: true, esperado: 16000, vecina: true },
  { que: "no vecina, servicio con precio preferencial", servicio: { price: 20000, residentPrice: 16000 }, isResident: false, esperado: 20000, vecina: false },
  { que: "ficha sin el dato (null) — no se regala el beneficio", servicio: { price: 20000, residentPrice: 16000 }, isResident: null, esperado: 20000, vecina: false },
  { que: "vecina, servicio SIN precio preferencial", servicio: { price: 20000, residentPrice: null }, isResident: true, esperado: 20000, vecina: false },
  { que: "preferencial en cero (gratis para vecinas) no cae al general", servicio: { price: 20000, residentPrice: 0 }, isResident: true, esperado: 0, vecina: true },
];

test("la regla congela el precio que corresponde, y deja dicho por qué", () => {
  for (const c of CASOS) {
    const r = precioCongeladoDeReserva(c.servicio, c.isResident);
    assert.equal(r.priceAtBooking, c.esperado, `ADR-013 roto en: ${c.que}`);
    assert.equal(
      r.isResidentBooking,
      c.vecina,
      `${c.que}: el rastro \`isResidentBooking\` tiene que decir la MISMA condición con la que ` +
        "se eligió el precio. Si se separan, el turno dice que cobró precio vecino y cobró otro " +
        "(o al revés), y los reportes de ADR-013 mienten.",
    );
  }
});

test("un isResident ausente (undefined) paga el general, no rompe", () => {
  // `bookAppointment` lo recibe opcional: la reserva pública puede no traer la ficha.
  const r = precioCongeladoDeReserva({ price: 20000, residentPrice: 16000 }, undefined);
  assert.equal(r.priceAtBooking, 20000);
  assert.equal(r.isResidentBooking, false);
});

test("los dos caminos de alta llaman a la regla en vez de reescribirla", () => {
  for (const archivo of [ACTIONS, WAITLIST]) {
    assert.match(
      fuente[archivo],
      /precioCongeladoDeReserva\(/,
      `${archivo} tiene que resolver el precio con \`precioCongeladoDeReserva\`. Una segunda ` +
        "enunciación de la regla es exactamente lo que dejó a la vecina de la lista de espera " +
        "pagando de más durante semanas.",
    );
    assert.doesNotMatch(
      fuente[archivo],
      /const\s+appliesResidentPrice\s*=/,
      `${archivo} volvió a enunciar la regla por su cuenta en vez de llamarla.`,
    );
  }
});

test("nadie más en el árbol vuelve a ELEGIR entre los dos precios por su cuenta", () => {
  // Lo que se persigue es la ELECCIÓN (`... ? algo.residentPrice : algo.price`), no la simple
  // mención de `residentPrice`: mostrar "Vecino/a $16.000" al lado del precio de lista es una
  // etiqueta de vidriera y no decide qué se cobra. Elegir sí, y cuando esa elección estuvo
  // escrita en varios lados, una copia se quedó atrás — primero en la lista de espera (la
  // vecina pagaba de más) y después en el modal de reserva (veía un número y pagaba otro).
  const culpables = archivosFuente().filter((p) => {
    if (p === "src/lib/turnos/precio-reserva.ts") return false;
    const t = sinComentarios(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
    return /residentPrice!?\s*:\s*\w+\.price\b/.test(t) || /const\s+appliesResidentPrice\s*=/.test(t);
  });
  assert.deepEqual(
    culpables,
    [],
    "Apareció otra enunciación de la regla de precio de vecina. La regla vive en " +
      "src/lib/turnos/precio-reserva.ts y se LLAMA; copiarla es cómo se separaron la última vez.",
  );
});

// --- Que no aparezca un quinto camino ----------------------------------------

function archivosFuente(): string[] {
  const out: string[] = [];
  for (const raiz of ["src/lib", "src/app"]) {
    for (const f of readdirSync(new URL(`../../${raiz}`, import.meta.url), { recursive: true }) as string[]) {
      const p = `${raiz}/${String(f).replaceAll("\\", "/")}`;
      if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
    }
  }
  return out;
}

test("sólo dos archivos crean un Appointment, y ninguno congela el precio general a secas", () => {
  const creadores = archivosFuente().filter((p) =>
    /\bappointment\.create\(/.test(sinComentarios(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"))),
  );
  assert.deepEqual(
    creadores.sort(),
    [ACTIONS, WAITLIST].sort(),
    "Apareció (o se movió) un camino de alta de turnos. Cada `appointment.create` que se suma es " +
      "otra copia de la regla de precio que puede quedarse atrás, que fue exactamente lo que pasó " +
      "con la lista de espera. Hacelo pasar por la regla compartida, o agregalo acá a conciencia.",
  );
  for (const archivo of creadores) {
    assert.doesNotMatch(
      fuente[archivo],
      /priceAtBooking:\s*\w+\.price\b/,
      `${archivo} escribe el precio general directo en priceAtBooking, sin pasar por la regla de ` +
        "vecino. Es el bug original, textual.",
    );
  }
});

// --- La otra validación que se le había caído al mismo camino ----------------

test("los cuatro caminos rechazan un servicio dado de baja antes de crear el turno", () => {
  // Un anotado puede llevar semanas en la lista de espera: que el catálogo desactive o
  // borre el servicio mientras tanto es el caso normal, no el raro.
  for (const archivo of [ACTIONS, WAITLIST]) {
    const texto = fuente[archivo];
    const guarda = /if\s*\(!service\.active\s*\|\|\s*service\.deletedAt\)/.exec(texto);
    assert.ok(
      guarda,
      `${archivo} no valida que el servicio siga activo. Sin eso queda un turno agendado contra un ` +
        "servicio que el negocio dejó de prestar, con su precio viejo congelado.",
    );
    assert.ok(
      guarda.index < texto.search(/\bappointment\.create\(/),
      `${archivo} valida el servicio DESPUÉS de crear el turno: la guarda no sirve de nada ahí.`,
    );
  }
});

test("los tres caminos de actions.ts delegan en bookAppointment pasándole isResident", () => {
  // Si alguno dejara de pasar `isResident`, la regla seguiría bien escrita y aun así la
  // clienta pagaría de más — el dato nunca llegaría.
  const texto = fuente[ACTIONS];
  for (const entrada of ["createAppointment", "createBookingFromModal", "createManualAppointment"]) {
    const desde = texto.indexOf(`export async function ${entrada}(`);
    assert.ok(desde > 0, `${ACTIONS} ya no exporta ${entrada}`);
    const hasta = texto.indexOf("\nexport ", desde + 1);
    const cuerpo = texto.slice(desde, hasta === -1 ? undefined : hasta);
    assert.match(cuerpo, /bookAppointment\(/, `${entrada} tiene que crear el turno por bookAppointment`);
    assert.match(cuerpo, /\bisResident\b/, `${entrada} no le pasa isResident a bookAppointment`);
  }
});

test("la lista de espera saca el dato de vecina de la ficha del Client", () => {
  // No lo pregunta en su formulario (WaitlistEntry no tiene la columna) y tampoco lo pisa:
  // sobreescribir la ficha con `false` le sacaría el beneficio a quien ya lo tenía.
  assert.match(
    fuente[WAITLIST],
    /precioCongeladoDeReserva\(\s*service\s*,\s*client\.isResident\s*\)/,
    `${WAITLIST} tiene que resolver el precio con el isResident de la ficha del cliente.`,
  );
  assert.doesNotMatch(
    fuente[WAITLIST],
    /client\.update\(/,
    `${WAITLIST} no debe escribir sobre la ficha del cliente: no tiene casilla "vecina" que ofrecer.`,
  );
});
