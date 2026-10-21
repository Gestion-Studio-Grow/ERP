"use client";

// La paleta del club (Ctrl/⌘+K o «/»), como la del club de hoy: escribir y elegir con flechas + Enter. Arma la lista
// paleta-core.ts; ClubDemo hace lo elegido. Es un <dialog data-ui="paleta">: el bloqueo de la sesión la cierra si se
// bloquea la pantalla (BloqueoDelClub), y mientras está abierta las teclas sueltas no disparan atajos.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Hoja } from "@/components/ui/Hoja";
import { cn } from "@/components/ui/cn";
import type { Almacen } from "./almacen";
import { armarPaleta, atajosDelClub, type AccionPaleta } from "./paleta-core";

export default function PaletaDelClub({
  almacen,
  hoy,
  dia,
  solapas,
  atajos,
  onElegir,
  onCerrar,
}: {
  almacen: Almacen;
  hoy: string;
  dia: string;
  solapas: readonly { id: string; etiqueta: string }[];
  atajos: boolean;
  onElegir: (a: AccionPaleta) => void;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  // Al cerrar, el foco vuelve a donde estaba (el <dialog> lo devuelve solo si nada lo movió).
  const previo = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const id = useId();
  // Se lee el estado al escribir: la paleta vive segundos y no necesita repintarse con el latido del reloj.
  const items = useMemo(() => armarPaleta(almacen.estado(), { texto, hoy, dia, solapas, atajos }), [almacen, texto, hoy, dia, solapas, atajos]);
  const i = Math.min(activo, Math.max(0, items.length - 1));

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  const elegir = (n: number) => {
    const it = items[n];
    if (!it) return;
    onCerrar();
    if (previo.current instanceof HTMLElement && previo.current.isConnected) previo.current.focus();
    onElegir(it.accion);
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setActivo((i + paso + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegir(i);
    }
  };

  return (
    <dialog
      ref={dialogo}
      data-ui="paleta"
      aria-label="Buscar o hacer"
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === dialogo.current) dialogo.current?.close();
      }}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-raised p-0 text-body shadow-overlay backdrop:bg-black/40"
    >
      <div className="flex flex-col">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-lista`}
          aria-activedescendant={items[i] ? `${id}-${items[i].clave}` : undefined}
          aria-label="Buscar un turno, un cliente o qué hacer"
          placeholder="Buscar un turno, un cliente o qué hacer…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
          }}
          onKeyDown={alTeclear}
          className="h-12 w-full border-b border-line bg-transparent px-4 text-base text-strong outline-none placeholder:text-faint"
        />
        <p role="status" aria-live="polite" className={items.length === 0 ? "px-4 py-3 text-sm text-muted" : "sr-only"}>
          {items.length === 0 ? `No encontré nada con «${texto}».` : `${items.length} resultado${items.length === 1 ? "" : "s"}`}
        </p>
        <ul id={`${id}-lista`} role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-1">

          {items.map((it, n) => (
            <li
              key={it.clave}
              id={`${id}-${it.clave}`}
              role="option"
              aria-selected={n === i}
              onMouseEnter={() => setActivo(n)}
              onClick={() => elegir(n)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-l-4 px-3 text-sm", n === i ? "border-accent bg-accent-soft" : "border-transparent")}
            >
              <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-muted">{it.grupo}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-strong">{it.titulo}</span>
              {it.detalle && <span className={cn("shrink-0 text-xs tabular-nums", it.rojo ? "font-semibold text-danger" : "text-muted")}>{it.detalle}</span>}
              {it.atajo && (
                <kbd aria-hidden="true" className="shrink-0 rounded border border-line px-1.5 text-xs text-muted">
                  {it.atajo}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}

/** ¿Es una Mac (o un iPad con teclado)? Ahí los atajos van con ⌘. */
function esMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

/**
 * La ayuda de atajos (tecla «?» o «Atajos de teclado» en la paleta), como `ayudaAtajos` del club de hoy: la lista de
 * teclas y qué hace cada una. Es una hoja (diálogo nativo): Escape o «Entendido» la cierran y el foco vuelve.
 */
export function AyudaDeAtajos({ atajos, onCerrar }: { atajos: boolean; onCerrar: () => void }) {
  const [mac] = useState(esMac);
  const lista = atajosDelClub({ mac, unaTecla: atajos });
  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo="Atajos de teclado"
      descripcion={
        atajos
          ? "Andan cuando no estás escribiendo en un campo. Todo se puede hacer también con el mouse o el dedo."
          : "Los de una tecla están apagados (se prenden desde la paleta). Quedan estos, que andan siempre que no estés escribiendo."
      }
      pie={
        <Button variant="solid" size="md" onClick={onCerrar}>
          Entendido
        </Button>
      }
    >
      <table data-ui="atajos" className="w-full text-sm">
        <caption className="sr-only">Atajos de teclado del club</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Teclas</th>
            <th scope="col">Qué hace</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.teclas.join("+")} className="border-b border-line last:border-b-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                {a.teclas.map((t, i) => (
                  <span key={i}>
                    {i > 0 && " "}
                    <kbd className="rounded border border-line-strong bg-surface-sunken px-1.5 py-0.5 text-xs font-semibold text-strong">{t}</kbd>
                  </span>
                ))}
              </th>
              <td className="py-2 text-body">{a.que}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Hoja>
  );
}
