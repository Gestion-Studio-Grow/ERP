// Los datos de la galería: del LABORATORIO (base erp_lab, MAGRA casa, 24/09/2026), leídos de la base y
// copiados acá para que la galería no consulte nada. Nombres «QA» son de la siembra de prueba. Lo que
// no sale del laboratorio lo dice («muestra»).

export interface PedidoDeMuestra {
  code: number;
  cliente: string;
  total: number;
  estado: "PENDING" | "CONFIRMED";
  canal: "tienda" | "mostrador";
  envio: boolean;
  cuando: string;
  lineas: number;
}

export const PEDIDOS_DEL_LABORATORIO: readonly PedidoDeMuestra[] = [
  { code: 483, cliente: "QA Cliente PC", total: 33900, estado: "PENDING", canal: "tienda", envio: false, cuando: "24/09 21:21", lineas: 1 },
  { code: 482, cliente: "QA Cliente Envío Canning", total: 57875, estado: "PENDING", canal: "tienda", envio: true, cuando: "24/09 21:10", lineas: 2 },
  { code: 481, cliente: "QA Cliente Retiro", total: 49100, estado: "PENDING", canal: "tienda", envio: false, cuando: "24/09 21:08", lineas: 2 },
  { code: 478, cliente: "Parrilla QA La Brasa", total: 234800, estado: "CONFIRMED", canal: "mostrador", envio: false, cuando: "24/09 20:09", lineas: 2 },
  { code: 473, cliente: "Catalina Rodríguez", total: 47946, estado: "PENDING", canal: "tienda", envio: false, cuando: "24/09 02:05", lineas: 2 },
  { code: 472, cliente: "Juan Paz", total: 40977.1, estado: "PENDING", canal: "tienda", envio: true, cuando: "23/09 23:55", lineas: 3 },
  { code: 468, cliente: "Alejandro Ortiz", total: 106089.9, estado: "PENDING", canal: "tienda", envio: false, cuando: "23/09 15:44", lineas: 4 },
  { code: 467, cliente: "Guadalupe Paz", total: 85731, estado: "PENDING", canal: "tienda", envio: true, cuando: "23/09 15:43", lineas: 2 },
];
