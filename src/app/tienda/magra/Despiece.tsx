// El DESPIECE de MAGRA en pantalla: el momento protagonista de la vidriera (DISENO.md §1.2).
//
//   · `Despiece` — la lámina del animal elegido. Tocar o hacer clic en una región la elige y filtra
//     la carta; pasar el mouse sólo la ilumina y dice el nombre (filtrar con el hover movería la
//     carta debajo del puntero: CLS sin un toque que lo justifique). Para el teclado y los lectores
//     de pantalla, las mismas regiones son los botones de abajo (nombre y cuántos cortes): con el
//     foco en uno, su región se ilumina en el dibujo. Así cada objetivo táctil mide 48 px o más
//     (en el celular, el dibujo entero mide 350 px: una región como la entraña no llega a 20).
//   · `SpriteDespiece` — los tres animales una sola vez, ocultos, para que las etiquetas y la ficha
//     los reusen con `<use>` sin repetir el dibujo en cada tarjeta.
//   · `MiniDespiece` — el animal recortado alrededor de la región del corte, con la región en oro:
//     la «foto» de los cortes que no tienen foto real. Es ilustración de marca, honesta.
//
// Sin 3D, sin librerías: SVG en línea, liviano y accesible.

import { useState } from "react";
import type { MagraAnimal } from "@/tenants/magra-content";
import { ANIMALES, ENCUADRE, cajaDelRecorte, camino, centro, regionDe } from "./despiece-datos";

const plural = (n: number) => (n === 1 ? "1 corte" : `${n} cortes`);

export function Despiece({
  animal,
  region,
  conteo,
  onElegir,
}: {
  animal: MagraAnimal;
  region: string | null;
  /** Cortes de hoy por región. */
  conteo: Record<string, number>;
  onElegir: (region: string | null) => void;
}) {
  const a = ANIMALES[animal];
  const [vista, setVista] = useState<string | null>(null);
  const mostrada = regionDe(animal, vista ?? region);

  const elegir = (id: string) => onElegir(region === id ? null : id);

  return (
    <div className="mg-desp">
      <svg
        className="mg-desp-svg"
        viewBox={ENCUADRE}
        role="img"
        aria-label={`Despiece de ${a.nombre.toLowerCase()}${mostrada ? `, marcada: ${mostrada.nombre.toLowerCase()}` : ""}`}
      >
        <path className="mg-desp-trazo" d={a.trazo} aria-hidden="true" />
        {a.regiones.map((r) =>
          r.puntos ? (
            <path
              key={r.id}
              d={camino(r.puntos)}
              className={`mg-desp-reg${region === r.id ? " on" : ""}${vista === r.id ? " vista" : ""}`}
              onClick={() => elegir(r.id)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setVista(r.id)}
              onPointerLeave={() => setVista(null)}
            />
          ) : null,
        )}
        <g aria-hidden="true" className="mg-desp-rotulos">
          {a.regiones.map((r) => {
            if (!r.puntos || r.rotulo === null) return null;
            const [x, y] = r.rotulo ?? centro(r.puntos);
            const lineas = r.nombre.split(" · ");
            return (
              <text key={r.id} x={x} y={y - (lineas.length - 1) * 12} textAnchor="middle" className={region === r.id ? "on" : undefined}>
                {lineas.map((l, i) => (
                  <tspan key={l} x={x} dy={i === 0 ? 8 : 24}>
                    {l}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>
      </svg>
      {/* Lo que se está mirando, sin mover nada: alto fijo reservado (CLS 0). */}
      <p className="mg-desp-vista" aria-hidden="true">
        {mostrada ? (
          <>
            <b>{mostrada.nombre}</b> · {plural(conteo[mostrada.id] ?? 0)}
          </>
        ) : (
          "Tocá una parte del dibujo"
        )}
      </p>
      {/* Las mismas partes como botones: las chicas (entraña) y las que no tienen dibujo
          («De varias partes») se eligen acá. En el celular, una fila que se corre de costado. */}
      <div className="mg-desp-chips" role="group" aria-label={`Partes de ${a.nombre.toLowerCase()}`}>
        {a.regiones.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`mg-chip${region === r.id ? " on" : ""}`}
            aria-pressed={region === r.id}
            onClick={() => elegir(r.id)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setVista(r.id)}
            onPointerLeave={() => setVista(null)}
            onFocus={() => setVista(r.id)}
            onBlur={() => setVista(null)}
          >
            {r.nombre}{" "}
            <span className="mg-chip-n">
              {conteo[r.id] ?? 0}
              <span className="mg-sr"> {(conteo[r.id] ?? 0) === 1 ? "corte" : "cortes"}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Los tres animales, una vez, para los `<use>` de las etiquetas y la ficha. */
export function SpriteDespiece() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        {Object.values(ANIMALES).map((a) => (
          <g key={a.id} id={`mg-a-${a.id}`}>
            <path d={a.trazo} vectorEffect="non-scaling-stroke" />
            {a.regiones.map((r) =>
              r.puntos ? <path key={r.id} id={`mg-r-${a.id}-${r.id}`} d={camino(r.puntos)} vectorEffect="non-scaling-stroke" /> : null,
            )}
          </g>
        ))}
      </defs>
    </svg>
  );
}

/**
 * El animal con la región del corte en oro. `recorte` = encuadre 4:5 alrededor de la región (la
 * «foto» de la etiqueta); sin recorte, el animal entero (la ficha, «De dónde sale»).
 */
export function MiniDespiece({
  animal,
  region,
  recorte = true,
  titulo,
  className,
}: {
  animal: MagraAnimal;
  region: string | null;
  recorte?: boolean;
  /** Texto accesible; sin él, el dibujo es decorativo. */
  titulo?: string;
  className?: string;
}) {
  const r = regionDe(animal, region);
  const caja = recorte ? cajaDelRecorte(animal, region) : ENCUADRE;
  return (
    <svg
      className={`mg-mini${className ? ` ${className}` : ""}`}
      viewBox={caja}
      preserveAspectRatio="xMidYMid meet"
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <use href={`#mg-a-${animal}`} />
      {r?.puntos && <use href={`#mg-r-${animal}-${r.id}`} className="on" />}
    </svg>
  );
}
