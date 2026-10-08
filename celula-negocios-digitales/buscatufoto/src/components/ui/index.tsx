"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import s from "./ui.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Botón ---------- */

type Variante = "primario" | "secundario" | "claro" | "fantasma" | "peligro";
type Tam = "chico" | "normal" | "grande";

interface PropsEstiloBoton {
  variante?: Variante;
  tam?: Tam;
  ancho?: boolean;
  icono?: boolean;
}

function clasesBoton({ variante = "secundario", tam = "normal", ancho, icono }: PropsEstiloBoton, extra?: string) {
  return cx(
    s.boton,
    variante === "primario" && s.primario,
    variante === "claro" && s.claro,
    variante === "fantasma" && s.fantasma,
    variante === "peligro" && s.peligro,
    tam === "chico" && s.chico,
    tam === "grande" && s.grande,
    ancho && s.ancho,
    icono && s.icono,
    extra,
  );
}

export const Boton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & PropsEstiloBoton>(
  function Boton({ variante, tam, ancho, icono, className, type = "button", ...p }, ref) {
    return <button ref={ref} type={type} className={clasesBoton({ variante, tam, ancho, icono }, className)} {...p} />;
  },
);

export function BotonLink({
  href,
  children,
  className,
  externo,
  ...e
}: PropsEstiloBoton & { href: string; children: ReactNode; className?: string; externo?: boolean; "aria-label"?: string }) {
  const cls = clasesBoton(e, className);
  if (externo)
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" aria-label={e["aria-label"]}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls} aria-label={e["aria-label"]}>
      {children}
    </Link>
  );
}

/* ---------- Campos ---------- */

interface PropsCampo {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  className?: string;
}

/** Envuelve un control con label real, ayuda y error asociados por aria-describedby. */
export function Campo({
  etiqueta,
  ayuda,
  error,
  className,
  children,
}: PropsCampo & { children: (ids: { id: string; describedBy: string | undefined; invalido: boolean }) => ReactNode }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx(s.campo, className)}>
      <label htmlFor={id} className={s.etiqueta}>
        {etiqueta}
      </label>
      {children({ id, describedBy, invalido: !!error })}
      {ayuda ? (
        <span id={idAyuda} className={s.ayuda}>
          {ayuda}
        </span>
      ) : null}
      {error ? (
        <span id={idError} className={s.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type PropsEntrada = InputHTMLAttributes<HTMLInputElement> & PropsCampo;

export const Entrada = forwardRef<HTMLInputElement, PropsEntrada>(function Entrada(
  { etiqueta, ayuda, error, className, ...p },
  ref,
) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      {({ id, describedBy, invalido }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalido || undefined}
          className={cx(s.entrada, p.inputMode === "numeric" && "mono")}
          {...p}
        />
      )}
    </Campo>
  );
});

export function Selector({
  etiqueta,
  ayuda,
  error,
  className,
  children,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & PropsCampo) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      {({ id, describedBy, invalido }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalido || undefined} className={s.entrada} {...p}>
          {children}
        </select>
      )}
    </Campo>
  );
}

export function AreaTexto({ etiqueta, ayuda, error, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & PropsCampo) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      {({ id, describedBy, invalido }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={invalido || undefined} className={s.entrada} {...p} />
      )}
    </Campo>
  );
}

/** Clase de entrada suelta, para controles que arman su propio label. */
export const claseEntrada = s.entrada;

