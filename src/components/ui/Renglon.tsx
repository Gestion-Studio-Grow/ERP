import { cn } from "./cn";

// ============================================================================
// RENGLÓN, BLOQUE, RÓTULO, LÍNEA DE ESTADO, FRANJA — la anatomía de «Renglón».
// ============================================================================
//
// Todo lo que el sistema muestra es una pila de renglones con la misma anatomía:
//
//     [folio] [asunto: título + detalle] [plata] [tecla]
//
// En la PC, una línea de 40 px con la plata en su columna fija; en el celular, dos líneas de 52 px
// (folio y plata arriba, asunto y tecla abajo). Un renglón ofrece UNA acción, la del paso que sigue;
// el resto va a «Más» (MenuMas). Los renglones se agrupan en BLOQUES: un rótulo, una raya y los
// renglones. Sin fondo, sin caja, sin sombra: las rayas ordenan.
//
// Presentacionales (sin "use client"): el llamador pone adentro sus enlaces y sus teclas. La piel
// (public/diseno/renglon.css) los viste sólo bajo `data-diseno="renglon"`.

export type RenglonProps = {
  /** Izquierda, condensado: hora, número, estado («#478 · 11:40», «Ayer 23/09»). */
  folio?: React.ReactNode;
  /** De qué se trata: el sujeto (un nombre, un producto). Un <Link> si abre una ficha. */
  titulo: React.ReactNode;
  /** Segunda línea: el detalle en palabras («4 cortes · Los Ceibos 455 · hoy»). */
  detalle?: React.ReactNode;
  /** La columna de plata (una <Plata/>, o «—»). */
  plata?: React.ReactNode;
  /** La tecla del paso que sigue, y «Más» si hace falta. */
  tecla?: React.ReactNode;
  className?: string;
  /** Atributos extra para la fila (p. ej. `data-resuelto` cuando se tacha y se va). */
  as?: "div" | "li";
};

export function Renglon({ folio, titulo, detalle, plata, tecla, className, as = "div" }: RenglonProps) {
  const Tag = as;
  return (
    <Tag data-ui="renglon" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2", className)}>
      <span data-parte="folio" className="text-[13px] text-muted">
        {folio}
      </span>
      <span data-parte="asunto" className="min-w-0 flex-1">
        <span data-parte="titulo" className="block text-strong">
          {titulo}
        </span>
        {detalle && (
          <span data-parte="detalle" className="block text-[13px] text-muted">
            {detalle}
          </span>
        )}
      </span>
      <span data-parte="plata" className="text-right">
        {plata}
      </span>
      <span data-parte="tecla">{tecla}</span>
    </Tag>
  );
}

/** El rótulo en versalitas condensadas (cabecera de bloque, de columna, de campo). */
export function Rotulo({ children, className, as = "p" }: { children: React.ReactNode; className?: string; as?: "p" | "span" | "h2" | "h3" }) {
  const Tag = as;
  return (
    <Tag data-ui="rotulo" className={cn("text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted", className)}>
      {children}
    </Tag>
  );
}

export type BloqueProps = {
  /** El título del bloque (va como h2). */
  titulo: React.ReactNode;
  /** Un número al lado del título («9», «3 abiertos»). */
  cuenta?: React.ReactNode;
  /** A la derecha de la cabeza: una frase corta o un enlace («Ver los 7 en Pedidos →»). */
  nota?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
};

/** Rótulo + raya + renglones. Reemplaza a la tarjeta. */
export function Bloque({ titulo, cuenta, nota, id, className, children }: BloqueProps) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section data-ui="bloque" id={id} aria-labelledby={idTitulo} className={className}>
      <div data-parte="cabeza" className="flex items-baseline gap-3 border-b border-line-strong pb-2">
        <h2 id={idTitulo} className="text-[15px] font-semibold text-strong">
          {titulo}
        </h2>
        {cuenta !== undefined && cuenta !== null && (
          <span data-parte="cuenta" className="text-[13px] text-muted">
            {cuenta}
          </span>
        )}
        {nota && (
          <span data-parte="nota" className="ml-auto text-[13px] text-muted">
            {nota}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * SECCIÓN — el `Bloque` un escalón más chico: rótulo en versalitas condensadas + raya. Va adentro de
 * un cajón, una hoja o un formulario largo, donde el título grande ya es el de afuera («Quién»,
 * «Cuándo», «Del remito», «Lo que llegó»). Con `id`, el rótulo nombra la sección para el lector.
 */
export function Seccion({
  titulo,
  nota,
  id,
  nivel = "h3",
  className,
  children,
}: {
  titulo: React.ReactNode;
  /** A la derecha del rótulo: una cuenta o un enlace corto. */
  nota?: React.ReactNode;
  id?: string;
  nivel?: "h2" | "h3";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-ui="seccion" aria-labelledby={id} className={className}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-1.5">
        <Rotulo as={nivel}>{id ? <span id={id}>{titulo}</span> : titulo}</Rotulo>
        {nota && <span className="text-xs tabular-nums text-muted">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * La línea de estado bajo el título: la frase del estado de la pantalla, en datos separados por
 * «·» («Caja abierta desde las 9:10 · 7 pedidos para preparar · agosto sin cerrar»). Reemplaza al
 * párrafo explicativo. Cada dato es un nodo (puede llevar <strong> o un enlace).
 */
export function LineaDeEstado({ datos, className }: { datos: readonly React.ReactNode[]; className?: string }) {
  const visibles = datos.filter((d) => d !== null && d !== undefined && d !== false && d !== "");
  if (visibles.length === 0) return null;
  return (
    <p data-ui="linea-estado" className={cn("mt-1 flex flex-wrap gap-x-2 text-sm text-muted", className)}>
      {visibles.map((d, i) => (
        <span key={i} data-parte="dato">
          {d}
        </span>
      ))}
    </p>
  );
}

/**
 * La franja: fija arriba del contenido, no flota. Para lo que cambia cómo se lee toda la pantalla:
 * modo prueba de ARCA, sin señal, un día sin cerrar. `role="status"` (se anuncia sin interrumpir).
 */
export function Franja({
  tono = "info",
  children,
  className,
}: {
  tono?: "info" | "atencion" | "peligro";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-ui="franja" data-tono={tono === "info" ? undefined : tono} role="status" className={cn("px-4 py-2 text-[13px]", className)}>
      {children}
    </div>
  );
}

/** Dos columnas 7/5 en la PC (el Inicio, una ficha); una sola en el celular. */
export function DosColumnas({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-ui="dos-columnas" className={cn("grid gap-8", className)}>
      {children}
    </div>
  );
}

/** El pie de atajos de una pantalla («/ buscar · F2 cobrar · Esc limpiar»). Se esconde en el celular. */
export function Atajos({ atajos, className }: { atajos: readonly { teclas: readonly string[]; que: string }[]; className?: string }) {
  return (
    <p data-ui="atajos" className={cn("text-xs text-muted", className)}>
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
  );
}
