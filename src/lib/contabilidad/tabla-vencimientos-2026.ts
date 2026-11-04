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

const MESES_2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

/** Mismo escalonado para todos los meses del año (ejemplo). Índice = terminación del CUIT (0-9). */
function todoElAnio(dias: readonly number[]): Record<string, readonly number[]> {
  return Object.fromEntries(MESES_2026.map((m) => [m, dias]));
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
      mesesHastaVencimiento: 1,
      // provisional a confirmar
      diasPorMes: todoElAnio([18, 18, 19, 19, 20, 20, 21, 21, 22, 22]),
    },
    {
      codigo: "IIBB_LOCAL",
      nombre: "Ingresos brutos — contribuyente local",
      organismo: "Rentas provincial",
      periodicidad: "MENSUAL",
      mesesHastaVencimiento: 1,
      // provisional a confirmar (depende de la provincia)
      diasPorMes: todoElAnio([13, 13, 14, 14, 15, 15, 16, 16, 17, 17]),
    },
    {
      codigo: "CM03",
      nombre: "Convenio Multilateral — CM03 mensual",
      organismo: "COMARB",
      periodicidad: "MENSUAL",
      mesesHastaVencimiento: 1,
      // provisional a confirmar
      diasPorMes: todoElAnio([15, 15, 15, 16, 16, 16, 17, 17, 17, 18]),
    },
    {
      codigo: "AUTONOMOS",
      nombre: "Autónomos — aporte mensual",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      mesesHastaVencimiento: 1,
      // provisional a confirmar
      diasPorMes: todoElAnio([5, 5, 5, 5, 6, 6, 6, 7, 7, 7]),
    },
    {
      codigo: "SUSS",
      nombre: "Cargas sociales — F.931 (SUSS)",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      mesesHastaVencimiento: 1,
      // provisional a confirmar
      diasPorMes: todoElAnio([9, 9, 9, 9, 10, 10, 10, 11, 11, 11]),
    },
    {
      codigo: "GANANCIAS_ANTICIPO",
      nombre: "Ganancias — anticipo",
      organismo: "ARCA",
      periodicidad: "MENSUAL",
      mesesHastaVencimiento: 1,
      // provisional a confirmar
      diasPorMes: todoElAnio([13, 13, 13, 14, 14, 14, 15, 15, 15, 15]),
    },
  ],
};

/**
 * Feriados nacionales 2026 que corren un vencimiento al hábil siguiente — provisional a confirmar
 * (los puentes turísticos se fijan por decreto y no están acá).
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
