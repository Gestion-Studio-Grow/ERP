/**
 * DATOS FISCALES DE UNA VENTA (R1-F5): lo que la factura de un inscripto necesita saber de la
 * venta misma, leído de la base y no armado a mano: la ficha fiscal del cliente (quién compra) y
 * lo cobrado por cada producto con su alícuota de IVA (`Product.alicuotaIva`).
 *
 * Lo usan, con los MISMOS datos, la promesa de Ventas (`puedeFacturarVenta`) y la emisión: así
 * la letra y el IVA que se prometen son los que se piden a ARCA.
 *
 * SERVIDOR: recibe la transacción del negocio (`tenantTransaction`), así que la venta de otro
 * negocio no se ve (RLS) y da `null`. No recibe el negocio por parámetro.
 */
import type { tenantTransaction } from "@/lib/rls";
import { centavosDe } from "@/lib/dinero/redondeo";
import type { FichaFiscal } from "./ficha-fiscal";
import type { RenglonConAlicuota } from "./impuestos-por-alicuota";

type TransaccionDelNegocio = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export interface DatosFiscalesDeVenta {
  /** Ficha fiscal del cliente de la venta; `null` si la venta no tiene cliente (mostrador). */
  receptor: FichaFiscal | null;
  /** Lo cobrado por cada producto, con el descuento de la venta ya repartido, y su alícuota. */
  renglones: RenglonConAlicuota[];
}

/** Un producto de la venta: lo que se cobró por él (sin el descuento general) y su alícuota. */
export interface ProductoVendido {
  lineTotal: number;
  alicuotaIva: number | null;
}

/**
 * Reparte el descuento de la venta entre sus productos, en proporción a lo que se cobró por cada
 * uno y al centavo (el centavo que sobra va al de mayor resto): la suma da exactamente lo vendido
 * menos el descuento. Así cada alícuota lleva su parte del descuento, como en la factura.
 * PURA. No inventa: si el descuento no se puede repartir (productos en cero o negativos, o un
 * descuento mayor que lo vendido) quedan los renglones como están, y el cálculo del IVA dice que
 * no suman lo cobrado (`MOTIVO_RENGLONES_NO_SUMAN`).
 */
export function renglonesDeLaVenta(venta: { items: readonly ProductoVendido[]; discount: number }): RenglonConAlicuota[] {
  const lineas = venta.items.map((i) => centavosDe(i.lineTotal));
  const suma = lineas.reduce((a, b) => a + b, 0);
  const descuento = centavosDe(venta.discount);
  const sePuedeRepartir = descuento > 0 && suma > 0 && descuento <= suma && lineas.every((c) => c >= 0);
  const partes = lineas.map(() => 0);
  if (sePuedeRepartir) {
    // En BigInt: descuento × línea puede pasar el entero exacto de un número de JS.
    const d = BigInt(descuento);
    const s = BigInt(suma);
    const restos = lineas.map((c, k) => {
      const producto = d * BigInt(c);
      partes[k] = Number(producto / s);
      return { k, resto: producto % s };
    });
    let sobra = descuento - partes.reduce((a, b) => a + b, 0);
    restos.sort((x, y) => (x.resto === y.resto ? x.k - y.k : x.resto > y.resto ? -1 : 1));
    for (const { k } of restos) {
      if (sobra <= 0) break;
      partes[k] += 1;
      sobra -= 1;
    }
  }
  return venta.items.map((i, k) => ({ total: (lineas[k] - partes[k]) / 100, alicuotaIva: i.alicuotaIva }));
}

/**
 * Lee la ficha del cliente y los renglones de UNA venta del negocio de la transacción. `null` si
 * la venta no existe o es de otro negocio.
 */
export async function leerDatosFiscalesDeVenta(tx: TransaccionDelNegocio, orderId: string): Promise<DatosFiscalesDeVenta | null> {
  const venta = await tx.order.findFirst({
    where: { id: orderId },
    select: {
      discount: true,
      client: { select: { docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true } },
      items: { orderBy: { id: "asc" }, select: { lineTotal: true, product: { select: { alicuotaIva: true } } } },
    },
  });
  if (!venta) return null;
  return {
    receptor: venta.client ?? null,
    renglones: renglonesDeLaVenta({
      items: venta.items.map((i) => ({ lineTotal: i.lineTotal, alicuotaIva: i.product?.alicuotaIva ?? null })),
      discount: venta.discount,
    }),
  };
}
