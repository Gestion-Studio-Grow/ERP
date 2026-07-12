"use client";

// ============================================================================
// CATÁLOGO DE CORTES — sección del /admin/catalogo para el rubro CARNICERÍA.
// ============================================================================
//
// Reemplaza, para un tenant retail/carnicería, la sección genérica "Productos
// (stock) — insumos usados en los servicios" (copy de spa, sin precio, sin kg):
// un mostrador no vende "insumos", vende CORTES por góndola (vaca/cerdo/pollo/
// achuras/preparados/gourmet), con su PRECIO POR KILO, su stock en kg y su MARGEN.
//
// Los campos ya existen en `Product` (saleUnit/price/pricePerKg — extensión retail
// de ADR-002) y la server action `createProduct/updateProduct` ya los parsea
// (`parseRetailFields`); lo único que faltaba era la UI para OPERARLOS. Cero schema
// nuevo. La categoría se deriva del nombre (clasificador puro `lib/carniceria/cortes`)
// mientras no exista `Product.category` (Gate 2, ver backoffice-carniceria-spec.md).

import { useState } from "react";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";
import { Badge, buttonClasses, fmtMoneyARS } from "@/components/ui";
import {
  groupCortesByCategoria,
  margenCorte,
  type CorteCategoria,
} from "@/lib/carniceria/cortes";

export type Corte = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  active: boolean;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  /** Último costo de compra conocido (para el margen). null = sin costo cargado. */
  cost: number | null;
};

const sellPrice = (c: Corte): number | null => (c.saleUnit === "WEIGHT" ? c.pricePerKg : c.price);

