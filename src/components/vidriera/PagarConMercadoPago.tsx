"use client";

// «Pagar ahora con Mercado Pago» en la página de Gracias (Magra T6a). Sólo se monta si el negocio
// tiene Mercado Pago disponible y la dirección trae el token del pedido (pago-de-la-tienda.server.ts).
// El monto no viaja: lo pone el servidor desde la base. Con el link en la mano, se abre Mercado Pago;
// el enlace queda visible por si el navegador no navega solo.
import { useActionState, useEffect } from "react";
import { pagarPedidoDeLaTienda, type EstadoPagoDeLaTienda } from "@/lib/cobros/pago-de-la-tienda-actions";

export default function PagarConMercadoPago({
  pedido,
  token,
  prueba,
  claseBoton,
  claseNota,
}: {
  pedido: string;
  token: string;
  /** Mercado Pago en modo de prueba: se avisa que el pago es del sandbox. */
  prueba: boolean;
  claseBoton: string;
  claseNota?: string;
}) {
  const [estado, pagar, pendiente] = useActionState<EstadoPagoDeLaTienda, FormData>(pagarPedidoDeLaTienda, null);
  const url = estado?.ok ? estado.url : null;

  useEffect(() => {
    if (url) window.location.assign(url);
  }, [url]);

  return (
    <form action={pagar} aria-busy={pendiente}>
      <input type="hidden" name="pedido" value={pedido} />
      <input type="hidden" name="t" value={token} />
      {url ? (
        <a href={url} className={claseBoton} rel="noopener noreferrer">
          Ir a Mercado Pago
        </a>
      ) : (
        <button type="submit" className={claseBoton} disabled={pendiente}>
          {pendiente ? "Abriendo Mercado Pago…" : "Pagar ahora con Mercado Pago"}
        </button>
      )}
      {prueba && <p className={claseNota}>Pago de prueba (sandbox)</p>}
      {estado && !estado.ok && (
        <p role="alert" className={claseNota}>
          {estado.error}
        </p>
      )}
    </form>
  );
}
