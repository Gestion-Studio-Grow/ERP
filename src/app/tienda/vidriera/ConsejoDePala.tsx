"use client";

// «¿Cuál te conviene?» (A Dos Manos). El catálogo no tiene nivel, forma ni balance de cada pala,
// así que esto NO es un filtro que finja saberlos: es una consulta armada. Se eligen nivel y juego y
// se abre WhatsApp con la pregunta ya escrita, al número del local. Sin número publicado, no se dibuja.

import { useState } from "react";
import s from "./vidriera.module.css";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import { IconoWhatsApp } from "./Iconos";

const NIVELES = ["Empiezo", "Intermedio", "Avanzado"] as const;
const JUEGOS = ["Control", "Equilibrio", "Potencia"] as const;

export function ConsejoDePala({ whatsapp }: { whatsapp: string }) {
  const [nivel, setNivel] = useState<(typeof NIVELES)[number]>("Intermedio");
  const [juego, setJuego] = useState<(typeof JUEGOS)[number]>("Equilibrio");
  const texto = `¡Hola A Dos Manos! Juego en nivel ${nivel.toLowerCase()} y busco una pala de ${juego.toLowerCase()}. ¿Cuál me recomendás?`;
  return (
    <div className={s.consejo}>
      <p>Contanos cómo jugás y te decimos cuál de estas te recomendamos.</p>
      <div>
        <span className={s.kicker} id="consejo-nivel">
          Tu nivel
        </span>
        <div className={s.opciones} role="group" aria-labelledby="consejo-nivel">
          {NIVELES.map((n) => (
            <button key={n} type="button" aria-pressed={nivel === n} onClick={() => setNivel(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className={s.kicker} id="consejo-juego">
          Tu juego
        </span>
        <div className={s.opciones} role="group" aria-labelledby="consejo-juego">
          {JUEGOS.map((j) => (
            <button key={j} type="button" aria-pressed={juego === j} onClick={() => setJuego(j)}>
              {j}
            </button>
          ))}
        </div>
      </div>
      <a className={s.btn} href={buildWhatsAppHref(whatsapp, texto)} target="_blank" rel="noopener noreferrer">
        <IconoWhatsApp /> Pedir la recomendación
      </a>
    </div>
  );
}
