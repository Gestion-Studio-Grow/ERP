"use client";

// Productos del catálogo genérico (tenants no retail): lo que se vende por caja Y los
// insumos que consumen los servicios, en la misma tabla, porque son la misma entidad
// (`Product`). La diferencia la marca el PRECIO DE VENTA: con precio aparece en la caja
// (/admin/pedidos); sin precio queda como insumo.
//
// Antes esta sección no tenía precio ni control de stock: un producto cargado desde acá
// quedaba a $0 en la caja y sólo se podía vender después de un UPDATE por SQL, y vender no
// descontaba stock. Los campos ya existían en `Product` (saleUnit/price/pricePerKg/
// trackStock) y la action ya los parseaba; faltaba la UI. Cero schema nuevo.
//
// Copy neutral de rubro a propósito: el mismo form lo ven una estética, una tienda y una
// carnicería. "Por peso (kg)" sí, "pesalo" o "cortes" no.

import { useState } from "react";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { salePriceOf, type SaleUnit } from "@/lib/stock/product-sale-fields";

type Product = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  active: boolean;
  saleUnit: SaleUnit;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
};

// Etiqueta de la unidad de venta para mostrar junto al precio.
const perLabel = (saleUnit: SaleUnit) => (saleUnit === "WEIGHT" ? "/kg" : "/u");

