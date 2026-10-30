// LA FICHA de un corte (contenido del `<dialog>` nativo que abre la etiqueta): de dónde sale, cómo
// se cocina, el precio por kilo y «¿Para cuántos comen?», que carga los kilos en la bolsa con la
// estimación de la casa. Sin texto genérico: la descripción por corte aparece cuando el dueño la
// mande (hoy no existe el dato), igual que el rango de peso por pack.

import { useState } from "react";
import {
  coccionesDe,
  GRAMOS_POR_PERSONA,
  packDeCorte,
  partesDelNombre,
  porcionesAKilos,
  regionDeCorte,
  type MagraAnimal,
} from "@/tenants/magra-content";
import { MiniDespiece } from "./Despiece";
import { EtiquetaDePack } from "./EtiquetaDePack";
import { regionDe } from "./despiece-datos";
import { altDelPack, Disponible, money, Stepper, unitLabel, unitPrice, type MagraProducto } from "./Etiqueta";

const PERSONAS = [2, 4, 6, 8] as const;
const NOMBRE_COCCION: Record<string, string> = {
  parrilla: "Parrilla",
  horno: "Horno",
  plancha: "Plancha",
  olla: "Olla",
  milanesas: "Milanesas",
};

export function FichaContenido({
  p,
  animal,
  enLaBolsa,
  notaDePeso,
  onAgregar,
  onCerrar,
}: {
  p: MagraProducto;
  animal: MagraAnimal | null;
  /** Lo que ya hay de este corte en la bolsa (0 si nada). */
  enLaBolsa: number;
  notaDePeso: string | null;
  onAgregar: (p: MagraProducto, cantidad: number) => void;
  onCerrar: () => void;
}) {
  const porPeso = p.saleUnit === "WEIGHT";
  const paso = porPeso ? 0.25 : 1;
  const [personas, setPersonas] = useState<number | null>(enLaBolsa > 0 || !porPeso ? null : 2);
  const [cantidad, setCantidad] = useState(enLaBolsa > 0 ? enLaBolsa : porPeso ? porcionesAKilos(2) : 1);
  const { nombre, proveedor, detalle } = partesDelNombre(p.name);
  const pack = packDeCorte(p.name);
  const regionId = animal ? regionDeCorte(animal, p.name) : null;
  const region = animal ? regionDe(animal, regionId) : null;
  const cocciones = coccionesDe(p.name);
  const agotado = p.disponibilidad === "sin-stock";

  const bump = (_: MagraProducto, dir: 1 | -1) => {
    setPersonas(null);
    setCantidad((c) => Math.max(paso, Math.round((c + dir * paso) * 100) / 100));
  };

  return (
    <div className="mg-ficha-in">
      <button type="button" className="mg-x" onClick={onCerrar} aria-label="Cerrar la ficha">
        ×
      </button>
      <div className="mg-ficha-vis">
        {pack ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pack.src} width={pack.width} height={pack.height} alt={altDelPack(p)} decoding="async" />
        ) : (
          // Sin foto real: la etiqueta del pack, sin sello (el «De dónde sale» de abajo ya lo dibuja).
          <EtiquetaDePack nombre={nombre} animal={animal} region={regionId} sello={false} />
        )}
      </div>
      <div className="mg-ficha-txt">
        {proveedor && <span className="mg-eyebrow">{proveedor}</span>}
        <h2 id="mg-ficha-t" className="mg-ficha-h">
          {nombre}
          {detalle && <small> {detalle}</small>}
        </h2>

        {animal && (
          <div className="mg-ficha-sale">
            <MiniDespiece animal={animal} region={regionId} recorte={false} />
            <div>
              <span className="mg-k">De dónde sale</span>
              <span className="mg-v">{region ? region.nombre : `${animal === "vaca" ? "La vaca" : animal === "cerdo" ? "El cerdo" : "El pollo"}, de varias partes`}</span>
            </div>
          </div>
        )}

        {cocciones.length > 0 && (
          <ul className="mg-ficha-cocc" aria-label="Cómo se cocina">
            {cocciones.map((c) => (
              <li key={c}>{NOMBRE_COCCION[c]}</li>
            ))}
          </ul>
        )}

        <p className="mg-ficha-pres">{porPeso ? "Envasado al vacío · se pesa al envasar" : "Envasado al vacío"}</p>

        <p className="mg-ficha-precio">
          {money.format(unitPrice(p))} <small>{unitLabel(p)}</small>
        </p>

        {porPeso && (
          <fieldset className="mg-cuantos">
            <legend>¿Para cuántos comen?</legend>
            <div className="mg-cuantos-op">
              {PERSONAS.map((n) => (
                <label key={n} className={personas === n ? "on" : undefined}>
                  <input
                    type="radio"
                    name={`personas-${p.id}`}
                    value={n}
                    checked={personas === n}
                    onChange={() => {
                      setPersonas(n);
                      setCantidad(porcionesAKilos(n));
                    }}
                  />
                  {n}
                </label>
              ))}
            </div>
            <p className="mg-cuantos-nota">
              Estimación de la casa: unos {GRAMOS_POR_PERSONA} g por persona. Se pesa al envasar.
            </p>
          </fieldset>
        )}

        <div className="mg-ficha-cant">
          <Stepper p={{ ...p, disponibilidad: undefined }} q={cantidad} onBump={bump} grande />
          <Disponible d={p.disponibilidad} />
        </div>
        {porPeso && notaDePeso && <p className="mg-nota-peso">{notaDePeso}</p>}
      </div>
      <div className="mg-ficha-pie">
        <button type="button" className="mg-btn mg-btn-oro" disabled={agotado} onClick={() => onAgregar(p, cantidad)}>
          {agotado ? "Sin stock" : "Agregar a mi bolsa"}
        </button>
      </div>
    </div>
  );
}
