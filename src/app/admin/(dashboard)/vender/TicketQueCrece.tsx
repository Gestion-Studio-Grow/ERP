"use client";

// ============================================================================
// EL TICKET QUE CRECE — el ticket vertical del mostrador nuevo (Magra tanda 2 · 2A).
// ============================================================================
//
// Arriba y fijo, el TOTAL en la cifra más grande de la pantalla (48 px, la display de la marca,
// oro sobre grafito): la clienta lo lee desde el otro lado del mostrador. Abajo, los renglones en
// el orden en que entran. Cada renglón: nombre y detalle, «−» cantidad «+», total del renglón y
// «Quitar». Quitar no pregunta: deja «Deshacer» 5 s (DESHACER_MS) y se va sin animar.
//
// El renglón ACTIVO (el último que entró, o el que se toca) es el que recibe el peso: el teclado
// grande (siempre abierto en una pantalla táctil al tocar algo por kilo) y, en la PC con la balanza
// por cable, el PESO EN VIVO adentro del renglón, que se toma solo cuando queda quieto 1 s
// (PESO_QUIETO_MS) y se corrige con «Fijar» / «Volver a pesar» (E03).
//
// Sólo presenta: el estado de la venta, la plata y las reglas viven en VenderForm y reglas-venta.ts
// (las mismas que aplica el servidor). Tokens de color, nunca hex. Nada animado.

import { useEffect, useState, type ReactNode } from "react";
import { Input, cn, fmtMoneyARS } from "@/components/ui";
import { TecladoNumerico } from "@/components/ui/Teclado";
import { formatearCantidad } from "@/lib/pos-peso";
import { useBalanzaSerie, type BalanzaSerie } from "@/lib/balanza-serie/usar-balanza-serie";
import { formatearKilos, textoDelEstado } from "@/components/balanza/TomarPesoDeBalanza";
import { PESO_QUIETO_MS, tomaElPesoSolo } from "./reglas-venta";

/** El marco del ticket: el total arriba, lo que se quitó (con «Deshacer») y los renglones. */
export default function TicketQueCrece({
  rotuloTotal,
  total,
  detalles,
  vacio,
  deshacer,
  children,
}: {
  rotuloTotal: string;
  total: number;
  /** Subtotal y descuento, productos y envío: líneas chicas bajo el rótulo. */
  detalles?: ReactNode;
  /** Sin renglones todavía: se dice cómo se carga el primero. */
  vacio: boolean;
  /** Lo último que se quitó, con su «Deshacer» (5 s). */
  deshacer: { texto: string; onDeshacer: () => void } | null;
  children: ReactNode;
}) {
  return (
    <>
      <div data-vender="total" className="flex items-end justify-between gap-2 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{rotuloTotal}</p>
          {detalles}
        </div>
        <p aria-live="polite" className="font-display text-5xl leading-none tabular-nums text-accent-ink">
          {fmtMoneyARS(total, Number.isInteger(total) ? 0 : 2)}
        </p>
      </div>
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
    </>
  );
}

