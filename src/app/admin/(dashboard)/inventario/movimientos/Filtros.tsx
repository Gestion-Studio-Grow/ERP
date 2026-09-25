"use client";

// Filtros de Movimientos: producto (con el buscador de siempre), tipo y fechas. Es un GET: la
// URL queda con los filtros, así se puede volver atrás, compartir el enlace o llegar desde
// Stock, Catálogo o Vender con el producto ya elegido. Sin imports de servidor.

import Link from "next/link";
import { useState } from "react";
import { BuscadorCombo, Input, Select, buttonClasses } from "@/components/ui";

type Opcion = { id: string; name: string; unit: string; stock: number; active: boolean };

const qty = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

export default function Filtros({
  productos,
  tipos,
  inicial,
  renglon = false,
}: {
  productos: Opcion[];
  tipos: { id: string; nombre: string }[];
  inicial: { producto: string | null; tipo: string | null; desde: string | null; hasta: string | null };
  /** Diseño nuevo («Renglón»): el filtro va suelto sobre la raya, sin caja; «Limpiar» sólo si hay algo filtrado. */
  renglon?: boolean;
}) {
  const hayFiltro = Boolean(inicial.producto || inicial.tipo || inicial.desde || inicial.hasta);
  const [producto, setProducto] = useState(inicial.producto ?? "");
  const opciones = productos.map((p) => ({
    id: p.id,
    etiqueta: p.active ? p.name : `${p.name} (inactivo)`,
    detalle: `hay ${qty.format(p.stock)} ${p.unit}`,
  }));
  return (
    <form
      method="get"
      action="/admin/inventario/movimientos"
      aria-label="Filtrar movimientos"
      className={renglon ? "grid gap-3 border-b border-line pb-4 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2 lg:grid-cols-4"}
    >
      <div className="text-sm sm:col-span-2">
        <span className="mb-1 block text-muted">Producto</span>
        <BuscadorCombo
          ariaLabel="Producto"
          opciones={opciones}
          valor={producto}
          onElegir={setProducto}
          placeholder="Todos · buscá por nombre…"
        />
        <input type="hidden" name="producto" value={producto} />
      </div>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Tipo</span>
        <Select name="tipo" defaultValue={inicial.tipo ?? ""} className="h-11">
          <option value="">Todos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label>
          <span className="mb-1 block text-muted">Desde</span>
          <Input type="date" name="desde" defaultValue={inicial.desde ?? ""} className="h-11" />
        </label>
        <label>
          <span className="mb-1 block text-muted">Hasta</span>
          <Input type="date" name="hasta" defaultValue={inicial.hasta ?? ""} className="h-11" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className={buttonClasses("solid", "md")}>
          Ver movimientos
        </button>
        {(!renglon || hayFiltro) && (
          <Link href="/admin/inventario/movimientos" className={buttonClasses("outline", "md")}>
            Limpiar filtros
          </Link>
        )}
      </div>
    </form>
  );
}
