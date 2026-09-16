// ============================================================================
// TEST DE FORMA — el payload de la lista de turnos no puede volver a inflarse.
// ============================================================================
//
// QUÉ PASABA: `/admin/turnos/lista` le pasaba a sus componentes CLIENTE
// (`AppointmentRow`, `AppointmentsHistoryList`) el objeto entero que devuelve
// `getAppointments()`, con los `include` de Prisma colgados. Todo campo que cruza
// ese borde se serializa al navegador aunque nadie lo lea: con los ~1.000 turnos
// que CH factura por año el documento pesaba 3,73 MB (2,21 MB de payload RSC), y la
// página es `force-dynamic` — se paga entero en cada apertura, muchas veces por día.
// Proyectando campo por campo bajó a 2,21 MB de documento y 791 KB de payload RSC.
//
// Este test NO prueba comportamiento: prueba la FORMA de `page.tsx`, porque el defecto
// no fue una función mal escrita — fue pasar un objeto de más. Un `...a` distraído, o un
// campo agregado al `type` de la fila sin agregarlo a la proyección, lo reintroducen sin
// que se note hasta que la pantalla se cuelga. Por eso la guardia es exacta en los dos
// sentidos: si a la proyección le SOBRA un campo, el payload se infla; si le FALTA, la
// pantalla se rompe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Comentarios afuera: si no, sus llaves y sus `:` confunden al parser de abajo. */
function sinComentarios(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Contenido del `{...}` que arranca en `desde`, balanceando llaves. */
function bloqueLlaves(src: string, desde = 0): string | null {
  const abre = src.indexOf("{", desde);
  if (abre === -1) return null;
  let profundidad = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === "{") profundidad++;
    else if (src[i] === "}") {
      profundidad--;
      if (profundidad === 0) return src.slice(abre + 1, i);
    }
  }
  return null;
}

/**
 * Claves de un objeto (literal o `type`) con el bloque anidado de cada una, si lo tiene.
 * Corta por `,`/`;` de NIVEL CERO, así el ternario multilínea de `payment` y los tipos
 * anidados (`{ name: string; phone: string }`) quedan enteros en su segmento.
 */
function clavesDe(bloque: string): Map<string, string | null> {
  const claves = new Map<string, string | null>();
  const segmentos: string[] = [];
  let profundidad = 0;
  let inicio = 0;
  for (let i = 0; i < bloque.length; i++) {
    const c = bloque[i];
    if (c === "{" || c === "(" || c === "[") profundidad++;
    else if (c === "}" || c === ")" || c === "]") profundidad--;
    else if (profundidad === 0 && (c === "," || c === ";")) {
      segmentos.push(bloque.slice(inicio, i));
      inicio = i + 1;
    }
  }
  segmentos.push(bloque.slice(inicio));
  for (const seg of segmentos) {
    const m = seg.match(/^\s*(\w+)\s*\??\s*:/);
    if (!m) continue;
    claves.set(m[1], bloqueLlaves(seg.slice(seg.indexOf(":") + 1)));
  }
  return claves;
}

function bloqueDespuesDe(src: string, marcador: string, que: string): string {
  const i = src.indexOf(marcador);
  assert.ok(i !== -1, `No encontré ${que} ("${marcador}"). Si se renombró, actualizá este test.`);
  const b = bloqueLlaves(src, i + marcador.length);
  assert.ok(b !== null, `No pude leer el bloque de ${que}.`);
  return b as string;
}

const fila = sinComentarios(leer("../AppointmentRow.tsx"));
const pagina = sinComentarios(leer("./page.tsx"));

const tipoDeLaFila = clavesDe(bloqueDespuesDe(fila, "type Appointment =", "el type Appointment de AppointmentRow"));
const cuerpoProyeccion = bloqueDespuesDe(pagina, "function proyectarTurno", "la proyección de page.tsx");
const objetoProyectado = bloqueLlaves(cuerpoProyeccion, cuerpoProyeccion.indexOf("return"));
assert.ok(objetoProyectado, "`proyectarTurno` tiene que devolver un objeto literal, campo por campo.");
const proyeccion = clavesDe(objetoProyectado);

