"use client";

// Piezas chicas que repiten los cuatro roles de la demo. Se apoyan en el toolkit de la casa
// (Badge, Button, cn) y agregan sólo lo que el toolkit no tiene: pestañas accesibles, el
// semáforo de un comprobante, el chip de "de dónde salió este dato" y la lista de validaciones
// del motor. Nada de esto decide reglas: muestra lo que devolvió el motor.

import type { KeyboardEvent, ReactNode } from "react";
import { Badge, Button, Field, cn } from "@/components/ui";
import type { OrigenDato, Severidad, Validacion } from "@/lib/rendiciones";
import { LUZ, SEVERIDAD, UMBRAL_DUDA, iniciales, ordenarPorSeveridad, type Luz } from "./derivados";
import { descargarArchivo } from "./descargas";

// ─────────────────────────────────────────────────────────────────────────────
// Pestañas (patrón WAI-ARIA "tabs": flechas, Inicio y Fin mueven y activan)
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionPestana<T extends string> {
  id: T;
  texto: string;
  /** Texto corto para pantallas angostas (si falta, se usa `texto`). */
  textoCorto?: string;
  contador?: number;
}

export const idPestana = (base: string, id: string) => `${base}-pestana-${id}`;
export const idPanel = (base: string, id: string) => `${base}-panel-${id}`;