// --- Selector de forma de venta (kg / unidad) compartido por alta y edición ---
// Cambia qué campo de precio se muestra y manda `saleUnit` (para que la action
// dispare `parseRetailFields`) + el `unit` coherente ("kg" o el que se tipee).
function VentaFields({
  saleUnit,
  price,
  pricePerKg,
  unit,
  idPrefix,
}: {
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  idPrefix: string;
}) {
  const [modo, setModo] = useState<"UNIT" | "WEIGHT">(saleUnit);
  const selectId = `${idPrefix}-saleUnit`;
  const priceId = `${idPrefix}-precio`;

  const inputClass =
    "rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent";

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-xs font-medium text-muted">
          Forma de venta
        </label>
        <select
          id={selectId}
          name="saleUnit"
          defaultValue={saleUnit}
          onChange={(e) => setModo(e.target.value === "WEIGHT" ? "WEIGHT" : "UNIT")}
          className={inputClass}
        >
          <option value="WEIGHT">Por kilo (balanza)</option>
          <option value="UNIT">Por unidad</option>
        </select>
      </div>

      {modo === "WEIGHT" ? (
        <>
          <input type="hidden" name="unit" value="kg" />
          <div className="flex flex-col gap-1">
            <label htmlFor={priceId} className="text-xs font-medium text-muted">
              Precio por kilo
            </label>
            <input
              id={priceId}
              name="pricePerKg"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={pricePerKg ?? ""}
              placeholder="$/kg"
              className={inputClass}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-unit`} className="text-xs font-medium text-muted">
              Unidad
            </label>
            <input
              id={`${idPrefix}-unit`}
              name="unit"
              defaultValue={unit && unit !== "kg" ? unit : "unidad"}
              placeholder="unidad, docena…"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={priceId} className="text-xs font-medium text-muted">
              Precio por unidad
            </label>
            <input
              id={priceId}
              name="price"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={price ?? ""}
              placeholder="$"
              className={inputClass}
            />
          </div>
        </>
      )}
    </>
  );
}

function MargenBadge({ corte }: { corte: Corte }) {
  const m = margenCorte(sellPrice(corte), corte.cost);
  if (!m) {
    return (
      <span className="text-xs text-faint" title="Cargá una compra con costo para ver el margen">
        sin costo
      </span>
    );
  }
  return (
    <Badge tone={m.tone} className="tabular-nums">
      {Math.round(m.pct * 100)}%
    </Badge>
  );
}

function CorteRow({ corte }: { corte: Corte }) {
  const [editing, setEditing] = useState(false);
  const lowStock = corte.stock <= corte.lowStockAt;
  const price = sellPrice(corte);
  const priceLabel =
    price == null
      ? "—"
      : corte.saleUnit === "WEIGHT"
        ? `${fmtMoneyARS(price)}/kg`
        : fmtMoneyARS(price);

  if (editing) {
    return (
      <tr className="block sm:table-row border-b bg-surface-sunken">
        <td colSpan={6} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              await updateProduct(fd);
              setEditing(false);
            }}
            className="grid grid-cols-1 sm:grid-cols-6 items-end gap-2 px-4 py-3"
          >
            <input type="hidden" name="id" value={corte.id} />
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor={`edit-${corte.id}-name`} className="text-xs font-medium text-muted">
                Corte
              </label>
              <input
                id={`edit-${corte.id}-name`}
                name="name"
                defaultValue={corte.name}
                required
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
              />
            </div>
            <VentaFields
              saleUnit={corte.saleUnit}
              price={corte.price}
              pricePerKg={corte.pricePerKg}
              unit={corte.unit}
              idPrefix={`edit-${corte.id}`}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor={`edit-${corte.id}-stock`} className="text-xs font-medium text-muted">
                Stock
              </label>
              <input
                id={`edit-${corte.id}-stock`}
                name="stock"
                type="number"
                step="0.1"
                defaultValue={corte.stock}
                required
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`edit-${corte.id}-low`} className="text-xs font-medium text-muted">
                Aviso stock bajo
              </label>
              <input
                id={`edit-${corte.id}-low`}
                name="lowStockAt"
                type="number"
                step="0.1"
                defaultValue={corte.lowStockAt}
                required
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
              />
            </div>
            <div className="flex gap-3 sm:col-span-6 justify-end">
              <button type="submit" className="text-sm font-medium">Guardar</button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted">
                Cancelar
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
      <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${corte.active ? "text-strong" : "text-faint line-through"}`}>
        {corte.name}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Venta:</span>
        <Badge tone={corte.saleUnit === "WEIGHT" ? "accent" : "neutral"}>
          {corte.saleUnit === "WEIGHT" ? "Por kg" : "Por unidad"}
        </Badge>
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Precio:</span>
        {priceLabel}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
        <span className={lowStock ? "text-danger font-medium tabular-nums" : "text-body tabular-nums"}>
          {corte.stock} {corte.unit}
        </span>
        {lowStock && (
          <span className="ml-2 inline-block rounded-full bg-danger-soft text-danger px-2 py-0.5 text-xs">
            Stock bajo
          </span>
        )}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Margen:</span>
        <MargenBadge corte={corte} />
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <form action={toggleProductActive}>
            <input type="hidden" name="id" value={corte.id} />
            <input type="hidden" name="active" value={String(corte.active)} />
            <button type="submit" className="chip-btn" aria-label={corte.active ? `Desactivar ${corte.name}` : `Activar ${corte.name}`}>
              {corte.active ? "Activo" : "Inactivo"}
            </button>
          </form>
          <button onClick={() => setEditing(true)} className="chip-btn">
            Editar
          </button>
          <form
            action={async (fd) => {
              if (!confirm(`¿Eliminar "${corte.name}"?`)) return;
              await deleteProduct(fd);
            }}
          >
            <input type="hidden" name="id" value={corte.id} />
            <button type="submit" className="chip-btn chip-btn-danger">
              Eliminar
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

const GONDOLA_HINT: Partial<Record<CorteCategoria, string>> = {
  vaca: "Distribuidores oficiales de Estancia Don Ramón.",
  cerdo: "Cortes magros, bajos en grasa.",
  pollo: "Pollo orgánico, fresco y práctico.",
  achuras: "Menudencias frescas del día.",
  preparados: "Elaborados de la casa listos para la parrilla.",
  gourmet: "La línea de almacén premium que acompaña.",
};

export default function CortesSection({ cortes, catalogHeading }: { cortes: Corte[]; catalogHeading: string }) {
  const grupos = groupCortesByCategoria(cortes);
  const lowStockCount = cortes.filter((c) => c.active && c.stock <= c.lowStockAt).length;

  return (
    <section aria-labelledby="cortes-heading">
      <div className="mb-4">
        <h2 id="cortes-heading" className="text-lg font-medium text-strong">
          {catalogHeading || "Catálogo de cortes"}
        </h2>
        <p className="text-sm text-muted mt-1">
          Cada corte, su forma de venta (por kilo o por unidad), su precio y su margen sobre el
          último costo de compra. Agrupados por góndola.
          {lowStockCount > 0 && (
            <span className="ml-1 text-danger font-medium">
              {lowStockCount} con stock bajo.
            </span>
          )}
        </p>
      </div>

      {grupos.length === 0 && (
        <p className="text-sm text-muted mb-6">Todavía no hay cortes cargados. Agregá el primero abajo.</p>
      )}

      <div className="space-y-8">
        {grupos.map(({ categoria, items }) => (
          <div key={categoria.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <span aria-hidden className="text-accent">{categoria.glyph}</span>
              <h3 className="text-base font-semibold text-strong">{categoria.label}</h3>
              <span className="text-xs text-faint">
                {items.length} corte{items.length !== 1 ? "s" : ""}
              </span>
              {GONDOLA_HINT[categoria.id] && (
                <span className="text-xs text-muted hidden sm:inline">· {GONDOLA_HINT[categoria.id]}</span>
              )}
            </div>
            <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
              <table className="block sm:table w-full text-left">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Corte</th>
                    <th className="px-4 py-2 font-medium">Venta</th>
                    <th className="px-4 py-2 font-medium">Precio</th>
                    <th className="px-4 py-2 font-medium">Stock</th>
                    <th className="px-4 py-2 font-medium">Margen</th>
                    <th className="px-4 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="block sm:table-row-group">
                  {items.map((c) => (
                    <CorteRow key={c.id} corte={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Alta de corte */}
      <div className="mt-8 rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="text-base font-medium text-strong mb-3">Agregar un corte</h3>
        <form action={createProduct} className="grid grid-cols-1 sm:grid-cols-6 items-end gap-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="new-corte-name" className="text-xs font-medium text-muted">
              Corte
            </label>
            <input
              id="new-corte-name"
              name="name"
              required
              placeholder="ej: Asado de tira"
              className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
            />
          </div>
          <VentaFields saleUnit="WEIGHT" price={null} pricePerKg={null} unit="kg" idPrefix="new-corte" />
          <div className="flex flex-col gap-1">
            <label htmlFor="new-corte-stock" className="text-xs font-medium text-muted">
              Stock inicial
            </label>
            <input
              id="new-corte-stock"
              name="stock"
              type="number"
              step="0.1"
              required
              defaultValue={0}
              className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-corte-low" className="text-xs font-medium text-muted">
              Aviso stock bajo
            </label>
            <input
              id="new-corte-low"
              name="lowStockAt"
              type="number"
              step="0.1"
              defaultValue={5}
              className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
            />
          </div>
          <div className="sm:col-span-6">
            <button type="submit" className={buttonClasses("solid", "md")}>
              Agregar corte
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
