// ============================================================================
// REGLAS A LA VISTA — una frase por pantalla con la regla que más sorprende, TOMADA DEL CÓDIGO.
// ============================================================================
//
// Cada frase dice lo que el sistema HACE, no lo que convendría que hiciera. Si la regla cambia en
// el código, la frase cambia acá (reglas-a-la-vista.test.ts ata cada frase a su fuente):
//
//   · vender  → order-anulacion.ts `fronteraDeVenta` / `mensajeVentaEnDiaCerrado`: con el día de
//               caja cerrado, una venta COBRADA no entra al libro; la salida es dejarla sin cobrar
//               y marcarla cobrada cuando la caja vuelve a abrir.
//   · caja    → cash-sale.ts + cash-register.ts: el arqueo del turno cuenta sólo el EFECTIVO; lo
//               cobrado por Mercado Pago o transferencia va al libro, no al cajón.
//   · cierre  → order-anulacion.ts `planAnulacionVenta` ("dia-cerrado"): un día cerrado no se
//               toca; la devolución va como egreso con la fecha de hoy.
//   · ventas  → factura-viva.ts `mensajeFacturaViva`: una venta con factura autorizada no se anula
//               acá; primero va la nota de crédito, que el sistema todavía no emite.
//
// Se muestran sólo en un negocio de mostrador (la LineaDeEstado del diseño nuevo): CH no cambia.
// PURO.

export type PantallaConRegla = "vender" | "caja" | "cierre" | "ventas";

export const REGLAS_A_LA_VISTA: Readonly<Record<PantallaConRegla, string>> = {
  vender: "Con el día de caja cerrado, una venta cobrada no entra: se registra sin cobrar y se marca cobrada cuando la caja vuelve a abrir.",
  caja: "El arqueo del turno cuenta sólo el efectivo: lo cobrado por Mercado Pago o transferencia va al libro, no al cajón.",
  cierre: "Un día cerrado no se toca: sus ventas ya no se anulan y una devolución va como egreso con la fecha de hoy.",
  ventas: "Una venta con factura autorizada no se anula acá: primero va la nota de crédito, que el sistema todavía no emite.",
};

/** La frase de la pantalla, sólo en un negocio de mostrador; `null` en el resto (CH). */
export function reglaALaVista(pantalla: PantallaConRegla, mostrador: boolean): string | null {
  return mostrador ? REGLAS_A_LA_VISTA[pantalla] : null;
}
