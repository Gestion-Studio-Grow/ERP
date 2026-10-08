"use client";

import { useState, type FormEvent } from "react";
import { AreaTexto, Aviso, Boton, Entrada, ModoDemo } from "@/components/ui";
import { CORREO_CONTACTO } from "@/lib/contenido/textos";
import s from "./paginas.module.css";

/** Formulario de contacto de la demo: valida y NO envía nada; lo avisa con claridad. */
export function FormContacto() {
  const [enviado, setEnviado] = useState(false);

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEnviado(true);
  };

  return (
    <form className={s.formContacto} onSubmit={enviar} aria-labelledby="titulo-soporte">
      <div className={s.formCabeza}>
        <h2 id="titulo-soporte">Soporte</h2>
        <ModoDemo />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14.5 }}>
        Contanos qué pasó: en qué álbum o pantalla estabas, qué hiciste y qué esperabas que pase.
      </p>
      <Entrada etiqueta="Nombre" name="nombre" autoComplete="name" required onChange={() => setEnviado(false)} />
      <Entrada etiqueta="Email" name="email" type="email" autoComplete="email" required onChange={() => setEnviado(false)} />
      <AreaTexto etiqueta="Mensaje" name="mensaje" rows={5} required onChange={() => setEnviado(false)} />
      <div>
        <Boton type="submit" variante="primario">
          Enviar
        </Boton>
      </div>
      {enviado ? (
        <Aviso tono="demo">
          <span>
            <strong>Modo demostración: el mensaje no se envió.</strong> Escribinos a{" "}
            <a href={`mailto:${CORREO_CONTACTO}`}>{CORREO_CONTACTO}</a> (provisional a confirmar).
          </span>
        </Aviso>
      ) : null}
    </form>
  );
}
