// COMPROBANTE (D4) · El tipo de comprobante y la condición del receptor salen de la decisión
// fiscal única (src/lib/fiscal/decidir-comprobante.ts), y el pedido a WSFEv1 se arma con lo que
// esa decisión resolvió: nada se completa en silencio en el armado del XML.
//
// Tabla emisor × receptor según la RG 1415 (letras), la RG 5003/2021 (Responsable Inscripto a
// monotributista → A con la leyenda de la Ley 27.618) y la RG 5616 (CondicionIVAReceptorId),
// y el XML de cada caso contra la secuencia de FECAEDetRequest del WSDL de WSFEv1 (manual del
// desarrollador, «provisional a confirmar» contra el pedido grabado en la homologación real).
// Dominio puro: sin base ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirComprobante,
  decidirDelEvento,
  type ComprobanteArca,
} from "./comprobante";
import type { InvoiceCreatedEvent } from "../core-contract";
import {
  AlicuotaIvaId,
  CondicionIva,
  CondicionIvaReceptorId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
  tipoFacturaCorrespondiente,
} from "./catalogos";
import { validarComprobante } from "./validacion";
import { armarFECAESolicitarRequest } from "../afip/soap";
import { construirPerfilFiscal, calcularImpuestos } from "@/lib/fiscal";

const TA = { token: "T", sign: "S", expiration: "2099-01-01T00:00:00Z" };
const CUIT_EMISOR = 20304050609;
const CUIT_RI = 30712345671;
const CUIT_MONO = 20111111112;
const CUIT_EXENTO = 30500010912;

type Receptor = InvoiceCreatedEvent["receptor"];
const RECEPTOR = {
  RI: { docTipo: TipoDocumento.CUIT, docNro: CUIT_RI, condicionIva: CondicionIva.ResponsableInscripto },
  MONO: { docTipo: TipoDocumento.CUIT, docNro: CUIT_MONO, condicionIva: CondicionIva.Monotributo },
  EXENTO: { docTipo: TipoDocumento.CUIT, docNro: CUIT_EXENTO, condicionIva: CondicionIva.Exento },
  CF: { docTipo: TipoDocumento.ConsumidorFinal, docNro: 0, condicionIva: CondicionIva.ConsumidorFinal },
  CF_DNI: { docTipo: TipoDocumento.DNI, docNro: 30111222, condicionIva: CondicionIva.ConsumidorFinal },
} satisfies Record<string, Receptor>;

/** Montos como los arma el Core (`calcularImpuestos`): RI discrimina 21 %, el resto va a 0 %. */
function evento(
  emisor: CondicionIva,
  receptor: Receptor,
  over: Partial<InvoiceCreatedEvent> = {},
): InvoiceCreatedEvent {
  const { neto, iva, total } = calcularImpuestos(emisor as never, 1210);
  return {
    invoiceId: "inv-1",
    tenantId: "t-1",
    concepto: Concepto.Productos,
    fecha: "20260925",
    emisor: { cuit: CUIT_EMISOR, condicionIva: emisor, puntoVenta: 3, regimenFacturaA: "A" },
    receptor,
    neto,
    iva,
    total,
    ...over,
  };
}

// ─── La tabla ────────────────────────────────────────────────────────────────

