// «CONFIRMAR TODO» del pedido de WhatsApp (Magra · tanda practicidad, V-5). PURO.
//
// Un toque confirma los renglones puestos, sin confirmar, completos (sin `problema`) y sin dudas del
// lector sobre el producto que quedó elegido. Los que traen una duda («Pidió 8: van 2 paquetes de
// 6», «se vende por unidad») se cuentan aparte: ésos se miran y se confirman de a uno con «Está
// bien», que es donde se confirmaba sin mirar.

export type RenglonAConfirmar = {
  key: string;
  productId: string;
  confirmado: boolean;
  quitado: boolean;
  propuesto: { productId: string | null; dudas: readonly string[] } | null;
};

export function confirmablesDeUnToque(vista: readonly { r: RenglonAConfirmar; problema: string | null }[]): { claves: string[]; conDudas: number } {
  const claves: string[] = [];
  let conDudas = 0;
  for (const { r, problema } of vista) {
    if (r.quitado || r.confirmado || problema !== null) continue;
    const dudas = r.propuesto && r.propuesto.productId === r.productId ? r.propuesto.dudas.length : 0;
    if (dudas > 0) conDudas++;
    else claves.push(r.key);
  }
  return { claves, conDudas };
}
