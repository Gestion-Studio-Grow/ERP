// Piezas de servidor compartidas por las pantallas de la inmobiliaria: la barra de secciones,
// los colores de cada estado y el medidor de calidad de una ficha. Sin estado propio.

import Link from "next/link";
import { cn } from "@/components/ui";
import {
  ESTADO_CONSULTA_LABEL,
  ESTADO_CUOTA_LABEL,
  ESTADO_PROPIEDAD_LABEL,
  type EstadoConsulta,
  type EstadoCuota,
  type EstadoPropiedad,
  type Urgencia,
} from "@/lib/inmobiliaria/core";

export const RAIZ = "/admin/inmobiliaria";
export const tarjeta = "rounded-2xl border border-line bg-surface-raised p-4";
export const titulo = "text-2xl font-bold text-strong";
export const subtitulo = "font-semibold text-strong";

const SECCIONES = [
  { href: RAIZ, label: "Hoy", plata: false, duenio: false },
  { href: `${RAIZ}/propiedades`, label: "Propiedades", plata: false, duenio: false },
  { href: `${RAIZ}/consultas`, label: "Consultas", plata: false, duenio: false },
  { href: `${RAIZ}/alquileres`, label: "Alquileres", plata: true, duenio: false },
  { href: `${RAIZ}/liquidaciones`, label: "Liquidaciones", plata: true, duenio: false },
  { href: `${RAIZ}/config`, label: "Configuración", plata: true, duenio: true },
];

export function BarraInmo({ activa, conPlata, esDuenio }: { activa: string; conPlata: boolean; esDuenio?: boolean }) {
  return (
    <nav aria-label="Secciones de la inmobiliaria" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {SECCIONES.filter((s) => (conPlata || !s.plata) && (esDuenio || !s.duenio)).map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.href === activa ? "page" : undefined}
          className={cn(
            "flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
            s.href === activa ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface-raised text-strong",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

const TONO_PROPIEDAD: Record<EstadoPropiedad, string> = {
  BORRADOR: "var(--text-faint)",
  PUBLICADA: "var(--success)",
  RESERVADA: "var(--warning)",
  ALQUILADA: "var(--info)",
  VENDIDA: "var(--info)",
  PAUSADA: "var(--text-faint)",
};
const TONO_CONSULTA: Record<EstadoConsulta, string> = {
  NUEVA: "var(--danger)",
  CONTACTADA: "var(--info)",
  VISITA: "var(--accent)",
  NEGOCIACION: "var(--warning)",
  GANADA: "var(--success)",
  PERDIDA: "var(--text-faint)",
};
const TONO_CUOTA: Record<EstadoCuota, string> = {
  PENDIENTE: "var(--info)",
  VENCIDA: "var(--danger)",
  PARCIAL: "var(--warning)",
  PAGADA: "var(--success)",
  ANULADA: "var(--text-faint)",
};
const TONO_URGENCIA: Record<Urgencia, string> = { "al-dia": "var(--success)", atencion: "var(--warning)", tarde: "var(--danger)" };

export const tonoUrgencia = (u: Urgencia): string => TONO_URGENCIA[u];
export const tonoConsulta = (e: EstadoConsulta): string => TONO_CONSULTA[e];

function Chip({ tono, children }: { tono: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-strong">
      <span aria-hidden className="size-2 rounded-full" style={{ background: tono }} />
      {children}
    </span>
  );
}

export const ChipPropiedad = ({ estado }: { estado: EstadoPropiedad }) => <Chip tono={TONO_PROPIEDAD[estado]}>{ESTADO_PROPIEDAD_LABEL[estado]}</Chip>;
export const ChipConsulta = ({ estado }: { estado: EstadoConsulta }) => <Chip tono={TONO_CONSULTA[estado]}>{ESTADO_CONSULTA_LABEL[estado]}</Chip>;
export const ChipCuota = ({ estado }: { estado: EstadoCuota }) => <Chip tono={TONO_CUOTA[estado]}>{ESTADO_CUOTA_LABEL[estado]}</Chip>;

/** Qué tan completa está una ficha, de 0 a 100. */
export function Calidad({ puntaje, chico }: { puntaje: number; chico?: boolean }) {
  const tono = puntaje >= 85 ? "var(--success)" : puntaje >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <span className={cn("inline-flex items-center gap-2", chico ? "text-xs" : "text-sm")} title="Qué tan completa está la ficha">
      <span className="h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--line)" }} role="img" aria-label={`Ficha completa al ${puntaje} por ciento`}>
        <span className="block h-full rounded-full" style={{ width: `${puntaje}%`, background: tono }} />
      </span>
      <span className="font-semibold tabular-nums text-strong">{puntaje}</span>
    </span>
  );
}

/** Un número grande con su leyenda, para el tablero. */
export function Dato({ valor, leyenda, href, alerta }: { valor: string | number; leyenda: string; href?: string; alerta?: boolean }) {
  const cuerpo = (
    <>
      <span className="block text-3xl font-bold tabular-nums text-strong" style={alerta ? { color: "var(--danger)" } : undefined}>
        {valor}
      </span>
      <span className="mt-1 block text-sm text-muted">{leyenda}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cn(tarjeta, "block min-h-24")}>
      {cuerpo}
    </Link>
  ) : (
    <div className={cn(tarjeta, "min-h-24")}>{cuerpo}</div>
  );
}
