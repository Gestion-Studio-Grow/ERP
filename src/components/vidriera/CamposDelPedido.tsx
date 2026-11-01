// Los campos ocultos del pedido de una tienda (ronda 2, P0-3): `productId`, `quantity` y `unitPrice` por renglón, y la
// clave anti-duplicado. Una sola pieza para las cuatro tiendas: antes cada bolsa los escribía a mano y sólo Magra
// mandaba el precio visto. El orden de los tres campos por renglón es el que lee `placeOnlineOrder`.
import { mandaPreciosVistos, type RenglonDelPedido } from "./bolsa";

export default function CamposDelPedido({ renglones, clave }: { renglones: readonly RenglonDelPedido[]; clave: string }) {
  const conPrecio = mandaPreciosVistos(renglones);
  return (
    <>
      {renglones.map((r) => (
        <span key={r.productId} hidden>
          <input type="hidden" name="productId" value={r.productId} />
          <input type="hidden" name="quantity" value={r.quantity} />
          {conPrecio && <input type="hidden" name="unitPrice" value={r.unitPrice ?? ""} />}
        </span>
      ))}
      {/* Sólo con renglones: con la bolsa vacía (el HTML del servidor) la clave no se dibuja y no hay desajuste al hidratar. */}
      {renglones.length > 0 && <input type="hidden" name="idempotencyKey" value={clave} />}
    </>
  );
}
