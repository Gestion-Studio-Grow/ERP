/**
 * Tabla de vencimientos fiscales 2026 — DATOS DE EJEMPLO, «provisional a confirmar».
 *
 * Es un PARÁMETRO (docs/producto/contabilidad/PLAN.md §5): el motor (`vencimientos.ts`) no sabe
 * fechas, sólo lee esta tabla. Los días de abajo imitan la forma del cronograma de ARCA
 * (escalonado por terminación de CUIT) pero NO son el cronograma oficial: antes de mostrarse a un
 * cliente hay que cargarlos desde la resolución general de ARCA y del organismo provincial que
 * corresponda. En producción se sobreescribe por negocio/organismo.
 */

import type { TablaVencimientos } from "./vencimientos";

/** Marca visible: la tabla trae datos de ejemplo. */
export const TABLA_VENCIMIENTOS_2026_PROVISIONAL = true;

const MESES_2026 = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => `2026-${m}`);

/** Mismo escalonado para todos los meses del año (ejemplo). Índice = terminación del CUIT (0-9). */
function cadaMes(dias: readonly number[]): Record<string, readonly number[]> {
  const r: Record<string, readonly number[]> = {};
  for (const m of MESES_2026) r[m] = dias;
  return r;
}

export const TABLA_VENCIMIENTOS_2026: TablaVencimientos = {
  anio: 2026,
  provisional: true,
  obligaciones: [
    {
      codigo: "IVA_MENSUAL",
      nombre: "IVA — declaración jurada mensual",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([18, 18, 19, 19, 20, 20, 21, 21, 22, 22]), // provisional a confirmar
    },
    {
      codigo: "IIBB_LOCAL",
      nombre: "Ingresos brutos — contribuyente local",
      organismo: "Rentas provincial",
      jurisdiccion: "provisional a confirmar",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([13, 13, 14, 14, 15, 15, 16, 16, 17, 17]), // provisional a confirmar
    },
    {
      codigo: "CM03",
      nombre: "Convenio Multilateral — CM03 mensual",
      organismo: "COMARB",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([15, 15, 15, 16, 16, 16, 17, 17, 17, 18]), // provisional a confirmar
    },
    {
      codigo: "CM05",
      nombre: "Convenio Multilateral — CM05 anual",
      organismo: "COMARB",
      periodicidad: "ANUAL",
      accion: "PRESENTACION",
      porPeriodo: { "2025": [{ cuota: 0, mes: "2026-06" }] },
      diasPorMes: { "2026-06": [15, 15, 15, 15, 15, 15, 15, 15, 15, 15] }, // provisional a confirmar
    },
    {
      codigo: "AUTONOMOS",
      nombre: "Autónomos — aporte mensual",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      accion: "PAGO",
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([5, 5, 5, 5, 6, 6, 6, 7, 7, 7]), // provisional a confirmar
    },
    {
      codigo: "F931",
      nombre: "Cargas sociales — F.931 (SUSS)",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([9, 9, 9, 9, 10, 10, 10, 11, 11, 11]), // provisional a confirmar
    },
    {
      codigo: "GANANCIAS_ANTICIPO",
      nombre: "Ganancias — anticipos",
      organismo: "ARCA",
      periodicidad: "ANTICIPO",
      accion: "PAGO",
      // Anticipos del período fiscal 2026, cuotas 1 a 5 (provisional a confirmar: cantidad y meses).
      porPeriodo: {
        "2026": [
          { cuota: 1, mes: "2026-08" },
          { cuota: 2, mes: "2026-09" },
          { cuota: 3, mes: "2026-10" },
          { cuota: 4, mes: "2026-11" },
          { cuota: 5, mes: "2026-12" },
        ],
      },
      diasPorMes: cadaMes([13, 13, 13, 14, 14, 14, 15, 15, 15, 15]), // provisional a confirmar
    },
    // ── T7 (FC-11): obligaciones que faltaban. Todas «provisional a confirmar». ──
    {
      codigo: "GANANCIAS_DDJJ",
      nombre: "Ganancias — declaración jurada anual y saldo",
      organismo: "ARCA",
      periodicidad: "ANUAL",
      accion: "AMBAS",
      // Período fiscal 2025 → vence en 2026 (provisional a confirmar: mes según tipo de sujeto).
      porPeriodo: { "2025": [{ cuota: 0, mes: "2026-06" }] },
      diasPorMes: { "2026-06": [11, 11, 12, 12, 12, 15, 15, 16, 16, 16] }, // provisional a confirmar
    },
    {
      codigo: "SICORE",
      nombre: "Retenciones y percepciones practicadas — SICORE",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      // Sólo si el negocio es agente de retención: entra apagada y se prende en el monitor.
      activaPorDefecto: false,
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([10, 10, 10, 10, 11, 11, 11, 12, 12, 12]), // provisional a confirmar
    },
    {
      codigo: "IIBB_AGENTE",
      nombre: "Ingresos brutos — retenciones y percepciones practicadas",
      organismo: "Rentas provincial",
      jurisdiccion: "provisional a confirmar",
      periodicidad: "MENSUAL",
      accion: "AMBAS",
      activaPorDefecto: false,
      mesesHastaVencimiento: 1,
      diasPorMes: cadaMes([12, 12, 12, 12, 12, 12, 12, 12, 12, 12]), // provisional a confirmar
    },
  ],
};

/**
 * Feriados nacionales 2026 que corren un vencimiento al hábil siguiente. Lista CONFIGURABLE,
 * provisional a confirmar (los puentes turísticos se fijan por decreto y no están acá).
 */
export const FERIADOS_2026: readonly string[] = [
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-03-24",
  "2026-04-02",
  "2026-04-03",
  "2026-05-01",
  "2026-05-25",
  "2026-06-15",
  "2026-06-20",
  "2026-07-09",
  "2026-08-17",
  "2026-10-12",
  "2026-11-23",
  "2026-12-08",
  "2026-12-25",
];
