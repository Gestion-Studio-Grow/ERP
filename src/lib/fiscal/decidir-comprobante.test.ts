// Tests de la decisión fiscal pura (R0-F4). node:test.
// Cada test EJECUTA la decisión: letra, CondicionIVAReceptorId, concepto y fechas,
// identificación del consumidor final (RG 5700/2025), FCE MiPyME y notas asociadas.
//
// Fixtures (CUITs sintéticos con verificador correcto, laboratorio del contador E1 §4.1):
//   emisor RI         30-71000111-8   receptor RI        30-71555444-1
//   emisor MiPyME     30-70999888-5   gran empresa       30-68000123-1
//   monotributista    20-30405060-9   emisora monotrib.  27-33344455-6

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CBTE_TIPO,
  CBTE_TIPO_FCE,
  CBTE_TIPO_M,
  CONDICION_IVA_RECEPTOR_ID,
  DOC_TIPO,
  RECEPTORES_ADMITIDOS,
  decidirComprobante,
  type CondicionIvaReceptor,
  type Decision,
  type EmisorFiscal,
  type OperacionFiscal,
  type ReceptorFiscal,
} from "@/lib/fiscal/decidir-comprobante";
import type { TablaVigencias } from "@/lib/fiscal/vigencias";
import {
  CondicionIvaReceptorId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
} from "@/plugins/arca/domain/catalogos";

const RI: EmisorFiscal = { condicionIva: "RESPONSABLE_INSCRIPTO", cuit: "30-71000111-8", regimenFacturaA: "A" };
const MONO: EmisorFiscal = { condicionIva: "MONOTRIBUTO", cuit: "27-33344455-6" };
const EXENTO: EmisorFiscal = { condicionIva: "EXENTO" };
const MIPYME_RI: EmisorFiscal = { condicionIva: "RESPONSABLE_INSCRIPTO", cuit: "30709998885", esMiPyme: true, regimenFacturaA: "A" };

const RECEPTOR_RI: ReceptorFiscal = { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 80, docNro: "30-71555444-1" };
const RECEPTOR_MONO: ReceptorFiscal = { condicionIva: "MONOTRIBUTO", docTipo: 80, docNro: "20304050609" };
const CF: ReceptorFiscal = {};
const GRAN_EMPRESA: ReceptorFiscal = {
  condicionIva: "RESPONSABLE_INSCRIPTO",
  docTipo: 80,
  docNro: "30680001231",
  esGranEmpresa: true,
};

const HOY = "20260924";
/** Operación de productos. El día de envío es la fecha del comprobante salvo que se diga otro. */
const productos = (extra: Partial<OperacionFiscal> = {}): OperacionFiscal => ({
  fecha: HOY,
  importeTotal: 121_000,
  naturaleza: "productos",
  ...extra,
  fechaDeEnvio: extra.fechaDeEnvio ?? extra.fecha ?? HOY,
});
const servicios = (extra: Partial<OperacionFiscal> = {}): OperacionFiscal =>
  productos({ naturaleza: "servicios", ...extra });

const codigos = (d: Decision) => d.motivos.map((m) => m.codigo);
const motivo = (d: Decision, codigo: string) => d.motivos.find((m) => m.codigo === codigo);
const sinAvisos = (d: Decision) => d.motivos.filter((m) => m.gravedad !== "aviso");

// ─── Criterio 1: RI + RI → A con CondicionIVAReceptorId correcto ─────────────────

test("RI a RI → Factura A (1), CondicionIVAReceptorId 1, CUIT 80, IVA discriminado, lista", () => {
  const d = decidirComprobante(RI, RECEPTOR_RI, productos());
  assert.equal(d.estado, "lista", JSON.stringify(d.motivos));
  const c = d.comprobante!;
  assert.equal(c.letra, "A");
  assert.equal(c.cbteTipo, 1);
  assert.equal(c.condicionIvaReceptorId, 1);
  assert.equal(c.docTipo, 80);
  assert.equal(c.docNro, 30715554441);
  assert.equal(c.discriminaIva, true);
  assert.equal(c.admiteIva, true);
  assert.equal(c.concepto, 1);
  assert.equal(c.cbteFch, HOY);
  assert.equal(c.fchServDesde, undefined, "productos no llevan fechas de servicio");
  assert.equal(c.consumidorFinalSobreUmbral, false);
  assert.deepEqual(c.leyendas, []);
  assert.equal(d.fce, null);
});

test("RI a monotributista → A (RG 5003/2021), CondicionIVAReceptorId 6 y su leyenda", () => {
  const d = decidirComprobante(RI, RECEPTOR_MONO, productos());
  assert.equal(d.estado, "lista");
  assert.equal(d.comprobante!.letra, "A");
  assert.equal(d.comprobante!.cbteTipo, 1);
  assert.equal(d.comprobante!.condicionIvaReceptorId, 6);
  const leyenda = d.comprobante!.leyendas.find((l) => l.codigo === "RG5003_MONOTRIBUTISTA");
  assert.ok(leyenda, "la Factura A a un monotributista lleva la leyenda de la Ley 27.618");
  assert.match(leyenda!.texto!, /Ley Nº 27\.618/);

  for (const [cond, id] of [["MONOTRIBUTO_SOCIAL", 13], ["MONOTRIBUTO_PROMOVIDO", 16]] as const) {
    const x = decidirComprobante(RI, { ...RECEPTOR_MONO, condicionIva: cond }, productos());
    assert.equal(x.comprobante!.letra, "A", cond);
    assert.equal(x.comprobante!.condicionIvaReceptorId, id, cond);
  }
});

// ─── Régimen de la Factura A que asignó ARCA (RG 1575) ──────────────────────────

test("régimen de la A sin cargar → revisión con la A propuesta (si se confirma A común, es la correcta)", () => {
  const d = decidirComprobante({ ...RI, regimenFacturaA: null }, RECEPTOR_RI, productos());
  assert.equal(d.estado, "revision");
  assert.deepEqual(codigos(d), ["REGIMEN_A_A_CONFIRMAR"]);
  assert.equal(d.comprobante!.cbteTipo, 1);
  // A un consumidor final le corresponde B con cualquier régimen: no pregunta.
  assert.equal(decidirComprobante({ ...RI, regimenFacturaA: null }, CF, productos()).estado, "lista");
});

test("Factura M asignada por ARCA: lo que sería A va a revisión SIN propuesta; la B no cambia", () => {
  const d = decidirComprobante({ ...RI, regimenFacturaA: "M" }, RECEPTOR_RI, productos());
  assert.equal(d.estado, "revision");
  assert.equal(d.comprobante, null, "no se propone una A a quien tiene que emitir M");
  assert.deepEqual(motivo(d, "FACTURA_M")!.fueraDelSistema, { cbteTipo: CBTE_TIPO_M.factura });

  const b = decidirComprobante({ ...RI, regimenFacturaA: "M" }, CF, productos());
  assert.equal(b.estado, "lista");
  assert.equal(b.comprobante!.letra, "B");

  // Con M no hay "FCE A" que sugerir: la alerta sale, sin tipo.
  const mFce = decidirComprobante({ ...MIPYME_RI, regimenFacturaA: "M" }, GRAN_EMPRESA, productos({ importeTotal: 6_000_000 }));
  assert.equal(mFce.comprobante, null);
  assert.deepEqual(mFce.fce, { tipoSugerido: null, obligatoria: true });
});

test("Factura A con leyenda asignada por ARCA → revisión sin propuesta, derivada a ARCA", () => {
  const d = decidirComprobante({ ...RI, regimenFacturaA: "A_CON_LEYENDA" }, RECEPTOR_MONO, productos());
  assert.equal(d.estado, "revision");
  assert.equal(d.comprobante, null, "una A sin la leyenda que exige ARCA sería el comprobante equivocado");
  assert.deepEqual(motivo(d, "FACTURA_A_CON_LEYENDA")!.fueraDelSistema, { cbteTipo: null });
});

test("régimen desconocido → bloqueada; las notas de una A no miran el régimen de hoy", () => {
  const raro = decidirComprobante({ ...RI, regimenFacturaA: "Z" }, RECEPTOR_RI, productos());
  assert.equal(raro.estado, "bloqueada");
  assert.ok(codigos(raro).includes("EMISOR_REGIMEN_DESCONOCIDO"));
  // Hoy le asignaron M, pero la factura que se anula fue A: la nota sale A.
  const nc = decidirComprobante({ ...RI, regimenFacturaA: "M" }, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: FACTURA_A }));
  assert.equal(nc.estado, "lista", JSON.stringify(nc.motivos));
  assert.equal(nc.comprobante!.cbteTipo, 3);
});

// ─── Criterio 2: RI → consumidor final → B ──────────────────────────────────────

