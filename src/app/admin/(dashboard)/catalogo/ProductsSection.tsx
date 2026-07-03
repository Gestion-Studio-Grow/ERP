"use client";

import { useState } from "react";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";

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
      <tr className="block sm:table-row border-b bg-neutral-50">
        <td colSpan={5} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              await updateProduct(fd);
              setEditing(false);
            }}
            className="grid grid-cols-2 sm:grid-cols-[1fr_100px_90px_90px_auto] items-center gap-2 px-4 py-2.5"
          >
            <input type="hidden" name="id" value={product.id} />
            <input name="name" defaultValue={product.name} required className="rounded-md border px-2 py-1 text-sm" />
            <input name="unit" defaultValue={product.unit} required className="rounded-md border px-2 py-1 text-sm" />
            <input
              name="stock"
              type="number"
              step="0.5"
              defaultValue={product.stock}
              required
              className="rounded-md border px-2 py-1 text-sm"
            />
            <input
              name="lowStockAt"
              type="number"
              step="0.5"
              defaultValue={product.lowStockAt}
              required
              className="rounded-md border px-2 py-1 text-sm"
            />
            <div className="col-span-2 sm:col-span-1 flex gap-4 sm:gap-3 justify-start sm:justify-end whitespace-nowrap">
              <button type="submit" className="text-sm font-medium">Guardar</button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
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
      <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${product.active ? "" : "text-neutral-400 line-through"}`}>
        {product.name}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-neutral-600">
        <span className="sm:hidden text-xs uppercase tracking-wide text-neutral-400 mr-1.5">Unidad:</span>
        {product.unit}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className={lowStock ? "text-red-600 font-medium" : "text-neutral-600"}>
          {product.stock} {product.unit}
        </span>
        {lowStock && (
          <span className="ml-2 inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">
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
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              product.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"
            }`}
          >
            {product.active ? "Activo" : "Inactivo"}
          </button>
        </form>
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
        <div className="flex gap-4 sm:gap-0">
          <button onClick={() => setEditing(true)} className="text-sm text-neutral-500 hover:underline sm:mr-3">
            Editar
          </button>
          <form
            className="inline"
            action={async (fd) => {
              if (!confirm(`¿Eliminar "${product.name}"?`)) return;
              await deleteProduct(fd);
            }}
          >
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className="text-sm text-red-600 hover:underline">
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
      <p className="text-sm text-neutral-500 mb-3">
        Insumos usados en los servicios. El stock se descuenta automáticamente al marcar un turno
        como completado.
        {lowStockCount > 0 && (
          <span className="ml-2 text-red-600 font-medium">
            {lowStockCount} producto{lowStockCount !== 1 ? "s" : ""} con stock bajo.
          </span>
        )}
      </p>

      <div className="sm:overflow-x-auto sm:rounded-lg sm:border mb-4">
        <table className="block sm:table w-full text-left">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
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
                <td colSpan={5} className="block sm:table-cell px-0 sm:px-4 py-4 text-sm text-neutral-500">
                  No hay productos cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={createProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input name="name" required placeholder="Nombre del producto" className="col-span-2 rounded-md border px-3 py-2 text-sm" />
        <input name="unit" defaultValue="unidades" placeholder="Unidad (ml, u.)" className="rounded-md border px-3 py-2 text-sm" />
        <input name="stock" type="number" step="0.5" required placeholder="Stock inicial" className="rounded-md border px-3 py-2 text-sm" />
        <input
          name="lowStockAt"
          type="number"
          step="0.5"
          defaultValue={5}
          placeholder="Aviso stock bajo"
          className="col-span-2 rounded-md border px-3 py-2 text-sm"
        />
        <button type="submit" className="col-span-2 rounded-md bg-black text-white px-4 py-2 text-sm font-medium">
          Agregar producto
        </button>
      </form>
    </section>
  );
}
