"use client";

import { memo, type CSSProperties } from "react";
import { IconoMas, IconoTilde, IconoVideo } from "@/components/ui";
import type { Medio } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { duracionTexto, listaDorsales, nombreMedio } from "./textos";

export interface EntradaGaleria {
  medio: Medio;
  /** posición en el álbum completo */
  indice: number;
}

/**
 * Grilla de miniaturas marcadas. Nunca toca el original: sólo `medio.miniatura`.
 * 2 columnas en el celular; filas justificadas por proporción desde 640 px.
 */
export function Galeria({
  entradas,
  elegidos,
  dorsalBuscado,
  onAlternar,
  onAbrir,
}: {
  entradas: EntradaGaleria[];
  elegidos: ReadonlySet<string>;
  dorsalBuscado: string;
  onAlternar: (id: string) => void;
  onAbrir: (id: string) => void;
}) {
  return (
    <ul className={s.galeria}>
      {entradas.map((e) => (
        <TarjetaMedio
          key={e.medio.id}
          medio={e.medio}
          indice={e.indice}
          elegida={elegidos.has(e.medio.id)}
          dorsalBuscado={dorsalBuscado}
          onAlternar={onAlternar}
          onAbrir={onAbrir}
        />
      ))}
    </ul>
  );
}

const TarjetaMedio = memo(function TarjetaMedio({
  medio,
  indice,
  elegida,
  dorsalBuscado,
  onAlternar,
  onAbrir,
}: {
  medio: Medio;
  indice: number;
  elegida: boolean;
  dorsalBuscado: string;
  onAlternar: (id: string) => void;
  onAbrir: (id: string) => void;
}) {
  const ancho = medio.ancho || 4;
  const alto = medio.alto || 3;
  const proporcion = ancho / alto;
  const estilo = {
    "--proporcion": `${ancho} / ${alto}`,
    "--crece": (proporcion * 100).toFixed(2),
    "--base": `${Math.round(proporcion * 210)}px`,
  } as CSSProperties;
  const nombre = nombreMedio(medio, indice);
  const alt =
    `Ampliar ${nombre.toLowerCase()}` + (medio.dorsales.length ? `, ${medio.dorsales.length === 1 ? "dorsal" : "dorsales"} ${listaDorsales(medio.dorsales)}` : "");
  return (
    <li className={s.item} style={estilo} data-elegida={elegida}>
      <button type="button" className={s.abrir} onClick={() => onAbrir(medio.id)}>
        <Miniatura blob={medio.miniatura} alt={alt} ancho={ancho} alto={alto} />
        {medio.tipo === "video" ? (
          <span className={s.insigniaVideo}>
            <IconoVideo /> Video{medio.duracion != null ? <span className="mono">{duracionTexto(medio.duracion)}</span> : null}
          </span>
        ) : null}
        {medio.dorsales.length ? (
          <span className={s.dorsalesMini} aria-hidden>
            {medio.dorsales.slice(0, 3).map((d) => (
              <span key={d} className={d === dorsalBuscado ? s.coincide : undefined}>
                {d}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      <span className={s.tilde} aria-hidden>
        <IconoTilde />
      </span>
      <button type="button" className={s.agregar} aria-pressed={elegida} onClick={() => onAlternar(medio.id)}>
        {elegida ? <IconoTilde /> : <IconoMas />}
        {elegida ? "Quitar" : "Agregar"}
        <span className="sr-only"> {nombre.toLowerCase()}</span>
      </button>
    </li>
  );
});
