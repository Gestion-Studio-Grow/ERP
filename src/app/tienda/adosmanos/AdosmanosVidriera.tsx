// La vidriera de A Dos Manos, entrada desde la página de la tienda. Componente de SERVIDOR a propósito
// (patrón quebienoles/QuebienolesVidriera.tsx y shine/ShineVidriera.tsx): escribe la piel (estilos.ts) en
// el HTML una sola vez y no viaja en el JS del navegador. Las letras van por next/font (fuentes.ts,
// importado por AdosmanosFront.tsx). El resto es el front de cliente.

import AdosmanosFront, { type PropsAdosmanos } from "./AdosmanosFront";
import { CSS } from "./estilos";
import { PROMESAS } from "./tokens";
import { copySinPromesasApagadas } from "./promesas";

export default function AdosmanosVidriera(props: PropsAdosmanos) {
  return (
    <>
      <style>{CSS}</style>
      {/* Las promesas apagadas no viajan al navegador (ronda 2): se filtran acá, en el servidor. */}
      <AdosmanosFront {...props} copy={copySinPromesasApagadas(props.copy, PROMESAS)} />
    </>
  );
}
