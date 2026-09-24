// El botón de WhatsApp de la casa, el mismo en la ficha, la bandeja, "Confirmar turnos de
// mañana" y los huecos de la lista de espera. Es LA acción de esas pantallas: en el celular va a
// lo ancho y más alto (48 px), para tocarlo sin apuntar; en la PC queda como estaba.
//
// Sólo clases: el <a> lo arma cada pantalla, porque cada una deja su constancia distinta.

import { buttonClasses } from "@/components/ui";

// `outline` para el que ya se usó ("WhatsApp de nuevo") o donde no es la acción principal.
export function claseBotonWhatsApp(variante: "solid" | "outline" = "solid"): string {
  return buttonClasses(
    variante,
    "md",
    "whitespace-nowrap max-sm:h-12 max-sm:w-full max-sm:text-base",
  );
}
