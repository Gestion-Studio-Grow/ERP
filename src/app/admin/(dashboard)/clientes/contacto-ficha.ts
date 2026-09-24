// QUÉ OFRECE LA FICHA PARA ESCRIBIRLE A UNA CLIENTA.
//
// Antes, si el teléfono cargado no era un celular, el botón de WhatsApp simplemente no estaba:
// la recepción no sabía si faltaba el botón o si era el número, y no había cómo seguir. Ahora
// la ficha dice cuál de los tres casos es y, si se puede, cómo arreglarlo:
//   · pidió no recibir mensajes (Ley 25.326, art. 27): no se ofrece escribirle (la ficha ya lo
//     muestra con su insignia y su constancia);
//   · el número no es un celular argentino: se dice, y a quien puede editar, dónde corregirlo;
//   · si no, el botón.
//
// Client-safe y puro. El link lo arma `waLinkClienta`, la misma regla que la agenda.

import { waLinkClienta } from "@/lib/whatsapp-cta";

export type ContactoFicha =
  | { tipo: "whatsapp"; href: string }
  | { tipo: "no-quiere" }
  | { tipo: "sin-celular"; texto: string };

export function contactoDeLaFicha({
  telefono,
  noQuiere,
  puedeEditar,
}: {
  telefono: string | null | undefined;
  noQuiere: boolean;
  puedeEditar: boolean;
}): ContactoFicha {
  if (noQuiere) return { tipo: "no-quiere" };
  const href = waLinkClienta(telefono);
  if (href) return { tipo: "whatsapp", href };
  return {
    tipo: "sin-celular",
    texto: puedeEditar
      ? "El teléfono cargado no es un celular, así que no se le puede escribir por WhatsApp. Corregilo con “Editar datos”."
      : "El teléfono cargado no es un celular, así que no se le puede escribir por WhatsApp.",
  };
}
