// ============================================================================
// Teléfono del cliente — CLAVE NATURAL de la ficha. Normalización PURA, sin DB.
// ============================================================================
//
// El teléfono no es un dato de contacto más: es lo que identifica a la clienta. Los cuatro
// caminos de alta de turno reusan la ficha si encuentran una con ese teléfono y crean una
// nueva si no. Ese match era EXACTO sobre el string tipeado, así que "11 4000-7919",
// "1140007919" y "+5491140007919" eran tres clientas distintas: el historial se partía,
// "total gastado" y "turnos totales" se repartían entre fichas que son la misma persona.
// Ahora los cuatro buscan con esta clave, por `buscarFichaPorTelefono`
// (ficha-por-telefono.ts). Las fichas duplicadas que ya existen siguen ahí: unificarlas es
// otra decisión.
//
// Esto devuelve la CLAVE de comparación: los dígitos del número nacional, sin código de
// país, sin el 0 de larga distancia, sin el 9 del formato internacional de móvil y sin el
// 15. No es el valor que se guarda —lo que se guarda es lo que la persona tipeó, ver el
// comentario de `updateClient` en `client-actions.ts`— es con lo que se COMPARA.
//
// A propósito NO valida: para eso está `isValidArgentinePhone` en `contact-validation.ts`,
// que es la guarda de forma. Acá un número inválido simplemente da una clave rara; lo que
// nunca puede pasar es que dos escrituras del MISMO número den claves distintas.

/**
 * Clave de comparación de un teléfono argentino. Devuelve `""` si no hay ningún dígito.
 *
 * Los cuatro prefijos que se sacan, en el orden en que se apilan cuando alguien escribe:
 *   - `00` internacional  → "0054 11 ..."
 *   - `54` código de país → "+54 11 ...", "5491140007919"
 *   - `0`  larga distancia nacional → "011 4000-7919"
 *   - `9`  móvil en formato internacional → "54 9 11 40007919"
 *   - `15` móvil en formato nacional → "011 15-4000-7919"
 */
export function normalizarTelefono(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";

  if (d.startsWith("00")) d = d.slice(2);
  // El `length > 10` evita comerse el código de área 54 de un número nacional ya limpio
  // (no existe área 54 en AR, pero la guarda es gratis y deja el invariante explícito:
  // un número que ya mide 10 dígitos no se toca nunca).
  if (d.startsWith("54") && d.length > 10) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  // Ningún código de área argentino empieza con 9 (empiezan con 1, 2 o 3), así que un 9
  // adelante de 11 dígitos sólo puede ser el del formato internacional de móvil.
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);

  // El 15 va DESPUÉS del código de área, que en AR mide 2 (sólo el 11), 3 o 4 dígitos, y
  // área + número siempre suma 10. Así que si quedan 12 dígitos y hay un "15" en alguno de
  // esos tres bordes, es el prefijo de móvil. Se prueba 2 primero porque el área 11 —CABA y
  // el conurbano, donde está el único tenant vivo— es la única de dos dígitos.
  //
  // Es una heurística y está dicho: un número de 12 dígitos cuyos dígitos 3 y 4 sean "15"
  // por casualidad se recorta mal. El costo de equivocarse para ese lado es una ficha que
  // no se encuentra; para el otro lado es la ficha duplicada que veníamos a arreglar.
  if (d.length === 12) {
    for (const off of [2, 3, 4]) {
      if (d.slice(off, off + 2) === "15") {
        d = d.slice(0, off) + d.slice(off + 2);
        break;
      }
    }
  }

  return d;
}

/** ¿Estos dos teléfonos son el mismo número escrito distinto? Vacío nunca matchea. */
export function mismoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizarTelefono(a);
  return ka !== "" && ka === normalizarTelefono(b);
}

// ── La decisión de duplicado, PURA ──────────────────────────────────────────
//
// Vive acá y no dentro de `updateClient` por una razón concreta: ahí adentro sólo se puede
// verificar por forma ("el archivo menciona `normalizarTelefono`"), y esa verificación queda
// verde aunque alguien borre el chequeo, porque el alta también normaliza. Acá se prueba con
// números de verdad.

export type FichaTelefono = { id: string; name: string; phone: string | null };

/**
 * ¿El teléfono que se quiere guardar ya es el de OTRA ficha? Devuelve la ficha que choca.
 *
 * Tres casos devuelven `null` a propósito:
 *   - el teléfono no cambió de número (se puede reescribir con otro formato sin que moleste),
 *   - la única coincidencia es la ficha que se está editando,
 *   - lo tipeado no tiene ningún dígito (de la forma se ocupa `validateBookingContact`).
 */
export function fichaQueChoca(
  editandoId: string,
  telefonoNuevo: string | null | undefined,
  telefonoAnterior: string | null | undefined,
  otras: readonly FichaTelefono[],
): FichaTelefono | null {
  const clave = normalizarTelefono(telefonoNuevo);
  if (!clave) return null;
  if (clave === normalizarTelefono(telefonoAnterior)) return null;
  return otras.find((c) => c.id !== editandoId && normalizarTelefono(c.phone) === clave) ?? null;
}
