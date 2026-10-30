// LA ETIQUETA DE PACK: la «foto» de los cortes que todavía no tienen foto real. Es el rótulo que
// MAGRA le pondría a su pack, como las etiquetas reales de Estancia Don Ramón de la foto del hero
// (marco oro sobre negro, un campo claro con el nombre grande, la línea de abajo): la marca, el
// nombre del corte en Bebas y «Envasado al vacío», con un sello MUY chico del animal y su región.
//
// Reemplaza al recorte ampliado del despiece (la QA lo vio como cuadros negros con líneas). Caja
// 4:5 fija (la pone el contenedor), todo medido en unidades del contenedor: sin CLS y legible
// tanto en la tarjeta de 120 px del celular como en la ficha. El peso aproximado por pack no
// existe como dato (DISENO.md §13.5): cuando el dueño lo pase, va en la línea de abajo.

import type { MagraAnimal } from "@/tenants/magra-content";
import { MiniDespiece } from "./Despiece";
import { regionDe } from "./despiece-datos";

export function EtiquetaDePack({
  nombre,
  animal,
  region,
  sello = true,
}: {
  nombre: string;
  animal: MagraAnimal | null;
  region: string | null;
  /** En la ficha va sin sello: ahí el «De dónde sale» ya tiene su dibujo (una sola vez). */
  sello?: boolean;
}) {
  const r = animal ? regionDe(animal, region) : null;
  const alt = `Etiqueta del pack de ${nombre.toLowerCase()} envasado al vacío${r ? `; sale de ${r.nombre.toLowerCase()}` : ""}`;
  return (
    <div className="mg-pack" role="img" aria-label={alt}>
      <div className="mg-pack-et" aria-hidden="true">
        <span className="mg-pack-marca">
          MA<b>G</b>RA
        </span>
        <span className="mg-pack-nom">{nombre}</span>
        <span className="mg-pack-pie">
          <span>Envasado al vacío</span>
          {sello && animal && (
            <span className="mg-pack-sello">
              <MiniDespiece animal={animal} region={region} recorte={false} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