test("RI a consumidor final sin identificar → Factura B (6), id 5, DocTipo 99 y DocNro 0", () => {
  const d = decidirComprobante(RI, CF, productos());
  assert.equal(d.estado, "lista", JSON.stringify(d.motivos));
  const c = d.comprobante!;
  assert.equal(c.letra, "B");
  assert.equal(c.cbteTipo, 6);
  assert.equal(c.condicionIvaReceptorId, 5);
  assert.equal(c.docTipo, 99);
  assert.equal(c.docNro, 0);
  assert.equal(c.discriminaIva, false, "la B no muestra IVA discriminado");
  assert.equal(c.admiteIva, true, "pero WSFEv1 lo informa si hay importe gravado");
  assert.ok(c.leyendas.some((l) => l.codigo === "LEY27743_TRANSPARENCIA_FISCAL"));
});

test("RI a consumidor final identificado con DNI, CUIL o CDI → B con ese documento", () => {
  const dni = decidirComprobante(RI, { docTipo: 96, docNro: "30.405.060" }, productos());
  assert.equal(dni.estado, "lista");
  assert.equal(dni.comprobante!.letra, "B");
  assert.equal(dni.comprobante!.docTipo, 96);
  assert.equal(dni.comprobante!.docNro, 30405060);
  assert.equal(dni.comprobante!.condicionIvaReceptorId, 5);

  const cuil = decidirComprobante(RI, { docTipo: 86, docNro: "20-30405060-9" }, productos());
  assert.equal(cuil.comprobante!.docTipo, 86);
  assert.equal(cuil.comprobante!.letra, "B");

  // RG 5700/2025 lista la CDI como identificación válida del consumidor final.
  const cdi = decidirComprobante(RI, { docTipo: 87, docNro: "20-30405060-9" }, productos());
  assert.equal(cdi.estado, "lista", JSON.stringify(cdi.motivos));
  assert.equal(cdi.comprobante!.docTipo, 87);
  assert.equal(cdi.comprobante!.docNro, 20304050609);
  const cdiMala = decidirComprobante(RI, { docTipo: 87, docNro: "20-30405060-1" }, productos());
  assert.equal(cdiMala.estado, "bloqueada");
  assert.match(motivo(cdiMala, "RECEPTOR_CUIT_INVALIDO")!.mensaje, /CDI/);
  // Un inscripto con CDI: para la A hace falta el CUIT.
  const riConCdi = decidirComprobante(RI, { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 87, docNro: "20304050609" }, productos());
  assert.ok(codigos(riConCdi).includes("RECEPTOR_SIN_CUIT"));
});

test("RI a exento, no categorizado o no alcanzado → B con su id", () => {
  const casos: [CondicionIvaReceptor, number][] = [
    ["EXENTO", 4],
    ["NO_CATEGORIZADO", 7],
    ["IVA_NO_ALCANZADO", 15],
  ];
  for (const [cond, id] of casos) {
    const d = decidirComprobante(RI, { condicionIva: cond, docTipo: 80, docNro: "30715554441" }, productos());
    assert.equal(d.estado, "lista", `${cond}: ${JSON.stringify(d.motivos)}`);
    assert.equal(d.comprobante!.letra, "B", cond);
    assert.equal(d.comprobante!.cbteTipo, 6, cond);
    assert.equal(d.comprobante!.condicionIvaReceptorId, id, cond);
  }
});

test("liberado por la Ley 19.640: B id 10 a revisión (si lleva IVA depende de dónde se entrega)", () => {
  const receptor: ReceptorFiscal = { condicionIva: "IVA_LIBERADO_LEY_19640", docTipo: 80, docNro: "30715554441" };
  const d = decidirComprobante(RI, receptor, productos());
  assert.equal(d.estado, "revision");
  assert.deepEqual(codigos(d), ["LIBERADO_LEY_19640"]);
  assert.equal(d.comprobante!.letra, "B");
  assert.equal(d.comprobante!.condicionIvaReceptorId, 10);
  // Un monotributista no cobra IVA: la C sale sin preguntar.
  assert.equal(decidirComprobante(MONO, receptor, productos()).estado, "lista");
});

// ─── Criterio 3: monotributista → siempre C ─────────────────────────────────────

test("emisor monotributista → siempre C, sea quien sea el comprador", () => {
  const receptores: ReceptorFiscal[] = [
    RECEPTOR_RI,
    RECEPTOR_MONO,
    CF,
    { docTipo: 96, docNro: "30405060" },
    { condicionIva: "EXENTO", docTipo: 80, docNro: "30715554441" },
    { condicionIva: "IVA_NO_ALCANZADO", docTipo: 80, docNro: "30715554441" },
  ];
  for (const r of receptores) {
    const d = decidirComprobante(MONO, r, productos());
    assert.equal(d.comprobante?.letra, "C", JSON.stringify(r));
    assert.equal(d.comprobante?.cbteTipo, 11, JSON.stringify(r));
    assert.equal(d.comprobante?.discriminaIva, false);
    assert.equal(d.comprobante?.admiteIva, false, "la C no informa IVA");
  }
  // El id del receptor en la C es el del comprador real (RG 5616), no siempre 5.
  assert.equal(decidirComprobante(MONO, RECEPTOR_RI, productos()).comprobante!.condicionIvaReceptorId, 1);
  assert.equal(decidirComprobante(MONO, CF, productos()).comprobante!.condicionIvaReceptorId, 5);
  // Exento también emite C, y el régimen de la A no le importa.
  assert.equal(decidirComprobante({ ...EXENTO, regimenFacturaA: "M" }, RECEPTOR_RI, productos()).comprobante!.letra, "C");
});

test("recorrido completo: todo comprador del país con CUIT y condición lleva comprobante, y respeta la tabla de ARCA", () => {
  const emisores = ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"];
  const condiciones = Object.keys(CONDICION_IVA_RECEPTOR_ID) as CondicionIvaReceptor[];
  let armados = 0;
  for (const e of emisores) {
    for (const cond of condiciones) {
      for (const docNro of ["30715554441", "20304050609"]) {
        const d = decidirComprobante({ condicionIva: e, regimenFacturaA: "A" }, { condicionIva: cond, docTipo: 80, docNro }, productos());
        const donde = `${e}→${cond} (${docNro}): ${JSON.stringify(d.motivos)}`;
        assert.equal(codigos(d).includes("CONDICION_INCOMPATIBLE_CON_LETRA"), false, donde);
        if (cond === "CLIENTE_EXTERIOR" || cond === "PROVEEDOR_EXTERIOR") {
          assert.equal(d.comprobante, null, donde);
          assert.ok(codigos(d).includes("RECEPTOR_DEL_EXTERIOR"), donde);
          continue;
        }
        // Sin saltear nada: si una combinación deja de armarse, el test lo dice.
        assert.ok(d.comprobante, donde);
        armados++;
        const c = d.comprobante!;
        assert.ok(RECEPTORES_ADMITIDOS[c.letra].has(c.condicionIvaReceptorId), donde);
        assert.equal(c.condicionIvaReceptorId, CONDICION_IVA_RECEPTOR_ID[cond], donde);
        if (e !== "RESPONSABLE_INSCRIPTO") assert.equal(c.letra, "C", donde);
        else assert.notEqual(c.letra, "C", donde);
      }
    }
  }
  assert.equal(armados, 3 * 9 * 2, "3 emisores × 9 condiciones del país × 2 CUIT");
});

