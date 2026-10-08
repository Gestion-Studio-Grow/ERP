"use client";

import { useEffect } from "react";
import { Boton, Dialogo, IconoFlecha, IconoMas, IconoTilde } from "@/components/ui";
import type { Medio } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { duracionTexto, nombreMedio } from "./textos";

/**
 * Visor ampliado: muestra la VISTA PREVIA marcada (≤ 1280 px), nunca el original.
 * Flechas del teclado para moverse dentro de la lista que se está viendo (filtrada o completa).
 */
export function Visor({
  lista,
  actualId,
  indiceAlbum,
  elegida,
  onIr,
  onAlternar,
  onCerrar,
}: {
  lista: Medio[];
  actualId: string | null;
  indiceAlbum: (id: string) => number;
  elegida: (id: string) => boolean;
  onIr: (id: string) => void;
  onAlternar: (id: string) => void;
  onCerrar: () => void;
}) {
  const pos = actualId ? lista.findIndex((m) => m.id === actualId) : -1;
  const medio = pos >= 0 ? lista[pos] : null;
  const anterior = pos > 0 ? lista[pos - 1] : null;
  const siguiente = pos >= 0 && pos < lista.length - 1 ? lista[pos + 1] : null;
  const abierto = !!medio;

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && anterior) {
        e.preventDefault();
        onIr(anterior.id);
      } else if (e.key === "ArrowRight" && siguiente) {
        e.preventDefault();
        onIr(siguiente.id);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, anterior, siguiente, onIr]);

  const nombre = medio ? nombreMedio(medio, indiceAlbum(medio.id)) : "";
  const sel = medio ? elegida(medio.id) : false;

  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} ancho titulo={medio ? `${nombre} · ${pos + 1} de ${lista.length}` : ""}>
      {medio ? (
        <div className={s.visor}>
          <div className={s.visorMarco}>
            <Miniatura
              key={medio.id}
              blob={medio.previa}
              alt={`Vista previa con marca de agua de ${nombre.toLowerCase()}`}
              ancho={medio.ancho || undefined}
              alto={medio.alto || undefined}
              ansiosa
            />
            {anterior ? (
              <Boton
                className={`${s.visorNav} ${s.flechaIzq}`}
                data-lado="izq"
                icono
                variante="secundario"
                aria-label="Anterior"
                onClick={() => onIr(anterior.id)}
              >
                <IconoFlecha />
              </Boton>
            ) : null}
            {siguiente ? (
              <Boton className={s.visorNav} data-lado="der" icono variante="secundario" aria-label="Siguiente" onClick={() => onIr(siguiente.id)}>
                <IconoFlecha />
              </Boton>
            ) : null}
          </div>
          <div className={s.visorPie}>
            <div className={s.visorDatos}>
              {medio.dorsales.length ? (
                <div className={s.chips} aria-label="Dorsales en esta foto">
                  {medio.dorsales.map((d) => (
                    <span key={d} className={s.chip}>
                      {d}
                    </span>
                  ))}
                </div>
              ) : (
                <span>Sin dorsales cargados.</span>
              )}
              <span>
                {medio.tipo === "video"
                  ? `Video${medio.duracion != null ? ` de ${duracionTexto(medio.duracion)}` : ""}: acá ves un cuadro con marca. El video completo, sin marca, lo descargás después de pagar.`
                  : "Vista previa con marca de agua. El original, sin marca y en tamaño completo, lo descargás después de pagar."}
              </span>
            </div>
            <Boton variante={sel ? "secundario" : "primario"} aria-pressed={sel} onClick={() => onAlternar(medio.id)}>
              {sel ? <IconoTilde /> : <IconoMas />}
              {sel ? "Quitar del carrito" : "Agregar al carrito"}
            </Boton>
          </div>
        </div>
      ) : null}
    </Dialogo>
  );
}
