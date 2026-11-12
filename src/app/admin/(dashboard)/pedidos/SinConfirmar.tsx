"use client";

// ============================================================================
// PEDÍ LOCAL · «SIN CONFIRMAR HACE N MIN» — el chip rojo del tablero del comercio.
// ============================================================================
//
// Sólo pedidos de delivery local (extras[id].deliveryLocal) en PENDING desde hace 20 min o más
// (src/lib/delivery-local/reloj.ts): a los 30 el cliente ya puede bajarlo (términos). Los demás
// negocios no lo ven. La hora se toma en el navegador después de montar (sin desfase de
// hidratación) y se vuelve a mirar cada minuto.

import { useEffect, useState } from "react";
import { Marca } from "@/components/ui";
import { minutosSinConfirmar } from "@/lib/delivery-local/reloj";

export default function SinConfirmar({ status, creado }: { status: string; creado: string }) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    if (status !== "PENDING") return;
    const mirar = () => setAhora(Date.now());
    const primero = window.setTimeout(mirar, 0);
    const t = window.setInterval(mirar, 60_000);
    return () => {
      window.clearTimeout(primero);
      window.clearInterval(t);
    };
  }, [status]);
  if (ahora === null) return null;
  const n = minutosSinConfirmar({ status, creado, ahora });
  if (n === null) return null;
  return (
    <Marca tipo="atencion" className="text-danger">
      Sin confirmar hace {n} min
    </Marca>
  );
}