test("invariante: sin propuesta si algo bloquea, si corresponde otro comprobante o si falta un dato de adentro", () => {
  // Recorre emisor × régimen × MiPyME × receptor × gran empresa × importe × operación × opciones.
  const emisores: EmisorFiscal[] = [];
  for (const condicionIva of ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"]) {
    for (const regimenFacturaA of ["A", "A_CON_LEYENDA", "M", null]) {
      for (const esMiPyme of [true, false, null]) emisores.push({ condicionIva, regimenFacturaA, esMiPyme });
    }
  }
  const receptores: ReceptorFiscal[] = [
    CF,
    { docTipo: 96, docNro: "30405060" },
    { docTipo: 96, docNro: "912345" }, // DNI de 6 números: revisión con propuesta
    { docTipo: 96, docNro: "00000000" }, // DNI en ceros: bloquea
    { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 80, docNro: "30715554442" }, // verificador mal: bloquea
    { docTipo: 80, docNro: "30680001231" }, // CUIT sin condición: pide el dato
  ];
  for (const cond of Object.keys(CONDICION_IVA_RECEPTOR_ID)) {
    for (const esGranEmpresa of [true, false, null]) {
      receptores.push({ condicionIva: cond, docTipo: 80, docNro: "30680001231", esGranEmpresa });
    }
  }
  const operaciones = (importeTotal: number): OperacionFiscal[] => [
    productos({ importeTotal }),
    productos({ importeTotal, clase: "nota_credito", asociado: { ...FACTURA_A, importeTotal: null } }),
    servicios({ importeTotal }),
    productos({ importeTotal, fecha: "20260910", fechaDeEnvio: HOY }), // fuera de la ventana: bloquea
  ];
  const variantes = [{}, { exigirPeriodoDeServicio: true, umbralIdentificacionDelNegocio: 600_000 }];
  const cuenta = { total: 0, bloqueada: 0, fueraDelSistema: 0, pideDato: 0, fceObligatoria: 0, revisionConPropuesta: 0, lista: 0 };
  for (const e of emisores) {
    for (const r of receptores) {
      for (const importeTotal of [1_000, 700_000, 6_000_000, 12_000_000]) {
        for (const op of operaciones(importeTotal)) {
          for (const opciones of variantes) {
            const d = decidirComprobante(e, r, op, opciones);
            cuenta.total++;
            const donde = `${JSON.stringify(e)} ${JSON.stringify(r)} ${JSON.stringify(op)} ${JSON.stringify(opciones)}`;
            if (d.motivos.some((m) => m.fueraDelSistema)) {
              cuenta.fueraDelSistema++;
              assert.equal(d.comprobante, null, donde);
              assert.notEqual(d.estado, "lista", donde);
            }
            if (d.motivos.some((m) => m.pideDato)) {
              cuenta.pideDato++;
              assert.equal(d.comprobante, null, `falta un dato de adentro y hay propuesta: ${donde}`);
              assert.notEqual(d.estado, "lista", donde);
            }
            if (codigos(d).includes("FCE_OBLIGATORIA")) {
              cuenta.fceObligatoria++;
              assert.equal(d.comprobante, null, `FCE obligatoria con factura común propuesta: ${donde}`);
              assert.equal(d.fce?.obligatoria, true, donde);
            }
            if (d.estado === "bloqueada") {
              cuenta.bloqueada++;
              assert.equal(d.comprobante, null, donde);
            }
            if (d.estado === "lista") {
              cuenta.lista++;
              assert.ok(d.comprobante, `'lista' sin comprobante: ${donde}`);
              assert.deepEqual(sinAvisos(d), [], donde);
            }
            if (d.estado === "revision" && d.comprobante) cuenta.revisionConPropuesta++;
            const c = d.comprobante;
            if (c) {
              assert.ok(RECEPTORES_ADMITIDOS[c.letra].has(c.condicionIvaReceptorId), donde);
              // Identificado = número real: nunca "DNI 0" ni "CUIT 0".
              if (c.docTipo === DOC_TIPO.SIN_IDENTIFICAR) assert.equal(c.docNro, 0, donde);
              else assert.ok(c.docNro > 0, `documento ${c.docTipo} con número ${c.docNro}: ${donde}`);
              // Desde el umbral de la RG 5700 el consumidor final va identificado.
              if (c.consumidorFinalSobreUmbral) assert.notEqual(c.docTipo, DOC_TIPO.SIN_IDENTIFICAR, donde);
            }
          }
        }
      }
    }
  }
  // Que el recorrido pase de verdad por cada rama (si no, el invariante no prueba nada).
  assert.equal(cuenta.total, 36 * 39 * 4 * 4 * 2, JSON.stringify(cuenta));
  for (const [rama, n] of Object.entries(cuenta)) assert.ok(n > 100, `${rama}: ${n} (${JSON.stringify(cuenta)})`);
});

// ─── Criterio 4: servicios → concepto 2 con fechas ──────────────────────────────

test("servicios → concepto 2 con FchServDesde, FchServHasta y FchVtoPago", () => {
  const d = decidirComprobante(
    RI,
    RECEPTOR_RI,
    {
      fecha: "2026-09-24",
      fechaDeEnvio: "2026-09-24",
      importeTotal: 50_000,
      naturaleza: "servicios",
      servicio: { desde: "2026-09-01", hasta: "2026-09-30", vencimientoPago: "2026-10-10" },
    },
  );
  assert.equal(d.estado, "lista", JSON.stringify(d.motivos));
  const c = d.comprobante!;
  assert.equal(c.concepto, 2);
  assert.equal(c.fchServDesde, "20260901");
  assert.equal(c.fchServHasta, "20260930");
  assert.equal(c.fchVtoPago, "20261010");
});

test("servicios sin período: toma la fecha de la factura y lo avisa (no lo esconde)", () => {
  const d = decidirComprobante(MONO, CF, servicios({ importeTotal: 30_000 }));
  assert.equal(d.estado, "lista");
  assert.equal(d.comprobante!.fchServDesde, HOY);
  assert.equal(d.comprobante!.fchServHasta, HOY);
  assert.equal(d.comprobante!.fchVtoPago, HOY);
  assert.deepEqual(codigos(d), ["FECHAS_SERVICIO_POR_DEFECTO"]);
  assert.equal(d.motivos[0].gravedad, "aviso");
});

test("servicios con sólo una punta del período: completa la otra y lo dice", () => {
  const soloHasta = decidirComprobante(MONO, CF, servicios({ servicio: { hasta: "20260920", vencimientoPago: HOY } }));
  assert.equal(soloHasta.comprobante!.fchServDesde, "20260920");
  assert.match(motivo(soloHasta, "FECHAS_SERVICIO_POR_DEFECTO")!.mensaje, /inicio del servicio igual al fin \(20\/09\/2026\)/);
  const soloDesde = decidirComprobante(MONO, CF, servicios({ servicio: { desde: "20260920", vencimientoPago: HOY } }));
  assert.equal(soloDesde.comprobante!.fchServHasta, "20260920");
  assert.match(motivo(soloDesde, "FECHAS_SERVICIO_POR_DEFECTO")!.mensaje, /fin del servicio igual al inicio/);
  const soloVto = decidirComprobante(MONO, CF, servicios({ servicio: { desde: "20260901", hasta: "20260930" } }));
  assert.match(motivo(soloVto, "FECHAS_SERVICIO_POR_DEFECTO")!.mensaje, /vencimiento del pago/);
});

test("emisión automática (exigirPeriodoDeServicio): sin período real va a revisión, no se inventa", () => {
  const opciones = { exigirPeriodoDeServicio: true };
  const sinPeriodo = decidirComprobante(MONO, CF, servicios(), opciones);
  assert.equal(sinPeriodo.estado, "revision");
  assert.deepEqual(codigos(sinPeriodo), ["FALTA_PERIODO_SERVICIO"]);
  assert.equal(sinPeriodo.comprobante, null, "un período inventado no se propone");
  const soloHasta = decidirComprobante(MONO, CF, servicios({ servicio: { hasta: "20260920" } }), opciones);
  assert.equal(soloHasta.estado, "revision");
  const conPeriodo = decidirComprobante(MONO, CF, servicios({ servicio: { desde: "20260920", hasta: "20260920" } }), opciones);
  assert.equal(conPeriodo.estado, "lista", "el vencimiento por defecto (contado) no molesta");
});

test("productos y servicios → concepto 3 con fechas", () => {
  const d = decidirComprobante(RI, CF, productos({
    importeTotal: 10_000,
    naturaleza: "productos_y_servicios",
    servicio: { desde: HOY, hasta: HOY, vencimientoPago: HOY },
  }));
  assert.equal(d.comprobante!.concepto, 3);
  assert.equal(d.comprobante!.fchVtoPago, HOY);
  assert.equal(d.estado, "lista");
});

test("bloqueada nunca trae propuesta armada (ni aunque la letra se sepa)", () => {
  const casos = [
    decidirComprobante(RI, RECEPTOR_RI, productos({ fecha: "20260910", fechaDeEnvio: HOY })),
    decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 999_999, asociado: FACTURA_A })),
    decidirComprobante(RI, RECEPTOR_RI, productos({ importeTotal: 0 })),
  ];
  for (const d of casos) {
    assert.equal(d.estado, "bloqueada", JSON.stringify(d.motivos));
    assert.equal(d.comprobante, null);
  }
});

test("fechas del servicio imposibles → bloqueada con motivo", () => {
  const alReves = decidirComprobante(RI, CF, servicios({
    importeTotal: 1_000,
    servicio: { desde: "20260930", hasta: "20260901", vencimientoPago: HOY },
  }));
  assert.equal(alReves.estado, "bloqueada");
  assert.match(motivo(alReves, "FECHAS_SERVICIO_INVALIDAS")!.mensaje, /terminar antes de empezar/);

  const vtoViejo = decidirComprobante(RI, CF, servicios({
    importeTotal: 1_000,
    servicio: { desde: "20260901", hasta: "20260930", vencimientoPago: "20260920" },
  }));
  assert.equal(vtoViejo.estado, "bloqueada");
  assert.match(vtoViejo.motivos[0].mensaje, /vencimiento del pago/);

  const noExiste = decidirComprobante(RI, CF, servicios({
    importeTotal: 1_000,
    servicio: { desde: "20260231", hasta: "20260930", vencimientoPago: HOY },
  }));
  assert.equal(noExiste.estado, "bloqueada");
});

