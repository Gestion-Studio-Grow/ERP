"use client";

// «Mi cuenta» del dispositivo: al abrir el seguimiento, el pedido guardado al mandarlo (o el que ya
// tenía ese número) queda atado a ESTE link y con su último estado (src/lib/delivery-local/mi-cuenta.ts
// → `asociarSeguimiento`). Si en este navegador no hay un pedido que corresponda (un link reenviado),
// no se guarda nada. No dibuja nada y no manda nada al servidor.

import { useEffect } from "react";
import { asociarSeguimiento } from "@/lib/delivery-local/mi-cuenta";
import { cambiarCuenta } from "@/app/tienda/local/cuenta-del-dispositivo";

export default function RecordarSeguimiento({
  slug,
  token,
  code,
  estado,
  terminado,
}: {
  slug: string;
  token: string;
  code: string;
  estado: string;
  terminado: boolean;
}) {
  useEffect(() => {
    if (!slug || !token) return;
    cambiarCuenta(slug, (c) => asociarSeguimiento(c, { token, code, estado, terminado }, new Date()));
  }, [slug, token, code, estado, terminado]);
  return null;
}