/** Un renglón de producto del ticket. */
export function RenglonDelTicket({
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
  /** Sólo por kilo: el teclado grande. `version` lo vuelve a armar si el peso cambió de afuera. */
  teclado: { abierto: boolean; version: number; onAlternar: () => void; onPeso: (kg: number) => void } | null;
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
  return (
    <li
      data-vender="renglon"
      data-activo={activo ? "" : undefined}
      className={cn("space-y-2 rounded-md px-2 py-3", activo && porKilo && "bg-accent-soft/40")}
      onPointerDown={onActivar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-strong">{nombre}</p>
          <p className="text-xs tabular-nums text-muted">
            {linea.qty > 0 ? `${formatearCantidad(linea.qty)} ${unidad} × ` : ""}
            {fmtMoneyARS(precio, Number.isInteger(precio) ? 0 : 2)}/{unidad}
          </p>
        </div>
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
              inputMode="decimal"
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
              className="w-28 pr-7 text-right tabular-nums"
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
        <span className="w-24 text-right text-sm font-semibold tabular-nums text-strong">{total > 0 ? fmtMoneyARS(total) : "—"}</span>
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar línea de ${nombre}`}
          className="inline-flex h-11 items-center justify-center px-2 text-sm text-muted underline hover:text-danger"
        >
          Quitar
        </button>
      </div>
      {cambioDePrecio && (
        <p role="status" data-vender="cambio-de-precio" className="w-fit rounded-full border border-warning bg-warning-soft px-3 py-1 text-xs font-semibold text-strong">
          {cambioDePrecio}
        </p>
      )}
      {children}
      {pesoEnVivo}
      {teclado && (
        <div data-vender="teclado-de-peso" className="grid gap-2">
          <button type="button" className="chip-btn h-11 justify-self-start text-sm" aria-expanded={teclado.abierto} onClick={teclado.onAlternar}>
            {teclado.abierto ? "Cerrar el teclado grande" : "Teclado grande"}
          </button>
          {teclado.abierto && (
            <TecladoNumerico
              key={`${linea.key}-${teclado.version}`}
              modo="peso"
              etiqueta={`Peso de ${nombre}`}
              ayuda="Los números de la etiqueta de la balanza: la coma la ponemos nosotros."
              inicial={linea.qty > 0 ? String(Math.round(linea.qty * 1000)) : ""}
              onCambio={(valor) => teclado.onPeso(valor)}
              className="max-w-sm"
            />
          )}
        </div>
      )}
    </li>
  );
}

// ── La balanza por cable: UNA por pantalla (useBalanzaSerie) ────────────────────

/**
 * Engancha la balanza por cable una sola vez para todo el ticket y le pasa el estado a quien la
 * muestra (el renglón activo). Sin `negocio` (o en un navegador sin Web Serial: tablet, celular,
 * Safari) le pasa `null` y no aparece nada: el peso se carga con la etiqueta o el teclado.
 */
export function ConBalanzaEnVivo({ negocio, children }: { negocio: string | null; children: (b: BalanzaSerie | null) => ReactNode }) {
  return negocio ? <ConBalanza negocio={negocio}>{children}</ConBalanza> : <>{children(null)}</>;
}

function ConBalanza({ negocio, children }: { negocio: string; children: (b: BalanzaSerie | null) => ReactNode }) {
  // Desde el ticket no se recuerda la balanza (ver TomarPesoParaElTicket): una lectura mal
  // interpretada cobraría de más. Se recuerda en el asistente de Balanza y lector.
  const b = useBalanzaSerie({ negocio, recordarAlConectar: false });
  return <>{children(b.soportado ? b : null)}</>;
}

/**
 * El peso en vivo DENTRO del renglón activo. Se toma solo cuando queda quieto `PESO_QUIETO_MS`
 * (una vez por activación: un paquete nuevo en la balanza no pisa el renglón ya pesado); «Fijar»
 * lo toma ya, y «Volver a pesar» lo vuelve a escuchar. Va con `key` = renglón: cambiar de renglón
 * arranca de cero.
 */
export function PesoEnVivoDelRenglon({ balanza, nombre, onTomar }: { balanza: BalanzaSerie; nombre: string; onTomar: (kg: number) => void }) {
  const [tomado, setTomado] = useState<number | null>(null);
  const { estado, pesoActual, estable } = balanza;
  useEffect(() => {
    if (!tomaElPesoSolo({ estable, pesoActual, yaTomado: tomado !== null })) return;
    const t = setTimeout(() => {
      const kg = balanza.tomarPeso();
      if (kg === null) return;
      setTomado(kg);
      onTomar(kg);
    }, PESO_QUIETO_MS);
    return () => clearTimeout(t);
    // `balanza` y `onTomar` cambian en cada pintura; lo que decide es el peso y si está quieto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estable, pesoActual, tomado]);

  if (estado !== "conectada") {
    return (
      <div data-vender="peso-en-vivo" className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="chip-btn h-11 text-sm"
          disabled={estado === "buscando"}
          onClick={() => void balanza.conectar()}
        >
          {estado === "buscando" ? "Buscando la balanza…" : "Conectar balanza"}
        </button>
        {balanza.error && (
          <p role="alert" className="text-xs text-danger">
            {balanza.error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div data-vender="peso-en-vivo" className="flex flex-wrap items-center gap-2 text-sm">
      <output aria-label={`Peso de la balanza para ${nombre}`} className={cn("font-semibold tabular-nums text-strong", !estable && "text-muted")}>
        {pesoActual === null ? "—" : `${formatearKilos(pesoActual)} en vivo`}
      </output>
      {tomado === null ? (
        <button
          type="button"
          className="chip-btn h-11 text-sm"
          aria-disabled={!estable || undefined}
          onClick={() => {
            const kg = balanza.tomarPeso();
            if (kg === null) return;
            setTomado(kg);
            onTomar(kg);
          }}
        >
          Fijar
        </button>
      ) : (
        <button type="button" className="chip-btn h-11 text-sm" onClick={() => setTomado(null)}>
          Volver a pesar
        </button>
      )}
      <p role="status" className="w-full text-xs text-muted">
        {tomado !== null ? `Tomado de la balanza: ${formatearKilos(tomado)}.` : textoDelEstado(balanza)}
      </p>
    </div>
  );
}
