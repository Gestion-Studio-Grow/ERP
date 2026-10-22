// Reglas puras del cobro dividido, «Llegó la seña», la deuda vieja y «Deshacer» (CH Tanda 2), y el
// contrato de campos entre la pantalla (`_agenda/campos.ts`, `camposDe*` de acá) y las Server Actions
// de `cobro-actions.ts`: se lee el código de la acción, no un mock, como campos.test.ts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MENSAJE_SENIA_CAMBIO,
  MENSAJE_VENTANA_VENCIDA,
  NOTA_LLEGO_LA_SENIA,
  VENTANA_DESHACER_MS,
  camposDeCobrarVarios,
  camposDeDeshacer,
  claveDeSaldo,
  claveDeSenia,
  leerCobrosVarios,
  leerPagos,
  leerQueSeDeshace,
  pesosDelCobro,
  planDeSenia,
  puedeDeshacerCierre,
  puedeDeshacerSenia,
  repartoEnPantalla,
  restoDelSaldo,
  seniaQueFalta,
  textoDelReparto,
  totalDeLaDeuda,
  validarCobroDividido,
  validarCobrosVarios,
} from "./cobro-dividido";
import { aFormData, camposDeDividir, camposDeSenia } from "../../app/admin/(dashboard)/turnos/_agenda/campos";

describe("cobro dividido: el reparto salda exacto lo que falta", () => {
  test("CH-023 · $18.000 = Efectivo $10.000 + Mercado Pago $8.000", () => {
    const v = validarCobroDividido(
      [
        { metodo: "EFECTIVO", monto: 10000 },
        { metodo: "MERCADOPAGO", monto: 8000 },
      ],
      18000,
    );
    assert.deepEqual(v, {
      ok: true,
      total: 18000,
      lineas: [
        { metodo: "EFECTIVO", monto: 10000 },
        { metodo: "MERCADOPAGO", monto: 8000 },
      ],
    });
  });

  test("con centavos, al centavo (sin errores de coma flotante)", () => {
    assert.equal(validarCobroDividido([{ metodo: "EFECTIVO", monto: 0.1 }, { metodo: "TRANSFERENCIA", monto: 0.2 }], 0.3).ok, true);
    assert.equal(validarCobroDividido([{ metodo: "EFECTIVO", monto: 7500.5 }, { metodo: "TRANSFERENCIA", monto: 10499.5 }], 18000).ok, true);
  });

  test("no excede el saldo, no le falta, y dice cuánto", () => {
    const mas = validarCobroDividido([{ metodo: "EFECTIVO", monto: 10000 }, { metodo: "MERCADOPAGO", monto: 9000 }], 18000);
    assert.deepEqual(mas, { ok: false, error: "Te pasaste por $1.000: es más de lo que falta cobrar." });
    const menos = validarCobroDividido([{ metodo: "EFECTIVO", monto: 10000 }, { metodo: "MERCADOPAGO", monto: 7000 }], 18000);
    assert.deepEqual(menos, { ok: false, error: "Faltan $1.000 para completar lo que falta cobrar." });
  });

  test("medios distintos, dos como mínimo, conocidos y con plata", () => {
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: 18000 }], 18000)), /dos medios/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: 9000 }, { metodo: "EFECTIVO", monto: 9000 }], 18000)), /Efectivo aparece dos veces/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "CHEQUE", monto: 9000 }, { metodo: "EFECTIVO", monto: 9000 }], 18000)), /no se reconoce/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: 0 }, { metodo: "MERCADOPAGO", monto: 18000 }], 18000)), /cuánto paga con efectivo/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: Number.NaN }, { metodo: "MERCADOPAGO", monto: 18000 }], 18000)), /cuánto paga/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: 9000.001 }, { metodo: "MERCADOPAGO", monto: 8999.999 }], 18000)), /centavos/);
    assert.match(errorDe(validarCobroDividido([{ metodo: "EFECTIVO", monto: 9000 }, { metodo: "MERCADOPAGO", monto: 9000 }], 0)), /nada para cobrar/);
    const cuatro = ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "OTRO"].map((metodo) => ({ metodo, monto: 1 }));
    assert.match(errorDe(validarCobroDividido(cuatro, 4)), /Hasta 3 medios/);
  });

  test("el resto se completa solo", () => {
    assert.equal(restoDelSaldo(18000, 10000), 8000);
    assert.equal(restoDelSaldo(18000, 0), 18000);
    assert.equal(restoDelSaldo(18000, 25000), 0);
    assert.equal(restoDelSaldo(0.3, 0.1), 0.2);
  });

  test("el reparto de la hoja: listo sólo con dos medios distintos y un primer monto menor al saldo", () => {
    assert.deepEqual(repartoEnPantalla({ saldo: 18000, primero: { metodo: "EFECTIVO", monto: 10000 }, segundoMetodo: "MERCADOPAGO" }), {
      listo: true,
      lineas: [
        { metodo: "EFECTIVO", monto: 10000 },
        { metodo: "MERCADOPAGO", monto: 8000 },
      ],
      texto: "Efectivo $10.000 + Mercado Pago $8.000",
    });
    assert.deepEqual(repartoEnPantalla({ saldo: 18000, primero: { metodo: "EFECTIVO", monto: 10000 }, segundoMetodo: null }), { listo: false, resto: 8000 });
    assert.deepEqual(repartoEnPantalla({ saldo: 18000, primero: { metodo: null, monto: null }, segundoMetodo: null }), { listo: false, resto: 18000 });
    const mismo = repartoEnPantalla({ saldo: 18000, primero: { metodo: "EFECTIVO", monto: 10000 }, segundoMetodo: "EFECTIVO" });
    assert.deepEqual(mismo, { listo: false, resto: 8000, error: "Elegí dos medios distintos." });
    const todo = repartoEnPantalla({ saldo: 18000, primero: { metodo: "EFECTIVO", monto: 18000 }, segundoMetodo: "MERCADOPAGO" });
    assert.equal(todo.listo, false);
    assert.match(todo.listo ? "" : todo.error ?? "", /un solo medio/);
  });

  test("textos en pesos, sin centavos cuando no hay", () => {
    assert.equal(pesosDelCobro(18000), "$18.000");
    assert.equal(pesosDelCobro(7500.5), "$7.500,50");
    assert.equal(textoDelReparto([{ metodo: "TRANSFERENCIA", monto: 5000 }]), "Transferencia $5.000");
  });

  test("claves de idempotencia: saldo:<turno>:<n> y senia:<turno>", () => {
    assert.equal(claveDeSaldo("t1", 1), "saldo:t1:1");
    assert.equal(claveDeSaldo("t1", 2), "saldo:t1:2");
    assert.equal(claveDeSenia("t1"), "senia:t1");
  });

  test("leer los pagos del formulario", () => {
    assert.deepEqual(leerPagos('[{"metodo":"EFECTIVO","monto":10000},{"metodo":"MERCADOPAGO","monto":"8000"}]'), {
      ok: true,
      lineas: [
        { metodo: "EFECTIVO", monto: 10000 },
        { metodo: "MERCADOPAGO", monto: 8000 },
      ],
    });
    for (const malo of [null, "", "{", "{}", "[1]"]) assert.equal(leerPagos(malo).ok, false, String(malo));
  });
});

