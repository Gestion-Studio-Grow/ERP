// ============================================================================
// Enviar un formulario a su acción SIN que React lo vacíe — para los client components de Stock
// y compras (Recibir mercadería, Mermas, Recuento, Proveedores, Devoluciones).
// ============================================================================
//
// POR QUÉ. Con `<form action={...}>`, React 19 vacía el formulario al terminar CUALQUIER envío,
// también el que volvió con error (react-dom 19.2.4: `requestFormReset` y después `form.reset()`
// en el commit). Medido en el código de React, no en pantalla: los campos de texto NO
// controlados (proveedor escrito, nota, CUIT, N° de orden, los datos de un proveedor) vuelven
// vacíos o a lo guardado, y los desplegables controlados vuelven a su primera opción EN
// PANTALLA mientras el estado sigue con la elegida (lo que se ve y lo que se manda dejan de
// coincidir). Eso contradice "todo error dice qué pasó y cómo seguir, sin perder lo cargado".
// Con `onSubmit` no hay vaciado automático: cada formulario vacía lo suyo sólo cuando salió bien.
//
// Además bloquea el doble envío: mientras la acción corre, `enviar` no hace nada (y los
// botones se deshabilitan con `enviando`).
//
// Sin imports de servidor: lo usan client components.

import { startTransition, useActionState, type FormEvent } from "react";

export function useEnvio<S>(accion: (prev: Awaited<S>, fd: FormData) => S | Promise<S>, inicial: Awaited<S>) {
  const [estado, despachar, enviando] = useActionState<S, FormData>(accion, inicial);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => despachar(fd));
  }
  return { estado, enviar, enviando };
}