const TABLA: {
  caso: string;
  emisor: CondicionIva;
  receptor: Receptor;
  tipo: TipoComprobante;
  condicion: CondicionIvaReceptorId;
  leyendaRg5003: boolean;
}[] = [
  { caso: "monotributo → responsable inscripto", emisor: CondicionIva.Monotributo, receptor: RECEPTOR.RI, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.ResponsableInscripto, leyendaRg5003: false },
  { caso: "monotributo → monotributista", emisor: CondicionIva.Monotributo, receptor: RECEPTOR.MONO, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.ResponsableMonotributo, leyendaRg5003: false },
  { caso: "monotributo → exento", emisor: CondicionIva.Monotributo, receptor: RECEPTOR.EXENTO, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.SujetoExento, leyendaRg5003: false },
  { caso: "monotributo → consumidor final", emisor: CondicionIva.Monotributo, receptor: RECEPTOR.CF, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.ConsumidorFinal, leyendaRg5003: false },
  { caso: "exento → responsable inscripto", emisor: CondicionIva.Exento, receptor: RECEPTOR.RI, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.ResponsableInscripto, leyendaRg5003: false },
  { caso: "exento → consumidor final", emisor: CondicionIva.Exento, receptor: RECEPTOR.CF, tipo: TipoComprobante.FacturaC, condicion: CondicionIvaReceptorId.ConsumidorFinal, leyendaRg5003: false },
  { caso: "responsable inscripto → responsable inscripto", emisor: CondicionIva.ResponsableInscripto, receptor: RECEPTOR.RI, tipo: TipoComprobante.FacturaA, condicion: CondicionIvaReceptorId.ResponsableInscripto, leyendaRg5003: false },
  { caso: "responsable inscripto → monotributista (RG 5003/2021)", emisor: CondicionIva.ResponsableInscripto, receptor: RECEPTOR.MONO, tipo: TipoComprobante.FacturaA, condicion: CondicionIvaReceptorId.ResponsableMonotributo, leyendaRg5003: true },
  { caso: "responsable inscripto → exento", emisor: CondicionIva.ResponsableInscripto, receptor: RECEPTOR.EXENTO, tipo: TipoComprobante.FacturaB, condicion: CondicionIvaReceptorId.SujetoExento, leyendaRg5003: false },
  { caso: "responsable inscripto → consumidor final sin identificar", emisor: CondicionIva.ResponsableInscripto, receptor: RECEPTOR.CF, tipo: TipoComprobante.FacturaB, condicion: CondicionIvaReceptorId.ConsumidorFinal, leyendaRg5003: false },
  { caso: "responsable inscripto → consumidor final con DNI", emisor: CondicionIva.ResponsableInscripto, receptor: RECEPTOR.CF_DNI, tipo: TipoComprobante.FacturaB, condicion: CondicionIvaReceptorId.ConsumidorFinal, leyendaRg5003: false },
];

/** Secuencia de FECAEDetRequest en el WSDL de WSFEv1 (sólo los elementos que el sistema manda). */
const SECUENCIA_WSFEV1 = [
  "Concepto", "DocTipo", "DocNro", "CbteDesde", "CbteHasta", "CbteFch",
  "ImpTotal", "ImpTotConc", "ImpNeto", "ImpOpEx", "ImpTrib", "ImpIVA",
  "FchServDesde", "FchServHasta", "FchVtoPago", "MonId", "MonCotiz", "CanMisMonExt",
  "CondicionIVAReceptorId", "CbtesAsoc", "Tributos", "Iva", "Opcionales", "Compradores",
  "PeriodoAsoc", "Actividades",
];

/** Los hijos directos de FECAEDetRequest, en el orden en que aparecen en el XML. */
function hijosDelDetalle(xml: string): string[] {
  const det = /<ar:FECAEDetRequest>([\s\S]*)<\/ar:FECAEDetRequest>/.exec(xml)?.[1] ?? "";
  const hijos: string[] = [];
  let resto = det;
  while (resto.length > 0) {
    const m = /^<ar:([A-Za-z]+)>/.exec(resto);
    assert.ok(m, `XML mal formado cerca de: ${resto.slice(0, 40)}`);
    const nombre = m[1];
    const cierre = `</ar:${nombre}>`;
    const fin = resto.indexOf(cierre);
    hijos.push(nombre);
    resto = resto.slice(fin + cierre.length);
  }
  return hijos;
}

function enSecuencia(hijos: string[]): boolean {
  const pos = hijos.map((h) => SECUENCIA_WSFEV1.indexOf(h));
  return pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1]));
}

const tag = (xml: string, t: string) => new RegExp(`<ar:${t}>([^<]*)</ar:${t}>`).exec(xml)?.[1];