describe("«Llegó la seña»: cobra lo que falta de la seña y confirma", () => {
  const base = { status: "PENDING", depositAmount: 5000, precio: 14000, cobradoReal: 0 };

  test("CH-022 · Reservado con seña pedida → cobrar $5.000 y confirmar", () => {
    assert.deepEqual(planDeSenia(base), { tipo: "cobrar", monto: 5000, confirmar: true });
    assert.deepEqual(planDeSenia({ ...base, montoEsperado: 5000 }), { tipo: "cobrar", monto: 5000, confirmar: true });
  });

  test("doble toque: la seña ya entró → sólo confirmar, o nada si ya estaba confirmado", () => {
    assert.deepEqual(planDeSenia({ ...base, cobradoReal: 5000 }), { tipo: "solo-confirmar" });
    assert.deepEqual(planDeSenia({ ...base, status: "CONFIRMED", cobradoReal: 5000 }), { tipo: "ya-estaba" });
  });

  test("un Confirmado al que le llega la seña se cobra sin tocar el estado", () => {
    assert.deepEqual(planDeSenia({ ...base, status: "CONFIRMED" }), { tipo: "cobrar", monto: 5000, confirmar: false });
  });

  test("parcial previo: cobra lo que falta; si la pantalla decía otro monto, no cobra", () => {
    assert.deepEqual(planDeSenia({ ...base, cobradoReal: 2000 }), { tipo: "cobrar", monto: 3000, confirmar: true });
    assert.deepEqual(planDeSenia({ ...base, cobradoReal: 2000, montoEsperado: 5000 }), { tipo: "rechazado", motivo: MENSAJE_SENIA_CAMBIO });
  });

  test("sin seña en el servicio, o un turno cerrado: rechazado con qué hacer", () => {
    assert.deepEqual(planDeSenia({ ...base, depositAmount: null }), { tipo: "rechazado", motivo: "Este servicio no tiene seña: confirmalo sin seña." });
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"]) assert.equal(planDeSenia({ ...base, status }).tipo, "rechazado", status);
  });

  test("la seña nunca supera el precio", () => {
    assert.equal(seniaQueFalta({ depositAmount: 5000, precio: 4000, cobradoReal: 0 }), 4000);
    assert.equal(seniaQueFalta({ depositAmount: 5000, precio: 14000, cobradoReal: 9000 }), 0);
  });
});

