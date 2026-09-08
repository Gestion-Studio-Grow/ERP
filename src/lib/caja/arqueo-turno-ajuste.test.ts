// ============================================================================
// TEST — la diferencia del ARQUEO DE TURNO llega al libro (y con el signo bien).
// ============================================================================
//
// El agujero que cierra: hasta ahora el arqueo de turno guardaba su diferencia SÓLO en
// `CashSession.closingDiff`. El libro de caja deriva el saldo SUMANDO movimientos, así que
// un faltante contado en el cajón no llegaba a ningún lado — el defecto de la planilla (el
// faltante anotado al margen) con otra ropa. Ahora `closeCashSession` asienta un ajuste en
// la misma transacción, y `deleteLibroEntry` no lo deja borrar.
//
// PURO (ADR-026): se testea la función que decide la fila, no la escritura.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ajusteDeArqueoTurno,
  arqueoTurnoMarker,
  ARQUEO_TURNO_ACTOR_PREFIX,
  CIERRE_DIARIO_ACTOR_PREFIX,
} from "@/lib/caja/cierre-marca";

test("cuadra → no escribe nada", () => {
  assert.equal(ajusteDeArqueoTurno(0, "cs_1"), null);
  assert.equal(ajusteDeArqueoTurno(-0, "cs_1"), null);
});

test("faltante (contado < esperado) → EGRESO por el valor absoluto", () => {
  const a = ajusteDeArqueoTurno(-2000, "cs_1");
  assert.ok(a);
  assert.equal(a.type, "EGRESO", "falta plata en el cajón: sale del libro");
  assert.equal(a.amount, 2000, "el monto se guarda POSITIVO; el signo lo pone el tipo");
  assert.equal(a.method, "EFECTIVO", "el arqueo de turno cuenta el cajón, no MP ni tarjeta");
});

test("sobrante (contado > esperado) → INGRESO", () => {
  const a = ajusteDeArqueoTurno(500, "cs_1");
  assert.ok(a);
  assert.equal(a.type, "INGRESO");
  assert.equal(a.amount, 500);
});

// El signo invertido es el error caro de este ajuste: convierte un faltante en un sobrante y
// el libro queda mintiendo al doble de la diferencia. Queda clavado.
test("el signo sigue al conteo físico, no al revés", () => {
  assert.equal(ajusteDeArqueoTurno(-1, "cs_1")?.type, "EGRESO");
  assert.equal(ajusteDeArqueoTurno(1, "cs_1")?.type, "INGRESO");
});

test("la marca identifica el turno y NO colisiona con la del cierre diario", () => {
  const a = ajusteDeArqueoTurno(-100, "cs_abc");
  assert.equal(a?.createdBy, arqueoTurnoMarker("cs_abc"));
  assert.ok(a?.createdBy.startsWith(ARQUEO_TURNO_ACTOR_PREFIX));
  assert.ok(
    !a?.createdBy.startsWith(CIERRE_DIARIO_ACTOR_PREFIX),
    "si las marcas se solaparan, borrar un ajuste de turno daría el mensaje del cierre",
  );
});

// El ajuste se asienta como INGRESO/EGRESO porque es lo que el libro sabe sumar. Eso lo pone
// del lado borrable de la guarda de tipo de `deleteLibroEntry`, así que el candado tiene que
// ser el PREFIJO. Este test es el que avisa si alguien cambia el tipo por otro pensando que
// la guarda de tipo alcanza.
test("el ajuste es de un tipo que el libro suma → el candado tiene que ser el prefijo", () => {
  const a = ajusteDeArqueoTurno(-100, "cs_1");
  assert.ok(a && (a.type === "INGRESO" || a.type === "EGRESO"));
});

test("un diff no finito no escribe una fila rota", () => {
  assert.equal(ajusteDeArqueoTurno(Number.NaN, "cs_1"), null);
  assert.equal(ajusteDeArqueoTurno(Number.POSITIVE_INFINITY, "cs_1"), null);
});
