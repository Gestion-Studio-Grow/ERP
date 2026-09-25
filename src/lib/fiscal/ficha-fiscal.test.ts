// FICHA FISCAL DEL CLIENTE (R1-F5) · qué se guarda y qué letra sale, EJECUTADO contra la decisión
// fiscal única (`decidirComprobante`), sin base ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosDeFicha,
  decidirFacturaDeVenta,
  motivoDeLaDecision,
  OPCIONES_CONDICION_IVA,
  OPCIONES_DOCUMENTO,
  queImpideEntregarLaFactura,
  receptorDeFicha,
  receptorParaComprobante,
  validarFichaFiscal,
  type FichaFiscal,
} from "./ficha-fiscal";
import { calcularImpuestosPorAlicuota } from "./impuestos-por-alicuota";
import { decidirDelEvento } from "@/plugins/arca/domain/comprobante";

// CUIT con dígito verificador correcto (calculado con validarCuit).
const CUIT_EMISOR = "30712345671";
const CUIT_INSCRIPTO = "30500000003";
const CUIT_MONOTRIBUTISTA = "27111111117";
const HOY = "20260925";

const INSCRIPTO: FichaFiscal = {
  docTipo: 80,
  docNro: CUIT_INSCRIPTO,
  razonSocial: "Distribuidora del Sur SA",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  domicilio: null,
};
const MONOTRIBUTISTA: FichaFiscal = {
  docTipo: 80,
  docNro: CUIT_MONOTRIBUTISTA,
  razonSocial: "Ana Gómez",
  condicionIva: "MONOTRIBUTO",
  domicilio: null,
};
const EMISOR_RI = { condicionIva: "RESPONSABLE_INSCRIPTO", cuit: CUIT_EMISOR, regimenFacturaA: "A" };

function error(r: ReturnType<typeof validarFichaFiscal>): string {
  return r.ok ? "" : `${r.campo}: ${r.error}`;
}

test("CUIT de responsable inscripto con guiones: se guarda sin guiones, con su condición y razón social", () => {
  const r = validarFichaFiscal({
    docTipo: "80",
    docNro: "30-50000000-3",
    razonSocial: "  Distribuidora   del Sur SA ",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: " Av. Mitre   1234, Avellaneda ",
  });
  assert.deepEqual(r, { ok: true, ficha: { ...INSCRIPTO, domicilio: "Av. Mitre 1234, Avellaneda" } });
});

// Refutación r1f5 (5): se guardaban fichas que reciben A sin domicilio, y la A no se podía imprimir.
test("inscripto o monotributista sin domicilio: se pide, porque la Factura A lo lleva impreso (RG 1415); exento o consumidor final, no", () => {
  const casos: [string, string][] = [
    ["RESPONSABLE_INSCRIPTO", CUIT_INSCRIPTO],
    ["MONOTRIBUTO", CUIT_MONOTRIBUTISTA],
    ["MONOTRIBUTO_SOCIAL", CUIT_MONOTRIBUTISTA],
    ["MONOTRIBUTO_PROMOVIDO", CUIT_MONOTRIBUTISTA],
  ];
  for (const [condicionIva, docNro] of casos) {
    const r = validarFichaFiscal({ docTipo: "80", docNro, razonSocial: "Razón SA", condicionIva, domicilio: "  " });
    assert.match(error(r), /^domicilio: .*Factura A/, condicionIva);
  }
  assert.equal(validarFichaFiscal({ docTipo: "80", docNro: CUIT_INSCRIPTO, razonSocial: "Razón SA", condicionIva: "EXENTO", domicilio: "" }).ok, true);
  assert.equal(validarFichaFiscal({ docTipo: "96", docNro: "12345678", condicionIva: "CONSUMIDOR_FINAL", domicilio: "" }).ok, true);
});

test("lo que impide entregar la factura decidida: nada en la A común con domicilio y una alícuota, ni en la B; sí en la A sin domicilio, con dos alícuotas o a un monotributista", () => {
  const conDomicilio = { ...INSCRIPTO, domicilio: "Av. Mitre 1234" };
  const a = decidirFacturaDeVenta(EMISOR_RI, conDomicilio, { hoy: HOY, total: 1210 });
  assert.equal(a.comprobante?.letra, "A");
  assert.equal(queImpideEntregarLaFactura(a, conDomicilio, 1), null);
  assert.match(queImpideEntregarLaFactura(a, INSCRIPTO, 1) ?? "", /domicilio/);
  assert.match(queImpideEntregarLaFactura(a, conDomicilio, 2) ?? "", /alícuotas/);
  const mono = { ...MONOTRIBUTISTA, domicilio: "Calle 12 Nº 345" };
  const aMono = decidirFacturaDeVenta(EMISOR_RI, mono, { hoy: HOY, total: 1210 });
  assert.match(queImpideEntregarLaFactura(aMono, mono, 1) ?? "", /RG 5003\/2021/);
  const b = decidirFacturaDeVenta(EMISOR_RI, null, { hoy: HOY, total: 1210 });
  assert.equal(b.comprobante?.letra, "B");
  assert.equal(queImpideEntregarLaFactura(b, null, 3), null, "la B a consumidor final con su leyenda (Ley 27.743) sí se imprime");
});