describe("deuda vieja: un cobro por turno, cada uno a su turno", () => {
  test("total de lo que debe", () => {
    assert.equal(totalDeLaDeuda([{ saldo: 9000 }, { saldo: 0.1 }, { saldo: 0.2 }]), 9000.3);
  });

  test("el pedido bien formado", () => {
    assert.equal(validarCobrosVarios([{ id: "hoy", monto: 6000 }, { id: "viejo", monto: 9000 }]), null);
    assert.match(validarCobrosVarios([]) ?? "", /Elegí/);
    assert.match(validarCobrosVarios([{ id: "a", monto: 1 }, { id: "a", monto: 1 }]) ?? "", /dos veces/);
    assert.match(validarCobrosVarios([{ id: "", monto: 1 }]) ?? "", /Falta identificar/);
    assert.match(validarCobrosVarios([{ id: "a", monto: 0 }]) ?? "", /sin monto/);
    assert.match(validarCobrosVarios(Array.from({ length: 11 }, (_, i) => ({ id: `t${i}`, monto: 1 }))) ?? "", /Hasta 10/);
  });

  test("leer los cobros del formulario", () => {
    assert.deepEqual(leerCobrosVarios('[{"id":"a","monto":6000}]'), { ok: true, cobros: [{ id: "a", monto: 6000 }] });
    assert.equal(leerCobrosVarios("x").ok, false);
    assert.equal(leerCobrosVarios(undefined).ok, false);
  });
});

describe("deshacer: dentro de la ventana y sólo lo que corresponde", () => {
  const ahora = new Date("2026-10-24T15:00:00Z");
  const hace = (ms: number) => new Date(ahora.getTime() - ms);

  test("CH-026 · una cancelación de hace 5 s se deshace; a los 10 min ya no", () => {
    assert.deepEqual(puedeDeshacerCierre({ que: "cancelacion", status: "CANCELLED", hechoEl: hace(5000), ahora }), { ok: true });
    assert.deepEqual(puedeDeshacerCierre({ que: "cancelacion", status: "CANCELLED", hechoEl: hace(VENTANA_DESHACER_MS + 1), ahora }), {
      ok: false,
      motivo: MENSAJE_VENTANA_VENCIDA,
    });
    assert.equal(puedeDeshacerCierre({ que: "no-vino", status: "NO_SHOW", hechoEl: hace(60_000), ahora }).ok, true);
  });

  test("el estado tiene que ser el que se marcó, y hace falta saber cuándo", () => {
    assert.equal(puedeDeshacerCierre({ que: "cancelacion", status: "PENDING", hechoEl: hace(1000), ahora }).ok, false);
    assert.equal(puedeDeshacerCierre({ que: "no-vino", status: "CANCELLED", hechoEl: hace(1000), ahora }).ok, false);
    assert.equal(puedeDeshacerCierre({ que: "cancelacion", status: "CANCELLED", hechoEl: null, ahora }).ok, false);
  });

  test("CH-049 · sólo la seña de «Llegó la seña», y reciente", () => {
    assert.deepEqual(puedeDeshacerSenia({ note: NOTA_LLEGO_LA_SENIA, cobradoEl: hace(5000), ahora }), { ok: true });
    assert.equal(puedeDeshacerSenia({ note: "Saldo al completar", cobradoEl: hace(5000), ahora }).ok, false);
    assert.equal(puedeDeshacerSenia({ note: NOTA_LLEGO_LA_SENIA, cobradoEl: hace(VENTANA_DESHACER_MS + 1), ahora }).ok, false);
  });

  test("qué se deshace", () => {
    assert.equal(leerQueSeDeshace("senia"), "senia");
    assert.equal(leerQueSeDeshace("completar"), null);
  });
});

