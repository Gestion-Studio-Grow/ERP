// GSG-FACT-011 · certificación de H1: ataque a la clave de borde (`hashBordePartido`).
//   · F1: si el mismo día se corta tres veces o más, el cobro nuevo no puede chocar con la clave de
//     borde de un corte anterior y perderse: va a revisión con la siguiente clave libre.
//   · F2: un extracto de un solo día vuelto a bajar manda sus cobros a revisión (no se puede
//     distinguir de otro corte del mismo día), con un motivo que nombra fecha e importe, avisa que
//     puede ser un cobro ya cargado y dice si ya está facturado (`banco:<hash>`).
// Misma "base en memoria" que repetidos.test.ts (unique [tenantId, hash], sólo se guardan los no
// descartados; rango = min/max de las filas guardadas de la importación). Puro: sin DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ClasificadorBancarioPorReglas } from "./domain/clasificador";
import { procesarExtracto, type ArchivoExtracto, type ResultadoExtracto } from "./handler";

const ENCABEZADO = "Fecha;Descripción;Débito;Crédito;Saldo";
function extracto(nombre: string, filas: Array<[string, string, string]>): ArchivoExtracto {
  const lineas = [ENCABEZADO, ...filas.map(([f, d, c]) => `${f};${d};;${c};0,00`)];
  return { nombre, contenido: new TextEncoder().encode(lineas.join("\r\n")) };
}

class Base {
  hashes = new Map<string, string>();
  fechas = new Map<string, string[]>();
  /** Movimientos con factura viva en el libro (`banco:<hash>`). */
  facturados = new Set<string>();
  guardar(imp: string, r: ResultadoExtracto) {
    const porId = new Map(r.movimientos.map((m) => [m.id, m]));
    for (const p of r.propuestas) {
      if (p.estado === "descartado") continue;
      if (this.hashes.has(p.movimientoId)) continue; // skipDuplicates
      const m = porId.get(p.movimientoId)!;
      this.hashes.set(m.id, imp);
      this.fechas.set(imp, [...(this.fechas.get(imp) ?? []), m.fecha]);
    }
  }
  deps() {
    return {
      tenantId: "t-1",
      clasificador: new ClasificadorBancarioPorReglas(),
      yaProcesado: (id: string) => this.hashes.has(id),
      rangoDeImportacionPrevia: async (id: string) => {
        const imp = this.hashes.get(id);
        if (!imp) return null;
        const f = [...(this.fechas.get(imp) ?? [])].sort();
        return { desde: f[0], hasta: f[f.length - 1] };
      },
      cobrosBancoYaFacturados: async (ids: readonly string[]) => new Set(ids.filter((id) => this.facturados.has(id))),
    };
  }
}
const vivas = (r: ResultadoExtracto) => r.propuestas.filter((p) => p.estado !== "descartado");
const X: [string, string, string] = ["15/11/2026", "Pago recibido", "3.000,00"];

test("ATAQUE 1: tres cortes del mismo día, un cobro igual en cada uno → el 3º se pierde", async () => {
  // Reportes intradía (p. ej. MP 00-12h, 12-18h, 18-24h): cada archivo es 15..15 con UN cobro igual.
  const db = new Base();
  const r1 = await procesarExtracto(extracto("15-manana.csv", [X]), db.deps());
  db.guardar("I1", r1);
  const r2 = await procesarExtracto(extracto("15-tarde.csv", [X, ["15/11/2026", "Otro", "1,00"]]), db.deps());
  db.guardar("I2", r2);
  const r3 = await procesarExtracto(extracto("15-noche.csv", [X, ["15/11/2026", "Otro2", "2,00"]]), db.deps());
  db.guardar("I3", r3);
  assert.equal(vivas(r1).length, 1);
  assert.equal(vivas(r2).filter((p) => p.montoTotal === 3000).length, 1, "2º corte: a revisión");
  // Tres cobros reales: el 3º tiene que quedar al menos en revisión.
  assert.equal(
    vivas(r3).filter((p) => p.montoTotal === 3000).length,
    1,
    `3º cobro perdido: ${JSON.stringify(r3.propuestas.map((p) => [p.montoTotal, p.estado, p.motivo]))}`,
  );
});

