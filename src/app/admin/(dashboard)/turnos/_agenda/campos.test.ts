// La agenda nueva manda lo MISMO que la fila de siempre: cada acción de src/lib/actions.ts lee del
// FormData ciertos campos, y acá se comprueba que los que arma campos.ts son exactamente esos (ni
// uno de más, ni uno con otro nombre). Se lee el código de la acción, no un mock: si alguien le
// cambia el nombre a un campo en el servidor, esta prueba falla antes que el cobro.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aFormData,
  camposDeAnular,
  camposDeCobro,
  camposDeCondonar,
  camposDelTurno,
  camposDeTerminar,
  leerMontoDelCobro,
  metodoElegido,
} from "./campos";

const ACCIONES = readFileSync(fileURLToPath(new URL("../../../../../lib/actions.ts", import.meta.url)), "utf8");

/** Los nombres que la acción lee con `formData.get("…")` / `formData.has("…")`. */
function camposQueLee(nombre: string): Set<string> {
  const i = ACCIONES.indexOf(`export async function ${nombre}(`);
  assert.ok(i >= 0, `no encontré ${nombre} en actions.ts`);
  const resto = ACCIONES.slice(i + 10);
  const fin = resto.search(/\nexport (async )?function /);
  const cuerpo = fin >= 0 ? resto.slice(0, fin) : resto;
  return new Set([...cuerpo.matchAll(/formData\.(?:get|has|getAll)\("([^"]+)"\)/g)].map((m) => m[1]));
}

const claves = (c: readonly (readonly [string, string])[]) => new Set(c.map(([k]) => k));

describe("los campos que viajan son los que lee cada acción", () => {
  test("registrarCobroTurno", () => {
    const c = camposDeCobro({ turnoId: "t1", clave: "k", monto: 22000, metodo: "EFECTIVO" });
    assert.deepEqual(claves(c), camposQueLee("registrarCobroTurno"));
  });

  test("completeAppointment: con medio, dejando el saldo, o sin saldo", () => {
    const lee = camposQueLee("completeAppointment");
    const conMedio = camposDeTerminar({ turnoId: "t1", saldo: 22000, cobro: { metodo: "MERCADOPAGO" } });
    const dejando = camposDeTerminar({ turnoId: "t1", saldo: 22000, cobro: "dejar-a-cobrar" });
    const sinSaldo = camposDeTerminar({ turnoId: "t1", saldo: 0, cobro: { metodo: "EFECTIVO" } });
    for (const c of [conMedio, dejando, sinSaldo]) for (const k of claves(c)) assert.ok(lee.has(k), `completeAppointment no lee ${k}`);
    assert.deepEqual(conMedio, [["appointmentId", "t1"], ["method", "MERCADOPAGO"]]);
    assert.deepEqual(dejando, [["appointmentId", "t1"], ["saldo", "a-cobrar"]]);
    assert.deepEqual(sinSaldo, [["appointmentId", "t1"]]);
  });

  test("confirmarTurno, cancelAppointment y markNoShow leen sólo el turno", () => {
    for (const a of ["confirmarTurno", "cancelAppointment", "markNoShow"]) {
      assert.deepEqual(claves(camposDelTurno("t1")), camposQueLee(a), a);
    }
  });

  test("anularCobroTurno y condonarSaldoTurno", () => {
    assert.deepEqual(claves(camposDeAnular({ cobroId: "k1", turnoId: "t1", motivo: " medio equivocado " })), camposQueLee("anularCobroTurno"));
    assert.deepEqual(claves(camposDeCondonar({ turnoId: "t1", motivo: "descuento" })), camposQueLee("condonarSaldoTurno"));
    assert.equal(aFormData(camposDeAnular({ cobroId: "k1", turnoId: "t1", motivo: " medio equivocado " })).get("motivo"), "medio equivocado");
  });
});

describe("el monto se lee como plata argentina y viaja canónico", () => {
  test("«22.000» son veintidós mil (con Number() serían 22)", () => {
    const l = leerMontoDelCobro("22.000", 22000);
    assert.deepEqual(l, { ok: true, monto: 22000 });
    assert.equal(aFormData(camposDeCobro({ turnoId: "t", clave: "k", monto: 22000, metodo: "EFECTIVO" })).get("amount"), "22000");
  });

  test("con centavos, con signo pesos y con espacios", () => {
    assert.deepEqual(leerMontoDelCobro("$ 7.500,50", 22000), { ok: true, monto: 7500.5 });
    assert.equal(aFormData(camposDeCobro({ turnoId: "t", clave: "k", monto: 7500.5, metodo: "EFECTIVO" })).get("amount"), "7500.5");
  });

  test("vacío, ilegible, cero o más que el saldo no se mandan", () => {
    assert.equal(leerMontoDelCobro("", 100).ok, false);
    assert.equal(leerMontoDelCobro("abc", 100).ok, false);
    assert.equal(leerMontoDelCobro("0", 100).ok, false);
    const mas = leerMontoDelCobro("150", 100);
    assert.equal(mas.ok, false);
    assert.equal(mas.ok ? "" : mas.error, "Es más de lo que falta cobrar.");
  });

  test("sin medio elegido no hay medio (no se asume efectivo)", () => {
    assert.equal(metodoElegido(""), null);
    assert.equal(metodoElegido("CHEQUE"), null);
    assert.equal(metodoElegido("TRANSFERENCIA"), "TRANSFERENCIA");
  });
});