export function Interruptor({
  etiqueta,
  checked,
  onChange,
  disabled,
}: {
  etiqueta: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={s.interruptor}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { valor: T; texto: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className={s.segmentado} role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" className={s.segmento} aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/* ---------- Visuales ---------- */

export function Insignia({ children, tono }: { children: ReactNode; tono?: "acento" | "ok" | "demo" }) {
  return (
    <span className={cx(s.insignia, tono === "acento" && s.insigniaAcento, tono === "ok" && s.insigniaOk, tono === "demo" && s.insigniaDemo)}>
      {children}
    </span>
  );
}

/** Rótulo obligatorio para todo lo simulado (pagos, WhatsApp, cobros). */
export function ModoDemo({ children = "Modo demostración" }: { children?: ReactNode }) {
  return <Insignia tono="demo">{children}</Insignia>;
}

export function Tarjeta({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={cx(s.tarjeta, className)}>{children}</Tag>;
}

export function Aviso({ children, tono, className }: { children: ReactNode; tono?: "error" | "ok" | "demo"; className?: string }) {
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={cx(s.aviso, tono === "error" && s.avisoError, tono === "ok" && s.avisoOk, tono === "demo" && s.avisoDemo, className)}
    >
      {children}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className={s.vacio}>{children}</div>;
}

export function Girador({ etiqueta = "Cargando" }: { etiqueta?: string }) {
  return (
    <span role="status" aria-label={etiqueta} style={{ display: "inline-flex" }}>
      <span className={s.girador} aria-hidden />
    </span>
  );
}

export function BarraProgreso({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <div className={s.barraProgreso} role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <span style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

/* ---------- Diálogo nativo ---------- */

export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho,
  pie,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  ancho?: boolean;
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className={cx(s.dialogo, ancho && s.dialogoAncho)}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className={s.dialogoCabeza}>
        <h2 id={idTitulo} className={s.dialogoTitulo}>
          {titulo}
        </h2>
        <Boton variante="fantasma" icono tam="chico" aria-label="Cerrar" onClick={onCerrar}>
          <IconoCerrar />
        </Boton>
      </div>
      <div className={s.dialogoCuerpo}>{children}</div>
      {pie ? <div className={s.dialogoCuerpo} style={{ borderTop: "1px solid var(--line)" }}>{pie}</div> : null}
    </dialog>
  );
}

/* ---------- Íconos (trazo, 20 px) ---------- */

function Ic({ children, tam = 18 }: { children: ReactNode; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
export const IconoCerrar = () => <Ic><path d="M6 6l12 12M18 6L6 18" /></Ic>;
export const IconoMas = () => <Ic><path d="M12 5v14M5 12h14" /></Ic>;
export const IconoTilde = () => <Ic><path d="M5 12.5l4.5 4.5L19 7.5" /></Ic>;
export const IconoBuscar = () => <Ic><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Ic>;
export const IconoCarrito = () => <Ic><path d="M3 4h2.2l2.3 11h10.8l2-7.5H6.4" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></Ic>;
export const IconoDescargar = () => <Ic><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Ic>;
export const IconoSubir = () => <Ic><path d="M12 20V9M7 13.5l5-5 5 5M5 4h14" /></Ic>;
export const IconoBasura = () => <Ic><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9.5 7V4.5h5V7" /></Ic>;
export const IconoCopiar = () => <Ic><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></Ic>;
export const IconoEnlace = () => <Ic><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ic>;
export const IconoSol = () => <Ic><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></Ic>;
export const IconoLuna = () => <Ic><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Ic>;
export const IconoMenu = () => <Ic><path d="M4 7h16M4 12h16M4 17h16" /></Ic>;
export const IconoIdioma = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></Ic>;
export const IconoCamara = () => <Ic><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></Ic>;
export const IconoVideo = () => <Ic><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5l5-3v9l-5-3" /></Ic>;
export const IconoWhatsapp = () => <Ic><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" /><path d="M9 9.5c.3 2.2 2.3 4.3 4.6 4.8l1.2-1.2 1.7.8-.4 1.5c-3.6.4-7.6-3.4-7.3-7l1.5-.4.8 1.7z" /></Ic>;
export const IconoFlecha = () => <Ic><path d="M5 12h14M13 6l6 6-6 6" /></Ic>;
export const IconoEtiqueta = () => <Ic><path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.3" /></Ic>;
export const IconoSelfie = () => <Ic><circle cx="12" cy="10" r="3.5" /><path d="M5.5 19.5c1.3-3 3.7-4.5 6.5-4.5s5.2 1.5 6.5 4.5" /><path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" /></Ic>;
