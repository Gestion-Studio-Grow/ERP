"use client";

// El script anti-flash del tema (AdminThemeScript) en su versión del diseño nuevo: el MISMO
// <script>, pero que no dispara el aviso de React al dibujarse en el navegador.
//
// Por qué: React sólo ejecuta un <script> que llega en el HTML del servidor. Cuando el mismo
// elemento se dibuja del lado del cliente (después de entrar, al volver a pintar el ingreso tras
// una clave equivocada, al navegar a la consola) no lo ejecuta y, en desarrollo, avisa por consola
// «Encountered a script tag while rendering React component». Ese aviso rompía la regla de cero
// errores de consola de los recorridos.
//
// Cómo: mientras el HTML viene del servidor o se está hidratando, el script sale igual que siempre
// (sin `type`: corre al leerse el HTML, antes de la primera pintura). Una vez hidratado, o si el
// elemento nace en el navegador, lleva `type="text/plain"`: para el navegador es un bloque de datos
// (nunca iba a correr igual) y React no avisa. El tema ya quedó puesto en la primera pintura; del
// lado del cliente lo sigue manejando ThemeToggle.

import { useSyncExternalStore } from "react";

/** El `type` del script: ninguno mientras viene del servidor; «text/plain» si nace en el navegador. */
export function tipoDelScriptDelTema(delServidor: boolean): "text/plain" | undefined {
  return delServidor ? undefined : "text/plain";
}

const sinSuscripcion = () => () => {};

export function ScriptDelTema({ codigo }: { codigo: string }) {
  // Servidor e hidratación: `true` (getServerSnapshot). Montado en el navegador: `false`.
  const delServidor = useSyncExternalStore(
    sinSuscripcion,
    () => false,
    () => true,
  );
  return <script type={tipoDelScriptDelTema(delServidor)} dangerouslySetInnerHTML={{ __html: codigo }} />;
}
