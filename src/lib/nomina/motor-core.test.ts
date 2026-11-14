/**
 * Casos calculados a mano por el experto en liquidación: docs/nomina/casos-comercio-130-75.md.
 * ART (2 % + $1.200) y seguro de vida ($300) son valores de EJEMPLO, no reales.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { liquidarReciboComercio, type EntradaReciboComercio } from "./motor-core";
import { sumarAlCentavo } from "../dinero/redondeo";

const EMPLEADOR_EJEMPLO = { alicuotaContribucion: 18, art: { variable: 2, fija: 1200 }, seguroVidaObligatorio: 300 };
const SIN_NOVEDADES = { ausenciasInjustificadas: 0, horasExtra50: 0, horasExtra100: 0 };

function entrada(parcial: Partial<EntradaReciboComercio> & Pick<EntradaReciboComercio, "empleado">): EntradaReciboComercio {
  return { periodo: "2026-11", novedades: SIN_NOVEDADES, empleador: EMPLEADOR_EJEMPLO, ...parcial };
}

function importes(recibo: ReturnType<typeof liquidarReciboComercio>): Record<string, number> {
  return Object.fromEntries(recibo.lineas.map((l) => [l.codigo, l.importe]));
}

interface Caso {
  nombre: string;
  entrada: EntradaReciboComercio;
  lineas: Record<string, number>;
  totales: { remunerativo: number; noRemunerativo: number; baseAportes: number; aportes: number; neto: number; contribuciones: number };
}

const NR = { NR_SUMA_FIJA: 120_000, NR_BONO: 25_000 };
const CO_FIJAS = { CO_ART_FIJA: 1200, CO_SVO: 300 };

const CASOS: Caso[] = [
  {
    nombre: "1 · normal (Administrativo A, 0 años, afiliado)",
    entrada: entrada({ empleado: { categoria: "administrativo-a", antiguedadAnios: 0, afiliadoSindical: true } }),
    lineas: {
      BASICO: 1_246_664, PRESENTISMO: 103_847.11, ...NR,
      AP_JUBILACION: 148_556.22, AP_LEY19032: 40_515.33, AP_OS: 40_515.33, AP_OS_NR: 4_350,
      AP_SINDICAL: 29_910.22, AP_FAECYS: 7_477.56,
      CO_814: 243_092, CO_OS: 81_030.67, CO_OS_NR: 8_700, CO_ART_VAR: 27_010.22, ...CO_FIJAS,
    },
    totales: { remunerativo: 1_350_511.11, noRemunerativo: 145_000, baseAportes: 1_350_511.11, aportes: 271_324.66, neto: 1_224_186.45, contribuciones: 361_332.89 },
  },
  {
    nombre: "2 · antigüedad 7 años (Vendedor B, no afiliado)",
    entrada: entrada({ empleado: { categoria: "vendedor-b", antiguedadAnios: 7, afiliadoSindical: false } }),
    lineas: {
      BASICO: 1_277_511, ANTIGUEDAD: 89_425.77, PRESENTISMO: 113_865.83, ...NR,
      AP_JUBILACION: 162_888.29, AP_LEY19032: 44_424.08, AP_OS: 44_424.08, AP_OS_NR: 4_350, AP_FAECYS: 8_129.01,
      CO_814: 266_544.47, CO_OS: 88_848.16, CO_OS_NR: 8_700, CO_ART_VAR: 29_616.05, ...CO_FIJAS,
    },
    totales: { remunerativo: 1_480_802.6, noRemunerativo: 145_000, baseAportes: 1_480_802.6, aportes: 264_215.46, neto: 1_361_587.14, contribuciones: 395_208.68 },
  },
  {
    nombre: "3 · 6 h extra al 50 % y 2 h al 100 % (Maestranza A, 3 años, afiliado)",
    entrada: entrada({
      empleado: { categoria: "maestranza-a", antiguedadAnios: 3, afiliadoSindical: true },
      novedades: { ausenciasInjustificadas: 0, horasExtra50: 6, horasExtra100: 2 },
    }),
    lineas: {
      BASICO: 1_233_448, ANTIGUEDAD: 37_003.44, PRESENTISMO: 105_828.6, HE50: 61_932.6, HE100: 27_525.6, ...NR,
      AP_JUBILACION: 161_231.21, AP_LEY19032: 43_972.15, AP_OS: 43_972.15, AP_OS_NR: 4_350,
      AP_SINDICAL: 32_214.76, AP_FAECYS: 8_053.69,
      CO_814: 263_832.88, CO_OS: 87_944.29, CO_OS_NR: 8_700, CO_ART_VAR: 29_314.76, ...CO_FIJAS,
    },
    totales: { remunerativo: 1_465_738.24, noRemunerativo: 145_000, baseAportes: 1_465_738.24, aportes: 293_793.96, neto: 1_316_944.28, contribuciones: 391_291.93 },
  },
  {
    nombre: "4 · 2 ausencias injustificadas pierden el presentismo (Administrativo A, 2 años, afiliado)",
    entrada: entrada({
      empleado: { categoria: "administrativo-a", antiguedadAnios: 2, afiliadoSindical: true },
      novedades: { ausenciasInjustificadas: 2, horasExtra50: 0, horasExtra100: 0 },
    }),
    lineas: {
      BASICO: 1_246_664, ANTIGUEDAD: 24_933.28, AUSENCIAS: -84_773.15, PRESENTISMO: 0, ...NR,
      AP_JUBILACION: 130_550.65, AP_LEY19032: 35_604.72, AP_OS: 35_604.72, AP_OS_NR: 4_350,
      AP_SINDICAL: 26_636.48, AP_FAECYS: 6_659.12,
      CO_814: 213_628.34, CO_OS: 71_209.45, CO_OS_NR: 8_700, CO_ART_VAR: 23_736.48, ...CO_FIJAS,
    },
    totales: { remunerativo: 1_186_824.13, noRemunerativo: 145_000, baseAportes: 1_186_824.13, aportes: 239_405.69, neto: 1_092_418.44, contribuciones: 318_774.27 },
  },
  {
    nombre: "5 · supera el tope de aportes (sobre escala $5M, 10 años, afiliado)",
    entrada: entrada({
      empleado: { categoria: "administrativo-a", basicoConvenido: 5_000_000, antiguedadAnios: 10, afiliadoSindical: true },
    }),
    lineas: {
      BASICO: 5_000_000, ANTIGUEDAD: 500_000, PRESENTISMO: 458_150, ...NR,
      AP_JUBILACION: 534_785.39, AP_LEY19032: 145_850.56, AP_OS: 145_850.56, AP_OS_NR: 4_350,
      AP_SINDICAL: 122_063, AP_FAECYS: 30_515.75,
      CO_814: 1_072_467, CO_OS: 357_489, CO_OS_NR: 8_700, CO_ART_VAR: 119_163, ...CO_FIJAS,
    },
    totales: { remunerativo: 5_958_150, noRemunerativo: 145_000, baseAportes: 4_861_685.38, aportes: 983_415.26, neto: 5_119_734.74, contribuciones: 1_559_319 },
  },
];

for (const caso of CASOS) {
  test(`Comercio 130/75 nov-2026 · caso ${caso.nombre}`, () => {
    const recibo = liquidarReciboComercio(caso.entrada);
    assert.deepEqual(importes(recibo), caso.lineas);
    assert.deepEqual(recibo.totales, caso.totales);
  });
}

test("los totales cuadran con la suma de las líneas y el neto = rem + no rem − aportes", () => {
  for (const caso of CASOS) {
    const r = liquidarReciboComercio(caso.entrada);
    const suma = (t: string) => sumarAlCentavo(r.lineas.filter((l) => l.tipo === t).map((l) => l.importe));
    assert.equal(r.totales.remunerativo, suma("R"));
    assert.equal(r.totales.noRemunerativo, suma("N"));
    assert.equal(r.totales.aportes, suma("A"));
    assert.equal(r.totales.contribuciones, suma("C"));
    assert.equal(r.totales.neto, sumarAlCentavo([suma("R"), suma("N"), -suma("A")]));
  }
});

test("el recibo guarda versión de reglas, tipo y los VALORES de parámetros usados", () => {
  const r = liquidarReciboComercio(CASOS[0].entrada);
  assert.equal(r.versionReglas, "comercio-v1");
  assert.equal(r.tipoLiquidacion, "mensual");
  assert.equal(r.versionParametros, "comercio-2026-11+ley-2026-11");
  assert.equal(r.parametros.topeBaseAportes, 4_861_685.38);
  assert.equal(r.parametros.basicoEscala, 1_246_664);
  assert.equal(r.parametros.presentismo, 8.33);
  assert.ok(r.advertencias.some((a) => a.includes("provisional")));
});

test("un período sin escala cargada es un error, no usa la última escala conocida", () => {
  for (const periodo of ["2026-10", "2026-12", "2027-01"]) {
    assert.throws(() => liquidarReciboComercio({ ...CASOS[0].entrada, periodo }), /No hay escalas de Comercio/);
  }
  assert.throws(() => liquidarReciboComercio({ ...CASOS[0].entrada, periodo: "2026-13" }), /Período inválido/);
});

test("sin ART ni seguro de vida configurados: no se inventan y queda advertencia", () => {
  const r = liquidarReciboComercio({ ...CASOS[0].entrada, empleador: { alicuotaContribucion: 18 } });
  assert.equal(r.totales.contribuciones, 332_822.67); // «contribuciones sin ART/SVO» del caso 1
  assert.equal(r.totales.neto, 1_224_186.45);
  assert.ok(r.advertencias.some((a) => a.startsWith("ART")));
  assert.ok(r.advertencias.some((a) => a.startsWith("Seguro de vida")));
});

test("alícuota 20,4 % del dto. 814/01", () => {
  const r = liquidarReciboComercio({ ...CASOS[0].entrada, empleador: { ...EMPLEADOR_EJEMPLO, alicuotaContribucion: 20.4 } });
  assert.equal(importes(r).CO_814, 275_504.27); // 1.350.511,11 × 20,4 % = 275.504,2664 → 275.504,27
});

test("horas extra con fracción: 1,5 h al 50 % sobre la base del caso 3", () => {
  const r = liquidarReciboComercio({
    ...CASOS[2].entrada,
    novedades: { ausenciasInjustificadas: 0, horasExtra50: 1.5, horasExtra100: 0 },
  });
  // 1.376.280,04 × 1,5 × 1,5 / 200 = 15.483,1504… → 15.483,15
  assert.equal(importes(r).HE50, 15_483.15);
});

test("rechaza entradas inválidas en vez de redondearlas en silencio", () => {
  const base = CASOS[0].entrada;
  const con = (cambios: Partial<EntradaReciboComercio>) => () => liquidarReciboComercio({ ...base, ...cambios });
  assert.throws(con({ empleado: { ...base.empleado, basicoConvenido: 1_000_000 } }), /menor que el de convenio/);
  assert.throws(con({ empleado: { ...base.empleado, antiguedadAnios: 2.5 } }), /Antigüedad/);
  assert.throws(con({ empleado: { ...base.empleado, categoria: "cajero-z" as never } }), /Categoría desconocida/);
  assert.throws(con({ novedades: { ...SIN_NOVEDADES, ausenciasInjustificadas: 31 } }), /ausencia/);
  assert.throws(con({ novedades: { ...SIN_NOVEDADES, ausenciasInjustificadas: -1 } }), /ausencia/);
  assert.throws(con({ novedades: { ...SIN_NOVEDADES, horasExtra50: 1.333 } }), /dos decimales/);
  assert.throws(con({ novedades: { ...SIN_NOVEDADES, horasExtra100: -2 } }), /Horas extra/);
  assert.throws(con({ empleador: { alicuotaContribucion: 17 } }), /Alícuota/);
  assert.throws(con({ empleador: { alicuotaContribucion: 18, art: { variable: 2.345, fija: 0 } } }), /ART variable/);
  assert.throws(con({ empleador: { alicuotaContribucion: 18, art: { variable: 2, fija: -1 } } }), /ART fija/);
  assert.throws(con({ empleador: { alicuotaContribucion: 18, seguroVidaObligatorio: 0.001 } }), /Seguro de vida/);
});

test("30 días de ausencia: neto no negativo y presentismo perdido", () => {
  const r = liquidarReciboComercio({
    ...CASOS[0].entrada,
    novedades: { ausenciasInjustificadas: 30, horasExtra50: 0, horasExtra100: 0 },
  });
  assert.equal(r.totales.remunerativo, 0);
  assert.equal(importes(r).PRESENTISMO, 0);
  assert.ok(r.totales.neto >= 0);
});

test("certificación · categorías heredadas del prototipo se rechazan (nunca neto NaN)", () => {
  const base = CASOS[0].entrada;
  for (const categoria of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"]) {
    for (const basicoConvenido of [undefined, 2_000_000]) {
      assert.throws(
        () => liquidarReciboComercio({ ...base, empleado: { ...base.empleado, categoria: categoria as never, basicoConvenido } }),
        /Categoría desconocida/,
      );
    }
  }
});

test("certificación · importes fuera de rango y horas extra sobre el máximo legal", () => {
  const base = CASOS[0].entrada;
  assert.throws(() => liquidarReciboComercio({ ...base, empleado: { ...base.empleado, basicoConvenido: 1e20 } }), /Básico convenido/);
  assert.throws(
    () => liquidarReciboComercio({ ...base, novedades: { ausenciasInjustificadas: 0, horasExtra50: 200, horasExtra100: 200 } }),
    /Horas extra/,
  );
  assert.throws(
    () => liquidarReciboComercio({ ...base, novedades: { ausenciasInjustificadas: 0, horasExtra50: 20, horasExtra100: 10.5 } }),
    /484\/00/,
  );
  // 30 h justas se aceptan.
  liquidarReciboComercio({ ...base, novedades: { ausenciasInjustificadas: 0, horasExtra50: 20, horasExtra100: 10 } });
});

test("certificación · afiliación no booleana se rechaza y −0 no llega al snapshot", () => {
  const base = CASOS[0].entrada;
  assert.throws(
    () => liquidarReciboComercio({ ...base, empleado: { ...base.empleado, afiliadoSindical: "false" as never } }),
    /Afiliación sindical/,
  );
  const r = liquidarReciboComercio({ ...base, empleador: { alicuotaContribucion: 18, art: { variable: 2, fija: -0 }, seguroVidaObligatorio: 300 } });
  assert.ok(r.lineas.every((l) => !Object.is(l.importe, -0)));
});

test("certificación · snapshot con novedades explícitas, fuentes y sumas no rem. con prefijo; advierte prorrateo pendiente", () => {
  const r = liquidarReciboComercio(CASOS[3].entrada);
  assert.deepEqual(r.novedades, { ausenciasInjustificadas: 2, horasExtra50: 0, horasExtra100: 0, antiguedadAnios: 2, afiliadoSindical: true });
  assert.equal(r.parametros["nr.NR_SUMA_FIJA"], 120_000);
  assert.equal(typeof r.parametros.escalaFuente, "string");
  assert.equal(typeof r.parametros.leyFuente, "string");
  assert.ok(r.advertencias.some((a) => a.includes("prorrateo")));
});
