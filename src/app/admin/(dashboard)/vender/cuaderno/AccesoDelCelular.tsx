"use client";

// EL CELULAR DEL LOCAL COMO MOSTRADOR DE RESPALDO (E20 del mostrador: se corta la luz).
// Vender anda en el celular con datos (el cobro queda fijo abajo y el teclado grande sirve con
// guantes); la balanza por cable no. Lo que falta es poder ENTRAR con un toque: el acceso guardado
// en la pantalla de inicio y la sesión iniciada. Esta tarjeta lo explica y deja copiar o compartir
// el enlace de Vender. No instala nada ni pide permisos.

import { useState } from "react";

const RUTA_DE_VENDER = "/admin/vender";

export default function AccesoDelCelular() {
  const [aviso, setAviso] = useState<string | null>(null);

  async function compartir() {
    const url = `${window.location.origin}${RUTA_DE_VENDER}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Vender", url });
        setAviso("Listo: abrilo en el celular del local y guardalo en la pantalla de inicio.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Enlace copiado: mandátelo al celular del local y guardalo en la pantalla de inicio.");
    } catch {
      // Cancelado o sin permiso para el portapapeles: se muestra para copiarlo a mano.
      setAviso(`Copiá este enlace a mano: ${url}`);
    }
  }

  return (
    <section aria-labelledby="acceso-del-celular" className="rounded-lg border border-line bg-surface-raised p-4 text-sm">
      <h2 id="acceso-del-celular" className="text-base font-semibold text-strong">
        El celular del local, de respaldo
      </h2>
      <p className="mt-1 text-body">
        Si se corta la luz, Vender anda en el celular con datos (sin la balanza por cable: el peso, de la etiqueta del paquete o de la balanza a
        pila). Dejalo listo hoy, con señal:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-body">
        <li>Abrí Vender en el celular del local y entrá con tu usuario (la sesión queda iniciada).</li>
        <li>
          Guardalo en la pantalla de inicio: en Android, menú ⋮ → «Agregar a la pantalla principal»; en iPhone, Compartir → «Agregar a
          inicio».
        </li>
      </ol>
      <button
        type="button"
        onClick={compartir}
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 font-medium text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Mandar el enlace de Vender al celular
      </button>
      <p role="status" aria-live="polite" className="mt-2 break-all text-muted">
        {aviso}
      </p>
    </section>
  );
}
