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
import Link from "next/link";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";
import { Badge, EmptyState, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { formatearCantidad } from "@/lib/pos-peso";
// "Stock bajo" tiene UNA definición (la de Stock y la del número del Inicio): controla stock y
// está en el mínimo o por debajo. Pura y sin Prisma: se puede usar en el cliente.
import { esStockBajo } from "@/lib/inventory/valuation";
// Los números del corte (precio, costo, stock inicial, aviso) se tipean con la misma pieza
// que el catálogo genérico: texto leído con la regla del POS. Ver `CampoDecimal` (y
// `useVolverAlResetear`, que deja el alta en blanco después de cada corte).
import { CampoDecimal, StockSoloLectura, useVolverAlResetear } from "./ProductsSection";
import {
  CORTE_CATEGORIAS,
  effectiveCategoria,
  margenCorte,
  type CorteCategoria,
} from "@/lib/carniceria/cortes";
import { VOCABULARIO_CARNICERIA, mayuscula, type VocabularioDelCatalogo } from "./vocabulario";

export type Corte = {
  id: string;
  /**
   * Los movimientos de este corte (/admin/inventario/movimientos?producto=…), armado en el
   * servidor con `hrefMovimientos`; ausente si quien mira no puede abrir Movimientos.
   */
  movimientos?: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  active: boolean;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  /**
   * Costo VIGENTE (src/lib/stock/costo.ts), el mismo de Stock y Margen: el cargado a mano
   * (Product.cost) o, si no hay, el del último ingreso con costo. Es el del margen.
   */
  cost: number | null;
  /** Sólo el cargado a mano (Product.cost). Es el que edita el formulario. */
  costoCargado: number | null;
  /** Góndola explícita (Product.category) o null → se deriva del nombre. */
  category: string | null;
  /** Si true, cada venta descuenta stock con guarda anti-oversell (order-core). */
  trackStock: boolean;
};

/** Agrupa por categoría EFECTIVA (explícita si está, si no derivada del nombre). */
function groupCortes(cortes: Corte[]): { categoria: (typeof CORTE_CATEGORIAS)[number]; items: Corte[] }[] {
  return CORTE_CATEGORIAS.map((categoria) => ({
    categoria,
    items: cortes.filter((c) => effectiveCategoria(c.name, c.category) === categoria.id),
  })).filter((g) => g.items.length > 0);
}

const sellPrice = (c: Corte): number | null => (c.saleUnit === "WEIGHT" ? c.pricePerKg : c.price);

// Estilo de los campos de un corte. `h-11`: 44px de alto, el objetivo táctil en el teléfono
// (antes era `py-1.5`, más bajo que eso, en la pantalla donde se cambian los precios de pie).
const CAMPO =
  "h-11 w-full rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent aria-invalid:border-danger";

// --- Selector de forma de venta (kg / unidad) compartido por alta y edición ---
// Cambia qué campo de precio se muestra y manda `saleUnit` (para que la action
// dispare `parseRetailFields`) + el `unit` coherente ("kg" o el que se tipee).
function VentaFields({
  saleUnit,
  price,
  pricePerKg,
  unit,
  category,
  costoCargado,
  costoVigente,
  conCostos,
  trackStock,
  idPrefix,
}: {
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  category: string | null;
  /** El costo cargado a mano: vacío = el margen usa el del último ingreso. */
  costoCargado: number | null;
  /** El vigente, para mostrarlo de referencia cuando no hay uno cargado. */
  costoVigente: number | null;
  /** Sin costs:read el campo de costo no se muestra ni viaja: guardar no lo toca. */
  conCostos: boolean;
  trackStock: boolean;
  idPrefix: string;
}) {
  const [modo, setModo] = useState<"UNIT" | "WEIGHT">(saleUnit);
  const selectId = `${idPrefix}-saleUnit`;
  const priceId = `${idPrefix}-precio`;
  // El `<select>` vuelve solo a su `defaultValue` cuando el alta se resetea; `modo` es estado y
  // no. Medido sin esto (el test de src/lib/stock/alta-producto.test.ts): después de un corte
  // "por unidad" el select volvía a "Por kilo" pero seguía a la vista "Precio por unidad", y el
  // corte siguiente viajaba con saleUnit=WEIGHT y unit=unidad.
  useVolverAlResetear(selectId, () => setModo(saleUnit));

  const inputClass = CAMPO;

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-category`} className="text-xs font-medium text-muted">
          Góndola
        </label>
        <select id={`${idPrefix}-category`} name="category" defaultValue={category ?? ""} className={inputClass}>
          <option value="">Auto (por nombre)</option>
          {CORTE_CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      {conCostos && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-cost`} className="text-xs font-medium text-muted">
            Costo (para margen)
          </label>
          {/* Vacío = manda el costo del último ingreso (compra, reposición o despiece). Por eso el
              campo trae el costo CARGADO y no el vigente: con el vigente, guardar un precio
              copiaba el costo de la última compra y lo dejaba fijo para siempre. */}
          <CampoDecimal
            id={`${idPrefix}-cost`}
            name="cost"
            tipo="importe"
            valorInicial={costoCargado}
            placeholder={costoCargado == null && costoVigente != null ? `último costo ${fmtMoneyARS(costoVigente, 0)}` : "$ costo"}
            className={inputClass}
          />
        </div>
      )}
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
            <CampoDecimal
              id={priceId}
              name="pricePerKg"
              tipo="importe"
              valorInicial={pricePerKg}
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
            <CampoDecimal
              id={priceId}
              name="price"
              tipo="importe"
              valorInicial={price}
              placeholder="$"
              className={inputClass}
            />
          </div>
        </>
      )}

      {/* Control de stock por producto: hidden "off" + checkbox "on" (un checkbox destildado
          no viaja). Sin esto, vender no descontaba stock: las compras sumaban y las ventas no
          restaban. Se decide acá, por producto, y no con un default global (ver ProductsSection). */}
      <label className="flex items-center gap-2 text-sm min-h-9">
        <input type="hidden" name="trackStock" value="off" />
        <input
          id={`${idPrefix}-trackStock`}
          type="checkbox"
          name="trackStock"
          value="on"
          defaultChecked={trackStock}
          className="size-4"
        />
        <span className="text-body">Controlar stock al vender</span>
      </label>
    </>
  );
}