for (const c of TABLA) {
  test(`${c.caso}: ${TipoComprobante[c.tipo]} con CondicionIVAReceptorId ${c.condicion}, y el XML sigue la secuencia de WSFEv1`, () => {
    const ev = evento(c.emisor, c.receptor);
    const decision = decidirDelEvento(ev, "20260925");
    assert.equal(decision.estado, "lista", JSON.stringify(decision.motivos));

    const comp = construirComprobante(ev, "20260925");
    assert.equal(comp.tipo, c.tipo);
    assert.equal(comp.condicionIvaReceptorId, c.condicion);
    assert.equal(
      (comp.leyendas ?? []).some((l) => l.codigo === "RG5003_MONOTRIBUTISTA"),
      c.leyendaRg5003,
    );
    assert.deepEqual(validarComprobante(comp), { ok: true, errores: [] });

    const xml = armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 7);
    assert.equal(tag(xml, "CbteTipo"), String(c.tipo));
    assert.equal(tag(xml, "CondicionIVAReceptorId"), String(c.condicion));
    assert.equal(tag(xml, "DocTipo"), String(c.receptor.docTipo));
    const hijos = hijosDelDetalle(xml);
    assert.ok(enSecuencia(hijos), `fuera de la secuencia de WSFEv1: ${hijos.join(", ")}`);
    // A y B informan IVA (bloque <Iva>); C no.
    assert.equal(hijos.includes("Iva"), c.tipo !== TipoComprobante.FacturaC);
    // Concepto productos: sin fechas de servicio.
    assert.ok(!hijos.includes("FchServDesde"));
    // Una factura no lleva comprobante ni período asociado.
    assert.ok(!hijos.includes("CbtesAsoc") && !hijos.includes("PeriodoAsoc"));
  });
}

test("el mapeo del catálogo coincide con la decisión en toda la tabla (responsable inscripto a monotributista va con A)", () => {
  for (const c of TABLA) {
    assert.equal(tipoFacturaCorrespondiente(c.emisor, c.receptor.condicionIva), c.tipo, c.caso);
  }
});

test("los códigos que faltaban del catálogo de ARCA: CDI 87 y las condiciones 8, 9, 10 y 16", () => {
  assert.equal(TipoDocumento.CDI, 87);
  assert.equal(CondicionIvaReceptorId.ProveedorExterior, 8);
  assert.equal(CondicionIvaReceptorId.ClienteExterior, 9);
  assert.equal(CondicionIvaReceptorId.IvaLiberadoLey19640, 10);
  assert.equal(CondicionIvaReceptorId.MonotributistaPromovido, 16);
});

// ─── Lo que no es "lista" no se construye ───────────────────────────────────

test("responsable inscripto sin la clase A que le asignó ARCA: la A no se construye y dice por qué", () => {
  const ev = evento(CondicionIva.ResponsableInscripto, RECEPTOR.RI);
  ev.emisor = { ...ev.emisor, regimenFacturaA: undefined };
  assert.throws(
    () => construirComprobante(ev, "20260925"),
    (e: Error & { motivos?: { codigo: string }[] }) =>
      e.motivos?.some((m) => m.codigo === "REGIMEN_A_A_CONFIRMAR") === true,
  );
});

test("una fecha de comprobante fuera de la ventana de ARCA no se construye (se frena antes de pedir el CAE)", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF);
  assert.throws(
    () => construirComprobante(ev, "20261025"),
    (e: Error & { motivos?: { codigo: string }[] }) =>
      e.motivos?.some((m) => m.codigo === "FECHA_FUERA_DE_VENTANA") === true,
  );
});

test("un concepto que no es 1, 2 ni 3 no se construye: no se adivina qué se vendió", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, { concepto: 9 });
  assert.throws(() => construirComprobante(ev, "20260925"));
});

// ─── Servicios: las fechas vienen de la decisión ────────────────────────────

test("servicios: FchServDesde, FchServHasta y FchVtoPago son las del evento, tal como las resolvió la decisión", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, {
    concepto: Concepto.Servicios,
    servicioDesde: "20260901",
    servicioHasta: "20260920",
    vencimientoPago: "20260930",
  });
  const comp = construirComprobante(ev, "20260925");
  const xml = armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 1);
  assert.equal(tag(xml, "FchServDesde"), "20260901");
  assert.equal(tag(xml, "FchServHasta"), "20260920");
  assert.equal(tag(xml, "FchVtoPago"), "20260930");
  assert.ok(enSecuencia(hijosDelDetalle(xml)));
});

