"use client";

// «¿Ya sos alumno? Pedí tu link» (F9, M-005/M-006): el link viaja por WhatsApp al número registrado
// y NUNCA se muestra en pantalla. La respuesta es la misma exista o no el celular (no revela quién
// es alumno). En el turnero es un botón que abre una hoja; en /mis-clases sin cookie («Entrá con tu
// celular») va a la vista, en la página.

import { useRef, useState, useTransition } from "react";
import { pedirMiLink } from "@/lib/padel/acciones-alumno";
import { HojaPublica } from "./_hoja";
import { alerta, botonPrincipal, botonTexto, campo, etiqueta, listo } from "./_estilos";

function FormLink({ idCampo }: { idCampo: string }) {
  const tel = useRef<HTMLInputElement>(null);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const pedir = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setMsg(null);
      const r = await pedirMiLink(tel.current?.value ?? "");
      setMsg(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    });
  };
  return (
    <form onSubmit={pedir} noValidate className="grid gap-3">
      <div>
        <label htmlFor={idCampo} className={etiqueta}>
          Celular (WhatsApp)
        </label>
        <input ref={tel} id={idCampo} type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" className={campo} />
      </div>
      <button type="submit" disabled={pendiente} className={botonPrincipal} data-qa="pedir-link">
        {pendiente ? "Mandando…" : "Mandarme mi link"}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? listo : alerta} data-qa="respuesta-link">
          {msg.texto}
        </p>
      )}
    </form>
  );
}

export function YaSoyAlumno({ abierto: abiertoAlInicio = false }: { abierto?: boolean }) {
  const [abierta, setAbierta] = useState(abiertoAlInicio);
  return (
    <>
      <button type="button" className={botonTexto} onClick={() => setAbierta(true)} data-qa="ya-soy-alumno">
        ¿Ya sos alumno? Pedí tu link
      </button>
      <HojaPublica
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Pedí tu link"
        descripcion="Poné el celular con el que pediste clase. Te lo mandamos por WhatsApp a ese número."
        qa="hoja-link"
      >
        <FormLink idCampo="t-tel-link" />
      </HojaPublica>
    </>
  );
}

/** La versión en la página, para /mis-clases sin cookie. */
export function EntrarConCelular() {
  return <FormLink idCampo="m-tel-link" />;
}
