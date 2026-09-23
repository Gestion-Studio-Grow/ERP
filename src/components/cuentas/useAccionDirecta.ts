"use client";

// La acción del formulario, INVOCADA DIRECTO y esperada, en vez de `useActionState` +
// `<form action>`. Es el camino que ya probó el libro de caja (caja/libro/LibroForms.tsx): por
// el otro, el QA de recorrido midió ~4 de cada 10 guardados colgados en "Guardando…" con la
// fila ya escrita, y en plata eso termina en un segundo cobro tipeado encima del primero.
// Además, `<form action>` de React vacía los campos al terminar AUNQUE el servidor rechace:
// un pago rechazado por día cerrado perdía el número de cheque y el banco ya cargados.
//
// Acá: se espera la promesa, se muestra lo que dijo el servidor y, si salió bien, se pide la
// pantalla de nuevo (`router.refresh`) para ver el saldo y el historial nuevos.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoFormularioCuenta } from "@/lib/debts/formularios";

export type AccionDeCuenta = (prev: EstadoFormularioCuenta, formData: FormData) => Promise<EstadoFormularioCuenta>;

const INICIAL: EstadoFormularioCuenta = { estado: "inicial" };

export function useAccionDirecta(accion: AccionDeCuenta, alTerminarBien?: () => void) {
  const [estado, setEstado] = useState<EstadoFormularioCuenta>(INICIAL);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    startTransition(async () => {
      let res: EstadoFormularioCuenta;
      try {
        res = await accion(INICIAL, fd);
      } catch {
        // La acción no tira (devuelve su rechazo); si igual falla la red o el servidor, se
        // dice sin perder lo cargado.
        res = { estado: "error", mensaje: "No hubo respuesta del servidor. Revisá la conexión y volvé a intentar; lo que cargaste sigue acá." };
      }
      setEstado(res);
      if (res.estado === "ok") {
        alTerminarBien?.();
        router.refresh();
      }
    });
  }

  return { estado, enviar, pendiente };
}
