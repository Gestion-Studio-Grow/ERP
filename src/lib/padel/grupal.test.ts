// PADEL-CLASES · E7 — Grupal con integrantes: reglas puras (core.ts). Estado «pagada», deuda,
// montos, cancelación y validación de la lista. Más B2: un pedido vencido nunca es pagable.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasePagada,
  cobroDeLaClase,
  detalleDeuda,
  esDeuda,
  esEnRevision,
  esPagable,
  estadoEnPantalla,
  integrantesValidos,
  montoPorPersona,
  pagoDeIntegranteAlCerrar,
  parteDeIntegrante,
  personasConIntegrantes,
  precioAlQuedarSolo,
  precioDe,
  revisionEnClaseCaida,
  precioDelTitular,
  puedeCobrarProfe,
  puedeQuitarIntegrante,
  puedeSubirComprobante,
  saldoAFavor,
  textoParaIntegrante,
  totalDeuda,
  MOTIVO_AUSENTE_NO_SE_COBRA,
  MOTIVO_AUSENTE_SE_COBRA,
} from "./core";

const config = { precioIndividual: 25_000, precioGrupal: 12_500.5 };

test("montos: con integrantes el titular paga su parte (por persona); sin ellos, lo de siempre", () => {
  assert.equal(precioDelTitular(config, "GRUPAL", 3, 2), 12_500.5);
  assert.equal(montoPorPersona(config), 12_500.5);
  // Sin integrantes: el total (precioDe), como las grupales de antes.
  assert.equal(precioDelTitular(config, "GRUPAL", 3, 0), precioDe(config, "GRUPAL", 3));
  assert.equal(precioDelTitular(config, "INDIVIDUAL", 1, 0), 25_000);
  // Titular + integrantes = el total de la lista, al centavo.
  const total = precioDelTitular(config, "GRUPAL", 4, 3) + 3 * montoPorPersona(config);
  assert.equal(Math.round(total * 100), Math.round(precioDe(config, "GRUPAL", 4) * 100));
  assert.equal(personasConIntegrantes(0), 1);
  assert.equal(personasConIntegrantes(3), 4);
  assert.equal(personasConIntegrantes(9), 4);
  assert.equal(montoPorPersona({ precioGrupal: Number.NaN }), 0);
  assert.equal(montoPorPersona({ precioGrupal: 0.1 + 0.2 }), 0.3);
});

test("pagada: sólo si el titular Y todos los integrantes pagaron", () => {
  assert.equal(clasePagada({ pagoEstado: "PAGADO" }, []), true);
  assert.equal(clasePagada({ pagoEstado: "PAGADO" }, [{ pagoEstado: "PAGADO" }, { pagoEstado: "PENDIENTE" }]), false);
  assert.equal(clasePagada({ pagoEstado: "PENDIENTE" }, [{ pagoEstado: "PAGADO" }]), false);
  assert.equal(clasePagada({ pagoEstado: "PAGADO" }, [{ pagoEstado: "EN_REVISION" }]), false);
  const c = cobroDeLaClase({ pagoEstado: "PAGADO", precio: 10_000 }, [
    { pagoEstado: "PAGADO", monto: 10_000 },
    { pagoEstado: "PENDIENTE", monto: 10_000 },
  ]);
  assert.deepEqual(c, { pagaron: 2, personas: 3, cobrado: 20_000, total: 30_000, pagada: false });
});

