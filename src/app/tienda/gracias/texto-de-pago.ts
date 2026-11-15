// Cómo se paga, en el último paso de «Gracias» (vidriera nueva y Magra). PURA.
//
// Con el botón «Pagar con Mercado Pago» a la vista no se dice sólo «pagás al recibir»: se ofrece
// pagar ahora y, si no, lo de siempre (certificación T6a). Sin el botón, el texto de antes.

/** `medios` es el de `textoDeMediosDePago` ("Efectivo, transferencia y Mercado Pago." o ""). */
export function textoDePagoDeGracias(p: { marca: string; medios: string; conMercadoPago: boolean }): string {
  const medios = p.medios ? `${p.medios.charAt(0).toLowerCase()}${p.medios.slice(1)}` : "";
  if (p.marca === "magra") {
    if (p.conMercadoPago) {
      return `Te lo llevamos o lo retirás. Podés pagar ahora con Mercado Pago${medios ? ` o al recibir: ${medios}` : " o coordinar el pago con el local."}`;
    }
    return medios
      ? `Te lo llevamos o lo retirás. Pagás al recibir: ${medios}`
      : "Te lo llevamos o lo retirás. El medio de pago te lo confirmamos antes de cobrar.";
  }
  if (p.conMercadoPago) {
    return `Te lo mandamos o lo retirás. Podés pagar ahora con Mercado Pago${medios ? ` o al confirmar: ${medios}` : " o coordinar el pago con el local."}`;
  }
  if (p.marca === "shinevelas" && medios) return `Te lo mandamos o lo retirás. El pago se coordina al confirmar: ${medios}`;
  return "Te lo mandamos o lo retirás. El medio de pago y el envío te los confirmamos antes de cobrar.";
}
