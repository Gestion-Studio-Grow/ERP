// La hoja del diseño nuevo de CH (estilos-ch.ts), UNA vez por página: la dibuja el layout de (site) sólo con
// el interruptor prendido. Componente de SERVIDOR a propósito: el string no viaja en el JS del navegador.
import { CSS_CH } from "./estilos-ch";

export default function PielCH() {
  return (
    <style href="ch-front-nuevo" precedence="default">
      {CSS_CH}
    </style>
  );
}
