"use client";

import { useState } from "react";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";
import { Input, buttonClasses } from "@/components/ui";

type Product = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  active: boolean;
};

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
            className="grid grid-cols-2 sm:grid-cols-[1fr_100px_90px_90px_auto] items-center gap-2 px-4 py-2.5"
          >
            <input type="hidden" name="id" value={product.id} />
            <input name="name" defaultValue={product.name} required className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent" />
            <input name="unit" defaultValue={product.unit} required className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent" />
            <input
              name="stock"
              type="number"
              step="0.5"
              defaultValue={product.stock}
              required
              className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent"
            />
            <input
              name="lowStockAt"
              type="number"
              step="0.5"
              defaultValue={product.lowStockAt}
              required
              className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent"
            />
            <div className="col-span-2 sm:col-span-1 flex gap-4 sm:gap-3 justify-start sm:justify-end whitespace-nowrap">
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
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-body">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Unidad:</span>
        {product.unit}
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

  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Productos (stock)</h2>
      <p className="text-sm text-muted mb-3">
        Insumos usados en los servicios. El stock se descuenta automáticamente al marcar un turno
        como completado.
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
              <th className="px-4 py-2 font-medium">Unidad</th>
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

      <form action={createProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input name="name" required placeholder="Nombre del producto" className="col-span-2" />
        <Input name="unit" defaultValue="unidades" placeholder="Unidad (ml, u.)" />
        <Input name="stock" type="number" step="0.5" required placeholder="Stock inicial" />
        <Input
          name="lowStockAt"
          type="number"
          step="0.5"
          defaultValue={5}
          placeholder="Aviso stock bajo"
          className="col-span-2"
        />
        <button type="submit" className={buttonClasses("solid", "md", "col-span-2")}>
          Agregar producto
        </button>
      </form>
    </section>
  );
}
