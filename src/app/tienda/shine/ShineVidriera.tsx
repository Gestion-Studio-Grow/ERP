// La vidriera de Shine, entrada desde la página de la tienda. Componente de SERVIDOR a propósito (patrón
// quebienoles/QuebienolesVidriera.tsx): escribe la piel (estilos.ts) en el HTML una sola vez. Las letras
// van por next/font (fuentes.ts, importado por ShineFront.tsx). El resto es el front de cliente.

import ShineFront, { type PropsShine } from "./ShineFront";
import { CSS } from "./estilos";

export default function ShineVidriera(props: PropsShine) {
  return (
    <>
      <style>{CSS}</style>
      <ShineFront {...props} />
    </>
  );
}