// ── Contrato de campos con las acciones ──────────────────────────────────────

const ACCIONES = readFileSync(fileURLToPath(new URL("./cobro-actions.ts", import.meta.url)), "utf8");

function camposQueLee(nombre: string): Set<string> {
  const i = ACCIONES.indexOf(`export async function ${nombre}(`);
  assert.ok(i >= 0, `no encontré ${nombre} en cobro-actions.ts`);
  const resto = ACCIONES.slice(i + 10);
  const fin = resto.search(/\n(export )?(async )?function /);
  const cuerpo = fin >= 0 ? resto.slice(0, fin) : resto;
  return new Set([...cuerpo.matchAll(/formData\.(?:get|has|getAll)\("([^"]+)"\)/g)].map((m) => m[1]));
}
const claves = (c: readonly (readonly [string, string])[]) => new Set(c.map(([k]) => k));

describe("los campos que arma la pantalla son los que lee cada acción", () => {
  test("terminarYCobrarDividido (camposDeDividir)", () => {
    const lee = camposQueLee("terminarYCobrarDividido");
    const c = camposDeDividir({ turnoId: "t1", lineas: [{ metodo: "EFECTIVO", monto: 10000 }, { metodo: "MERCADOPAGO", monto: 8000 }], estado: "PENDING" });
    for (const k of claves(c)) assert.ok(lee.has(k), `no lee ${k}`);
    assert.deepEqual(c, [
      ["appointmentId", "t1"],
      ["pagos", '[{"metodo":"EFECTIVO","monto":10000},{"metodo":"MERCADOPAGO","monto":8000}]'],
      ["vino", "on"],
    ]);
    assert.equal(aFormData(camposDeDividir({ turnoId: "t1", lineas: [], estado: "CONFIRMED" })).has("vino"), false);
    // Lo que manda la pantalla se relee igual del lado del servidor.
    const relei = leerPagos(aFormData(c).get("pagos"));
    assert.ok(relei.ok && validarCobroDividido(relei.lineas, 18000).ok);
  });

  test("cobrarSeniaYConfirmar (camposDeSenia)", () => {
    const c = camposDeSenia({ turnoId: "t1", monto: 5000, metodo: "TRANSFERENCIA" });
    assert.deepEqual(claves(c), camposQueLee("cobrarSeniaYConfirmar"));
    assert.deepEqual(c, [["appointmentId", "t1"], ["method", "TRANSFERENCIA"], ["amount", "5000"]]);
  });

  test("cobrarVariosTurnos (camposDeCobrarVarios)", () => {
    const c = camposDeCobrarVarios({
      cobros: [{ id: "hoy", monto: 6000 }, { id: "viejo", monto: 9000 }],
      metodo: "EFECTIVO",
      terminar: { turnoId: "hoy", estado: "PENDING" },
    });
    assert.deepEqual(claves(c), camposQueLee("cobrarVariosTurnos"));
    const relei = leerCobrosVarios(aFormData(c).get("cobros"));
    assert.deepEqual(relei, { ok: true, cobros: [{ id: "hoy", monto: 6000 }, { id: "viejo", monto: 9000 }] });
    assert.equal(aFormData(camposDeCobrarVarios({ cobros: [{ id: "v", monto: 1 }], metodo: "EFECTIVO" })).has("terminar"), false);
  });

  test("deshacerCierre (camposDeDeshacer); el cobroId lo lee la rama de la seña", () => {
    const lee = camposQueLee("deshacerCierre");
    for (const k of claves(camposDeDeshacer({ turnoId: "t1", que: "senia", cobroId: "c1" }))) assert.ok(lee.has(k), `no lee ${k}`);
    assert.deepEqual(camposDeDeshacer({ turnoId: "t1", que: "cancelacion", cobroId: "c1" }), [["appointmentId", "t1"], ["que", "cancelacion"]]);
  });
});

function errorDe(v: { ok: boolean; error?: string }): string {
  return v.ok ? "" : v.error ?? "";
}
