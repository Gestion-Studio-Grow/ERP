// La vidriera de Qué Bien Olés, entrada desde la página de la tienda. Componente de SERVIDOR a propósito:
// escribe la piel (estilos.ts, ~45 KB) en el HTML y le pasa el resto al front de cliente.
//
// Por qué no la escribe el front: un componente de cliente que importa la piel la arrastra al bundle del
// navegador, y el visitante la baja dos veces (en el HTML del servidor y adentro del JS), además de
// pagar su parseo. Desde acá viaja una sola vez. Los tokens que el cliente sí necesita (fondo, oro,
// didona) están en tokens.ts, sin el CSS.

import QuebienolesFront, { type PropsFront } from "./QuebienolesFront";
import { CSS } from "./estilos";

export default function QuebienolesVidriera(props: PropsFront) {
  return (
    <>
      <style>{CSS}</style>
      <QuebienolesFront {...props} />
    </>
  );
}