test("CUIT con el dígito verificador cambiado: se rechaza y se dice por qué", () => {
  const r = validarFichaFiscal({ docTipo: 80, docNro: "30500000004", razonSocial: "X SA", condicionIva: "RESPONSABLE_INSCRIPTO" });
  assert.match(error(r), /^docNro: .*verificador/);
});

test("un número sin tipo de documento no se adivina: se pide elegir CUIT, CUIL o DNI", () => {
  assert.match(error(validarFichaFiscal({ docNro: CUIT_INSCRIPTO })), /^docTipo: Elegí qué documento/);
  assert.match(error(validarFichaFiscal({ docTipo: "87", docNro: CUIT_INSCRIPTO })), /^docTipo: .*CUIT, CUIL o DNI/);
  assert.match(error(validarFichaFiscal({ docTipo: "80" })), /^docNro: Falta el número de CUIT/);
});

test("CUIT sin condición frente al IVA: se pide, no se asume consumidor final", () => {
  const r = validarFichaFiscal({ docTipo: 80, docNro: CUIT_INSCRIPTO, razonSocial: "X SA" });
  assert.match(error(r), /^condicionIva: Con CUIT hace falta la condición/);
});

test("CUIT sin razón social: se pide, no se copia el nombre de la ficha", () => {
  const r = validarFichaFiscal({ docTipo: 80, docNro: CUIT_INSCRIPTO, condicionIva: "RESPONSABLE_INSCRIPTO" });
  assert.match(error(r), /^razonSocial: Falta la razón social/);
});

test("responsable inscripto, monotributista o exento sin CUIT: se pide el CUIT", () => {
  for (const condicionIva of ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"]) {
    const conDni = validarFichaFiscal({ docTipo: 96, docNro: "30111222", condicionIva, razonSocial: "X" });
    assert.match(error(conDni), /^docNro: .*identifica con su CUIT/, condicionIva);
    assert.match(error(validarFichaFiscal({ condicionIva })), /^docNro: .*CUIT/, condicionIva);
  }
});

test("una condición frente al IVA que no está en la tabla de ARCA se rechaza", () => {
  assert.match(error(validarFichaFiscal({ condicionIva: "INSCRIPTO" })), /^condicionIva: Esa condición/);
  assert.match(error(validarFichaFiscal({ condicionIva: "constructor" })), /^condicionIva: Esa condición/);
});

test("ficha vacía: vale y deja al cliente como consumidor final sin identificar", () => {
  const r = validarFichaFiscal({ docTipo: "99", docNro: "", razonSocial: " ", condicionIva: "", domicilio: "" });
  assert.deepEqual(r, {
    ok: true,
    ficha: { docTipo: null, docNro: null, razonSocial: null, condicionIva: null, domicilio: null },
  });
  assert.deepEqual(receptorDeFicha(r.ok ? r.ficha : null), { condicionIva: null, docTipo: null, docNro: null });
});

test("DNI de consumidor final: se guarda sin puntos; uno de 5 números se rechaza", () => {
  const r = validarFichaFiscal({ docTipo: 96, docNro: "30.111.222", condicionIva: "CONSUMIDOR_FINAL" });
  assert.equal(r.ok && r.ficha.docNro, "30111222");
  assert.match(error(validarFichaFiscal({ docTipo: 96, docNro: "12345" })), /^docNro: El DNI/);
});

test("razón social o domicilio demasiado largos se rechazan", () => {
  const largo = "x".repeat(121);
  const r = validarFichaFiscal({ docTipo: 80, docNro: CUIT_INSCRIPTO, condicionIva: "EXENTO", razonSocial: largo });
  assert.match(error(r), /^razonSocial: .*120/);
  assert.match(error(validarFichaFiscal({ domicilio: "y".repeat(201) })), /^domicilio: .*200/);
});

