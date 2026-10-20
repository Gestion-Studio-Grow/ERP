"use client";

// Qué número de la balanza (PLU) es cada producto. Es el `Product.codigo` del catálogo: el mismo
// que lee el lector en Vender, en Pedidos y en la caja. Una fila, un formulario: guardar uno no
// pisa lo que se está tipeando en otro.

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import { asignarPluDeProducto, type EstadoBalanza } from "@/lib/balanza/balanza-actions";

export interface ProductoParaPlu {
  id: string;
  name: string;
  porKilo: boolean;
  codigo: string | null;
}

function Fila({ p }: { p: ProductoParaPlu }) {
  const [estado, accion, enviando] = useActionState<EstadoBalanza, FormData>(asignarPluDeProducto, null);
  const [codigo, setCodigo] = useState(p.codigo ?? "");
  const campo = `plu-${p.id}`;
  return (
    <li className="rounded-md border border-line p-3">
      <form action={accion} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="productId" value={p.id} />
        <div className="min-w-0 flex-1">
          <label htmlFor={campo} className="block text-sm font-medium text-strong">
            {p.name}
          </label>
          <p className="text-xs text-muted">{p.porKilo ? "Por kilo" : "Por unidad"}</p>
        </div>
        <Input
          id={campo}
          name="codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Sin código"
          className="w-36 font-mono"
          aria-describedby={`${campo}-estado`}
        />
        <Button type="submit" variant="outline" disabled={enviando || codigo.trim() === (p.codigo ?? "")}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      <p id={`${campo}-estado`} role={estado && !estado.ok ? "alert" : "status"} className={estado && !estado.ok ? "mt-1 text-sm font-medium text-danger" : "mt-1 text-sm text-success"}>
        {estado ? (estado.ok ? estado.mensaje : estado.error) : ""}
      </p>
    </li>
  );
}

export default function PluDeProductos({ productos }: { productos: ProductoParaPlu[] }) {
  const sinCodigo = productos.filter((p) => p.porKilo && !p.codigo).length;
  if (productos.length === 0) {
    return <p className="text-sm text-body">Todavía no hay productos con precio en el catálogo. Cargalos y después volvé acá.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-body">
        En la balanza cada producto tiene un número (el PLU). Escribí acá el mismo número, así la etiqueta trae el producto
        correcto. {sinCodigo > 0 ? `Faltan ${sinCodigo} de los que se venden por kilo.` : "Los que se venden por kilo ya tienen el suyo."}
      </p>
      <ul className="space-y-2">
        {productos.map((p) => (
          <Fila key={p.id} p={p} />
        ))}
      </ul>
    </div>
  );
}
