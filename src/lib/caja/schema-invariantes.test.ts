// ============================================================================
// TEST DE FORMA — los @@unique que arbitran la idempotencia del dinero.
// ============================================================================
//
// Qué encontró la auditoría: se pueden borrar los cuatro `@@unique` que arbitran la
// idempotencia del dinero y la suite queda VERDE. Los tests de concurrencia que los
// "prueban" simulan la colisión con dobles (`cash-sale-unique.test.ts`), así que verifican
// la lógica de reintento y no la existencia del árbitro.
//
// Por qué importa: el sistema cobra con dos capas. Capa 1, un pre-chequeo dentro de la
// transacción. Capa 2, el `@@unique`, que hace chocar el `create` cuando dos submits pasan
// el pre-chequeo a la vez (lo dice `src/lib/caja/cobro-turno.ts`). La capa 1 sola es un
// check-then-write: sin el índice, dos pestañas o un reintento de red cobran dos veces.
//
// Este test mira el schema, no el comportamiento. Es a propósito, y es la mitad del
// mecanismo: la otra mitad es `npm run predeploy-check`, que desde ahora compara estos
// mismos índices contra `pg_index` de la base destino. Uno verifica que el árbitro esté
// ESCRITO; el otro, que exista DONDE corre la plata. Hacen falta los dos: `migrate deploy`
// se detiene en la primera migración que falla y puede dejar la columna creada y el índice
// no — y en ese estado el chequeo de columnas da verde.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

/** Los `@@unique` de un modelo, normalizados a "col1,col2". */
function unicosDe(modelo: string): string[] {
  const m = new RegExp(`model\\s+${modelo}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  assert.ok(m, `el modelo ${modelo} tiene que existir en schema.prisma`);
  return [...m[1].matchAll(/@@unique\s*\(\s*\[([^\]]+)\]/g)].map((x) =>
    x[1].split(",").map((c) => c.trim()).join(","),
  );
}

// (modelo, columnas, qué se duplica si falta)
const ARBITROS: [string, string, string][] = [
  ["CashMovement", "tenantId,orderId,type", "una venta de mostrador asienta dos veces en el libro"],
  ["CashMovement", "tenantId,paymentId,type", "un pago de turno asienta dos veces en el libro"],
  ["CashMovement", "tenantId,collectionId,type", "un cobro parcial asienta dos veces en el libro"],
  ["Collection", "tenantId,idempotencyKey", "un doble submit cobra dos veces el mismo saldo"],
  ["Order", "tenantId,idempotencyKey", "un reintento de la vidriera crea dos pedidos"],
  // Los dos de Invoice los encontró este mismo test, por el chequeo inverso de abajo: no
  // estaban en la lista escrita a mano y son los de peor consecuencia unitaria, porque la
  // duplicación sale del sistema y llega a AFIP.
  ["Invoice", "tenantId,orderId", "se emiten DOS comprobantes fiscales por el mismo pedido y hay que hacer nota de crédito"],
  ["Invoice", "tenantId,mpPaymentId", "un reintento del webhook de Mercado Pago factura dos veces el mismo pago"],
];

for (const [modelo, cols, consecuencia] of ARBITROS) {
  test(`@@unique([${cols.split(",").join(", ")}]) en ${modelo} — sin él, ${consecuencia}`, () => {
    assert.ok(
      unicosDe(modelo).includes(cols),
      `Falta @@unique([${cols.split(",").join(", ")}]) en ${modelo}. No es cosmético: es la ` +
        `capa 2 de la idempotencia del dinero. Sin el índice, el pre-chequeo de la capa 1 es ` +
        `un check-then-write y ${consecuencia}.`,
    );
  });
}

// La lista de arriba se escribió a mano. Este test la ata al schema para el otro lado: si
// alguien agrega un @@unique nuevo sobre una clave de idempotencia y no lo suma acá, salta.
test("no hay claves de idempotencia en el schema que esta lista no conozca", () => {
  const enElSchema: string[] = [];
  for (const [, modelo, cuerpo] of SCHEMA.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    for (const u of cuerpo.matchAll(/@@unique\s*\(\s*\[([^\]]+)\]/g)) {
      const cols = u[1].split(",").map((c) => c.trim()).join(",");
      if (/idempotencyKey|orderId|[Pp]aymentId|collectionId/.test(cols)) enElSchema.push(`${modelo}|${cols}`);
    }
  }
  const conocidos = new Set(ARBITROS.map(([m, c]) => `${m}|${c}`));
  const desconocidos = enElSchema.filter((x) => !conocidos.has(x));
  assert.deepEqual(
    desconocidos,
    [],
    "hay @@unique sobre claves de idempotencia que esta lista no cubre: sumalos con su " +
      "consecuencia, o sacá la clave del nombre si no arbitra plata",
  );
});
