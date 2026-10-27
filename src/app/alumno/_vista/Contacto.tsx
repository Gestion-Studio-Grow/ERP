"use client";

// El canal con el profe, SIEMPRE (principio 6, A·E30): «Escribirle por WhatsApp» si el profe cargó
// su celular; si no, «Dejarle un mensaje», que entra a su bandeja. Con el link o la cookie, el
// mensaje va con el nombre del alumno; desde el turnero sin sesión, pide nombre y celular (llega
// marcado «sin verificar»: nadie se hace pasar por otro).

import { useRef, useState, useTransition } from "react";
import { dejarMensaje } from "@/lib/padel/acciones-alumno";
import { HojaPublica } from "@/app/clases/_hoja";
import { alerta, botonBorde, botonPrincipal, campo, etiqueta, listo } from "@/app/clases/_estilos";

export function Contacto({ wa, profe, token = null, conocido }: { wa: string | null; profe: string; token?: string | null; conocido: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const texto = useRef<HTMLTextAreaElement>(null);
  const nombre = useRef<HTMLInputElement>(null);
  const tel = useRef<HTMLInputElement>(null);

  if (wa) {
    return (
      <a href={wa} target="_blank" rel="noopener noreferrer" className={`${botonBorde} w-full`} data-qa="escribirle">
        <span aria-hidden>💬</span> Escribirle a {profe}
      </a>
    );
  }

  const mandar = () =>
    start(async () => {
      setMsg(null);
      const r = await dejarMensaje({ token, texto: texto.current?.value ?? "", nombre: nombre.current?.value, telefono: tel.current?.value });
      setMsg(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      if (r.ok && texto.current) texto.current.value = "";
    });

  return (
    <>
      <button type="button" className={`${botonBorde} w-full`} onClick={() => setAbierta(true)} data-qa="dejar-mensaje">
        <span aria-hidden>💬</span> Dejarle un mensaje a {profe}
      </button>
      <HojaPublica
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo={`Dejale un mensaje a ${profe}`}
        descripcion="Le llega a su agenda y te contesta por WhatsApp."
        qa="hoja-mensaje"
        pie={
          <button type="button" className={botonPrincipal} disabled={pendiente} onClick={mandar} data-qa="mandar-mensaje">
            {pendiente ? "Mandando…" : "Mandar mensaje"}
          </button>
        }
      >
        <div className="grid gap-3">
          {!conocido && (
            <>
              <div>
                <label htmlFor="m-nombre" className={etiqueta}>Tu nombre</label>
                <input ref={nombre} id="m-nombre" autoComplete="name" className={campo} />
              </div>
              <div>
                <label htmlFor="m-tel" className={etiqueta}>Tu celular (WhatsApp)</label>
                <input ref={tel} id="m-tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" className={campo} />
              </div>
            </>
          )}
          <div>
            <label htmlFor="m-texto" className={etiqueta}>Mensaje</label>
            <textarea ref={texto} id="m-texto" rows={4} maxLength={500} className={`${campo} py-3`} />
          </div>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={msg.ok ? listo : alerta} data-qa="respuesta-mensaje">
              {msg.texto}
            </p>
          )}
        </div>
      </HojaPublica>
    </>
  );
}
