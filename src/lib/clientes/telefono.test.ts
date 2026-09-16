// ============================================================================
// El invariante: el MISMO número escrito de cualquier manera es UNA clienta.
// ============================================================================
//
// No se prueba "normalizarTelefono('+5491140007919') devuelve '1140007919'" — ese es el
// QUÉ y podría cambiar sin que nadie se entere de que se rompió algo. Lo que importa es
// que todas las formas en que una recepcionista escribe el teléfono de Ana COLAPSEN a la
// misma clave, y que la clave de Ana nunca sea la de otra. Por eso el test son clases de
// equivalencia: cada grupo tiene que ser interno-igual y externo-distinto.
//
// Lo que arregla: hasta acá "11 4000-7919", "1140007919" y "+5491140007919" eran tres
// fichas. El alta de turno reusa la ficha por `findFirst({ where: { phone } })` con match
// exacto, así que cada variante de tipeo creaba una clienta nueva y le partía el historial.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarTelefono, mismoTelefono, fichaQueChoca } from "./telefono";

// Cada entrada: todas las escrituras del MISMO número real.
const CLASES: Record<string, string[]> = {
  "movil 11 (Canning/CABA — el tenant vivo)": [
    "11 4000-7919",
    "1140007919",
    "+54 9 11 4000-7919",
    "5491140007919",
    "011 15-4000-7919",
    "(011) 15 4000 7919",
    "0054 9 11 4000 7919",
    "+54 11 4000-7919",
    "011 4000-7919",
    "  11 4000 7919  ",
  ],
  "area de 3 digitos (Rosario, 341)": [
    "341 555-6666",
    "3415556666",
    "+54 9 341 555 6666",
    "0341 15 555-6666",
    "0341 555-6666",
  ],
  "area de 4 digitos (Santa Rosa, 2954)": [
    "2954 12-3456",
    "02954 12-3456",
    "+5492954123456",
    "02954 15 12-3456",
  ],
  "fijo de 11 distinto del movil": [
    "11 4300-1234",
    "011 4300-1234",
    "+54 11 4300 1234",
  ],
};

test("cada forma de escribir un mismo número da la misma clave", () => {
  for (const [clase, variantes] of Object.entries(CLASES)) {
    const claves = variantes.map((v) => [v, normalizarTelefono(v)] as const);
    const esperada = claves[0][1];
    assert.equal(esperada.length, 10, `${clase}: la clave nacional AR tiene 10 dígitos, dio "${esperada}"`);
    for (const [escrito, clave] of claves) {
      assert.equal(clave, esperada, `${clase}: "${escrito}" → "${clave}", se esperaba "${esperada}"`);
    }
  }
});

test("dos números distintos nunca comparten clave", () => {
  const claves = Object.entries(CLASES).map(([clase, v]) => [clase, normalizarTelefono(v[0])] as const);
  for (const [claseA, a] of claves) {
    for (const [claseB, b] of claves) {
      if (claseA === claseB) continue;
      assert.notEqual(a, b, `${claseA} y ${claseB} colapsaron a la misma clave "${a}"`);
    }
  }
});

test("un número que ya viene limpio no se toca", () => {
  // Guarda contra recortes de más: 10 dígitos es el número nacional completo.
  for (const n of ["1140007919", "3415556666", "2954123456", "1143001234"]) {
    assert.equal(normalizarTelefono(n), n);
  }
});

test("sin dígitos no hay clave (y una clave vacía nunca matchea)", () => {
  for (const basura of ["", "   ", null, undefined, "sin teléfono", "---"]) {
    assert.equal(normalizarTelefono(basura), "");
  }
  // Importante para el dedupe: dos fichas sin teléfono NO son la misma persona.
  assert.equal(mismoTelefono("", ""), false);
  assert.equal(mismoTelefono(null, undefined), false);
});

test("mismoTelefono reconoce las variantes y separa lo distinto", () => {
  assert.equal(mismoTelefono("11 4000-7919", "+5491140007919"), true);
  assert.equal(mismoTelefono("011 15 4000 7919", "1140007919"), true);
  assert.equal(mismoTelefono("11 4000-7919", "11 4000-7918"), false);
  assert.equal(mismoTelefono("11 4000-7919", "341 555-6666"), false);
});

// ============================================================================
// TEST DE FORMA — `updateClient` no puede quedar sin guarda, sin auditoría ni
// sin el chequeo de teléfono duplicado.
// ============================================================================
//
// `clients:manage` existía, estaba otorgada a RECEPTION y NO la consumía ninguna acción:
// un permiso que no permitía nada. Y editar el teléfono sin chequear duplicados es peor
// que no poder editarlo, porque deja dos fichas activas para la misma persona y el alta de
// turno elige una al azar. Las tres cosas son el arreglo; este test mira el archivo para
// que nadie las "simplifique" de vuelta.