test("concepto: usa el habitual del negocio con aviso; sin ninguno, va a revisión", () => {
  const conDefault = decidirComprobante({ ...MONO, conceptoDefault: 2 }, CF, productos({ importeTotal: 5_000, naturaleza: null }));
  assert.equal(conDefault.comprobante!.concepto, 2);
  assert.ok(codigos(conDefault).includes("CONCEPTO_POR_DEFECTO"));
  assert.equal(conDefault.estado, "lista");

  const sinNada = decidirComprobante(MONO, CF, productos({ importeTotal: 5_000, naturaleza: null }));
  assert.equal(sinNada.estado, "revision");
  assert.equal(sinNada.comprobante, null);
  assert.deepEqual(codigos(sinNada), ["FALTA_CONCEPTO"]);
  assert.equal(sinNada.motivos[0].pideDato, true);

  const raro = decidirComprobante(MONO, CF, productos({ importeTotal: 5_000, naturaleza: "constructor" as never }));
  assert.equal(raro.comprobante, null, "una clave del prototipo no se cuela como concepto");
});

// ─── Ventana de fechas de ARCA (CbteFch contra el día del envío) ───────────────

test("ventana de ARCA: ±5 días para productos, ±10 para servicios y para productos y servicios", () => {
  const p5 = decidirComprobante(RI, CF, productos({ fecha: "20260919", fechaDeEnvio: HOY }));
  assert.equal(p5.estado, "lista");
  const p6 = decidirComprobante(RI, CF, productos({ fecha: "20260918", fechaDeEnvio: HOY }));
  assert.equal(p6.estado, "bloqueada");
  assert.ok(codigos(p6).includes("FECHA_FUERA_DE_VENTANA"));

  const s10 = decidirComprobante(RI, CF, servicios({ fecha: "20261004", importeTotal: 1, fechaDeEnvio: HOY }));
  assert.equal(sinAvisos(s10).length, 0);
  const s11 = decidirComprobante(RI, CF, servicios({ fecha: "20260913", importeTotal: 1, fechaDeEnvio: HOY }));
  assert.equal(s11.estado, "bloqueada");
  assert.match(motivo(s11, "FECHA_FUERA_DE_VENTANA")!.mensaje, /10 días/);

  const mixto = (fecha: string) =>
    decidirComprobante(RI, CF, productos({ fecha, fechaDeEnvio: HOY, naturaleza: "productos_y_servicios", servicio: { desde: fecha, hasta: fecha } }));
  assert.equal(sinAvisos(mixto("20260914")).length, 0, "concepto 3: 10 días antes sirve");
  assert.equal(mixto("20260913").estado, "bloqueada", "concepto 3: 11 días no");
});

test("ventana de ARCA: para productos, la fecha no puede pasar al mes siguiente al del envío", () => {
  const mesSiguiente = decidirComprobante(RI, CF, productos({ fecha: "20261002", fechaDeEnvio: "20260930" }));
  assert.equal(mesSiguiente.estado, "bloqueada");
  assert.match(motivo(mesSiguiente, "FECHA_FUERA_DE_VENTANA")!.mensaje, /mes siguiente/);
  assert.equal(decidirComprobante(RI, CF, productos({ fecha: "20260928", fechaDeEnvio: "20261002" })).estado, "lista", "hacia atrás, dentro de los 5 días, sí");
  assert.equal(
    sinAvisos(decidirComprobante(RI, CF, servicios({ fecha: "20261002", fechaDeEnvio: "20260930" }))).length,
    0,
    "la regla del mes es sólo de productos",
  );
});

test("sin día de envío (o uno que no existe) no sale nunca 'lista'", () => {
  const sinEnvio = decidirComprobante(RI, CF, { fecha: HOY, importeTotal: 1_000, naturaleza: "productos" } as unknown as OperacionFiscal);
  assert.equal(sinEnvio.estado, "bloqueada");
  assert.equal(sinEnvio.comprobante, null);
  assert.equal(motivo(sinEnvio, "FECHA_INVALIDA")!.campo, "fechaDeEnvio");
  assert.match(motivo(sinEnvio, "FECHA_INVALIDA")!.mensaje, /Falta el día de envío/);

  const envioRaro = decidirComprobante(RI, CF, productos({ fechaDeEnvio: "20260231" }));
  assert.equal(envioRaro.estado, "bloqueada");
  assert.equal(motivo(envioRaro, "FECHA_INVALIDA")!.gravedad, "bloquea");

  const lejana = decidirComprobante(RI, CF, productos({ fecha: "20991231", fechaDeEnvio: HOY }));
  assert.equal(lejana.estado, "bloqueada", "una fecha de 2099 no sale lista");
});

test("sin concepto igual se controla la ventana más amplia", () => {
  const siete = decidirComprobante(MONO, CF, productos({ fecha: "20260917", fechaDeEnvio: HOY, naturaleza: null }));
  assert.deepEqual(codigos(siete), ["FALTA_CONCEPTO"]);
  const once = decidirComprobante(MONO, CF, productos({ fecha: "20260913", fechaDeEnvio: HOY, naturaleza: null }));
  assert.equal(once.estado, "bloqueada");
});

// ─── Identificación del consumidor final (RG 5700/2025) ─────────────────────────

test("consumidor final sin identificar desde $10.000.000 → revisión con la norma (igual o superior)", () => {
  const justo = decidirComprobante(RI, CF, productos({ fecha: "20250601", importeTotal: 10_000_000 }));
  assert.equal(justo.estado, "revision");
  const m = motivo(justo, "IDENTIFICACION_OBLIGATORIA")!;
  assert.equal(m.norma, "RG ARCA 5700/2025");
  assert.match(m.mensaje, /CUIT, CUIL, CDI o DNI/);
  assert.equal(justo.vigencias.umbralIdentificacion?.valor, 10_000_000);
  assert.equal(m.pideDato, true);
  assert.equal(justo.comprobante, null, "una B con DocNro 0 desde el umbral no la arregla ninguna respuesta: se identifica y se vuelve a decidir");

  const abajo = decidirComprobante(RI, CF, productos({ fecha: "20250601", importeTotal: 9_999_999.99 }));
  assert.equal(abajo.estado, "lista");
  assert.equal(abajo.comprobante!.consumidorFinalSobreUmbral, false);
});

test("consumidor final identificado desde el umbral: alcanza el documento, y el impreso se entera", () => {
  const d = decidirComprobante(RI, { docTipo: 96, docNro: "30405060" }, productos({ importeTotal: 25_000_000 }));
  assert.equal(d.estado, "lista", "RG 5700: CUIT, CUIL, CDI o DNI; apellido, nombre y domicilio pueden ir con NR");
  assert.equal(d.comprobante!.consumidorFinalSobreUmbral, true);
  assert.equal(d.vigencias.umbralIdentificacion?.norma, "RG ARCA 5700/2025");
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "30405060" }, productos()).comprobante!.consumidorFinalSobreUmbral, false);
  assert.equal(decidirComprobante(RI, RECEPTOR_RI, productos({ importeTotal: 25_000_000 })).comprobante!.consumidorFinalSobreUmbral, false, "sólo consumidor final");
});

test("antes de la vigencia cargada no se asume ningún umbral: revisión", () => {
  const d = decidirComprobante(MONO, CF, productos({ fecha: "20250528", importeTotal: 1_000 }));
  assert.equal(d.estado, "revision");
  assert.deepEqual(codigos(d), ["SIN_UMBRAL_VIGENTE"]);
  assert.equal(d.comprobante, null, "pide identificar: sin el documento no hay propuesta");
});

test("regla propia del negocio más estricta ($600.000) → revisión, sin confundirla con la ley", () => {
  const d = decidirComprobante(MONO, CF, productos({ importeTotal: 600_000 }), { umbralIdentificacionDelNegocio: 600_000 });
  assert.equal(d.estado, "revision");
  assert.deepEqual(codigos(d), ["IDENTIFICACION_REGLA_DEL_NEGOCIO"]);
  assert.equal(d.motivos[0].norma, undefined, "no es una norma: es una regla del negocio");
  assert.equal(d.comprobante, null, "pide el documento: sin él no hay propuesta");

  const abajo = decidirComprobante(MONO, CF, productos({ importeTotal: 599_999 }), { umbralIdentificacionDelNegocio: 600_000 });
  assert.equal(abajo.estado, "lista");
});

// ─── Criterio 5: FCE MiPyME ─────────────────────────────────────────────────────

