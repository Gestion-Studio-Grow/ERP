"use client";

// EL RENGLÓN DEL MOSTRADOR BOUTIQUE (Magra · tanda practicidad, V-4 y V-3).
//
// A 390 px el renglón de siempre (TicketQueCrece) cortaba el nombre a «L..» y el peso entraba con
// el teclado del sistema, que sumaba ~300 px encima del pie. Acá:
//   · el nombre va ENTERO arriba (corta palabra si hace falta, nunca «…»), con «Quitar» al lado;
//   · abajo, «−» peso «+» y el total del renglón;
//   · el peso se carga con un teclado PROPIO en línea (tres filas, teclas de 48 px) y el campo
//     tiene `inputMode="none"`: el teclado del sistema no se abre. En la PC se tipea igual.
// El teclado no guarda nada: lee los dígitos del peso que ya tiene el renglón y le pasa el nuevo,
// así nunca queda desfasado de lo que se tipeó o de lo que trajo la balanza.

import { useEffect, useRef, type ReactNode } from "react";
import { Input, cn, fmtMoneyARS } from "@/components/ui";
import { Icono } from "@/components/ui/Icono";
import { aplicarTecla, valorDe, type Tecla } from "@/components/ui/teclado-core";
import { vibrar } from "@/components/ui/tactil";
import { formatearCantidad } from "@/lib/pos-peso";

/** Las teclas del teclado en línea, en tres filas de cuatro. */
export const TECLAS_DEL_RENGLON: Tecla[] = ["1", "2", "3", "borrar", "4", "5", "6", "00", "7", "8", "9", "0"];

/** Los dígitos de un peso (kg, al gramo), como los tipea el teclado: 1,28 → «1280». PURA. */
export function digitosDelPeso(kg: number): string {
  return kg > 0 && Number.isFinite(kg) ? String(Math.round(kg * 1000)) : "";
}

/** El peso que queda después de una tecla. PURA. */
export function pesoTrasTecla(kg: number, tecla: Tecla): number {
  return valorDe(aplicarTecla(digitosDelPeso(kg), tecla, "peso"), "peso");
}

function TecladoDelRenglon({ nombre, kg, onPeso }: { nombre: string; kg: number; onPeso: (kg: number) => void }) {
  const apretado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocar = (t: Tecla) => {
    vibrar(8);
    const nuevo = pesoTrasTecla(kg, t);
    if (nuevo !== kg) onPeso(nuevo);
  };
  const soltar = () => {
    if (apretado.current) clearTimeout(apretado.current);
    apretado.current = null;
  };
  return (
    <div role="group" aria-label={`Teclado del peso de ${nombre}`} data-vender="teclado-en-linea" className="grid max-w-sm grid-cols-4 gap-2">
      {TECLAS_DEL_RENGLON.map((t) => (
        <button
          key={t}
          type="button"
          data-tecla={t}
          aria-label={t === "borrar" ? "Borrar el último número (mantener: borrar todo)" : undefined}
          className="grid h-12 place-items-center rounded-lg border border-line bg-surface-raised text-xl font-semibold tabular-nums text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() => tocar(t)}
          onPointerDown={() => {
            if (t !== "borrar") return;
            apretado.current = setTimeout(() => {
              apretado.current = null;
              onPeso(0);
            }, 550);
          }}
          onPointerUp={soltar}
          onPointerLeave={soltar}
        >
          {t === "borrar" ? <Icono nombre="borrar" /> : t}
        </button>
      ))}
    </div>
  );
}