function MargenBadge({ corte }: { corte: Corte }) {
  const m = margenCorte(sellPrice(corte), corte.cost);
  if (corte.cost == null) {
    return (
      <span className="text-xs text-faint" title="Cargá una compra con costo para ver el margen">
        sin costo
      </span>
    );
  }
  // El costo vigente a la vista: es el mismo número que usan Stock y Margen.
  const costo = (
    <span className="text-xs text-muted tabular-nums">
      costo {fmtMoneyARS(corte.cost, 0)}
      {corte.saleUnit === "WEIGHT" ? "/kg" : ""}
    </span>
  );
  if (!m) return costo;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={m.tone} className="tabular-nums">
        {Math.round(m.pct * 100)}%
      </Badge>
      {costo}
    </span>
  );
}

function CorteRow({ corte, conCostos, nombre }: { corte: Corte; conCostos: boolean; nombre: string }) {
  const [editing, setEditing] = useState(false);
  const lowStock = esStockBajo(corte);
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
                {nombre}
              </label>
              <input
                id={`edit-${corte.id}-name`}
                name="name"
                defaultValue={corte.name}
                required
                className={CAMPO}
              />
            </div>
            <VentaFields
              saleUnit={corte.saleUnit}
              price={corte.price}
              pricePerKg={corte.pricePerKg}
              unit={corte.unit}
              category={corte.category}
              costoCargado={corte.costoCargado}
              costoVigente={corte.cost}
              conCostos={conCostos}
              trackStock={corte.trackStock}
              idPrefix={`edit-${corte.id}`}
            />
            {/* El stock NO se edita acá: guardar el precio lo pisaba con el número de cuando se
                abrió la pantalla, borrando lo vendido en el medio sin dejar movimiento. Se
                muestra, y "Recontar" lleva al recuento con motivo (queda en el ledger). */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Stock</span>
              <StockSoloLectura productId={corte.id} stock={corte.stock} unit={corte.unit} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`edit-${corte.id}-low`} className="text-xs font-medium text-muted">
                Aviso stock bajo
              </label>
              <CampoDecimal
                id={`edit-${corte.id}-low`}
                name="lowStockAt"
                tipo="cantidad"
                valorInicial={corte.lowStockAt}
                required
                className={CAMPO}
              />
            </div>
            <div className="flex gap-3 sm:col-span-6 justify-end">
              <button type="submit" className="min-h-11 px-2 text-sm font-medium">Guardar</button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-2 text-sm text-muted">
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
          {formatearCantidad(corte.stock)} {corte.unit}
        </span>
        {lowStock && (
          <span className="ml-2 inline-block rounded-full bg-danger-soft text-danger px-2 py-0.5 text-xs">
            Stock bajo
          </span>
        )}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Margen:</span>
        {conCostos ? <MargenBadge corte={corte} /> : <span className="text-xs text-faint">—</span>}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {corte.movimientos && (
            <Link href={corte.movimientos} className="chip-btn max-sm:min-h-11!" aria-label={`Movimientos de ${corte.name}`}>
              Movimientos
            </Link>
          )}
          <form action={toggleProductActive}>
            <input type="hidden" name="id" value={corte.id} />
            <input type="hidden" name="active" value={String(corte.active)} />
            <button type="submit" className="chip-btn max-sm:min-h-11!" aria-label={corte.active ? `Desactivar ${corte.name}` : `Activar ${corte.name}`}>
              {corte.active ? "Activo" : "Inactivo"}
            </button>
          </form>
          <button onClick={() => setEditing(true)} className="chip-btn max-sm:min-h-11!">
            Editar
          </button>
          <form
            action={async (fd) => {
              if (!confirm(`¿Eliminar "${corte.name}"?`)) return;
              await deleteProduct(fd);
            }}
          >
            <input type="hidden" name="id" value={corte.id} />
            <button type="submit" className="chip-btn max-sm:min-h-11! chip-btn-danger">
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

export default function CortesSection({
  cortes,
  catalogHeading,
  conCostos = true,
  vocabulario = VOCABULARIO_CARNICERIA,
}: {
  cortes: Corte[];
  catalogHeading: string;
  /** ¿Quien mira puede ver costos (costs:read)? Sin ella no se ven ni se editan. */
  conCostos?: boolean;
  /** Las palabras y la forma de venta del rubro (`vocabularioDelRubro`). Sin él, carnicería. */
  vocabulario?: VocabularioDelCatalogo;
}) {
  const { uno, varios } = vocabulario;
  const Uno = mayuscula(uno);
  const grupos = groupCortes(cortes);
  const lowStockCount = cortes.filter((c) => c.active && esStockBajo(c)).length;

  return (
    <section aria-labelledby="cortes-heading">
      <div className="mb-4">
        <h2 id="cortes-heading" className="text-lg font-medium text-strong">
          {catalogHeading || "Catálogo de cortes"}
        </h2>
        <p className="text-sm text-muted mt-1">
          Cada {uno}, su forma de venta (por kilo o por unidad), su precio y su margen sobre el
          costo vigente: el que cargaste a mano o, si no, el del último ingreso. Agrupados por góndola.
          {lowStockCount > 0 && (
            <span className="ml-1 text-danger font-medium">
              {lowStockCount} con stock bajo.
            </span>
          )}
        </p>
      </div>

      {/* Vacío: qué hacer y el botón que lleva al alta (está abajo; en el celular, fuera de la
          pantalla). */}
      {grupos.length === 0 && (
        <EmptyState
          className="mb-6"
          title="El catálogo está vacío"
          description="Se carga de a uno con el formulario de abajo, o todo junto con la planilla. Lo que cargues aparece en el mostrador y en la tienda."
          action={
            <button
              type="button"
              onClick={() => document.getElementById("new-corte-name")?.focus()}
              className={buttonClasses("solid", "md")}
            >
              Empezar a cargar
            </button>
          }
        />
      )}

      <div className="space-y-8">
        {grupos.map(({ categoria, items }) => (
          <div key={categoria.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <span aria-hidden className="text-accent">{categoria.glyph}</span>
              <h3 className="text-base font-semibold text-strong">{categoria.label}</h3>
              <span className="text-xs text-faint">
                {items.length} {items.length === 1 ? uno : varios}
              </span>
              {vocabulario.carniceria && GONDOLA_HINT[categoria.id] && (
                <span className="text-xs text-muted hidden sm:inline">· {GONDOLA_HINT[categoria.id]}</span>
              )}
            </div>
            <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
              <table className="block sm:table w-full text-left">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">{Uno}</th>
                    <th className="px-4 py-2 font-medium">Venta</th>
                    <th className="px-4 py-2 font-medium">Precio</th>
                    <th className="px-4 py-2 font-medium">Stock</th>
                    <th className="px-4 py-2 font-medium">Margen</th>
                    <th className="px-4 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="block sm:table-row-group">
                  {items.map((c) => (
                    <CorteRow key={c.id} corte={c} conCostos={conCostos} nombre={Uno} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Alta de corte */}
      <div className="mt-8 rounded-lg border border-line bg-surface-sunken p-4">
        {/* En la carnicería, el título de siempre ("un corte"); en los demás rubros el sustantivo
            solo, porque el artículo cambia con el género ("una prenda"). */}
        <h3 className="text-base font-medium text-strong mb-3">Agregar {vocabulario.carniceria ? "un corte" : uno}</h3>
        <form action={createProduct} className="grid grid-cols-1 sm:grid-cols-6 items-end gap-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="new-corte-name" className="text-xs font-medium text-muted">
              {Uno}
            </label>
            <input
              id="new-corte-name"
              name="name"
              required
              placeholder={vocabulario.carniceria ? "ej: Asado de tira" : "Como lo ve el cliente"}
              className={CAMPO}
            />
          </div>
          <VentaFields saleUnit={vocabulario.porPeso ? "WEIGHT" : "UNIT"} price={null} pricePerKg={null} unit={vocabulario.porPeso ? "kg" : "unidad"} category={null} costoCargado={null} costoVigente={null} conCostos={conCostos} trackStock={true} idPrefix="new-corte" />
          <div className="flex flex-col gap-1">
            <label htmlFor="new-corte-stock" className="text-xs font-medium text-muted">
              Stock inicial
            </label>
            {/* Entra por el ledger como AJUSTE "Stock inicial" (alta-producto.ts), no por el
                create. Vacío = 0. */}
            <CampoDecimal
              id="new-corte-stock"
              name="stock"
              tipo="cantidad"
              valorInicial={0}
              className={CAMPO}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-corte-low" className="text-xs font-medium text-muted">
              Aviso stock bajo
            </label>
            <CampoDecimal
              id="new-corte-low"
              name="lowStockAt"
              tipo="cantidad"
              valorInicial={5}
              className={CAMPO}
            />
          </div>
          <div className="sm:col-span-6">
            <button type="submit" className={buttonClasses("solid", "md")}>
              Agregar {uno}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