test("MiPyME a gran empresa desde el mínimo FCE vigente → revisión SIN factura común, con el tipo FCE", () => {
  const d = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ importeTotal: 5_549_862 }));
  assert.equal(d.estado, "revision");
  const m = motivo(d, "FCE_OBLIGATORIA")!;
  assert.ok(m, JSON.stringify(d.motivos));
  assert.match(m.mensaje, /Factura de Crédito Electrónica A/);
  assert.match(m.mensaje, /No emitas una factura común/);
  assert.match(m.norma!, /Ley 27\.440/);
  assert.match(m.norma!, /Resolución 1\/2026/);
  assert.deepEqual(m.fueraDelSistema, { cbteTipo: 201 });
  assert.equal(d.comprobante, null, "la ley obliga a FCE: una Factura A común sería el comprobante equivocado");
  assert.deepEqual(d.fce, { tipoSugerido: 201, obligatoria: true });
  assert.equal(d.vigencias.minimoFce?.valor, 5_549_862);

  const abajo = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ importeTotal: 5_549_861.99 }));
  assert.equal(abajo.estado, "lista");
  assert.equal(abajo.comprobante!.cbteTipo, 1);
  assert.equal(abajo.fce, null);
});

test("FCE: el mínimo es el vigente A LA FECHA del comprobante", () => {
  const op = (fecha: string) => productos({ fecha, importeTotal: 4_000_000 });
  // $4.000.000 supera el mínimo de 2025 ($3.958.316) pero no el de 2026 ($5.549.862).
  assert.equal(decidirComprobante(MIPYME_RI, GRAN_EMPRESA, op("20260413")).estado, "revision");
  assert.equal(decidirComprobante(MIPYME_RI, GRAN_EMPRESA, op("20260413")).comprobante, null);
  assert.equal(decidirComprobante(MIPYME_RI, GRAN_EMPRESA, op("20260414")).estado, "lista");
  const sinMinimo = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, op("20250410"));
  assert.equal(sinMinimo.estado, "revision", "sin mínimo cargado: revisión");
  assert.deepEqual(codigos(sinMinimo), ["FCE_SIN_MINIMO_VIGENTE"]);
  assert.deepEqual(sinMinimo.fce, { tipoSugerido: 201, obligatoria: null });
});

test("FCE: lo que no se sabe se confirma (con la común propuesta); lo que se sabe que no, no molesta", () => {
  const monto = productos({ importeTotal: 8_000_000 });
  const riSinDato: EmisorFiscal = { ...RI, esMiPyme: null };
  const empresaSinDato: ReceptorFiscal = { ...GRAN_EMPRESA, esGranEmpresa: null };

  const aConfirmar = decidirComprobante(riSinDato, empresaSinDato, monto);
  assert.equal(aConfirmar.estado, "revision");
  const m = motivo(aConfirmar, "FCE_A_CONFIRMAR")!;
  assert.match(m.mensaje, /certificado MiPyME/);
  assert.match(m.mensaje, /gran empresa/);
  assert.equal(m.fueraDelSistema, undefined);
  assert.deepEqual(aConfirmar.fce, { tipoSugerido: 201, obligatoria: null });
  assert.equal(aConfirmar.comprobante!.cbteTipo, 1, "si no es gran empresa, la A común es la correcta");
  assert.ok(decidirComprobante(MIPYME_RI, empresaSinDato, monto).comprobante, "sólo falta saber si es gran empresa");

  assert.equal(decidirComprobante({ ...riSinDato, esMiPyme: false }, empresaSinDato, monto).estado, "lista", "el emisor no es MiPyME");
  assert.equal(decidirComprobante(riSinDato, { ...GRAN_EMPRESA, esGranEmpresa: false }, monto).estado, "lista", "el comprador no es gran empresa");
  assert.equal(decidirComprobante(riSinDato, { ...RECEPTOR_MONO }, monto).estado, "lista", "un monotributista no es gran empresa");
  assert.equal(decidirComprobante(MONO, CF, monto).motivos.some((x) => x.codigo.startsWith("FCE")), false, "consumidor final: nunca FCE");

  const monoMiPyme = decidirComprobante({ ...MONO, esMiPyme: true }, GRAN_EMPRESA, monto);
  assert.deepEqual(monoMiPyme.fce, { tipoSugerido: CBTE_TIPO_FCE.C.factura, obligatoria: true }, "la C sugiere FCE C (211)");
  assert.equal(monoMiPyme.comprobante, null, "tampoco una Factura C común");
});

test("FCE: cada condición que puede ser gran empresa la dispara con su letra; las demás no", () => {
  const monto = productos({ importeTotal: 5_549_862 });
  const conFce: [CondicionIvaReceptor, number][] = [
    ["RESPONSABLE_INSCRIPTO", 201],
    ["EXENTO", 206],
    ["NO_CATEGORIZADO", 206],
    ["IVA_NO_ALCANZADO", 206],
    ["IVA_LIBERADO_LEY_19640", 206],
  ];
  for (const [cond, tipo] of conFce) {
    const d = decidirComprobante(MIPYME_RI, { ...GRAN_EMPRESA, condicionIva: cond }, monto);
    assert.deepEqual(motivo(d, "FCE_OBLIGATORIA")?.fueraDelSistema, { cbteTipo: tipo }, `${cond}: ${JSON.stringify(d.motivos)}`);
    assert.equal(d.comprobante, null, `${cond}: una factura común sería la equivocada`);
    assert.deepEqual(d.fce, { tipoSugerido: tipo, obligatoria: true }, cond);
    const c = decidirComprobante({ ...MONO, esMiPyme: true }, { ...GRAN_EMPRESA, condicionIva: cond }, monto);
    assert.deepEqual(c.fce, { tipoSugerido: CBTE_TIPO_FCE.C.factura, obligatoria: true }, `${cond} (emisor C)`);
    assert.equal(c.comprobante, null, `${cond} (emisor C)`);
  }
  for (const cond of ["MONOTRIBUTO", "MONOTRIBUTO_SOCIAL", "MONOTRIBUTO_PROMOVIDO", "CONSUMIDOR_FINAL"] as const) {
    const d = decidirComprobante(MIPYME_RI, { ...GRAN_EMPRESA, condicionIva: cond }, monto);
    assert.equal(d.fce, null, cond);
    assert.equal(d.motivos.some((m) => m.codigo.startsWith("FCE")), false, cond);
  }
});

test("el importe se decide con 2 decimales, como viaja a ARCA (toFixed(2) del plugin)", () => {
  // 5.549.861,995 viaja como 5.549.862,00: ya es el mínimo de FCE.
  const fce = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ importeTotal: 5_549_861.995 }));
  assert.ok(codigos(fce).includes("FCE_OBLIGATORIA"), JSON.stringify(fce.motivos));
  assert.equal(fce.comprobante, null);
  // 9.999.999,996 viaja como 10.000.000,00: hay que identificar.
  assert.ok(codigos(decidirComprobante(RI, CF, productos({ importeTotal: 9_999_999.996 }))).includes("IDENTIFICACION_OBLIGATORIA"));
  // El umbral se decide sobre el mismo número que recibe ARCA, sea cual sea el redondeo.
  for (const importeTotal of [9_999_999.99, 9_999_999.994, 9_999_999.995, 9_999_999.996, 10_000_000.004]) {
    const viaja = Number(importeTotal.toFixed(2));
    const d = decidirComprobante(RI, CF, productos({ importeTotal }));
    assert.equal(codigos(d).includes("IDENTIFICACION_OBLIGATORIA"), viaja >= 10_000_000, `${importeTotal} viaja como ${viaja}`);
  }
  // Igual con la regla del negocio. 599.999,995 es, en binario, 599.999,99499…: viaja como
  // 599.999,99 (debajo de 600.000), aunque Math.round(importe * 100) diría 600.000,00.
  for (const importeTotal of [599_999.99, 599_999.995, 599_999.996, 600_000]) {
    const viaja = Number(importeTotal.toFixed(2));
    const d = decidirComprobante(MONO, CF, productos({ importeTotal }), { umbralIdentificacionDelNegocio: 600_000 });
    assert.equal(codigos(d).includes("IDENTIFICACION_REGLA_DEL_NEGOCIO"), viaja >= 600_000, `${importeTotal} viaja como ${viaja}`);
  }
  // Menos de medio centavo viaja como 0,00: no es un importe.
  assert.ok(codigos(decidirComprobante(RI, CF, productos({ importeTotal: 0.004 }))).includes("IMPORTE_INVALIDO"));
  // Nota de crédito: 121.000,004 viaja como 121.000,00 y cabe en la factura de 121.000.
  assert.equal(
    decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 121_000.004, asociado: FACTURA_A })).estado,
    "lista",
  );
});

