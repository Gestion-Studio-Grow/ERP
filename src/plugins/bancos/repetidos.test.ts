// GSG-FACT-011 · H1: cobros legítimos iguales el mismo día y extractos partidos a mitad de día.
//
//   · Dos cobros iguales (misma fecha, monto y descripción) en UN archivo son dos ventas: dos
//     movimientos, dos propuestas. El 1º conserva el hash de siempre (compatibilidad con lo ya
//     guardado y con la clave `banco:<hash>` del libro); el n-ésimo lleva `#n`.
//   · El mismo archivo dos veces no suma nada.
//   · Día partido entre dos extractos (último de uno, primero del otro) con un cobro igual a uno
//     ya guardado: no se pierde ni sale solo → revisión, con una clave distinta y determinista
//     (la siguiente libre si el día se cortó más de una vez: ver ataque-borde.test.ts).
// Puro: la "base" de importaciones anteriores es un Map en memoria (sin DB, sin reloj, sin azar).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ClasificadorBancarioPorReglas } from "./domain/clasificador";
import { normalizarTexto, hashMovimiento } from "./domain/valores";
import { procesarExtracto, type ArchivoExtracto, type ResultadoExtracto } from "./handler";

const ENCABEZADO = "Fecha;Descripción;Débito;Crédito;Saldo";

/** Extracto estilo Nación con sólo créditos: [dd/mm/aaaa, descripción, crédito]. */
function extracto(nombre: string, filas: Array<[string, string, string]>): ArchivoExtracto {
  const lineas = [ENCABEZADO, ...filas.map(([f, d, c]) => `${f};${d};;${c};0,00`)];
  return { nombre, contenido: new TextEncoder().encode(lineas.join("\r\n")) };
}

/** Lo que una base guardaría: hash → importación, y las fechas de las filas de cada importación. */
class BaseEnMemoria {
  private readonly hashes = new Map<string, string>();
  private readonly fechas = new Map<string, string[]>();

  guardar(importacion: string, r: ResultadoExtracto): void {
    const porId = new Map(r.movimientos.map((m) => [m.id, m]));
    for (const p of r.propuestas) {
      if (p.estado === "descartado") continue;
      const m = porId.get(p.movimientoId)!;
      this.hashes.set(m.id, importacion);
      this.fechas.set(importacion, [...(this.fechas.get(importacion) ?? []), m.fecha]);
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
    };
  }
}

const nuevas = (r: ResultadoExtracto) => r.propuestas.filter((p) => p.estado !== "descartado");