test("servicios sin fechas en el comprobante: el armado del XML no las inventa, se niega", () => {
  const comp: ComprobanteArca = {
    ...construirComprobante(evento(CondicionIva.Monotributo, RECEPTOR.CF), "20260925"),
    concepto: Concepto.Servicios,
  };
  assert.throws(() => armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 1), /fechas del servicio/);
  assert.equal(validarComprobante(comp).ok, false);
});

// ─── CondicionIVAReceptorId: sin valor por defecto ──────────────────────────

test("sin condición del receptor el armado no manda consumidor final por defecto: se niega", () => {
  const comp: ComprobanteArca = {
    ...construirComprobante(evento(CondicionIva.Monotributo, RECEPTOR.CF), "20260925"),
    condicionIvaReceptorId: undefined,
  };
  assert.throws(() => armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 1), /condición frente al IVA del receptor/);
  assert.equal(validarComprobante(comp).ok, false);
});

test("Factura A a consumidor final se frena en la validación con un mensaje en castellano (RG 5616)", () => {
  const comp: ComprobanteArca = {
    ...construirComprobante(evento(CondicionIva.ResponsableInscripto, RECEPTOR.RI), "20260925"),
    condicionIvaReceptorId: CondicionIvaReceptorId.ConsumidorFinal,
  };
  const v = validarComprobante(comp);
  assert.equal(v.ok, false);
  assert.ok(v.errores.some((e) => e.campo === "condicionIvaReceptorId" && /no admite/.test(e.mensaje)));
});

// ─── Exento y no gravado: del comprobante, no fijos en 0 ────────────────────

test("ImpOpEx e ImpTotConc viajan con lo que trae el comprobante, y el total los suma", () => {
  const ev = evento(CondicionIva.ResponsableInscripto, RECEPTOR.CF, {
    importeExento: 50,
    importeNoGravado: 25.5,
    total: 1210 + 50 + 25.5,
  });
  const comp = construirComprobante(ev, "20260925");
  assert.deepEqual(validarComprobante(comp), { ok: true, errores: [] });
  const xml = armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 1);
  assert.equal(tag(xml, "ImpOpEx"), "50.00");
  assert.equal(tag(xml, "ImpTotConc"), "25.50");
  assert.equal(tag(xml, "ImpTotal"), "1285.50");
});

test("Factura C con exento o no gravado se frena antes de ARCA (en C van en 0)", () => {
  const comp: ComprobanteArca = {
    ...construirComprobante(evento(CondicionIva.Monotributo, RECEPTOR.CF), "20260925"),
    importeExento: 10,
  };
  assert.equal(validarComprobante(comp).ok, false);
});

// ─── Notas de crédito: CbtesAsoc o PeriodoAsoc, nunca los dos ───────────────

const FACTURA_C_ORIGINAL = { cbteTipo: 11, puntoVenta: 3, numero: 41, fecha: "20260920" };

test("nota de crédito con la factura que corrige: CbtesAsoc con Tipo, PtoVta, Nro y CbteFch, sin PeriodoAsoc", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, {
    clase: "nota_credito",
    asociado: FACTURA_C_ORIGINAL,
  });
  const comp = construirComprobante(ev, "20260925");
  assert.equal(comp.tipo, TipoComprobante.NotaCreditoC);
  assert.deepEqual(validarComprobante(comp), { ok: true, errores: [] });
  const xml = armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 2);
  assert.match(
    xml,
    /<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>11<\/ar:Tipo><ar:PtoVta>3<\/ar:PtoVta><ar:Nro>41<\/ar:Nro><ar:CbteFch>20260920<\/ar:CbteFch><\/ar:CbteAsoc><\/ar:CbtesAsoc>/,
  );
  const hijos = hijosDelDetalle(xml);
  assert.ok(!hijos.includes("PeriodoAsoc"));
  assert.ok(enSecuencia(hijos), hijos.join(", "));
});

