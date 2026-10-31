// «No encontramos esta página» en el sitio del negocio (P0-3, ronda 2): el 404 de Next en inglés no tiene camino de vuelta.
//
// Sólo con el «Diseño nuevo» de CH prendido: con su piel (la sirve PielCH desde el layout) y un link a la carta. Apagado (o
// cualquier otro negocio) se ve el 404 de Next de siempre: CH no cambia hasta que se prenda el interruptor. La ficha de un
// tratamiento tiene el suyo (servicios/[id]/not-found.tsx); una dirección que no existe la atiende src/app/not-found.tsx,
// que dibuja esta misma pieza.

import NotFoundDeNext from "next/dist/client/components/builtin/not-found";
import { chConDisenoNuevo } from "./_ch/diseno-ch.server";
import NoEncontradaCH from "./_ch/NoEncontradaCH";

export default async function NoEncontradaDelSitio() {
  if (!(await chConDisenoNuevo())) return <NotFoundDeNext />;
  return <NoEncontradaCH />;
}