test("H1: dos cobros iguales el mismo día en un archivo → dos movimientos AUTO", async () => {
  const r = await procesarExtracto(
    extracto("nov.csv", [
      ["10/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["10/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["10/11/2026", "TRANSFERENCIA  recibida cbu 285", "5.000,00"], // misma descripción normalizada
    ]),
    new BaseEnMemoria().deps(),
  );
  assert.equal(r.movimientos.length, 3);
  assert.deepEqual(r.propuestas.map((p) => p.estado), ["auto", "auto", "auto"]);
  assert.equal(new Set(r.movimientos.map((m) => m.id)).size, 3, "ids distintos");

  // Compatibilidad: el 1º conserva el hash viejo; el n-ésimo es sha256(base + "#n").
  const base = `20261110|5000.00|${normalizarTexto("Transferencia recibida CBU 285")}`;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  assert.equal(r.movimientos[0].id, hashMovimiento("20261110", 5000, "Transferencia recibida CBU 285"));
  assert.equal(r.movimientos[1].id, sha(`${base}#2`));
  assert.equal(r.movimientos[2].id, sha(`${base}#3`));
});

test("H1: el mismo archivo dos veces → cero nuevos (con los puertos completos)", async () => {
  const db = new BaseEnMemoria();
  const archivo = extracto("nov.csv", [
    ["01/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ["01/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ["15/11/2026", "Acreditación ventas", "7.000,00"],
    ["30/11/2026", "Transferencia recibida CBU 007", "3.000,00"],
  ]);
  const primera = await procesarExtracto(archivo, db.deps());
  assert.equal(nuevas(primera).length, 4);
  db.guardar("imp-1", primera);

  const segunda = await procesarExtracto(archivo, db.deps());
  assert.equal(nuevas(segunda).length, 0, JSON.stringify(segunda.propuestas));
});

test("H1: día partido entre dos extractos → el cobro igual va a REVISIÓN con clave estable, no se pierde", async () => {
  const db = new BaseEnMemoria();
  // Extracto viejo: 01 al 15/11, exportado a mitad del 15 (tiene el cobro de la mañana).
  const viejo = await procesarExtracto(
    extracto("1a15.csv", [
      ["01/11/2026", "Acreditación ventas", "1.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ]),
    db.deps(),
  );
  db.guardar("imp-1", viejo);
  const idViejo = viejo.movimientos[1].id;

  // Extracto nuevo: 15 al 20/11, empieza después del corte (sólo el cobro de la tarde del 15).
  const archivoNuevo = extracto("15a20.csv", [
    ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ["20/11/2026", "Acreditación ventas", "2.000,00"],
  ]);
  const nuevo = await procesarExtracto(archivoNuevo, db.deps());
  const borde = nuevo.propuestas[0];
  assert.equal(borde.estado, "revision", "no se descarta ni sale solo");
  assert.match(borde.motivo ?? "", /posible cobro repetido/i);
  assert.notEqual(borde.movimientoId, idViejo, "clave distinta de la fila ya guardada");
  assert.equal(nuevo.movimientos[0].id, borde.movimientoId);
  assert.equal(nuevo.propuestas[1].estado, "auto");

  // Estable: procesar el mismo archivo otra vez da la misma clave…
  const otraVez = await procesarExtracto(archivoNuevo, db.deps());
  assert.equal(otraVez.propuestas[0].movimientoId, borde.movimientoId);
  // …y una vez guardado, volver a bajarlo (otros bytes: el mismo archivo lo frena H3 antes) no se
  // distingue de un 3er corte del mismo día (F1): el cobro del borde vuelve a REVISIÓN con la
  // siguiente clave libre, avisando que puede ser uno ya cargado; nada sale solo.
  db.guardar("imp-2", nuevo);
  const tercera = await procesarExtracto(archivoNuevo, db.deps());
  assert.deepEqual(nuevas(tercera).map((p) => p.estado), ["revision"], JSON.stringify(tercera.propuestas));
  assert.notEqual(tercera.propuestas[0].movimientoId, borde.movimientoId, "siguiente clave libre, no pisa la guardada");
  assert.match(tercera.propuestas[0].motivo ?? "", /ya cargaste 2 cobros iguales/);
});

test("H1: el borde al revés (extracto anterior subido después) también va a revisión", async () => {
  const db = new BaseEnMemoria();
  const posterior = await procesarExtracto(
    extracto("15a30.csv", [
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["30/11/2026", "Acreditación ventas", "1.000,00"],
    ]),
    db.deps(),
  );
  db.guardar("imp-1", posterior);
  const anterior = await procesarExtracto(
    extracto("1a15.csv", [
      ["01/11/2026", "Acreditación ventas", "2.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ]),
    db.deps(),
  );
  assert.equal(anterior.propuestas[1].estado, "revision");
  assert.match(anterior.propuestas[1].motivo ?? "", /posible cobro repetido/i);
});

test("H1: si el día estaba ADENTRO del rango viejo, sigue «ya procesado»", async () => {
  const db = new BaseEnMemoria();
  const viejo = await procesarExtracto(
    extracto("10a20.csv", [
      ["10/11/2026", "Acreditación ventas", "1.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["20/11/2026", "Acreditación ventas", "1.500,00"],
    ]),
    db.deps(),
  );
  db.guardar("imp-1", viejo);
  const nuevo = await procesarExtracto(
    extracto("15a25.csv", [
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["25/11/2026", "Acreditación ventas", "2.500,00"],
    ]),
    db.deps(),
  );
  assert.equal(nuevo.propuestas[0].estado, "descartado");
  assert.match(nuevo.propuestas[0].motivo ?? "", /importación anterior/i);
  assert.equal(nuevo.propuestas[1].estado, "auto");
});

test("H1: día completo en el extracto nuevo → el 1º ya estaba, el 2º sale (ordinal), sin perder nada", async () => {
  const db = new BaseEnMemoria();
  const viejo = await procesarExtracto(
    extracto("1a15.csv", [
      ["01/11/2026", "Acreditación ventas", "1.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
    ]),
    db.deps(),
  );
  db.guardar("imp-1", viejo);
  // El nuevo arranca el 14: el 15 está adentro del nuevo, así que no es un borde partido.
  const nuevo = await procesarExtracto(
    extracto("14a20.csv", [
      ["14/11/2026", "Acreditación ventas", "3.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["15/11/2026", "Transferencia recibida CBU 285", "5.000,00"],
      ["20/11/2026", "Acreditación ventas", "2.000,00"],
    ]),
    db.deps(),
  );
  assert.deepEqual(nuevo.propuestas.map((p) => p.estado), ["auto", "descartado", "auto", "auto"]);
});