// --- Campos de venta compartidos por alta y edición ---
// Manda `saleUnit` (dispara el parseo de precio en la action), el precio que corresponde a
// esa forma, el `unit` coherente (kg si es por peso) y `trackStock` con el patrón
// hidden "off" + checkbox "on" (un checkbox destildado no viaja en el FormData).
function SaleFields({
  idPrefix,
  saleUnit,
  price,
  pricePerKg,
  unit,
  trackStock,
}: {
  idPrefix: string;
  saleUnit: SaleUnit;
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  trackStock: boolean;
}) {
  const [modo, setModo] = useState<SaleUnit>(saleUnit);
  const isWeight = modo === "WEIGHT";
  const priceId = `${idPrefix}-precio`;

  return (
    <>
      <label className="text-sm">
        <span className="block text-xs text-muted mb-1">Forma de venta</span>
        <Select
          id={`${idPrefix}-saleUnit`}
          name="saleUnit"
          defaultValue={saleUnit}
          onChange={(e) => setModo(e.target.value === "WEIGHT" ? "WEIGHT" : "UNIT")}
        >
          <option value="UNIT">Por unidad</option>
          <option value="WEIGHT">Por peso (kg)</option>
        </Select>
      </label>

      {isWeight ? (
        <input type="hidden" name="unit" value="kg" />
      ) : (
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Unidad</span>
          <Input
            id={`${idPrefix}-unit`}
            name="unit"
            defaultValue={unit && unit !== "kg" ? unit : "unidades"}
            placeholder="unidades, ml, cajas…"
          />
        </label>
      )}

      <label className="text-sm">
        <span className="block text-xs text-muted mb-1">
          Precio de venta {isWeight ? "por kg" : "por unidad"}
        </span>
        <Input
          id={priceId}
          key={isWeight ? "kg" : "u"}
          name={isWeight ? "pricePerKg" : "price"}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={(isWeight ? pricePerKg : price) ?? ""}
          placeholder="Vacío = no se vende"
        />
      </label>

      <label className="flex items-center gap-2 text-sm self-end min-h-11">
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

function PriceCell({ product }: { product: Product }) {
  const sale = salePriceOf(product);
  if (sale == null) {
    return <span className="text-faint">Sin precio (insumo)</span>;
  }
  return (
    <span className="tabular-nums text-body">
      {fmtMoneyARS(sale)}
      <span className="text-faint"> {perLabel(product.saleUnit)}</span>
    </span>
  );
}

function ProductRow({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const lowStock = product.stock <= product.lowStockAt;

  if (editing) {
    return (
      <tr className="block sm:table-row border-b bg-surface-sunken">
        <td colSpan={5} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              await updateProduct(fd);
              setEditing(false);
            }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3"
          >
            <input type="hidden" name="id" value={product.id} />
            <label className="text-sm col-span-2">
              <span className="block text-xs text-muted mb-1">Nombre</span>
              <Input name="name" defaultValue={product.name} required />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-muted mb-1">Stock</span>
              <Input name="stock" type="number" step="0.001" defaultValue={product.stock} required />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-muted mb-1">Aviso stock bajo</span>
              <Input name="lowStockAt" type="number" step="0.5" defaultValue={product.lowStockAt} required />
            </label>
            <SaleFields
              idPrefix={`edit-${product.id}`}
              saleUnit={product.saleUnit}
              price={product.price}
              pricePerKg={product.pricePerKg}
              unit={product.unit}
              trackStock={product.trackStock}
            />
            <div className="col-span-2 sm:col-span-4 flex gap-4 sm:gap-3 justify-start sm:justify-end whitespace-nowrap">
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
      <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${product.active ? "" : "text-faint line-through"}`}>
        {product.name}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Venta:</span>
        <PriceCell product={product} />
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
        <span className={lowStock ? "text-danger font-medium" : "text-body"}>
          {product.stock} {product.unit}
        </span>
        {lowStock && (
          <span className="ml-2 inline-block rounded-full bg-danger-soft text-danger px-2 py-0.5 text-xs">
            Stock bajo
          </span>
        )}
        {product.trackStock && (
          <span
            className="ml-2 inline-block rounded-full bg-surface-sunken text-muted px-2 py-0.5 text-xs"
            title="Cada venta descuenta stock y no se vende más de lo que hay"
          >
            Descuenta al vender
          </span>
        )}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5">
        <form action={toggleProductActive}>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="active" value={String(product.active)} />
          <button
            type="submit"
            className={`inline-flex items-center min-h-6 rounded-full px-2.5 py-1 text-xs font-medium ${
              product.active ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
            }`}
          >
            {product.active ? "Activo" : "Inactivo"}
          </button>
        </form>
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button onClick={() => setEditing(true)} className="chip-btn">
            Editar
          </button>
          <form
            action={async (fd) => {
              if (!confirm(`¿Eliminar "${product.name}"?`)) return;
              await deleteProduct(fd);
            }}
          >
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className="chip-btn chip-btn-danger">
              Eliminar
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default function ProductsSection({ products }: { products: Product[] }) {
  const lowStockCount = products.filter((p) => p.active && p.stock <= p.lowStockAt).length;
  const sellableCount = products.filter((p) => p.active && salePriceOf(p) != null).length;

  return (
    <section id="productos" aria-labelledby="productos-heading">
      <h2 id="productos-heading" className="text-lg font-medium mb-1">Productos</h2>
      <p className="text-sm text-muted mb-3">
        Lo que vendés por caja y los insumos que consumen los servicios. Un producto con precio de
        venta aparece en la caja; sin precio, queda como insumo. Con «controlar stock» activo, cada
        venta descuenta existencias y no se vende más de lo que hay — revisá que el stock cargado sea
        real antes de activarlo. El consumo por servicio se descuenta al completar el turno.
        {sellableCount === 0 && products.length > 0 && (
          <span className="ml-2 text-warning font-medium">
            Ningún producto tiene precio de venta: la caja no puede vender nada todavía.
          </span>
        )}
        {lowStockCount > 0 && (
          <span className="ml-2 text-danger font-medium">
            {lowStockCount} producto{lowStockCount !== 1 ? "s" : ""} con stock bajo.
          </span>
        )}
      </p>

      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line mb-4">
        <table className="block sm:table w-full text-left">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Precio de venta</th>
              <th className="px-4 py-2 font-medium">Stock</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
            {products.length === 0 && (
              <tr className="block sm:table-row">
                <td colSpan={5} className="block sm:table-cell px-0 sm:px-4 py-4 text-sm text-muted">
                  No hay productos cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alta: el control de stock arranca ACTIVO porque el stock inicial se carga acá mismo
          (es real). Los productos ya existentes conservan su valor hasta que alguien lo edite:
          prenderlo en masa sobre stock inventado bloquearía ventas por "falta de stock". */}
      <form action={createProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-sm col-span-2">
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <Input id="new-product-name" name="name" required placeholder="Nombre del producto" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Stock inicial</span>
          <Input id="new-product-stock" name="stock" type="number" step="0.001" required placeholder="0" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Aviso stock bajo</span>
          <Input id="new-product-low" name="lowStockAt" type="number" step="0.5" defaultValue={5} />
        </label>
        <SaleFields
          idPrefix="new-product"
          saleUnit="UNIT"
          price={null}
          pricePerKg={null}
          unit="unidades"
          trackStock={true}
        />
        <button type="submit" className={buttonClasses("solid", "md", "col-span-2 sm:col-span-4")}>
          Agregar producto
        </button>
      </form>
    </section>
  );
}