export default function RenglonBoutique({
  linea,
  nombre,
  porKilo,
  precio,
  total,
  activo,
  invalida,
  marcarInvalida,
  cambioDePrecio,
  teclado,
  pesoEnVivo,
  onActivar,
  onTipear,
  onEnter,
  onPaso,
  onQuitar,
  children,
}: {
  linea: { key: number; qtyText: string; qty: number };
  nombre: string;
  porKilo: boolean;
  precio: number;
  total: number;
  activo: boolean;
  invalida: boolean;
  /** Pintar el campo como mal (no alcanza el stock, cantidad ilegible). */
  marcarInvalida: boolean;
  /** «Subió a $29.900 recién» (MG-048). */
  cambioDePrecio: string | null;
  /** Sólo por kilo: el teclado en línea (abierto o no) y el peso que carga. */
  teclado: { abierto: boolean; onAlternar: () => void; onPeso: (kg: number) => void } | null;
  /** Sólo en el renglón activo por kilo, con la balanza por cable. */
  pesoEnVivo?: ReactNode;
  onActivar: () => void;
  onTipear: (qtyText: string) => void;
  onEnter: () => void;
  onPaso: (sentido: 1 | -1) => void;
  onQuitar: () => void;
  /** Avisos del renglón (peso por confirmar, etiqueta distinta, stock, …). */
  children?: ReactNode;
}) {
  const unidad = porKilo ? "kg" : "u";
  // Por unidad, «−/+» con cantidades enteras; por kilo, de a 100 g (PASO_KG).
  const conPasos = porKilo ? !invalida : !invalida && Number.isInteger(linea.qty);
  const abierto = teclado?.abierto ?? false;
  const li = useRef<HTMLLIElement>(null);
  // Con el teclado abierto, el renglón entero queda a la vista (arriba del pie fijo).
  useEffect(() => {
    if (abierto) li.current?.scrollIntoView?.({ block: "nearest" });
  }, [abierto]);
  return (
    <li
      ref={li}
      data-vender="renglon"
      data-activo={activo ? "" : undefined}
      className={cn("scroll-mb-48 space-y-2 rounded-md px-2 py-3", activo && porKilo && "bg-accent-soft/40")}
      onPointerDown={onActivar}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p data-vender="nombre-del-renglon" className="text-base font-semibold leading-snug text-strong [overflow-wrap:anywhere]">
            {nombre}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {linea.qty > 0 ? `${formatearCantidad(linea.qty)} ${unidad} × ` : ""}
            {fmtMoneyARS(precio, Number.isInteger(precio) ? 0 : 2)}/{unidad}
          </p>
        </div>
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar línea de ${nombre}`}
          className="inline-flex h-11 shrink-0 items-center justify-center px-2 text-sm text-muted underline hover:text-danger"
        >
          Quitar
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {conPasos && (
            <button
              type="button"
              className="chip-btn h-11 w-11 justify-center text-base"
              aria-label={porKilo ? `100 gramos menos de ${nombre}` : `Una ${nombre} menos`}
              disabled={porKilo ? !(linea.qty > 0.1) : linea.qty <= 1}
              onClick={() => onPaso(-1)}
            >
              −
            </button>
          )}
          <label className="relative">
            <span className="sr-only">{porKilo ? `Peso de ${nombre} en kg` : `Cantidad de ${nombre}`}</span>
            <Input
              id={`qty-${linea.key}`}
              type="text"
              // Por kilo, el teclado es el de acá abajo: el del sistema taparía el ticket y el pie.
              inputMode={porKilo ? "none" : "numeric"}
              autoComplete="off"
              value={linea.qtyText}
              placeholder={porKilo ? "0,000" : "Cant."}
              onFocus={onActivar}
              onChange={(e) => onTipear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (linea.qty > 0) onEnter();
                }
              }}
              aria-invalid={marcarInvalida ? true : undefined}
              // Una ráfaga del lector que cae acá vuelve el campo a su valor (CampoUnico).
              data-tipo={porKilo ? "peso" : "cantidad"}
              className="h-11 w-28 pr-7 text-right text-base tabular-nums"
            />
            <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">
              {unidad}
            </span>
          </label>
          {conPasos && (
            <button
              type="button"
              className="chip-btn h-11 w-11 justify-center text-base"
              aria-label={porKilo ? `100 gramos más de ${nombre}` : `Una ${nombre} más`}
              onClick={() => onPaso(1)}
            >
              +
            </button>
          )}
        </div>
        {teclado && (
          <button type="button" className="chip-btn h-11 text-sm" aria-expanded={abierto} onClick={teclado.onAlternar}>
            {abierto ? "Cerrar teclado" : "Teclado"}
          </button>
        )}
        <span className="ml-auto text-right text-base font-semibold tabular-nums text-strong">{total > 0 ? fmtMoneyARS(total) : "—"}</span>
      </div>
      {cambioDePrecio && (
        <p role="status" data-vender="cambio-de-precio" className="w-fit rounded-full border border-warning bg-warning-soft px-3 py-1 text-xs font-semibold text-strong">
          {cambioDePrecio}
        </p>
      )}
      {children}
      {pesoEnVivo}
      {teclado && abierto && <TecladoDelRenglon nombre={nombre} kg={linea.qty} onPeso={teclado.onPeso} />}
    </li>
  );
}

/**
 * El marco del ticket boutique: lo que se quitó (con «Deshacer»), los renglones y, abajo, el
 * detalle de la cuenta (subtotal y descuento, productos y envío). SIN el total: el total es uno
 * solo y va en el pie (`PieDeCobroPlegable`), que está siempre a la vista.
 */
export function TicketBoutique({
  detalles,
  vacio,
  deshacer,
  children,
}: {
  detalles?: ReactNode;
  vacio: boolean;
  deshacer: { texto: string; onDeshacer: () => void } | null;
  children: ReactNode;
}) {
  return (
    <>
      {deshacer && (
        <div role="status" data-vender="deshacer" className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken pl-3 text-sm text-strong">
          <p className="py-2">{deshacer.texto}</p>
          <button type="button" className="h-11 shrink-0 px-3 text-sm font-semibold text-accent-ink underline" onClick={deshacer.onDeshacer}>
            Deshacer
          </button>
        </div>
      )}
      {vacio ? (
        <p className="text-sm text-muted">Pasá la etiqueta, tocá una tecla o escribí el nombre: la línea entra acá.</p>
      ) : (
        <ol aria-label="Lo que lleva" className="divide-y divide-line">
          {children}
        </ol>
      )}
      {detalles}
    </>
  );
}