test("ATAQUE 2: A (1..15 mediodía), re-descarga del día 15 hasta mediodía, B (15 tarde..20) → cobro de la tarde perdido", async () => {
  const db = new Base();
  const a = await procesarExtracto(extracto("1a15.csv", [["01/11/2026", "Acreditación ventas", "1.000,00"], X]), db.deps());
  db.guardar("A", a);
  // La misma mañana del 15 bajada de nuevo (otro archivo, mismos movimientos): revisión "posible repetido" (falso positivo).
  const z = await procesarExtracto(extracto("solo15.csv", [X]), db.deps());
  db.guardar("Z", z);
  const b = await procesarExtracto(extracto("15a20.csv", [X, ["20/11/2026", "Acreditación ventas", "2.000,00"]]), db.deps());
  db.guardar("B", b);
  assert.equal(
    vivas(b).filter((p) => p.montoTotal === 3000).length,
    1,
    `cobro de la tarde del 15 perdido: ${JSON.stringify(b.propuestas.map((p) => [p.montoTotal, p.estado, p.motivo]))}`,
  );
});

test("F2: re-descarga de un extracto de UN día → revisión con un motivo que avisa (fecha, importe, ya facturado)", async () => {
  const db = new Base();
  const T: [string, string, string] = ["15/11/2026", "Transferencia CBU 1", "9.000,00"];
  const r1 = await procesarExtracto(extracto("hoy.csv", [X, T]), db.deps());
  db.guardar("I1", r1);
  // El de $9.000 ya se facturó desde la bandeja (clave `banco:<hash>` en el libro).
  db.facturados.add(r1.movimientos[1].id);
  // Mismo contenido, otro orden de filas → otros bytes (H3 no lo frena). No se puede distinguir de
  // otro corte del mismo día: va a revisión, nunca sale solo ni se pierde.
  const r2 = await procesarExtracto(extracto("hoy-otra-vez.csv", [T, X]), db.deps());
  const vivas2 = vivas(r2);
  assert.equal(vivas2.length, 2);
  for (const p of vivas2) assert.equal(p.estado, "revision", "nunca sale solo");
  const de9000 = vivas2.find((p) => p.montoTotal === 9000)!;
  const de3000 = vivas2.find((p) => p.montoTotal === 3000)!;
  for (const p of [de9000, de3000]) {
    assert.match(p.motivo ?? "", /posible cobro repetido/i);
    assert.match(p.motivo ?? "", /15\/11\/2026/, "nombra la fecha");
    assert.match(p.motivo ?? "", /ya cargaste/i, "avisa que puede ser un cobro ya cargado");
  }
  assert.match(de9000.motivo ?? "", /\$9\.000,00/, "nombra el importe");
  assert.match(de3000.motivo ?? "", /\$3\.000,00/, "nombra el importe");
  assert.match(de9000.motivo ?? "", /ya está facturado/i, "el facturado lo dice");
  assert.doesNotMatch(de3000.motivo ?? "", /facturad/i, "el no facturado no lo dice");
});

test("F1: el 3er corte cuenta los cobros iguales ya cargados y es determinista", async () => {
  const db = new Base();
  db.guardar("I1", await procesarExtracto(extracto("a.csv", [X]), db.deps()));
  db.guardar("I2", await procesarExtracto(extracto("b.csv", [X, ["15/11/2026", "Otro", "1,00"]]), db.deps()));
  const archivo = extracto("c.csv", [X, ["15/11/2026", "Otro2", "2,00"]]);
  const r3 = await procesarExtracto(archivo, db.deps());
  const otraVez = await procesarExtracto(archivo, db.deps());
  const p3 = vivas(r3).find((p) => p.montoTotal === 3000)!;
  assert.equal(p3.estado, "revision");
  assert.match(p3.motivo ?? "", /2 cobros iguales/);
  assert.equal(vivas(otraVez).find((p) => p.montoTotal === 3000)!.movimientoId, p3.movimientoId, "misma clave");
  // Las tres claves de $3.000 (original y dos de borde) son distintas: ninguna pisa a otra.
  // Filas: I1 = 1 (X), I2 = 2 (X de borde + Otro), I3 = 2 (X de borde + Otro2).
  db.guardar("I3", r3);
  assert.equal(db.hashes.size, 5);
});