test("tablas de ARCA (FEParamGetCondicionIvaReceptor): ids y clases que admite cada uno, tal cual", () => {
  assert.deepEqual({ ...CONDICION_IVA_RECEPTOR_ID }, {
    RESPONSABLE_INSCRIPTO: 1,
    EXENTO: 4,
    CONSUMIDOR_FINAL: 5,
    MONOTRIBUTO: 6,
    NO_CATEGORIZADO: 7,
    PROVEEDOR_EXTERIOR: 8,
    CLIENTE_EXTERIOR: 9,
    IVA_LIBERADO_LEY_19640: 10,
    MONOTRIBUTO_SOCIAL: 13,
    IVA_NO_ALCANZADO: 15,
    MONOTRIBUTO_PROMOVIDO: 16,
  });
  const orden = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);
  assert.deepEqual(orden(RECEPTORES_ADMITIDOS.A), [1, 6, 13, 16]);
  assert.deepEqual(orden(RECEPTORES_ADMITIDOS.B), [4, 5, 7, 8, 9, 10, 15]);
  assert.deepEqual(orden(RECEPTORES_ADMITIDOS.C), [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]);
  // Monotributista promovido: A (16) desde un inscripto y C (16) desde un monotributista.
  const promovido: ReceptorFiscal = { ...RECEPTOR_MONO, condicionIva: "MONOTRIBUTO_PROMOVIDO" };
  const c = decidirComprobante(MONO, promovido, productos());
  assert.equal(c.estado, "lista", JSON.stringify(c.motivos));
  assert.equal(c.comprobante!.cbteTipo, 11);
  assert.equal(c.comprobante!.condicionIvaReceptorId, 16);
});

test("los montos salen de la tabla de vigencias: con otra tabla, otra decisión", () => {
  const tablaDePrueba: TablaVigencias = {
    id: "prueba",
    nombre: "prueba",
    comparacion: "igual_o_superior",
    vigencias: [{ desde: "2020-01-01", valor: 100, norma: "Norma de prueba", fuente: "test", verificacion: "test" }],
  };
  const d = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ importeTotal: 100 }), { tablas: { minimoFce: tablaDePrueba } });
  assert.ok(codigos(d).includes("FCE_OBLIGATORIA"));

  const cf = decidirComprobante(MONO, CF, productos({ importeTotal: 100 }), { tablas: { umbralIdentificacion: tablaDePrueba } });
  assert.ok(codigos(cf).includes("IDENTIFICACION_OBLIGATORIA"));
  assert.equal(cf.motivos[0].norma, "Norma de prueba");
});

test("tabla de montos mal cargada → bloqueada con un mensaje que no culpa al usuario; sólo si se usa", () => {
  const rota: TablaVigencias = {
    id: "rota",
    nombre: "Tabla rota de prueba",
    comparacion: "igual_o_superior",
    vigencias: [{ desde: "2020-01-01", valor: 0, norma: "n", fuente: "f", verificacion: "v" }],
  };
  const cf = decidirComprobante(MONO, CF, productos(), { tablas: { umbralIdentificacion: rota } });
  assert.equal(cf.estado, "bloqueada");
  assert.equal(cf.comprobante, null);
  assert.deepEqual(codigos(cf), ["TABLA_DE_VIGENCIAS_INVALIDA"]);
  assert.match(cf.motivos[0].mensaje, /No es un error tuyo/);
  const fce = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ importeTotal: 9_000_000 }), { tablas: { minimoFce: rota } });
  assert.deepEqual(codigos(fce), ["TABLA_DE_VIGENCIAS_INVALIDA"]);
  // Una venta que no usa esas tablas (RI a monotributista: ni consumidor final ni FCE posible) sigue.
  assert.equal(decidirComprobante(RI, RECEPTOR_MONO, productos(), { tablas: { umbralIdentificacion: rota, minimoFce: rota } }).estado, "lista");
  // RI a RI sin saber si el emisor es MiPyME SÍ es candidata a FCE: consulta la tabla y se bloquea.
  assert.equal(decidirComprobante(RI, RECEPTOR_RI, productos(), { tablas: { minimoFce: rota } }).estado, "bloqueada");
});

test("decidir-comprobante.ts no tiene montos escritos: todo monto sale de vigencias.ts", () => {
  const fuente = readFileSync(fileURLToPath(new URL("./decidir-comprobante.ts", import.meta.url)), "utf8");
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  const montos = codigo.match(/\b\d{4,}\b|\b\d{1,3}(?:_\d{3})+\b/g) ?? [];
  assert.deepEqual(montos, [], `números de 4 cifras o más en el código de la decisión: ${montos.join(", ")}`);
});

// ─── Criterio 6: CUIT con dígito inválido rechazado ─────────────────────────────

test("CUIT del comprador con dígito verificador inválido → bloqueada, sin comprobante", () => {
  const d = decidirComprobante(RI, { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 80, docNro: "30-71555444-2" }, productos());
  assert.equal(d.estado, "bloqueada");
  assert.equal(d.comprobante, null);
  assert.match(motivo(d, "RECEPTOR_CUIT_INVALIDO")!.mensaje, /verificador/);
});

test("CUIT del emisor inválido → bloqueada", () => {
  const d = decidirComprobante({ ...RI, cuit: "30-71000111-9" }, RECEPTOR_RI, productos());
  assert.equal(d.estado, "bloqueada");
  assert.ok(codigos(d).includes("EMISOR_CUIT_INVALIDO"));
});

test("documento del comprador: DNI mal cargado, largo raro o número con 'sin identificar' → bloqueada", () => {
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "123" }, productos()).estado, "bloqueada");
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "12345" }, productos()).estado, "bloqueada", "5 números no es un DNI");
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "123456789" }, productos()).estado, "bloqueada", "9 números tampoco");
  const raro = decidirComprobante(RI, { docNro: "2030405060" }, productos());
  assert.equal(raro.estado, "bloqueada");
  assert.match(raro.motivos[0].mensaje, /10 caracteres/);
  assert.ok(codigos(decidirComprobante(RI, { docTipo: 99, docNro: "30405060" }, productos())).includes("RECEPTOR_SIN_IDENTIFICAR_CON_NUMERO"));
  assert.ok(codigos(decidirComprobante(RI, { docTipo: 81, docNro: "30405060" }, productos())).includes("DOC_TIPO_DESCONOCIDO"));
  // La libreta de enrolamiento (89) existe en ARCA: el mensaje no dice que "no se usa".
  const le = motivo(decidirComprobante(RI, { docTipo: 89, docNro: "4123456" }, productos()), "DOC_TIPO_DESCONOCIDO")!;
  assert.match(le.mensaje, /todavía no factura con ese tipo de documento \(código 89\)/);
  assert.doesNotMatch(le.mensaje, /no se usa/);
});

test("DNI de 6 números: se propone y una persona lo confirma (documentos viejos existen)", () => {
  for (const receptor of [{ docTipo: 96, docNro: "912345" }, { docNro: "912.345" }]) {
    const d = decidirComprobante(RI, receptor, productos());
    assert.equal(d.estado, "revision", JSON.stringify(receptor));
    assert.deepEqual(codigos(d), ["DNI_A_CONFIRMAR"]);
    assert.equal(d.comprobante!.docTipo, 96);
    assert.equal(d.comprobante!.docNro, 912345);
  }
});

test("DNI en ceros → bloqueada con cualquier emisor e importe: no esquiva la RG 5700 ni la regla del negocio", () => {
  for (const docNro of ["00000000", "0000000", "000000", "0", 0, "00.000.000"]) {
    for (const emisor of [RI, MONO]) {
      for (const importeTotal of [1_000, 700_000, 25_000_000]) {
        const d = decidirComprobante(emisor, { docTipo: 96, docNro }, productos({ importeTotal }), { umbralIdentificacionDelNegocio: 600_000 });
        const donde = `${String(docNro)} ${String(emisor.condicionIva)} ${importeTotal}: ${JSON.stringify(d.motivos)}`;
        assert.equal(d.estado, "bloqueada", donde);
        assert.equal(d.comprobante, null, donde);
        assert.match(motivo(d, "RECEPTOR_DOCUMENTO_INVALIDO")?.mensaje ?? "", /en ceros/, donde);
      }
    }
  }
  assert.match(
    motivo(decidirComprobante(RI, { docTipo: 96, docNro: "" }, productos()), "RECEPTOR_DOCUMENTO_INVALIDO")!.mensaje,
    /Falta el número de DNI/,
  );
  // Sin tipo, un número en ceros es "sin identificar" (99/0), y la RG 5700 se aplica igual.
  const sinTipo = decidirComprobante(RI, { docNro: "00000000" }, productos({ importeTotal: 25_000_000 }));
  assert.ok(codigos(sinTipo).includes("IDENTIFICACION_OBLIGATORIA"));
  assert.equal(sinTipo.comprobante, null);
  // CUIT, CUIL o CDI en ceros: no existen.
  for (const docTipo of [80, 86, 87]) {
    const d = decidirComprobante(RI, { docTipo, docNro: "00000000000" }, productos());
    assert.equal(d.estado, "bloqueada", String(docTipo));
    assert.ok(codigos(d).includes("RECEPTOR_CUIT_INVALIDO"), String(docTipo));
  }
});

