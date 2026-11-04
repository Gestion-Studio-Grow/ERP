"use client";

// ============================================================================
// «+ PRODUCTO» EN EL CAJÓN DEL TURNO (Venta y agenda simples, T1; interruptor `venta-agenda-simple`).
// ============================================================================
//
// El buscador de los productos del negocio (la MISMA lectura de Vender, `productosParaElTurno`) y los
// renglones con su cantidad. Controlado: los renglones los tiene `TerminarTurno`, que arma el total
// turno + productos y cobra todo con un toque en el medio. La lista se pide UNA vez, al abrir el
// buscador (no en cada dibujo de la agenda).

import { useMemo, useState, useTransition } from "react";
import { Button, Input, Plata } from "@/components/ui";
import { productosParaElTurno, type ProductoParaElTurno } from "@/lib/turnos/cobro-con-producto-actions";
import { buscarProductos } from "@/lib/turnos/cobro-con-producto";

export type RenglonDelCajon = { producto: ProductoParaElTurno; qty: number };

export default function SumarProductos({
  renglones,
  onCambiar,
  onTarjeta,
  disabled,
}: {
  renglones: readonly RenglonDelCajon[];
  onCambiar: (r: RenglonDelCajon[]) => void;
  /** El servidor dice si el negocio cobra con tarjeta (Débito y Crédito). */
  onTarjeta: (conTarjeta: boolean) => void;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<ProductoParaElTurno[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [cargando, empezar] = useTransition();
  const encontrados = useMemo(() => (lista ? buscarProductos(lista, q) : []), [lista, q]);

  const abrir = () => {
    setAbierto(true);
    if (lista) return;
    empezar(async () => {
      try {
        const r = await productosParaElTurno();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setLista(r.productos);
        onTarjeta(r.conTarjeta);
      } catch {
        setError("No se pudieron leer los productos. Probá de nuevo.");
      }
    });
  };

  const sumar = (p: ProductoParaElTurno) => {
    const ya = renglones.find((r) => r.producto.id === p.id);
    onCambiar(ya ? renglones.map((r) => (r.producto.id === p.id ? { ...r, qty: r.qty + 1 } : r)) : [...renglones, { producto: p, qty: 1 }]);
    setQ("");
  };
  const cambiar = (id: string, delta: number) =>
    onCambiar(renglones.map((r) => (r.producto.id === id ? { ...r, qty: r.qty + delta } : r)).filter((r) => r.qty > 0));

  return (
    <div data-ui="sumar-productos" className="space-y-2">
      {renglones.length > 0 && (
        <ul className="space-y-1" aria-label="Productos sumados al cobro">
          {renglones.map((r) => (
            <li key={r.producto.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-body">{r.producto.name}</span>
              <span className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Uno menos de ${r.producto.name}`} onClick={() => cambiar(r.producto.id, -1)}>
                  −
                </Button>
                <span className="w-6 text-center tabular-nums" aria-label={`Cantidad de ${r.producto.name}`}>
                  {r.qty}
                </span>
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Uno más de ${r.producto.name}`} onClick={() => cambiar(r.producto.id, 1)}>
                  +
                </Button>
              </span>
              <Plata valor={r.qty * r.producto.precio} sinCentavos={Number.isInteger(r.qty * r.producto.precio)} />
            </li>
          ))}
        </ul>
      )}

      {!abierto ? (
        <Button type="button" variant="outline" size="md" className="w-full" disabled={disabled} onClick={abrir}>
          + Producto
        </Button>
      ) : (
        <div className="space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá el producto (crema, sérum…)" aria-label="Buscar un producto" maxLength={60} autoFocus />
          {cargando && <p className="text-sm text-muted">Buscando los productos…</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {lista && encontrados.length === 0 && <p className="text-sm text-muted">No hay productos con ese nombre.</p>}
          {encontrados.length > 0 && (
            <ul className="space-y-1" aria-label="Productos del negocio">
              {encontrados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => sumar(p)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <Plata valor={p.precio} sinCentavos={Number.isInteger(p.precio)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
