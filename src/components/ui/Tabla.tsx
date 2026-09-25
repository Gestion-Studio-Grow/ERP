"use client";

// ============================================================================
// TABLA DENSA — la pieza central de «Renglón».
// ============================================================================
//
// Cabecera de 32 px, filas de 40 px con raya, cifras a la derecha en la columna de plata, la fila
// entera enlazada a su ficha y UNA tecla del paso que sigue al final. Encima, cuando hay algo
// seleccionado, la barra de lote pegada a la cabecera («3 seleccionados · Marcar preparados ·
// Avisar por WhatsApp»: sólo verbos que existen, los pone el llamador). En un contenedor angosto
// (el celular), cada fila son dos líneas: folio y plata arriba, asunto y tecla abajo.
//
// NO trae datos ni decide nada del negocio: la página (servidor) trae las filas ya filtradas,
// ordenadas y paginadas con los mismos parámetros de la URL (tabla-core.ts). Esta pieza:
//   · ordena por URL: el encabezado es un enlace a `?orden=clave` / `?orden=-clave`;
//   · abre la fila: clic en la fila (fuera de sus teclas) o Enter con el foco, a su ficha (`enlace`)
//     o a un cajón de la misma pantalla (`onAbrir`);
//   · selecciona: casilla de 20 px con área de 44, Mayúsculas para un rango, ⇧A todo, Esc limpia;
//   · teclado: ↑/↓ o j/k mueven el foco de fila (raya a la izquierda), x selecciona, la letra de
//     la tecla de contexto la ejecuta sobre la fila con foco. Nunca con el foco en un campo o con
//     un diálogo abierto, y nunca con Ctrl/⌘/Alt (Ctrl/⌘K es del buscador).
//
// Uso (desde un client component de la pantalla, que es quien tiene las funciones de celda):
//
//     <Tabla titulo="Pedidos abiertos" filas={pedidos} clave={(p) => p.id}
//       columnas={[{ clave: "numero", titulo: "#", movil: "folio", celda: (p) => `#${p.code}` }, …]}
//       enlace={(p) => `/admin/pedidos/${p.id}`} seleccion lote={(ids, limpiar) => <Button …/>}
//       teclas={[{ letra: "p", que: "preparar", hacer: (p) => preparar(p.id) }]} />

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "./cn";
import { ariaSortFor } from "./data-table-sort";
import { esCampo, hayAlgoEncima } from "./tecla-de-pantalla";
import {
  accionDeTecla,
  aperturaDeFila,
  alternarSeleccion,
  estadoDeTodas,
  hrefConParametros,
  moverFoco,
  ordenAUrl,
  ordenDesdeUrl,
  seleccionarRango,
  siguienteOrden,
} from "./tabla-core";
import { MenuMas } from "./MenuMas";

/** ⇅: dos flechas, una sube y otra baja. */
function IconoOrden() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14M12.5 15.5 16 19l3.5-3.5" />
    </svg>
  );
}

export type ColumnaTabla<T> = {
  clave: string;
  titulo: string;
  celda: (fila: T) => React.ReactNode;
  /** Cifras y plata: a la derecha. */
  alinear?: "derecha";
  /** El encabezado ordena por URL (la página tiene que entender esa clave). */
  ordenable?: boolean;
  /**
   * Dónde va en el celular (dos líneas): `folio` y `plata` arriba, `asunto` y `tecla` abajo,
   * `detalle` debajo del asunto; `oculta` no se ve en el celular. Por defecto, `detalle`.
   */
  movil?: "folio" | "asunto" | "detalle" | "plata" | "tecla" | "oculta";
  className?: string;
};

export type TeclaDeFila<T> = {
  /** Una letra («p»). */
  letra: string;
  /** El verbo del pie de atajos («preparar»). */
  que: string;
  hacer: (fila: T) => void;
  /** Si no aplica a esa fila (ya preparado), la letra no hace nada. */
  aplica?: (fila: T) => boolean;
};

export type TablaProps<T> = {
  /** Qué es la tabla, para el lector de pantalla (`<caption>`). */
  titulo: string;
  filas: readonly T[];
  clave: (fila: T) => string;
  columnas: readonly ColumnaTabla<T>[];
  /** La ficha de la fila: clic en la fila o Enter la abren. */
  enlace?: (fila: T) => string | null;
  /**
   * Abrir la fila en esta misma pantalla (un cajón): clic en el renglón o Enter con el foco.
   * Si la fila tiene `enlace`, gana el enlace.
   */
  onAbrir?: (fila: T) => void;
  /** Con casillas y barra de lote. */
  seleccion?: boolean;
  /** Lo que se hace con lo seleccionado. Sólo verbos que existen. */
  lote?: (claves: string[], limpiar: () => void) => React.ReactNode;
  teclas?: readonly TeclaDeFila<T>[];
  /** El nombre del parámetro de orden en la URL. */
  parametroOrden?: string;
  /** Lo que se muestra sin filas: una frase con qué pasa y qué hacer. */
  vacio?: React.ReactNode;
  /** A la izquierda del pie: «10 de 10 abiertos». */
  cuenta?: React.ReactNode;
  /** A la derecha del pie: «Siguientes 50» (enlace con `?cursor=`), el orden actual. */
  pie?: React.ReactNode;
  /**
   * Arriba de la lista, en UNA fila con «Ordenar» (⇅, sólo en el celular): el buscador de la
   * lista y, si hace falta, un «⋯». Así la primera pantalla del celular es de renglones, no de botones.
   */
  barra?: React.ReactNode;
  /** Debajo de la barra: la fila de filtros (chips con scroll horizontal propio). */
  filtros?: React.ReactNode;
  /** Escuchar el teclado (j/k, x, Enter…). Una sola tabla por pantalla debería escucharlo. */
  teclado?: boolean;
  className?: string;
};

