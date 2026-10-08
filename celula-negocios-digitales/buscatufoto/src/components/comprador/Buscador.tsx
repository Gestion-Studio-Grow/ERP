"use client";

import { useId, useRef, useState } from "react";
import { Boton, Dialogo, IconoCerrar, IconoSelfie } from "@/components/ui";
import s from "./comprador.module.css";

/**
 * El momento protagonista: escribís tu dorsal y la galería se ordena alrededor tuyo.
 * Sólo dígitos (hasta 5); la normalización (sin ceros adelante) la hace quien filtra.
 */
export function Buscador({ numero, onNumero }: { numero: string; onNumero: (v: string) => void }) {
  const id = useId();
  const [selfie, setSelfie] = useState(false);
  const refNumero = useRef<HTMLInputElement>(null);
  return (
    <div className={s.buscador}>
      <div className={s.buscadorTexto}>
        <h2 className="titulo-m">Encontrá tus fotos</h2>
        <p>Escribí el número de tu dorsal y te mostramos sólo las fotos donde aparecés.</p>
      </div>
      <div className={s.bloque}>
        <form role="search" aria-label="Buscar por número" onSubmit={(e) => e.preventDefault()} className={s.formNumero}>
          <label htmlFor={id} className={s.etiquetaNumero}>
            Tu número
          </label>
          <div className={s.campoNumero}>
            <span className={s.numeral} aria-hidden>
              #
            </span>
            <input
              ref={refNumero}
              id={id}
              className={`mono ${s.entradaNumero}`}
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="search"
              autoComplete="off"
              maxLength={5}
              placeholder="1043"
              value={numero}
              onChange={(e) => onNumero(e.target.value.replace(/\D/g, "").slice(0, 5))}
            />
            {numero ? (
              <Boton variante="fantasma" icono aria-label="Borrar el número" onClick={() => onNumero("")}>
                <IconoCerrar />
              </Boton>
            ) : null}
          </div>
        </form>
        <div className={s.acciones}>
          <Boton variante="secundario" onClick={() => setSelfie(true)}>
            <IconoSelfie /> Buscar con una selfie
          </Boton>
        </div>
      </div>
      <Dialogo abierto={selfie} onCerrar={() => setSelfie(false)} titulo="Búsqueda con selfie: próximamente">
        <div className={s.texto}>
          <p>
            Todavía no está. Queremos que la búsqueda por rostro corra entera en tu navegador, sin mandar tu cara a ningún servidor, y que
            esté bien probada antes de ofrecerla.
          </p>
          <p>Mientras tanto, buscate por tu número de dorsal o mirá la galería completa: es rápido.</p>
          <Boton
            variante="primario"
            onClick={() => {
              setSelfie(false);
              // el diálogo nativo devuelve el foco al botón que lo abrió; después lo llevamos al número
              requestAnimationFrame(() => refNumero.current?.focus());
            }}
          >
            Buscar por número
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}
