"use client";

import { createContext } from "react";

/**
 * Un formulario que se envía con `onSubmit` (no con `action`, que React 19 vacía al terminar aunque haya fallado) avisa por
 * acá que está enviando: `SubmitButton` se deshabilita igual que con `useFormStatus`.
 */
export const EnvioEnCurso = createContext(false);