test("cambios de la ficha: sólo lo que cambió, con el valor anterior al lado", () => {
  const antes: FichaFiscal = { ...INSCRIPTO, condicionIva: "MONOTRIBUTO" };
  assert.deepEqual(cambiosDeFicha(antes, INSCRIPTO), {
    condicionIva: { antes: "MONOTRIBUTO", despues: "RESPONSABLE_INSCRIPTO" },
  });
  assert.deepEqual(cambiosDeFicha(INSCRIPTO, { ...INSCRIPTO }), {});
});

test("inscripto con A común a un cliente inscripto guardado: Factura A (tipo 1), lista para emitir", () => {
  const d = decidirFacturaDeVenta(EMISOR_RI, INSCRIPTO, { hoy: HOY, total: 1210 });
  assert.equal(d.estado, "lista", motivoDeLaDecision(d));
  assert.equal(d.comprobante?.letra, "A");
  assert.equal(d.comprobante?.cbteTipo, 1);
  assert.equal(d.comprobante?.docTipo, 80);
  assert.equal(d.comprobante?.docNro, Number(CUIT_INSCRIPTO));
  assert.equal(d.comprobante?.condicionIvaReceptorId, 1);
});

test("inscripto a un monotributista: Factura A con la leyenda de la RG 5003/2021, no B", () => {
  const d = decidirFacturaDeVenta(EMISOR_RI, MONOTRIBUTISTA, { hoy: HOY, total: 1210 });
  assert.equal(d.estado, "lista", motivoDeLaDecision(d));
  assert.equal(d.comprobante?.letra, "A");
  assert.equal(d.comprobante?.condicionIvaReceptorId, 6);
  assert.ok(d.comprobante?.leyendas.some((l) => l.codigo === "RG5003_MONOTRIBUTISTA"));
});

test("inscripto a un consumidor final sin ficha: Factura B (tipo 6), sin documento", () => {
  const d = decidirFacturaDeVenta(EMISOR_RI, null, { hoy: HOY, total: 1210 });
  assert.equal(d.estado, "lista", motivoDeLaDecision(d));
  assert.equal(d.comprobante?.letra, "B");
  assert.equal(d.comprobante?.cbteTipo, 6);
  assert.equal(d.comprobante?.docTipo, 99);
  assert.equal(d.comprobante?.docNro, 0);
});

test("monotributo emite siempre C, a cualquier ficha", () => {
  const emisor = { condicionIva: "MONOTRIBUTO", cuit: CUIT_EMISOR };
  for (const ficha of [INSCRIPTO, MONOTRIBUTISTA, null]) {
    const d = decidirFacturaDeVenta(emisor, ficha, { hoy: HOY, total: 1210 });
    assert.equal(d.estado, "lista", motivoDeLaDecision(d));
    assert.equal(d.comprobante?.letra, "C");
    assert.equal(d.comprobante?.cbteTipo, 11);
  }
});

test("inscripto sin la clase A cargada: la A no sale sola (a revisión, con el motivo); la B a consumidor final sí", () => {
  const sinClase = { condicionIva: "RESPONSABLE_INSCRIPTO", cuit: CUIT_EMISOR };
  const a = decidirFacturaDeVenta(sinClase, INSCRIPTO, { hoy: HOY, total: 1210 });
  assert.equal(a.estado, "revision");
  assert.equal(a.comprobante?.letra ?? "A", "A");
  assert.ok(a.motivos.some((m) => m.codigo === "REGIMEN_A_A_CONFIRMAR"));
  assert.notEqual(motivoDeLaDecision(a), "");
  const b = decidirFacturaDeVenta(sinClase, null, { hoy: HOY, total: 1210 });
  assert.equal(b.estado, "lista");
  assert.equal(b.comprobante?.letra, "B");
});

test("emisor sin condición frente al IVA: la decisión se niega con un motivo que dice qué cargar", () => {
  const d = decidirFacturaDeVenta({ condicionIva: null, cuit: CUIT_EMISOR }, INSCRIPTO, { hoy: HOY, total: 1210 });
  assert.equal(d.estado, "bloqueada");
  assert.equal(d.comprobante, null);
  assert.ok(d.motivos.some((m) => m.codigo === "EMISOR_SIN_CONDICION"));
  assert.match(motivoDeLaDecision(d), /IVA/);
});

const CON_DNI: FichaFiscal = { docTipo: 96, docNro: "12345678", razonSocial: null, condicionIva: null, domicilio: null };