export function Tabla<T>({
  titulo,
  filas,
  clave,
  columnas,
  enlace,
  onAbrir,
  seleccion = false,
  lote,
  teclas = [],
  parametroOrden = "orden",
  vacio,
  cuenta,
  pie,
  barra,
  filtros,
  teclado = true,
  className,
}: TablaProps<T>) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const idTabla = useId();
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const claves = useMemo(() => filas.map(clave), [filas, clave]);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [foco, setFoco] = useState(-1);
  const ultimaTocada = useRef<string | null>(null);

  const ordenables = columnas.filter((c) => c.ordenable).map((c) => c.clave);
  const orden = ordenDesdeUrl(params.get(parametroOrden), ordenables);
  const colOrden = orden ? columnas.find((c) => c.clave === orden.key) : undefined;
  const ordenActual = colOrden?.titulo ?? null;
  const hrefOrden = (col: string) =>
    hrefConParametros(ruta, params, { [parametroOrden]: ordenAUrl(siguienteOrden(orden, col)) });

  // Lo seleccionado que ya no está en pantalla (cambió el filtro) no cuenta.
  const seleccionadas = claves.filter((k) => sel.has(k));
  const todas = estadoDeTodas(sel, claves);
  const focoValido = foco >= 0 && foco < filas.length ? foco : -1;

  const limpiar = useCallback(() => setSel(new Set()), []);

  const abrir = useCallback(
    (i: number) => {
      const f = filas[i];
      if (f === undefined) return;
      const a = aperturaDeFila(enlace?.(f), onAbrir !== undefined);
      if (a?.tipo === "enlace") router.push(a.href);
      else if (a?.tipo === "cajon") onAbrir?.(f);
    },
    [filas, enlace, onAbrir, router],
  );

  // El foco de fila siempre a la vista.
  useEffect(() => {
    if (focoValido < 0) return;
    cuerpo.current?.rows[focoValido]?.scrollIntoView({ block: "nearest" });
  }, [focoValido]);

  useEffect(() => {
    if (!teclado) return;
    const letras = teclas.map((t) => t.letra);
    const alPresionar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || esCampo(e.target) || hayAlgoEncima()) return;
      const a = accionDeTecla(e, letras);
      if (!a) return;
      if (a.tipo === "mover") {
        e.preventDefault();
        setFoco((f) => moverFoco(f >= filas.length ? -1 : f, a.delta, filas.length));
      } else if (a.tipo === "seleccionar" && seleccion && focoValido >= 0) {
        e.preventDefault();
        setSel((s) => alternarSeleccion(s, claves[focoValido]));
      } else if (a.tipo === "abrir" && focoValido >= 0) {
        // Enter sobre un botón o un enlace es de ese botón.
        if (e.target instanceof HTMLElement && e.target.closest("a, button")) return;
        e.preventDefault();
        abrir(focoValido);
      } else if (a.tipo === "todas" && seleccion) {
        e.preventDefault();
        setSel(new Set(claves));
      } else if (a.tipo === "limpiar") {
        if (sel.size === 0 && focoValido < 0) return;
        setSel(new Set());
        setFoco(-1);
      } else if (a.tipo === "tecla" && focoValido >= 0) {
        const t = teclas.find((x) => x.letra === a.letra);
        const f = filas[focoValido];
        if (t && f && (t.aplica?.(f) ?? true)) {
          e.preventDefault();
          t.hacer(f);
        }
      }
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [teclado, teclas, filas, claves, focoValido, seleccion, sel.size, abrir]);

  const alTocarFila = (e: React.MouseEvent<HTMLTableRowElement>, i: number) => {
    setFoco(i);
    if ((e.target as HTMLElement).closest("a, button, input, label, select, textarea, [role='menu'], [popover], dialog")) return;
    if (e.metaKey || e.ctrlKey) {
      const href = enlace?.(filas[i]);
      if (href) window.open(href, "_blank", "noopener");
      return;
    }
    abrir(i);
  };

  const alMarcar = (k: string, conRango: boolean) => {
    setSel((s) => (conRango ? seleccionarRango(s, claves, ultimaTocada.current, k) : alternarSeleccion(s, k)));
    ultimaTocada.current = k;
  };

  const atajos = [
    { teclas: ["↑", "↓"], que: "mover" },
    ...(seleccion ? [{ teclas: ["x"], que: "seleccionar" }, { teclas: ["⇧", "A"], que: "todo lo filtrado" }] : []),
    ...(enlace ? [{ teclas: ["Enter"], que: "abrir" }] : []),
    ...teclas.map((t) => ({ teclas: [t.letra], que: t.que })),
  ];

  return (
    <div data-ui="tabla-densa" className={cn("min-w-0", className)}>
      {(barra || ordenables.length > 0) && (
        <div data-parte="barra">
          {barra}
          {ordenables.length > 0 && (
            // En la PC el orden está en los encabezados; en el celular (sin encabezados) es un ⇅
            // al lado del buscador, no dos filas de botones arriba de la lista.
            <span data-parte="orden-movil">
              <MenuMas etiqueta={`Ordenar la lista${ordenActual ? ` (ahora: ${ordenActual})` : ""}`} icono={<IconoOrden />}>
                <p data-parte="menu-titulo">Ordenar por</p>
                {columnas
                  .filter((c) => c.ordenable)
                  .map((c) => (
                    <Link key={c.clave} href={hrefOrden(c.clave)} role="menuitem" aria-current={orden?.key === c.clave ? "true" : undefined}>
                      {c.titulo}
                      {orden?.key === c.clave ? (
                        <span aria-hidden>{orden.direction === "asc" ? " ↑" : " ↓"}</span>
                      ) : null}
                    </Link>
                  ))}
              </MenuMas>
            </span>
          )}
        </div>
      )}
      {filtros}

      {seleccion && seleccionadas.length > 0 && (
        <div data-parte="lote" role="region" aria-label="Acciones sobre lo seleccionado" aria-live="polite">
          <strong>
            {seleccionadas.length} {seleccionadas.length === 1 ? "seleccionado" : "seleccionados"}
          </strong>
          {lote?.(seleccionadas, limpiar)}
          <button type="button" data-ui="button" data-variant="ghost" data-size="sm" data-parte="limpiar" onClick={limpiar}>
            Deseleccionar
          </button>
        </div>
      )}

      <table aria-describedby={cuenta ? `${idTabla}-cuenta` : undefined}>
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr>
            {seleccion && (
              <th scope="col" data-parte="seleccion">
                <label>
                  <input
                    type="checkbox"
                    aria-label={todas === "todas" ? "Sacar todo lo de esta página" : "Seleccionar todo lo de esta página"}
                    checked={todas === "todas"}
                    ref={(el) => {
                      if (el) el.indeterminate = todas === "algunas";
                    }}
                    onChange={() => setSel(todas === "todas" ? new Set() : new Set(claves))}
                  />
                </label>
              </th>
            )}
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                data-alinear={c.alinear}
                aria-sort={c.ordenable ? ariaSortFor(orden, c.clave) : undefined}
                className={c.className}
              >
                {c.ordenable ? (
                  <Link href={hrefOrden(c.clave)} scroll={false} className="inline-flex items-center gap-1">
                    {c.titulo}
                    <span aria-hidden>{orden?.key === c.clave ? (orden.direction === "asc" ? "↑" : "↓") : ""}</span>
                  </Link>
                ) : (
                  c.titulo
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={cuerpo}>
          {filas.length === 0 && (
            <tr data-parte="vacio">
              <td colSpan={columnas.length + (seleccion ? 1 : 0)}>{vacio ?? "No hay nada con estos filtros."}</td>
            </tr>
          )}
          {filas.map((f, i) => {
            const k = claves[i];
            const marcada = sel.has(k);
            return (
              <tr
                key={k}
                aria-selected={seleccion ? marcada : undefined}
                data-foco={i === focoValido ? "" : undefined}
                data-enlace={aperturaDeFila(enlace?.(f), onAbrir !== undefined) ? "" : undefined}
                onClick={(e) => alTocarFila(e, i)}
              >
                {seleccion && (
                  <td data-parte="seleccion">
                    <label>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar"
                        checked={marcada}
                        onClick={(e) => alMarcar(k, e.shiftKey)}
                        onChange={() => {}}
                      />
                    </label>
                  </td>
                )}
                {columnas.map((c) => (
                  <td key={c.clave} data-movil={c.movil ?? "detalle"} data-alinear={c.alinear} className={c.className}>
                    {c.celda(f)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {(cuenta || pie || (teclado && filas.length > 0)) && (
        <div data-parte="pie">
          <span id={`${idTabla}-cuenta`}>{cuenta}</span>
          {teclado && filas.length > 0 && (
            <p data-ui="atajos">
              {atajos.map((a) => (
                <span key={a.que}>
                  {a.teclas.map((t) => (
                    <kbd key={t} data-ui="kbd">
                      {t}
                    </kbd>
                  ))}
                  {a.que}
                </span>
              ))}
            </p>
          )}
          {pie}
        </div>
      )}
    </div>
  );
}
