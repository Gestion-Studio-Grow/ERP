"use client";

// ============================================================================
// VENTA RÁPIDA DE MOSTRADOR — se carga, se cobra y se cierra en el acto, sin cuenta a nombre de nadie.
// ============================================================================
//
// El `mostrador` del club vanilla: buscar el producto (el lector o el nombre), sumarlo al carrito, − / + por línea,
// cómo paga (sólo medios de caja: con créditos se usa una cuenta a nombre del cliente) y «Cobrar $X»
// (`ventaMostrador`, buffet-mesa-core.ts). Lo de alquiler no se ofrece: va a la cuenta de un jugador.
// El carrito es estado de esta pieza (`memo`): tipear o sumar al carrito no repinta las cuentas ni la agenda.

import { memo, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { pesos } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { VENTA_DESHACIBLE, armarCarrito, productosParaMostrador, sumarAlCarrito, venderEnMostrador, type Carrito } from "./buffet-mesa-core";
import type { MedioCaja } from "./cuenta-core";
import { ComoPaga } from "./piezas";

const VACIO: Carrito = {};

function VentaDeMostrador({ almacen }: { almacen: Almacen }) {
  const [carrito, setCarrito] = useState<Carrito>(VACIO);
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const id = useId();
  const estado = almacen.estado();
  const { porCodigo, productos } = productosParaMostrador(estado, texto);
  const { lineas, total } = armarCarrito(estado, carrito);
  const sumar = (productoId: string, delta: number) => setCarrito((c) => sumarAlCarrito(c, productoId, delta));
  const elegir = (productoId: string) => {
    sumar(productoId, 1);
    setTexto("");
  };
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
      <div>
        <h2 id={`${id}-t`} className="font-semibold text-strong">
          Venta rápida de mostrador
        </h2>
        <p className="text-sm text-muted">Se cobra en el acto. Para dejarlo a nombre de alguien, abrí una cuenta.</p>
      </div>
      <Field label="Código o producto (pasá el lector o escribí)" htmlFor={id}>
        <Input
          id={id}
          value={texto}
          autoComplete="off"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && productos.length === 1 && (porCodigo || texto.trim())) {
              e.preventDefault();
              elegir(productos[0].id);
            }
          }}
          aria-describedby={`${id}-r`}
        />
      </Field>
      <p id={`${id}-r`} className="sr-only" aria-live="polite">
        {texto.trim() ? (productos.length ? `${productos.length} productos` : "No hay productos con eso") : ""}
      </p>
      {texto.trim() !== "" && (
        <ul aria-label="Productos para la venta" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {productos.length === 0 && <li className="text-sm text-muted">No hay productos con eso.</li>}
          {productos.map((p) => (
            <li key={p.id}>
              <Button variant="ghost" size="md" className="w-full justify-between!" onClick={() => elegir(p.id)}>
                <span className="truncate">+ {p.nombre}</span>
                <span className="tabular-nums text-muted">
                  {pesos(p.precio)} · {p.stock}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {lineas.length > 0 ? (
        <ul aria-label="Lo que lleva" className="flex flex-col gap-1 text-sm tabular-nums">
          {lineas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{l.nombre}</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno menos de ${l.nombre}`} onClick={() => sumar(l.id, -1)}>
                  −
                </Button>
                <span className="w-6 text-center font-semibold">{l.cant}</span>
                <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno más de ${l.nombre}`} onClick={() => sumar(l.id, 1)}>
                  +
                </Button>
              </span>
              <span className="w-20 text-right">{pesos(l.importe)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Buscá y sumá productos.</p>
      )}
      {lineas.length > 0 && (
        <>
          <ComoPaga medio={medio} onElegir={(m) => m !== "monedero" && setMedio(m)} leyenda="Cómo paga la venta" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-bold tabular-nums text-strong">Total {pesos(total)}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="md" onClick={() => setCarrito(VACIO)}>
                Vaciar
              </Button>
              <Button
                variant="solid"
                size="md"
                disabled={!(total > 0)}
                onClick={() => {
                  const d = almacen.ejecutar((e, ahora) => venderEnMostrador(e, carrito, medio, ahora), { deshacible: VENTA_DESHACIBLE });
                  if (d.ok) setCarrito(VACIO);
                }}
              >
                Cobrar {pesos(total)}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default memo(VentaDeMostrador);