test("nota de crédito por período: PeriodoAsoc con FchDesde y FchHasta, sin CbtesAsoc", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, {
    clase: "nota_credito",
    periodoAsociado: { desde: "20260801", hasta: "20260831", letra: "C" },
  });
  const comp = construirComprobante(ev, "20260925");
  const xml = armarFECAESolicitarRequest(TA, CUIT_EMISOR, comp, 2);
  assert.match(xml, /<ar:PeriodoAsoc><ar:FchDesde>20260801<\/ar:FchDesde><ar:FchHasta>20260831<\/ar:FchHasta><\/ar:PeriodoAsoc>/);
  const hijos = hijosDelDetalle(xml);
  assert.ok(!hijos.includes("CbtesAsoc"));
  assert.ok(enSecuencia(hijos), hijos.join(", "));
});

test("nota de crédito con factura y período a la vez: no se construye, la validación la frena y el XML no se arma", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, {
    clase: "nota_credito",
    asociado: FACTURA_C_ORIGINAL,
    periodoAsociado: { desde: "20260801", hasta: "20260831", letra: "C" },
  });
  assert.throws(() => construirComprobante(ev, "20260925"));
  const nc = construirComprobante({ ...ev, periodoAsociado: undefined }, "20260925");
  const doble: ComprobanteArca = { ...nc, periodoAsociado: { desde: "20260801", hasta: "20260831" } };
  assert.equal(validarComprobante(doble).ok, false);
  assert.throws(() => armarFECAESolicitarRequest(TA, CUIT_EMISOR, doble, 2), /nunca los dos/);
});

test("nota de crédito sin factura ni período: no se construye", () => {
  const ev = evento(CondicionIva.Monotributo, RECEPTOR.CF, { clase: "nota_credito" });
  assert.throws(() => construirComprobante(ev, "20260925"));
});

// ─── CH sigue emitiendo lo mismo ────────────────────────────────────────────

test("CH (beauty-spa): con su perfil fiscal medido en el código sigue emitiendo Factura C a consumidor final, como hoy", () => {
  // fiscal.ts no lee `arcaCondicionIva` (la columna no existe): en homologación asume Monotributo
  // y en producción no emite sin la condición cargada. Es la condición con la que CH factura hoy.
  const perfil = construirPerfilFiscal("beauty-spa", {
    arcaCuit: String(CUIT_EMISOR),
    arcaPuntoVenta: 1,
    arcaHomologacion: true,
  });
  assert.equal(perfil.condicionIva, "MONOTRIBUTO");
  // Turno cobrado (invoice-from-appointment): concepto servicios, período = el día del turno.
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, 15000);
  const ev: InvoiceCreatedEvent = {
    invoiceId: "inv-ch",
    tenantId: "beauty-spa",
    concepto: Concepto.Servicios,
    fecha: "20260925",
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva as CondicionIva, puntoVenta: perfil.puntoVenta },
    receptor: RECEPTOR.CF,
    neto,
    iva,
    total,
    servicioDesde: "20260925",
    servicioHasta: "20260925",
    vencimientoPago: "20260925",
  };
  const antes = tipoFacturaCorrespondiente(CondicionIva.Monotributo, CondicionIva.ConsumidorFinal);
  const comp = construirComprobante(ev, "20260925");
  assert.equal(comp.tipo, antes);
  assert.equal(comp.tipo, TipoComprobante.FacturaC);
  assert.equal(comp.condicionIvaReceptorId, CondicionIvaReceptorId.ConsumidorFinal);
  const xml = armarFECAESolicitarRequest(TA, perfil.cuit, comp, 1);
  assert.equal(tag(xml, "ImpTotal"), "15000.00");
  assert.equal(tag(xml, "ImpNeto"), "15000.00");
  assert.equal(tag(xml, "ImpIVA"), "0.00");
  assert.equal(tag(xml, "FchServDesde"), "20260925");
  assert.ok(!hijosDelDetalle(xml).includes("Iva"));
});

test("la misma operación con AlicuotaIvaId del Core viaja con el id del catálogo", () => {
  const comp = construirComprobante(evento(CondicionIva.ResponsableInscripto, RECEPTOR.CF), "20260925");
  assert.equal(comp.iva[0].id, AlicuotaIvaId.VeintiUno);
});
