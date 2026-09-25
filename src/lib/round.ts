/**
 * `round2`: el importe redondeado al centavo, con LA regla de la plata del sistema
 * (`src/lib/dinero/redondeo.ts`, ENG-109 y ADR-100 §3, que deroga ADR-057 §2).
 *
 * Medio centavo hacia arriba, lejos del cero, y un `number` vale lo que dicen sus
 * 15 cifras significativas: 1,005 → 1,01; 2,135 → 2,14; −2,675 → −2,68.
 * La versión anterior sumaba un épsilon de máquina antes de multiplicar por 100 y
 * bajaba 587.189 de los 10.000.000 de x,xx5 entre $0 y $100.000 (2,135 daba 2,13).
 *
 * Queda con la misma firma para sus llamadas de hoy; el código nuevo usa el módulo.
 *
 * Nota: `round3` (cantidades en kg del ledger de stock) vive en `stock/ledger.ts` — no es
 * dinero y no se toca acá.
 */
export { redondearAlCentavo as round2 } from "@/lib/dinero/redondeo";