const ordenadas = (m: Map<string, unknown>) => [...m.keys()].sort();

test("la proyección manda EXACTAMENTE los campos que la fila declara", () => {
  assert.deepEqual(
    ordenadas(proyeccion),
    ordenadas(tipoDeLaFila),
    "Los campos de `proyectarTurno` (page.tsx) tienen que coincidir uno a uno con el " +
      "`type Appointment` de AppointmentRow.tsx. Si sobra alguno, cada turno lo serializa al " +
      "navegador para nada (eran 1,9 MB de más por carga). Si falta alguno, la fila lo lee " +
      "`undefined` y la pantalla se rompe.",
  );
});

// Único campo que la proyección puede pasar tal cual: el loader ya lo trae recortado
// (ver el test de más abajo). Cualquier otro objeto anidado va campo por campo.
const PASAN_TAL_CUAL = new Set(["collections"]);

test("los objetos anidados también van campo por campo, no enteros", () => {
  for (const [clave, anidadoDeLaFila] of tipoDeLaFila) {
    if (!anidadoDeLaFila || PASAN_TAL_CUAL.has(clave)) continue;
    const anidadoProyectado = proyeccion.get(clave);
    assert.ok(
      anidadoProyectado,
      `\`${clave}\` se está pasando entero (\`${clave}: a.${clave}\`) en vez de campo por campo. ` +
        "Ése es el objeto crudo de Prisma: se lleva al navegador tenantId, createdAt, updatedAt y " +
        "todo lo que la fila no muestra — exactamente lo que hacía pesar 1,9 MB a esta pantalla.",
    );
    assert.deepEqual(
      ordenadas(clavesDe(anidadoProyectado)),
      ordenadas(clavesDe(anidadoDeLaFila)),
      `El objeto \`${clave}\` de la proyección no coincide con el que declara AppointmentRow. ` +
        "Traer el objeto de Prisma entero (client con email/notes/birthDate, service con " +
        "description…) es justo lo que hacía pesar 1,9 MB a la pantalla.",
    );
  }
});

test("`collections` pasa tal cual: ya viene proyectada del loader", () => {
  const cuerpo = bloqueDespuesDe(pagina, "function proyectarTurno", "la proyección de page.tsx");
  assert.match(
    cuerpo,
    /collections:\s*a\.collections/,
    "`cobrosDetalladosPorTurno` ya selecciona id/amount/method/note/createdAt y convierte el " +
      "Decimal a number en el borde: re-proyectarla acá sería trabajo al pedo, pero traer otra " +
      "cosa (la Collection cruda) volvería a colgarle tenantId/originId/collectedBy a cada cobro.",
  );
});

test("la proyección no usa spread", () => {
  const cuerpo = bloqueDespuesDe(pagina, "function proyectarTurno", "la proyección de page.tsx");
  assert.ok(
    !cuerpo.includes("..."),
    "Un `...a` o `...a.client` adentro de `proyectarTurno` arrastra de nuevo el objeto entero de " +
      "Prisma (tenantId, createdAt, updatedAt, email, description…) y deshace el arreglo en " +
      "silencio: el test de arriba ni se entera porque las claves de más no se declaran.",
  );
});

test("nada llega a la UI sin pasar por la proyección", () => {
  const usos = [...pagina.matchAll(/\bappointments\s*\.\s*(\w+)/g)].map((m) => m[0].replace(/\s+/g, ""));
  assert.deepEqual(
    usos,
    ["appointments.map"],
    "`appointments` es el resultado CRUDO del loader: el único uso permitido es " +
      "`appointments.map(proyectarTurno)`. Filtrar o renderizar desde ahí le pasa a los " +
      "componentes cliente el objeto de Prisma entero.",
  );
  for (const lista of ["pending", "aCobrar", "rest"]) {
    assert.match(
      pagina,
      new RegExp(`const ${lista} = turnos\\.filter`),
      `\`${lista}\` tiene que derivar de \`turnos\` (lo proyectado), no de \`appointments\`.`,
    );
  }
});