test("el comprador de la factura es el de la decisión: inscripto, monotributista, DNI y sin identificar", () => {
  const receptor = (ficha: FichaFiscal | null) =>
    receptorParaComprobante(decidirFacturaDeVenta(EMISOR_RI, ficha, { hoy: HOY, total: 15500 }));
  assert.deepEqual(receptor(INSCRIPTO), { docTipo: 80, docNro: 30500000003, condicionIva: "RESPONSABLE_INSCRIPTO" });
  assert.deepEqual(receptor(MONOTRIBUTISTA), { docTipo: 80, docNro: 27111111117, condicionIva: "MONOTRIBUTO" });
  assert.deepEqual(receptor(CON_DNI), { docTipo: 96, docNro: 12345678, condicionIva: "CONSUMIDOR_FINAL" });
  // Sin ficha: el mismo consumidor final fijo que llevan hoy las facturas (99, 0).
  assert.deepEqual(receptor(null), { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" });
});

test("sin decisión lista no hay comprador para la factura: CUIT sin condición, o la A sin su clase", () => {
  const cuitSinCondicion: FichaFiscal = { ...INSCRIPTO, condicionIva: null };
  const d1 = decidirFacturaDeVenta(EMISOR_RI, cuitSinCondicion, { hoy: HOY, total: 15500 });
  assert.equal(receptorParaComprobante(d1), null);
  assert.match(motivoDeLaDecision(d1), /condición frente al IVA/);
  const sinClase = { ...EMISOR_RI, regimenFacturaA: null };
  assert.equal(receptorParaComprobante(decidirFacturaDeVenta(sinClase, INSCRIPTO, { hoy: HOY, total: 15500 })), null);
});

test("lo que Ventas decide es lo que el despacho vuelve a decidir con la factura armada", () => {
  for (const ficha of [INSCRIPTO, MONOTRIBUTISTA, CON_DNI, null]) {
    for (const total of [15500, 12_345_678.9]) {
      const enVentas = decidirFacturaDeVenta(EMISOR_RI, ficha, { hoy: HOY, total });
      const receptor = receptorParaComprobante(enVentas);
      if (!receptor) {
        // Sin comprador sólo quedan las ventas grandes: con CUIT puede ir Factura de Crédito
        // Electrónica (se confirma a mano) y sin identificar hace falta el documento (RG 5700).
        assert.ok(total > 10_000_000 && ficha !== CON_DNI, motivoDeLaDecision(enVentas));
        assert.match(motivoDeLaDecision(enVentas), ficha ? /Factura de Crédito Electrónica/ : /documento|DNI|identific/i);
        continue;
      }
      const impuestos = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", { total, renglones: [{ total, alicuotaIva: 5 }] });
      assert.ok(impuestos.ok);
      const ev = {
        invoiceId: "inv",
        tenantId: "t",
        concepto: 1,
        fecha: HOY,
        emisor: { cuit: Number(CUIT_EMISOR), condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1, regimenFacturaA: "A" },
        receptor,
        ...impuestos.impuestos,
        ivaPorProducto: true,
      } as Parameters<typeof decidirDelEvento>[0];
      const enElDespacho = decidirDelEvento(ev, HOY);
      assert.equal(enElDespacho.estado, "lista", motivoDeLaDecision(enElDespacho));
      const clave = (d: typeof enVentas) => {
        const c = d.comprobante!;
        return [c.letra, c.cbteTipo, c.docTipo, c.docNro, c.condicionIvaReceptor, c.condicionIvaReceptorId];
      };
      assert.deepEqual(clave(enElDespacho), clave(enVentas));
    }
  }
});

test("el formulario de la ficha ofrece sólo lo que la acción acepta, y cada condición dicha en castellano", () => {
  for (const { valor } of OPCIONES_DOCUMENTO) {
    const numero = valor === "96" ? "12345678" : valor === "" ? "" : CUIT_INSCRIPTO;
    const r = validarFichaFiscal({ docTipo: valor, docNro: numero, razonSocial: "Razón SA", condicionIva: valor === "80" ? "EXENTO" : "" });
    assert.equal(r.ok, true, `documento ${valor}: ${error(r)}`);
  }
  assert.equal(OPCIONES_CONDICION_IVA.length, 12, "sin cargar + las 11 de la tabla de ARCA");
  for (const { valor, etiqueta } of OPCIONES_CONDICION_IVA.slice(1)) {
    assert.notEqual(etiqueta, valor, `${valor} sin etiqueta en castellano`);
    const r = validarFichaFiscal({ docTipo: "80", docNro: CUIT_INSCRIPTO, razonSocial: "Razón SA", condicionIva: valor, domicilio: "Av. Mitre 1234" });
    assert.equal(r.ok, true, `condición ${valor}: ${error(r)}`);
  }
});
