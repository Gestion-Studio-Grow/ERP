"use client";

// FACTOQUE · alta: el botón para activar a mano cuando el servidor no tiene el mail conectado (fix 11/11:
// prod decía «revisá tu mail» y el mail no salía). Envuelve la acción del alta sin tocar AltaAsistente:
// si la respuesta trae `activacion`, muestra el botón de WhatsApp (o de mail) con un texto que no lleva
// ningún dato del pedido. Con el mail conectado no aparece nada: la pantalla es la de siempre.
// Deuda: cuando AltaAsistente se libere, el botón va adentro, junto al aviso del alta.

import { useCallback, useState } from "react";
import type { ActivacionManual as Activacion, RespuestaDelPedido } from "@/lib/factoque/alta-web.server";
import type { CanalGsg } from "../contacto";
import { BOTON_PRINCIPAL, FOCO } from "../estilos";
import AltaAsistente from "./AltaAsistente";

export default function AltaConActivacion({
  canal,
  mpDisponible,
  pedirAlta,
}: {
  canal: CanalGsg;
  mpDisponible: boolean;
  pedirAlta: (f: FormData) => Promise<RespuestaDelPedido>;
}) {
  const [activacion, setActivacion] = useState<Activacion | null>(null);
  const pedir = useCallback(
    async (f: FormData) => {
      const r = await pedirAlta(f);
      setActivacion(r.ok && r.activacion ? r.activacion : null);
      return r;
    },
    [pedirAlta],
  );

  return (
    <>
      <AltaAsistente canal={canal} mpDisponible={mpDisponible} pedirAlta={pedir} />
      {activacion && (
        <div className="mt-6" data-qa="activacion-manual">
          <a href={activacion.enlace} target="_blank" rel="noopener noreferrer" className={`${BOTON_PRINCIPAL} ${FOCO}`}>
            {activacion.etiqueta}
          </a>
        </div>
      )}
    </>
  );
}