test("DNI: se valida el número que recibe ARCA; los ceros de adelante no cuentan", () => {
  const conCero = decidirComprobante(RI, { docTipo: 96, docNro: "01234567" }, productos());
  assert.equal(conCero.estado, "lista", JSON.stringify(conCero.motivos));
  assert.equal(conCero.comprobante!.docNro, 1_234_567);
  const seis = decidirComprobante(RI, { docTipo: 96, docNro: "00123456" }, productos());
  assert.deepEqual(codigos(seis), ["DNI_A_CONFIRMAR"], "quedan 6 números: se confirma");
  assert.equal(seis.comprobante!.docNro, 123_456);
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "00012345" }, productos()).estado, "bloqueada", "quedan 5 números");
  assert.equal(decidirComprobante(RI, { docTipo: 96, docNro: "0012345678" }, productos()).estado, "bloqueada", "más de 8 caracteres");
});

test("sin DocTipo se deduce del número: 11 → CUIT, 8 → DNI, vacío o 0 → sin identificar", () => {
  const cuit = decidirComprobante(RI, { condicionIva: "RESPONSABLE_INSCRIPTO", docNro: "30715554441" }, productos());
  assert.equal(cuit.comprobante!.docTipo, 80);
  assert.equal(decidirComprobante(RI, { docNro: "30405060" }, productos()).comprobante!.docTipo, 96);
  assert.equal(decidirComprobante(RI, { docNro: "0" }, productos()).comprobante!.docTipo, 99);
  assert.equal(decidirComprobante(RI, { docTipo: 99, docNro: 0 }, productos()).comprobante!.docNro, 0);
});

// ─── Receptor: condición desconocida, faltante o inconsistente ──────────────────

test("comprador con CUIT pero sin condición de IVA → revisión (no se adivina la letra)", () => {
  const d = decidirComprobante(RI, { docTipo: 80, docNro: "30715554441" }, productos());
  assert.equal(d.estado, "revision");
  assert.equal(d.comprobante, null);
  assert.deepEqual(codigos(d), ["RECEPTOR_SIN_CONDICION"]);
  assert.equal(d.motivos[0].pideDato, true, "se carga la condición y se vuelve a decidir");
  // También para la C: el CondicionIVAReceptorId es obligatorio y tiene que ser el real.
  assert.equal(decidirComprobante(MONO, { docTipo: 80, docNro: "30715554441" }, productos()).estado, "revision");
});

test("responsable inscripto sin CUIT → revisión pidiendo el CUIT", () => {
  const d = decidirComprobante(RI, { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 96, docNro: "30405060" }, productos());
  assert.equal(d.estado, "revision");
  assert.match(d.motivos[0].mensaje, /hace falta su CUIT/);
  assert.equal(d.motivos[0].pideDato, true);
  assert.equal(d.comprobante, null);
});

test("empresa cargada como consumidor final → revisión", () => {
  const d = decidirComprobante(RI, { condicionIva: "CONSUMIDOR_FINAL", docTipo: 80, docNro: "30715554441" }, productos());
  assert.equal(d.estado, "revision");
  assert.ok(codigos(d).includes("EMPRESA_COMO_CONSUMIDOR_FINAL"));
  assert.equal(d.comprobante!.letra, "B", "la propuesta queda, para que el contador la mire");
});

test("comprador del exterior → revisión sin propuesta; el mensaje dice 'si es exportación', no lo afirma", () => {
  const d = decidirComprobante(RI, { condicionIva: "CLIENTE_EXTERIOR" }, productos());
  assert.equal(d.estado, "revision");
  assert.equal(d.comprobante, null);
  const m = motivo(d, "RECEPTOR_DEL_EXTERIOR")!;
  assert.equal(m.pideDato, undefined, "no falta un dato: es otro comprobante o una consulta");
  assert.match(m.mensaje, /Si la venta es una exportación, le corresponde Factura E/);
  assert.match(m.mensaje, /servicio que se usa en el país/);
});

test("condición desconocida del comprador → bloqueada", () => {
  const d = decidirComprobante(RI, { condicionIva: "INSCRIPTO", docTipo: 80, docNro: "30715554441" }, productos());
  assert.equal(d.estado, "bloqueada");
  assert.ok(codigos(d).includes("RECEPTOR_CONDICION_DESCONOCIDA"));
});

test("facturarse a sí mismo → bloqueada", () => {
  const d = decidirComprobante(RI, { condicionIva: "RESPONSABLE_INSCRIPTO", docTipo: 80, docNro: "30710001118" }, productos());
  assert.equal(d.estado, "bloqueada");
  assert.ok(codigos(d).includes("FACTURA_A_SI_MISMO"));
});

// ─── Emisor ─────────────────────────────────────────────────────────────────────

test("emisor sin condición, consumidor final o desconocida → bloqueada, nunca se asume monotributo", () => {
  for (const cond of [null, undefined, "", "CONSUMIDOR_FINAL", "RI"]) {
    const d = decidirComprobante({ condicionIva: cond }, CF, productos());
    assert.equal(d.estado, "bloqueada", String(cond));
    assert.equal(d.comprobante, null, String(cond));
  }
  assert.ok(codigos(decidirComprobante({ condicionIva: null }, CF, productos())).includes("EMISOR_SIN_CONDICION"));
});

test("fecha o importe inválidos → bloqueada", () => {
  assert.equal(decidirComprobante(RI, CF, productos({ fecha: "20260231" })).estado, "bloqueada");
  for (const importe of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const d = decidirComprobante(RI, CF, productos({ importeTotal: importe }));
    assert.equal(d.estado, "bloqueada", String(importe));
    assert.ok(codigos(d).includes("IMPORTE_INVALIDO"));
  }
  assert.equal(decidirComprobante(RI, CF, productos({ clase: "recibo" as never })).estado, "bloqueada");
});

// ─── Notas de crédito y débito asociadas ────────────────────────────────────────

const FACTURA_A = { cbteTipo: 1, puntoVenta: 3, numero: 120, fecha: "20260920", importeTotal: 121_000 };

test("nota de crédito de una Factura A → NC A (3) con el comprobante asociado", () => {
  const d = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 50_000, asociado: FACTURA_A }));
  assert.equal(d.estado, "lista", JSON.stringify(d.motivos));
  assert.equal(d.comprobante!.cbteTipo, 3);
  assert.deepEqual(d.comprobante!.asociado, { cbteTipo: 1, puntoVenta: 3, numero: 120, cbteFch: "20260920" });
});

test("NC y ND heredan la letra: B → 8/7, C → 13/12", () => {
  const facturaB = { ...FACTURA_A, cbteTipo: 6 };
  assert.equal(decidirComprobante(RI, CF, productos({ clase: "nota_credito", asociado: facturaB })).comprobante!.cbteTipo, 8);
  assert.equal(decidirComprobante(RI, CF, productos({ clase: "nota_debito", asociado: facturaB })).comprobante!.cbteTipo, 7);
  const facturaC = { ...FACTURA_A, cbteTipo: 11 };
  assert.equal(decidirComprobante(MONO, CF, productos({ clase: "nota_credito", asociado: facturaC })).comprobante!.cbteTipo, 13);
  assert.equal(decidirComprobante(MONO, CF, productos({ clase: "nota_debito", asociado: facturaC })).comprobante!.cbteTipo, 12);
});

test("NC: sin factura asociada, mayor que la original, anterior a ella o de otra letra → no sale sola", () => {
  const sinAsociado = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito" }));
  assert.equal(sinAsociado.estado, "bloqueada");
  assert.ok(codigos(sinAsociado).includes("FALTA_COMPROBANTE_ASOCIADO"));

  const mayor = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 121_000.01, asociado: FACTURA_A }));
  assert.equal(mayor.estado, "bloqueada");
  assert.ok(codigos(mayor).includes("NOTA_CREDITO_SUPERA_ORIGINAL"));
  assert.equal(
    decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 121_000, asociado: FACTURA_A })).estado,
    "lista",
    "anular el total exacto se puede",
  );

  const anterior = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", fecha: "20260919", asociado: FACTURA_A }));
  assert.ok(codigos(anterior).includes("ASOCIADO_POSTERIOR"));

  // La factura original fue B (el cliente era consumidor final) y hoy es RI → A.
  const otraLetra = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", asociado: { ...FACTURA_A, cbteTipo: 6 } }));
  assert.equal(otraLetra.estado, "revision");
  assert.equal(otraLetra.comprobante, null);
  assert.ok(codigos(otraLetra).includes("LETRA_DISTINTA_A_LA_ORIGINAL"));
});

