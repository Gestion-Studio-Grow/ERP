// El logotipo tipográfico del profe y la ilustración de la cancha (fronts/agendaprofe/DISENO.md §3 y
// §7). Son TEXTO e SVG inline, no imágenes: pesan cero bytes extra, usan la letra de la piel y se
// leen con lector de pantalla. Sirven para cualquier profe (salen de su nombre); la paleta, de
// `--padel-*`. Con la identidad provisional, el pie de la página lo avisa (no se simula la marca real).

import { cn } from "@/components/ui/cn";
import { Pelota } from "./_iconos";

/** «Profe Matías Consoli» → «Matías Consoli». */
export const nombreDelProfe = (nombreNegocio: string): string => nombreNegocio.replace(/^profe\s+/i, "").trim() || nombreNegocio;

/** Las iniciales para el monograma («MC»). */
export const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Una palabra en mayúsculas; si tiene «Í», la pelota reemplaza el acento (la firma del logotipo). */
function Palabra({ palabra }: { palabra: string }) {
  const alta = palabra.toLocaleUpperCase("es-AR");
  const i = alta.indexOf("Í");
  if (i < 0) return <span className="block">{alta}</span>;
  return (
    <span className="block">
      {alta.slice(0, i)}
      <span className="relative inline-block">
        I
        <Pelota className="absolute left-1/2 top-[-0.2em] size-[0.36em] -translate-x-1/2" costura="var(--padel-tinta)" />
      </span>
      {alta.slice(i + 1)}
    </span>
  );
}

/**
 * «MATÍAS / CONSOLI · PROFE DE PÁDEL»: dos líneas encimadas en la condensada y la bajada espaciada.
 * Va sobre la tinta (cabecera). Se anuncia como un solo texto.
 */
export function Logotipo({ nombre, bajada = "Profe de pádel", className }: { nombre: string; bajada?: string; className?: string }) {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  // Dos líneas: la primera palabra arriba, el resto abajo («MATÍAS» / «CONSOLI»).
  const lineas = palabras.length > 1 ? [palabras[0]!, palabras.slice(1).join(" ")] : palabras;
  return (
    <span className={cn("pz-logo inline-flex flex-col", className)}>
      <span className="sr-only">{`${nombre} · ${bajada}`}</span>
      <span aria-hidden className="pz-display text-[1.5rem] font-extrabold leading-[0.82] tracking-[-0.005em] lg:text-[1.875rem]">
        {lineas.map((l) => (
          <Palabra key={l} palabra={l} />
        ))}
      </span>
      <span aria-hidden className="mt-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.22em] opacity-85 lg:text-[0.6875rem]">
        {bajada}
      </span>
    </span>
  );
}

/**
 * La cancha vista desde arriba (10 × 20 m): alfombra azul, líneas blancas, la red al medio y la pelota
 * en un cuadro de saque, sobre la noche del club. Es la ilustración de la marca mientras no llegue
 * la foto del profe (§7): no es un degradé con el nombre. Encuadre 4:5; en el celular se recorta al
 * medio (16:9) con `slice`. El monograma va encima, en HTML (usa la letra de la piel).
 */
export function IlustracionCancha({ monograma, className }: { monograma: string; className?: string }) {
  // 20 m de largo = 128 unidades (6,4 por metro). La red en y=58; las líneas de saque a 6,95 m de la red.
  const red = 58;
  const saque = 6.95 * 6.4;
  return (
    <div className={cn("relative overflow-hidden rounded-[20px] bg-[var(--padel-tinta)]", className)}>
      <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden focusable={false}>
        <rect x="18" y="-6" width="64" height="128" fill="var(--padel-cancha)" />
        <g fill="none" stroke="var(--padel-sobre-tinta)" strokeWidth="1.1">
          <rect x="18" y="-6" width="64" height="128" />
          <path d={`M18 ${red - saque}H82M18 ${red + saque}H82M50 ${red - saque}V${red + saque}`} />
        </g>
        {/* La red: una banda oscura con la faja blanca arriba. */}
        <rect x="14" y={red - 1.4} width="72" height="2.8" fill="var(--padel-tinta)" opacity=".85" />
        <rect x="14" y={red - 1.6} width="72" height="0.7" fill="var(--padel-sobre-tinta)" />
        <g transform={`translate(64 ${red + 22})`}>
          <circle r="3.6" fill="var(--padel-vivo)" />
          <path d="M-2.6 -2.5a3.6 3.6 0 0 1 0 5M2.6 -2.5a3.6 3.6 0 0 0 0 5" fill="none" stroke="var(--padel-cancha)" strokeWidth=".6" />
        </g>
      </svg>
      <span
        aria-hidden
        className="pz-display absolute bottom-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--padel-tinta)] px-2.5 text-[1.375rem] font-extrabold leading-none text-[var(--padel-sobre-tinta)]"
      >
        {monograma}
      </span>
    </div>
  );
}