test("deuda: la parte de un integrante sigue la MISMA regla que una clase", () => {
  const dada = { estado: "DADA", motivoCancel: null };
  const parte = parteDeIntegrante(dada, { pagoEstado: "PENDIENTE", monto: 10_000 });
  assert.equal(esDeuda(parte), true);
  assert.equal(puedeCobrarProfe(parte), true);
  assert.equal(esDeuda(parteDeIntegrante(dada, { pagoEstado: "PAGADO", monto: 10_000 })), false);
  assert.equal(esDeuda(parteDeIntegrante(dada, { pagoEstado: "EN_REVISION", monto: 10_000 })), false);
  assert.equal(esEnRevision(parteDeIntegrante(dada, { pagoEstado: "EN_REVISION", monto: 10_000 })), true);
  // Confirmada: se puede pagar por adelantado, pero no es deuda.
  const conf = parteDeIntegrante({ estado: "CONFIRMADA" }, { pagoEstado: "PENDIENTE", monto: 10_000 });
  assert.equal(esDeuda(conf), false);
  assert.equal(esPagable(conf), true);
  assert.equal(puedeSubirComprobante(conf), true);
  // Pedida: ni deuda ni pagable ni cobrable.
  const pedida = parteDeIntegrante({ estado: "PEDIDA" }, { pagoEstado: "PENDIENTE", monto: 10_000 });
  assert.equal(esPagable(pedida), false);
  assert.equal(puedeCobrarProfe(pedida), false);
  // No vino: se cobra igual → deuda; no se cobra → no.
  assert.equal(esDeuda(parteDeIntegrante({ estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }, { pagoEstado: "PENDIENTE", monto: 1 })), true);
  assert.equal(esDeuda(parteDeIntegrante({ estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_NO_SE_COBRA }, { pagoEstado: "PENDIENTE", monto: 1 })), false);
  // Sin monto, nunca deuda.
  assert.equal(esDeuda(parteDeIntegrante(dada, { pagoEstado: "PENDIENTE", monto: 0 })), false);
  // Suma con sus clases: total y detalle.
  const clases = [
    { estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000, empiezaEn: new Date("2026-11-02T21:00:00Z") },
    { ...parte, empiezaEn: new Date("2026-11-03T21:00:00Z") },
  ];
  assert.equal(totalDeuda(clases), 35_000);
  assert.equal(detalleDeuda(clases).cantidad, 2);
});

