"use client";

// ============================================================================
// REGISTRAR UN REMITO — entra mercadería: suma stock y queda la deuda con el proveedor.
// ============================================================================
//
// Lo abren Proveedores («Registrar remito») y Stock («Ingresar por remito»); recepción lo tiene a mano en
// Proveedores (es lo único de proveedores que hace). Como el vanilla (`remitoDialogo`):
//   · el proveedor y el número de remito;
//   · el LECTOR: un campo que recibe lo que tipea el lector (código y Enter) y suma 1 por lectura, sin moverse de ahí;
//   · o BUSCARLO por nombre o código y tocarlo para sumar 1;
//   · cada línea con su cantidad y su costo por unidad (arranca con el costo de hoy), el subtotal y «Quitar»;
//   · el total y «Registrar remito».
// El borrador vive en la pantalla hasta que se registra (con «Deshacer» los 6 s del aviso). Reglas en
// proveedores-core.ts.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { Campo, etiquetaDelClub } from "./formulario-del-club";
import {
  armarRemito,
  cambiarLinea,
  candidatosParaRemito,
  ejecutarProveedores,
  leerParaElRemito,
  quitarDelRemito,
  remitoVacio,
  sumarAlRemito,
  type BorradorRemito,
  type SumaAlRemito,
} from "./proveedores-core";
import { porFirma, useSeleccion } from "./usar-almacen";

export function RegistrarRemito({ almacen, onListo, onCerrar, enfocar = true }: { almacen: Almacen; onListo?: () => void; onCerrar?: () => void; enfocar?: boolean }) {
  const [b, setB] = useState<BorradorRemito>(() => remitoVacio(almacen.estado()));
  const [busca, setBusca] = useState("");
  const [lectura, setLectura] = useState("");
  const seleccionar = useCallback((e: EstadoClub) => {
    const remito = armarRemito(e, b);
    const candidatos = candidatosParaRemito(e, busca);
    return { remito, candidatos, firma: `${remito.firma}|${JSON.stringify(candidatos)}` };
  }, [b, busca]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const ids = { titulo: useId(), proveedor: useId(), lineas: useId() };
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (enfocar) titulo.current?.focus();
  }, [enfocar]);
  const demo = almacen.modo() === "demo";

  const sumar = (r: SumaAlRemito) => {
    if (r.ok) setB(r.borrador);
    almacen.informar({ ok: r.ok, mensaje: r.mensaje });
    return r.ok;
  };

  return (
    <section aria-labelledby={ids.titulo} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4" onKeyDown={(e) => e.key === "Escape" && onCerrar?.()}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={ids.titulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            Registrar remito
          </h2>
          <p className="text-sm text-body">Entra mercadería: suma stock y queda la deuda con el proveedor.</p>
        </div>
        {onCerrar && (
          <Button variant="ghost" size="md" onClick={onCerrar}>
            Cerrar
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.proveedor} className={etiquetaDelClub}>
            Proveedor
          </label>
          <Select id={ids.proveedor} value={b.proveedorId} onChange={(e) => setB({ ...b, proveedorId: e.target.value })}>
            {v.remito.proveedores.length === 0 && <option value="">Todavía no hay proveedores</option>}
            {v.remito.proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>
        <Campo label="Número de remito" placeholder="0001-00001234" value={b.numero} onChange={(e) => setB({ ...b, numero: e.target.value })} />
      </div>

      {/* El lector escribe el código y un Enter, como un teclado: cada lectura suma 1 y el foco se queda acá. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sumar(leerParaElRemito(almacen.estado(), b, lectura));
          setLectura("");
        }}
      >
        <Campo
          label="Lector: pasá el código de barras (cada lectura suma 1)"
          ayuda={`Lectores USB o Bluetooth que escriben el código y un Enter.${demo ? " En la demo, probá con 7790000000028 y Enter." : ""}`}
          inputMode="numeric"
          value={lectura}
          onChange={(e) => setLectura(e.target.value)}
        />
      </form>

      <div className="flex flex-col gap-2">
        <Campo label="O buscalo por nombre o código" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca.trim() !== "" &&
          (v.candidatos.length === 0 ? (
            <p className="text-sm text-body">No hay productos con eso (los platos no entran por remito).</p>
          ) : (
            <ul aria-label="Productos para sumar al remito" className="flex flex-col gap-1">
              {v.candidatos.map((c) => (
                <li key={c.id}>
                  <Button
                    variant="outline"
                    size="md"
                    className="h-auto! min-h-11 w-full justify-between py-2 text-left whitespace-normal!"
                    onClick={() => {
                      if (sumar(sumarAlRemito(almacen.estado(), b, c.id))) setBusca("");
                    }}
                  >
                    <span>+ {c.nombre}</span>
                    <span className="text-sm font-normal text-body tabular-nums">{c.detalle}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <section aria-labelledby={ids.lineas} className="flex flex-col gap-2">
        <h3 id={ids.lineas} className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
          Lo que trajo <span className="tabular-nums">Total del remito {pesos(v.remito.total)}</span>
        </h3>
        {v.remito.lineas.length === 0 ? (
          <p className="text-sm text-body">Todavía no hay productos: pasá el lector o buscalos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {v.remito.lineas.map((l) => (
              <li key={l.productoId}>
                <fieldset className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
                  <legend className="px-1 text-sm font-semibold text-strong">{l.nombre}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Cantidad" inputMode="numeric" value={l.cant} onChange={(e) => setB(cambiarLinea(b, l.productoId, "cant", e.target.value))} />
                    <Campo label="Costo por unidad" inputMode="numeric" importe value={l.costo} onChange={(e) => setB(cambiarLinea(b, l.productoId, "costo", e.target.value))} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-body tabular-nums">{l.subtotal == null ? "Revisá cantidad y costo" : `Subtotal ${pesos(l.subtotal)}`}</span>
                    <Button variant="ghost" size="md" aria-label={`Quitar ${l.nombre} del remito`} onClick={() => setB(quitarDelRemito(b, l.productoId))}>
                      Quitar
                    </Button>
                  </div>
                </fieldset>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="solid"
          size="md"
          onClick={() => {
            const d = almacen.ejecutar((e, ahora, auth) => ejecutarProveedores(e, { tipo: "remito", borrador: b }, ahora, auth), { deshacible: true });
            if (!d.ok) return;
            setB(remitoVacio(almacen.estado()));
            setBusca("");
            onListo?.();
          }}
        >
          Registrar remito
        </Button>
        {onCerrar && (
          <Button variant="outline" size="md" onClick={onCerrar}>
            Cancelar
          </Button>
        )}
      </div>
    </section>
  );
}