test("NC: el tope es lo que queda por anular, no el total de la factura", () => {
  const conAnterior = { ...FACTURA_A, importeYaAcreditado: 100_000 };
  const cabe = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 21_000, asociado: conAnterior }));
  assert.equal(cabe.estado, "lista", JSON.stringify(cabe.motivos));
  const noCabe = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 21_000.01, asociado: conAnterior }));
  assert.equal(noCabe.estado, "bloqueada");
  assert.match(motivo(noCabe, "NOTA_CREDITO_SUPERA_ORIGINAL")!.mensaje, /notas anteriores/);
  const sinNotas = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 121_000, asociado: { ...FACTURA_A, importeYaAcreditado: 0 } }));
  assert.equal(sinNotas.estado, "lista", "sin notas anteriores (suma 0) se puede anular el total");
  const raro = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: { ...FACTURA_A, importeYaAcreditado: -1 } }));
  assert.ok(codigos(raro).includes("ASOCIADO_INVALIDO"));
});

test("NC: tiene que ir al mismo cliente que la factura", () => {
  const conCliente = { ...FACTURA_A, docNro: "30-71555444-1" };
  assert.equal(decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: conCliente })).estado, "lista");
  const otro = decidirComprobante(RI, { ...RECEPTOR_MONO }, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: conCliente }));
  assert.equal(otro.estado, "bloqueada");
  assert.ok(codigos(otro).includes("ASOCIADO_OTRO_CLIENTE"));
  // Factura B a consumidor final sin identificar (DocNro 0) → la NC también sin identificar.
  const facturaB = { ...FACTURA_A, cbteTipo: 6, docNro: 0 };
  assert.equal(decidirComprobante(RI, CF, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: facturaB })).estado, "lista");
  assert.ok(codigos(decidirComprobante(RI, { docTipo: 96, docNro: "30405060" }, productos({ clase: "nota_credito", importeTotal: 1_000, asociado: facturaB }))).includes("ASOCIADO_OTRO_CLIENTE"));
});

test("NC: original FCE o M, o una NC que 'anula' otra NC → bloqueada", () => {
  for (const cbteTipo of [201, 206, 211, 51]) {
    const d = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", asociado: { ...FACTURA_A, cbteTipo } }));
    assert.ok(codigos(d).includes("ASOCIADO_NO_SOPORTADO"), String(cbteTipo));
  }
  const ncDeNc = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", asociado: { ...FACTURA_A, cbteTipo: 3 } }));
  assert.ok(codigos(ncDeNc).includes("ASOCIADO_CLASE_INCOMPATIBLE"));
  const incompleto = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", asociado: { ...FACTURA_A, numero: 0 } }));
  assert.ok(codigos(incompleto).includes("ASOCIADO_INVALIDO"));
});

test("NC por período (PeriodoAsoc) con la letra de lo facturado", () => {
  const agosto = { desde: "2026-08-01", hasta: "2026-08-31" };
  const d = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { ...agosto, letra: "A" } }));
  assert.equal(d.estado, "lista", JSON.stringify(d.motivos));
  assert.equal(d.comprobante!.cbteTipo, 3);
  assert.deepEqual(d.comprobante!.periodoAsociado, { desde: "20260801", hasta: "20260831" });
  const alReves = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { desde: "2026-08-31", hasta: "2026-08-01", letra: "A" } }));
  assert.equal(alReves.estado, "bloqueada");
});

test("NC por período: sin letra se pregunta; con otra letra no se propone; M o letra rara, bloqueada", () => {
  const agosto = { desde: "2026-08-01", hasta: "2026-08-31" };
  const sinLetra = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: agosto }));
  assert.equal(sinLetra.estado, "revision");
  assert.deepEqual(codigos(sinLetra), ["PERIODO_SIN_LETRA"]);
  assert.ok(sinLetra.comprobante, "si se confirma que fue A, la NC A es la correcta");

  // Antes era exento (se le facturó B) y hoy es inscripto (A): la NC no puede salir A.
  const otraLetra = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { ...agosto, letra: "B" } }));
  assert.equal(otraLetra.estado, "revision");
  assert.equal(otraLetra.comprobante, null);
  assert.ok(codigos(otraLetra).includes("LETRA_DISTINTA_A_LA_ORIGINAL"));

  assert.ok(codigos(decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { ...agosto, letra: "M" } }))).includes("ASOCIADO_NO_SOPORTADO"));
  assert.equal(decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { ...agosto, letra: "Z" as never } })).estado, "bloqueada");
});

test("NC por período: no puede terminar después de la nota, ni venir junto con la factura", () => {
  const futuro = decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { desde: "20261001", hasta: "20261231", letra: "A" } }));
  assert.equal(futuro.estado, "bloqueada");
  assert.ok(codigos(futuro).includes("PERIODO_POSTERIOR"));
  assert.equal(
    decidirComprobante(RI, RECEPTOR_RI, productos({ clase: "nota_credito", periodoAsociado: { desde: "20260901", hasta: HOY, letra: "A" } })).estado,
    "lista",
    "hasta el mismo día de la nota, sí",
  );

  const lasDos = decidirComprobante(RI, RECEPTOR_RI, productos({
    clase: "nota_credito",
    importeTotal: 1_000,
    asociado: FACTURA_A,
    periodoAsociado: { desde: "20260801", hasta: "20260831", letra: "A" },
  }));
  assert.equal(lasDos.estado, "bloqueada");
  assert.equal(lasDos.comprobante, null);
  assert.ok(codigos(lasDos).includes("ASOCIADO_Y_PERIODO"));
});

test("las notas no disparan la alerta de FCE (es de la factura)", () => {
  const d = decidirComprobante(MIPYME_RI, GRAN_EMPRESA, productos({ clase: "nota_credito", importeTotal: 9_000_000, asociado: { ...FACTURA_A, importeTotal: 9_000_000 } }));
  assert.equal(d.motivos.some((m) => m.codigo.startsWith("FCE")), false);
  assert.equal(d.fce, null);
});

// ─── Pureza y contrato con el plugin ────────────────────────────────────────────

test("es pura: no toca lo que recibe y da lo mismo dos veces", () => {
  const emisor = Object.freeze({ ...MIPYME_RI });
  const receptor = Object.freeze({ ...GRAN_EMPRESA });
  const op = Object.freeze(productos({ importeTotal: 6_000_000, servicio: Object.freeze({ desde: HOY }) }));
  const a = decidirComprobante(emisor, receptor, op);
  const b = decidirComprobante(emisor, receptor, op);
  assert.deepEqual(a, b);
  const c = decidirComprobante(Object.freeze({ ...RI }), Object.freeze({ ...CF }), op);
  assert.deepEqual(c, decidirComprobante(RI, CF, op));
});

test("los códigos coinciden con los del plugin ARCA (no se separan)", () => {
  assert.equal(CBTE_TIPO.A.factura, TipoComprobante.FacturaA);
  assert.equal(CBTE_TIPO.A.nota_debito, TipoComprobante.NotaDebitoA);
  assert.equal(CBTE_TIPO.A.nota_credito, TipoComprobante.NotaCreditoA);
  assert.equal(CBTE_TIPO.B.factura, TipoComprobante.FacturaB);
  assert.equal(CBTE_TIPO.B.nota_debito, TipoComprobante.NotaDebitoB);
  assert.equal(CBTE_TIPO.B.nota_credito, TipoComprobante.NotaCreditoB);
  assert.equal(CBTE_TIPO.C.factura, TipoComprobante.FacturaC);
  assert.equal(CBTE_TIPO.C.nota_debito, TipoComprobante.NotaDebitoC);
  assert.equal(CBTE_TIPO.C.nota_credito, TipoComprobante.NotaCreditoC);
  assert.equal(DOC_TIPO.CUIT, TipoDocumento.CUIT);
  assert.equal(DOC_TIPO.CUIL, TipoDocumento.CUIL);
  assert.equal(DOC_TIPO.DNI, TipoDocumento.DNI);
  assert.equal(DOC_TIPO.SIN_IDENTIFICAR, TipoDocumento.ConsumidorFinal);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.RESPONSABLE_INSCRIPTO, CondicionIvaReceptorId.ResponsableInscripto);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.EXENTO, CondicionIvaReceptorId.SujetoExento);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.CONSUMIDOR_FINAL, CondicionIvaReceptorId.ConsumidorFinal);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.MONOTRIBUTO, CondicionIvaReceptorId.ResponsableMonotributo);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.NO_CATEGORIZADO, CondicionIvaReceptorId.SujetoNoCategorizado);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.MONOTRIBUTO_SOCIAL, CondicionIvaReceptorId.MonotributistaSocial);
  assert.equal(CONDICION_IVA_RECEPTOR_ID.IVA_NO_ALCANZADO, CondicionIvaReceptorId.IvaNoAlcanzado);
  assert.equal(Concepto.Servicios, 2);
  assert.equal(Concepto.ProductosYServicios, 3);
});