const fuente = readFileSync(new URL("../client-actions.ts", import.meta.url), "utf8");

function cuerpoDe(nombre: string): string {
  const i = fuente.indexOf(`export async function ${nombre}(`);
  assert.notEqual(i, -1, `client-actions.ts ya no exporta ${nombre}`);
  const j = fuente.indexOf("\nexport ", i + 1);
  return fuente.slice(i, j === -1 ? undefined : j);
}

test("updateClient exige clients:manage antes de escribir", () => {
  const cuerpo = cuerpoDe("updateClient");
  const guarda = cuerpo.indexOf('requireCapability("clients:manage")');
  assert.ok(guarda !== -1, "updateClient tiene que exigir la capacidad clients:manage");
  const escritura = cuerpo.indexOf("prisma.client.update");
  assert.ok(escritura !== -1, "updateClient tiene que escribir el Client");
  assert.ok(guarda < escritura, "la guarda va ANTES de la escritura, no después");
});

test("updateClient audita el cambio con el antes y el después", () => {
  const cuerpo = cuerpoDe("updateClient");
  assert.ok(cuerpo.includes("auditAdmin"), "un cambio de dato de contacto sin auditar no se puede deshacer");
  assert.ok(
    /antes/.test(cuerpo) && /despues/.test(cuerpo),
    "la auditoría tiene que guardar el valor anterior: es lo único que permite volver atrás",
  );
});

// ── El chequeo de duplicado, con números de verdad ───────────────────────────
//
// El test anterior sólo miraba que `updateClient` MENCIONARA `normalizarTelefono`, y quedaba
// verde aunque se borrara el chequeo entero: la función se menciona igual para otras cosas.
// Ahora se prueba la decisión, que vive en `fichaQueChoca`.

const PADRON = [
  { id: "cli_ana", name: "Ana", phone: "11 4000-7919" },
  { id: "cli_bea", name: "Bea", phone: "011 15-4300-1234" },
  { id: "cli_sin", name: "Sin teléfono", phone: null },
];

test("editar una ficha al teléfono de otra CHOCA, escrito como esté", () => {
  // Las cinco escrituras del número de Ana. Ninguna puede pasar mientras Ana lo tenga.
  for (const escrito of ["1140007919", "+54 9 11 4000-7919", "011 15-4000-7919", "0054 9 11 4000 7919", "(011) 4000 7919"]) {
    const choque = fichaQueChoca("cli_bea", escrito, "011 15-4300-1234", PADRON);
    assert.equal(choque?.id, "cli_ana", `"${escrito}" es el número de Ana y tiene que chocar`);
  }
});

test("reescribir el PROPIO teléfono con otro formato no choca", () => {
  // Es el caso que tiene que seguir andando: Bea normaliza su propio número a mano.
  assert.equal(fichaQueChoca("cli_bea", "11 4300-1234", "011 15-4300-1234", PADRON), null);
  // Y tampoco choca contra su propia fila cuando el número no cambió en absoluto.
  assert.equal(fichaQueChoca("cli_bea", "011 15-4300-1234", "011 15-4300-1234", PADRON), null);
});

test("un teléfono libre entra, y uno sin dígitos no bloquea", () => {
  assert.equal(fichaQueChoca("cli_bea", "11 5555-0000", "011 15-4300-1234", PADRON), null);
  // Sin dígitos no es asunto de este chequeo: de la forma se ocupa validateBookingContact.
  assert.equal(fichaQueChoca("cli_bea", "sin número", "011 15-4300-1234", PADRON), null);
  assert.equal(fichaQueChoca("cli_bea", "", "011 15-4300-1234", PADRON), null);
});

test("una ficha sin teléfono nunca es el choque", () => {
  // `normalizarTelefono(null)` da "" y "" no matchea con nada: si matcheara, TODA edición
  // chocaría contra la primera ficha sin teléfono del padrón.
  assert.equal(fichaQueChoca("cli_ana", "11 9999-8888", "11 4000-7919", PADRON), null);
});

test("updateClient usa esa decisión y no una copia suya", () => {
  const cuerpo = cuerpoDe("updateClient");
  assert.ok(
    cuerpo.includes("fichaQueChoca("),
    "updateClient tiene que delegar el chequeo de duplicado en `fichaQueChoca`: una segunda " +
      "copia de la comparación es exactamente cómo se desincronizan los dos caminos.",
  );
  const chequeo = cuerpo.indexOf("fichaQueChoca(");
  const escritura = cuerpo.indexOf("prisma.client.update");
  assert.ok(escritura !== -1 && chequeo < escritura, "el chequeo va ANTES de la escritura");
});
