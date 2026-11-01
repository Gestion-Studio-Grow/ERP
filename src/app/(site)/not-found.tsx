// «No encontramos esta página» cuando una página del sitio dice `notFound()` (/reserva/turno/<id>, /reserva/confirmacion/<id>).
// Next dibuja el 404 ADENTRO del layout del sitio haya o no este archivo (probado 31/10 con el interruptor apagado: encabezado y
// 404 de Next): lo que cambia acá es sólo el cuerpo. Sin este archivo, el de la raíz volvía a poner el layout y salían dos
// encabezados.
//
// Con el «Diseño nuevo» de CH prendido: su piel y el camino de vuelta (P0-3). Apagado (o cualquier otro negocio): la hoja en
// castellano con el nombre de ese negocio. Una dirección que no existe la atiende src/app/not-found.tsx, que dibuja las mismas piezas.

import { chConDisenoNuevo } from "./_ch/diseno-ch.server";
import NoEncontradaCH from "./_ch/NoEncontradaCH";
import NoEncontradaDelNegocio from "./NoEncontradaDelNegocio";

export default async function NoEncontradaDelSitio() {
  if (!(await chConDisenoNuevo())) return <NoEncontradaDelNegocio />;
  return <NoEncontradaCH />;
}
