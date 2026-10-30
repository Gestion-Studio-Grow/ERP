// LA ETIQUETA de cada corte: como el rótulo de los packs reales de Estancia Don Ramón (filete oro
// sobre carbón, el nombre grande, el proveedor, el precio por kilo). Toda la etiqueta abre la ficha
// (un botón estirado sobre la tarjeta); el «−/+» queda por encima y suma a la bolsa sin abrirla.

import { memo } from "react";
import { formatearCantidad } from "@/lib/pos-peso";
import { etiquetaDeDisponibilidad, type Disponibilidad } from "../reglas-tienda";
import { packDeCorte, partesDelNombre, type MagraAnimal } from "@/tenants/magra-content";
import { EtiquetaDePack } from "./EtiquetaDePack";

export type MagraProducto = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  /** "Sin stock" / "Últimas unidades", ya decidido en el servidor (nunca el número). */
  disponibilidad?: Disponibilidad;
};

export const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const unitPrice = (p: MagraProducto) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
export const unitLabel = (p: MagraProducto) => (p.saleUnit === "WEIGHT" ? "/ kg" : "/ u");
export const cantidadConUnidad = (p: MagraProducto, q: number) =>
  q > 0 ? `${formatearCantidad(q)} ${p.saleUnit === "WEIGHT" ? "kg" : "u"}` : "0";

/** «Sin stock» / «Últimas unidades», sin el número (lo decide el servidor, reglas-tienda.ts). */
export function Disponible({ d }: { d: Disponibilidad | undefined }) {
  const texto = etiquetaDeDisponibilidad(d ?? null);
  if (!texto) return null;
  return <span className={`mg-disp${d === "sin-stock" ? " off" : ""}`}>{texto}</span>;
}

/** El «−  cantidad  +» de un corte. */
export function Stepper({
  p,
  q,
  onBump,
  grande,
}: {
  p: MagraProducto;
  q: number;
  onBump: (p: MagraProducto, dir: 1 | -1) => void;
  grande?: boolean;
}) {
  return (
    <div className={`mg-step${grande ? " grande" : ""}`} role="group" aria-label={`Cantidad de ${p.name}`}>
      <button type="button" onClick={() => onBump(p, -1)} disabled={q === 0} aria-label={`Quitar ${p.name}`}>
        −
      </button>
      <span className="mg-step-q" aria-live="polite">
        {cantidadConUnidad(p, q)}
      </span>
      <button type="button" onClick={() => onBump(p, 1)} disabled={p.disponibilidad === "sin-stock"} aria-label={`Agregar ${p.name}`}>
        +
      </button>
    </div>
  );
}

export function altDelPack(p: MagraProducto): string {
  const { nombre, proveedor } = partesDelNombre(p.name);
  return `Pack de ${nombre.toLowerCase()} envasado al vacío${proveedor ? `, ${proveedor}` : ""}`;
}

export const Etiqueta = memo(function Etiqueta({
  p,
  q,
  animal,
  region,
  onAbrir,
  onBump,
  conImagen = true,
}: {
  p: MagraProducto;
  q: number;
  animal: MagraAnimal | null;
  region: string | null;
  onAbrir: (id: string) => void;
  onBump: (p: MagraProducto, dir: 1 | -1) => void;
  /** Gourmet: sin dibujo ni foto, renglón de lista. */
  conImagen?: boolean;
}) {
  const { nombre, proveedor, detalle } = partesDelNombre(p.name);
  const pack = conImagen ? packDeCorte(p.name) : null;
  const agotado = p.disponibilidad === "sin-stock";
  return (
    <article className={`mg-eti${q > 0 ? " on" : ""}${agotado ? " off" : ""}${conImagen ? "" : " lista"}`}>
      {conImagen && (
        <div className="mg-eti-vis">
          {pack ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pack.src} width={pack.width} height={pack.height} alt={altDelPack(p)} loading="lazy" decoding="async" />
          ) : (
            <>
              <EtiquetaDePack nombre={nombre} animal={animal} region={region} />
              {/* Sin foto del corte todavía (QA Magra v2): el placeholder lo dice, no se inventa una foto. */}
              <span className="mg-pendiente">Foto: material real pendiente</span>
            </>
          )}
        </div>
      )}
      <div className="mg-eti-rot">
        {proveedor && <span className="mg-eti-prov">{proveedor}</span>}
        <h3 className="mg-eti-nom">
          <button type="button" className="mg-eti-abrir" aria-haspopup="dialog" onClick={() => onAbrir(p.id)}>
            {nombre}
            {detalle && <small> {detalle}</small>}
          </button>
        </h3>
        <div className="mg-eti-pie">
          <span className="mg-eti-precio">
            {money.format(unitPrice(p))}
            <small>{unitLabel(p)}</small>
          </span>
          <Stepper p={p} q={q} onBump={onBump} />
        </div>
        <Disponible d={p.disponibilidad} />
      </div>
    </article>
  );
});