test("cancelación: lo pagado por el integrante queda a favor; sin pagar o por revisar, igual", () => {
  assert.deepEqual(pagoDeIntegranteAlCerrar({ pagoEstado: "PAGADO", pagoMedio: "EFECTIVO" }, { tipo: "cancelar" }), { pagoEstado: "ACREDITADO" });
  assert.equal(pagoDeIntegranteAlCerrar({ pagoEstado: "PENDIENTE" }, { tipo: "cancelar" }), null);
  assert.equal(pagoDeIntegranteAlCerrar({ pagoEstado: "EN_REVISION" }, { tipo: "cancelar" }), null);
  // «No vino → no se cobra»: pagado a favor, comprobante por revisar queda sin efecto.
  assert.deepEqual(pagoDeIntegranteAlCerrar({ pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA" }, { tipo: "noVino", seCobra: false }), { pagoEstado: "ACREDITADO" });
  assert.equal(pagoDeIntegranteAlCerrar({ pagoEstado: "EN_REVISION" }, { tipo: "noVino", seCobra: false })?.pagoEstado, "PENDIENTE");
  assert.equal(pagoDeIntegranteAlCerrar({ pagoEstado: "PAGADO" }, { tipo: "noVino", seCobra: true }), null);
  // Lo acreditado de su parte cuenta en su saldo a favor.
  const acreditada = parteDeIntegrante({ estado: "CANCELADA" }, { pagoEstado: "ACREDITADO", monto: 12_500 });
  assert.equal(saldoAFavor([acreditada]), 12_500);
  assert.equal(saldoAFavor([acreditada, parteDeIntegrante({ estado: "CANCELADA" }, { pagoEstado: "DEVUELTO", monto: 12_500 })]), 12_500);
  // Quitar: sólo si no pagó ni mandó comprobante.
  assert.equal(puedeQuitarIntegrante({ pagoEstado: "PENDIENTE" }), true);
  assert.equal(puedeQuitarIntegrante({ pagoEstado: "EN_REVISION" }), false);
  assert.equal(puedeQuitarIntegrante({ pagoEstado: "PAGADO" }), false);
});

test("lista de integrantes: hasta 3, sin repetidos, nombre obligatorio y celular válido u omitido", () => {
  assert.deepEqual(integrantesValidos(""), { ok: true, lista: [] });
  assert.deepEqual(integrantesValidos(null), { ok: true, lista: [] });
  const ok = integrantesValidos(JSON.stringify([{ alumnoId: "abc123" }, { nombre: "  Ana   Ruiz ", telefono: "11 5555-1234" }, { nombre: "Beto" }]));
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.lista, [{ alumnoId: "abc123" }, { nombre: "Ana Ruiz", telefono: "1155551234" }, { nombre: "Beto", telefono: "" }]);
  assert.equal(integrantesValidos([{ nombre: "A1" }, { nombre: "A2" }, { nombre: "A3" }, { nombre: "A4" }]).ok, false);
  assert.equal(integrantesValidos([{ alumnoId: "x" }, { alumnoId: "x" }]).ok, false);
  assert.equal(integrantesValidos([{ nombre: "Ana", telefono: "1155551234" }, { nombre: "Eva", telefono: "11 5555 1234" }]).ok, false);
  assert.equal(integrantesValidos([{ nombre: "A" }]).ok, false);
  assert.equal(integrantesValidos([{ nombre: "Ana", telefono: "123" }]).ok, false);
  assert.equal(integrantesValidos([{ alumnoId: "x'; drop" }]).ok, false);
  assert.equal(integrantesValidos("{no es json").ok, false);
  assert.equal(integrantesValidos({ nombre: "Ana" }).ok, false);
});

test("WhatsApp al integrante: su monto, el titular y su link si lo tiene", () => {
  const t = textoParaIntegrante({ nombre: "Ana Ruiz", titular: "Juan Pérez", empiezaEn: new Date("2026-11-12T21:00:00Z"), monto: 12_500, alias: "profe.mp", club: "Club Norte", link: "https://x/alumno/T" });
  assert.match(t, /Ana/);
  assert.match(t, /Juan/);
  assert.match(t, /Club Norte/);
  assert.match(t, /12\.500/);
  assert.match(t, /profe\.mp/);
  assert.match(t, /\/alumno\/T/);
  assert.doesNotMatch(textoParaIntegrante({ nombre: "Ana", titular: "Juan", empiezaEn: new Date(), monto: 0 }), /\$/);
});

test("B2: un pedido vencido (o sin confirmar) nunca ofrece «Pagar»", () => {
  const ayer = new Date(Date.now() - 86_400_000);
  const estado = estadoEnPantalla("PEDIDA", ayer, new Date());
  assert.equal(estado, "SIN_RESPUESTA");
  assert.equal(esPagable({ estado, pagoEstado: "PENDIENTE", precio: 25_000 }), false);
  assert.equal(puedeSubirComprobante({ estado, pagoEstado: "PENDIENTE", precio: 25_000 }), false);
  assert.equal(esPagable({ estado: "PEDIDA", pagoEstado: "PENDIENTE", precio: 25_000 }), false);
  assert.equal(puedeSubirComprobante({ estado: "PEDIDA", pagoEstado: "PENDIENTE", precio: 25_000 }), false);
});

test("quitar el último integrante: individual con tope en lo que pagaba el grupo; dada o pagada, no se toca", () => {
  const conf = { estado: "CONFIRMADA", pagoEstado: "PENDIENTE", precio: 12_000 };
  // La lista subió a 40.000 después de confirmar: el titular paga lo que pagaba el grupo (24.000).
  assert.equal(precioAlQuedarSolo(conf, 40_000, [12_000]), 24_000);
  // La individual es más barata que el grupo: la individual.
  assert.equal(precioAlQuedarSolo(conf, 20_000, [12_000]), 20_000);
  assert.equal(precioAlQuedarSolo({ ...conf, estado: "PEDIDA" }, 25_000, [12_000]), 24_000);
  for (const estado of ["DADA", "AUSENTE", "CANCELADA", "RECHAZADA", "SIN_RESPUESTA"]) assert.equal(precioAlQuedarSolo({ ...conf, estado }, 40_000, [12_000]), null, estado);
  for (const pagoEstado of ["PAGADO", "EN_REVISION", "ACREDITADO"]) assert.equal(precioAlQuedarSolo({ ...conf, pagoEstado }, 40_000, [12_000]), null, pagoEstado);
});

test("comprobante mandado en una clase caída: está bien → a favor; no es válido → pendiente; nada más corre", () => {
  for (const estado of ["CANCELADA", "RECHAZADA"]) {
    assert.equal(revisionEnClaseCaida("EN_REVISION", estado, "validar"), "ACREDITADO");
    assert.equal(revisionEnClaseCaida("EN_REVISION", estado, "noValido"), "PENDIENTE");
    assert.equal(revisionEnClaseCaida("EN_REVISION", estado, "efectivo"), null);
    assert.equal(revisionEnClaseCaida("PENDIENTE", estado, "validar"), null);
  }
  assert.equal(revisionEnClaseCaida("EN_REVISION", "CONFIRMADA", "validar"), null);
});