export function Pestanas<T extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
  idBase,
  variante = "subrayado",
  className,
}: {
  etiqueta: string;
  opciones: readonly OpcionPestana<T>[];
  valor: T;
  alCambiar: (id: T) => void;
  idBase: string;
  variante?: "subrayado" | "segmentado";
  className?: string;
}) {
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = opciones.findIndex((o) => o.id === valor);
    const n = opciones.length;
    const destino =
      e.key === "ArrowRight" ? (i + 1) % n
      : e.key === "ArrowLeft" ? (i - 1 + n) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : -1;
    if (destino < 0) return;
    e.preventDefault();
    const siguiente = opciones[destino].id;
    alCambiar(siguiente);
    document.getElementById(idPestana(idBase, siguiente))?.focus();
  };

  const segmentado = variante === "segmentado";
  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      className={cn(
        segmentado
          ? "grid auto-cols-fr grid-flow-col gap-1 rounded-[11px] bg-surface-sunken p-1"
          : "flex gap-6 overflow-x-auto border-b border-line",
        className,
      )}
    >
      {opciones.map((o) => {
        const activa = o.id === valor;
        return (
          <button
            key={o.id}
            id={idPestana(idBase, o.id)}
            type="button"
            role="tab"
            aria-selected={activa}
            aria-controls={activa ? idPanel(idBase, o.id) : undefined}
            tabIndex={activa ? 0 : -1}
            onClick={() => alCambiar(o.id)}
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              segmentado
                ? cn(
                    "min-h-9 rounded-lg px-3",
                    activa ? "bg-surface-raised text-strong shadow-xs" : "text-muted hover:text-strong",
                  )
                : cn(
                    "-mb-px min-h-11 border-b-2 px-0.5",
                    activa ? "border-accent text-strong" : "border-transparent text-muted hover:text-strong",
                  ),
            )}
          >
            {o.textoCorto ? (
              <>
                <span className="sm:hidden">{o.textoCorto}</span>
                <span className="hidden sm:inline">{o.texto}</span>
              </>
            ) : (
              o.texto
            )}
            {o.contador ? (
              <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold tabular-nums text-accent-ink">
                {o.contador}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Encabezado de cada rol. Misma escala que PageHeader del toolkit (27 px / 700 / -0.02em),
 * pero con <h2>: el <h1> de la página es el nombre del producto, en el encabezado fijo.
 */
export function EncabezadoRol({
  id,
  eyebrow,
  titulo,
  descripcion,
  acciones,
  className,
}: {
  id: string;
  eyebrow: string;
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
        <h2 id={id} className="mt-1.5 text-xl font-bold leading-tight tracking-[-0.02em] text-strong sm:text-[27px]">
          {titulo}
        </h2>
        {descripcion ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo, origen del dato y validaciones
// ─────────────────────────────────────────────────────────────────────────────

export function Semaforo({ luz, className }: { luz: Luz; className?: string }) {
  return (
    <Badge tone={LUZ[luz].tono} dot className={className}>
      {LUZ[luz].texto}
    </Badge>
  );
}

/** De dónde salió un dato: el QR (exacto), la IA (con su confianza) o la persona. */
export function ChipOrigen({ origen, confianza }: { origen: OrigenDato; confianza?: number }) {
  if (origen === "qr") return <Badge tone="success">QR · exacto</Badge>;
  if (origen === "ia") {
    const dudoso = confianza !== undefined && confianza < UMBRAL_DUDA;
    const porcentaje = confianza !== undefined ? ` · ${Math.round(confianza * 100)} %` : "";
    return <Badge tone={dudoso ? "warning" : "info"}>{`IA${porcentaje}${dudoso ? " · revisalo" : ""}`}</Badge>;
  }
  return <Badge tone="neutral">A mano</Badge>;
}

const ESTILO_VALIDACION: Record<Severidad, string> = {
  bloquea: "border-danger/25 bg-danger-soft",
  advierte: "border-warning/25 bg-warning-soft",
  informa: "border-line bg-surface-sunken",
};

/**
 * Lo que dijo el motor de un comprobante, de lo más grave a lo más leve. Lo que bloquea va
 * con role="alert": un lector de pantalla lo anuncia apenas aparece. La fuente normativa es
 * para el contador: en la vista de quien rinde queda plegada detrás de "¿Por qué?".
 */
export function ListaValidaciones({
  validaciones,
  conFuente = false,
  vacio = "Sin observaciones: está todo en orden.",
}: {
  validaciones: Validacion[];
  conFuente?: boolean;
  vacio?: string;
}) {
  if (!validaciones.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5 text-sm text-strong">
        <IconoCheck className="text-success" />
        {vacio}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {ordenarPorSeveridad(validaciones).map((v, i) => (
        <li key={`${v.codigo}-${i}`}>
          <div
            role={v.severidad === "bloquea" ? "alert" : undefined}
            className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", ESTILO_VALIDACION[v.severidad])}
          >
            <IconoSeveridad severidad={v.severidad} />
            <div className="min-w-0 flex-1">
              <p className="leading-snug text-strong">
                <span className="sr-only">{SEVERIDAD[v.severidad].texto}: </span>
                {v.mensaje}
              </p>
              {v.fuente && conFuente ? (
                <p className="mt-1 text-xs text-muted">
                  <span className="font-mono">{v.codigo}</span> · {v.fuente}
                </p>
              ) : null}
              {v.fuente && !conFuente ? (
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer select-none rounded hover:text-strong">¿Por qué?</summary>
                  <p className="mt-1">{v.fuente}</p>
                </details>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IconoSeveridad({ severidad }: { severidad: Severidad }) {
  if (severidad === "bloquea") return <IconoBloqueo className="mt-0.5 text-danger" />;
  if (severidad === "advierte") return <IconoAlerta className="mt-0.5 text-warning" />;
  return <IconoInfo className="mt-0.5 text-muted" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Campo de formulario accesible
// ─────────────────────────────────────────────────────────────────────────────

/** Atributos que `Campo` le pasa al control (se esparcen sobre el <input>/<select>/<textarea>). */
export interface AtributosControl {
  id: string;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/**
 * Campo con la asociación accesible completa: `aria-required` en los obligatorios y
 * `aria-describedby` apuntando a la ayuda o al error, que el lector de pantalla lee al entrar al
 * control. La etiqueta (y su asterisco) la pone el Field del toolkit; la ayuda y el error se
 * escriben acá, con id, porque Field no les asigna uno. El control llega como función:
 * `{(control) => <Select {...control} … />}`.
 */
export function Campo({
  id,
  etiqueta,
  obligatorio,
  ayuda,
  error,
  className,
  children,
}: {
  id: string;
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: string;
  error?: string;
  className?: string;
  children: (control: AtributosControl) => ReactNode;
}) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  return (
    <Field label={etiqueta} htmlFor={id} required={obligatorio} className={className}>
      {children({
        id,
        "aria-required": obligatorio || undefined,
        "aria-describedby": error ? idError : ayuda ? idAyuda : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={idError} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : ayuda ? (
        <p id={idAyuda} className="text-xs text-muted">
          {ayuda}
        </p>
      ) : null}
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filas de datos, avisos y descargas
// ─────────────────────────────────────────────────────────────────────────────

/** Fila etiqueta/valor de una lista <dl> (con el chip de origen si se conoce). */
export function FilaDato({
  etiqueta,
  children,
  origen,
  confianza,
}: {
  etiqueta: ReactNode;
  children: ReactNode;
  origen?: OrigenDato;
  confianza?: number;
}) {
  const dudoso = origen === "ia" && confianza !== undefined && confianza < UMBRAL_DUDA;
  return (
    <div className={cn("flex items-start justify-between gap-3 py-2", dudoso && "-mx-2 rounded-md bg-warning-soft px-2")}>
      <dt className="pt-px text-sm text-muted">{etiqueta}</dt>
      <dd className="flex min-w-0 flex-col items-end gap-1 text-right">
        <span className="break-words text-sm font-medium tabular-nums text-strong">{children}</span>
        {origen ? <ChipOrigen origen={origen} confianza={confianza} /> : null}
      </dd>
    </div>
  );
}

/** Confirmación de algo que salió bien (el toolkit tiene error y aviso; éxito es de la demo). */
export function AvisoExito({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-start gap-2.5 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5 text-sm text-strong", className)}
    >
      <IconoCheck className="mt-0.5 text-success" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function BotonDescargar({
  nombre,
  contenido,
  children,
  variant = "outline",
  className,
}: {
  nombre: string;
  contenido: string;
  children: ReactNode;
  variant?: "outline" | "solid" | "subtle";
  className?: string;
}) {
  return (
    <Button variant={variant} size="sm" className={className} onClick={() => descargarArchivo(nombre, contenido)}>
      <IconoDescarga />
      {children}
    </Button>
  );
}

export function Avatar({ legajo, className }: { legajo: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink",
        className,
      )}
    >
      {iniciales(legajo)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Íconos (trazo de 1.8, decorativos: siempre aria-hidden)
// ─────────────────────────────────────────────────────────────────────────────

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

type PropsIcono = { className?: string };

export function IconoCamara(p: PropsIcono) {
  return <Svg {...p}><path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3V19H4z" /><circle cx="12" cy="13.5" r="3.4" /></Svg>;
}
export function IconoQr(p: PropsIcono) {
  return <Svg {...p}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" /></Svg>;
}
export function IconoEnviar(p: PropsIcono) {
  return <Svg {...p}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></Svg>;
}
export function IconoVolver(p: PropsIcono) {
  return <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
}
export function IconoFlecha(p: PropsIcono) {
  return <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
}
export function IconoCheck(p: PropsIcono) {
  return <Svg {...p}><path d="m5 12.5 4.2 4.2L19 7" /></Svg>;
}
export function IconoAlerta(p: PropsIcono) {
  return <Svg {...p}><path d="M12 3.5 2.5 20h19zM12 10v4.5M12 17.2h.01" /></Svg>;
}
export function IconoInfo(p: PropsIcono) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></Svg>;
}
export function IconoBloqueo(p: PropsIcono) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></Svg>;
}
export function IconoDescarga(p: PropsIcono) {
  return <Svg {...p}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Svg>;
}
export function IconoReiniciar(p: PropsIcono) {
  return <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" /></Svg>;
}
export function IconoPlay(p: PropsIcono) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5.5 3.5-5.5 3.5z" /></Svg>;
}
export function IconoCerrar(p: PropsIcono) {
  return <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
}
export function IconoCandado(p: PropsIcono) {
  return <Svg {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Svg>;
}
export function IconoBolsillo(p: PropsIcono) {
  return <Svg {...p}><path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7l2-3h12l2 3M9 12h6" /></Svg>;
}
export function IconoBasura(p: PropsIcono) {
  return <Svg {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>;
}
export function IconoDerivar(p: PropsIcono) {
  return <Svg {...p}><path d="M4 12h12M12 7l5 5-5 5M20 5v14" /></Svg>;
}
export function IconoDocumento(p: PropsIcono) {
  return <Svg {...p}><path d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M10 12h5M10 16h5" /></Svg>;
}
