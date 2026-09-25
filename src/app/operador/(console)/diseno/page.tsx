// ============================================================================
// /operador/diseno — LA GALERÍA de «Renglón» (ADR-099).
// ============================================================================
//
// La hoja de referencia del diseño nuevo: cada pieza en sus estados, en claro y en oscuro, con el
// acento de cada negocio, y el contraste MEDIDO de cada par de la piel (src/design/contraste.ts).
// La miran el dueño (repaso) y quien construye pantallas (qué pieza usar y cómo se ve).
//
// Guardia: el layout de la consola ya exige sesión de operador (`requireOperator`, y el portón
// del proxy). Se repite acá porque en Next la página y el layout se resuelven en paralelo: la
// página no depende de que el layout haya cortado antes. No toca ningún negocio ni la base.
//
// La consola lleva la piel siempre (su layout pone `data-diseno="renglon"` y monta ConDiseno); las
// dos islas de abajo fijan su tema con `data-theme` y el acento del negocio elegido.

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { requireOperator } from "@/lib/operator-session";
import { ACCENT_PRESETS, type AccentPreset } from "@/lib/branding";
import { Bloque, ChipLink, LineaDeEstado, Marca, Rotulo } from "@/components/ui";
import { medirPiel } from "@/design/contraste";
import { Muestras } from "./Muestras";
import { AvisoQuieto, DeslizarVivo, DialogoVivo, PaletaViva, TablaViva, TecladoVivo } from "./Vivos";

export const metadata: Metadata = { title: "Galería · Renglón", robots: { index: false, follow: false } };

const NEGOCIOS: { id: string; nombre: string; preset: AccentPreset | null }[] = [
  { id: "gsg", nombre: "GSG", preset: null },
  { id: "ch", nombre: "CH Estética", preset: "petroleo" },
  { id: "magra", nombre: "MAGRA", preset: "oxblood" },
  { id: "shine", nombre: "Shine", preset: "ambar" },
  { id: "adosmanos", nombre: "A Dos Manos", preset: "verde" },
];

const MODOS = [
  { id: "ambos", nombre: "Claro y oscuro" },
  { id: "claro", nombre: "Claro" },
  { id: "oscuro", nombre: "Oscuro" },
] as const;

type Modo = (typeof MODOS)[number]["id"];

function acentoDe(preset: AccentPreset | null): CSSProperties {
  if (!preset) return {};
  const p = ACCENT_PRESETS[preset];
  return {
    ["--tenant-accent-light" as string]: p.light,
    ["--tenant-on-accent-light" as string]: p.onLight,
    ["--tenant-accent-dark" as string]: p.dark,
    ["--tenant-on-accent-dark" as string]: p.onDark,
  };
}

function enlace(negocio: string, modo: Modo) {
  const q = new URLSearchParams();
  if (negocio !== "gsg") q.set("negocio", negocio);
  if (modo !== "ambos") q.set("modo", modo);
  const s = q.toString();
  return `/operador/diseno${s ? `?${s}` : ""}`;
}

export default async function GaleriaDiseno({
  searchParams,
}: {
  searchParams: Promise<{ negocio?: string; modo?: string }>;
}) {
  await requireOperator();
  const sp = await searchParams;
  const negocio = NEGOCIOS.find((n) => n.id === sp.negocio) ?? NEGOCIOS[0];
  const modo: Modo = MODOS.some((m) => m.id === sp.modo) ? (sp.modo as Modo) : "ambos";
  const islas = modo === "ambos" ? (["claro", "oscuro"] as const) : ([modo] as const);

  // El contraste de TODOS los pares de la piel, con el acento de este negocio, en los dos modos y con
  // los neutros de respaldo y teñidos.
  const medidas = medirPiel(negocio.preset ? { [negocio.preset]: ACCENT_PRESETS[negocio.preset] } : {}).filter(
    (m) => m.negocio === (negocio.preset ?? "gsg"),
  );
  const fallan = medidas.filter((m) => !m.pasa);
  const justos = [...medidas].sort((a, b) => a.razon / a.par.minimo - b.razon / b.par.minimo).slice(0, 8);

  return (
    <div className="space-y-8">
      <header>
        <Rotulo>Diseño nuevo · ADR-099</Rotulo>
        <h1 className="mt-1 text-2xl font-bold text-strong">Renglón</h1>
        <LineaDeEstado
          datos={[
            "Un renglón por cosa, la plata en su columna, una tecla por renglón",
            <Marca key="c" tipo={fallan.length === 0 ? "hecho" : "atencion"}>
              {`${medidas.length - fallan.length} de ${medidas.length} pares con contraste`}
            </Marca>,
          ]}
        />
        <nav aria-label="Acento del negocio" className="mt-4 flex flex-wrap gap-2">
          {NEGOCIOS.map((n) => (
            <ChipLink key={n.id} href={enlace(n.id, modo)} actual={n.id === negocio.id}>
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: n.preset ? ACCENT_PRESETS[n.preset].light : "oklch(38% 0.16 285)" }}
              />
              {n.nombre}
            </ChipLink>
          ))}
        </nav>
        <nav aria-label="Modo" className="mt-2 flex flex-wrap gap-2">
          {MODOS.map((m) => (
            <ChipLink key={m.id} href={enlace(negocio.id, m.id)} actual={m.id === modo}>
              {m.nombre}
            </ChipLink>
          ))}
        </nav>
      </header>

      <div className={islas.length === 2 ? "grid gap-6 2xl:grid-cols-2" : "grid"}>
        {islas.map((isla) => (
          <div
            key={isla}
            data-theme={isla === "claro" ? "light" : "dark"}
            style={acentoDe(negocio.preset)}
            className="min-w-0 border border-line bg-surface p-4 text-body sm:p-6"
          >
            <Rotulo className="mb-4">
              {isla === "claro" ? "Claro" : "Oscuro · pizarrón"} · {negocio.nombre}
            </Rotulo>
            <Muestras sufijo={isla} />
            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong pb-2">
                <h2 className="text-[15px] font-semibold text-strong">La tabla densa: selección, lote, orden en la URL y teclado</h2>
                <code className="text-[12px] text-muted">@/components/ui/Tabla</code>
              </div>
              <TablaViva sufijo={isla} />
            </section>
            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong pb-2">
                <h2 className="text-[15px] font-semibold text-strong">Lo que flota: diálogo, paleta, aviso</h2>
                <code className="text-[12px] text-muted">Dialogo · PaletaDeComandos · Aviso</code>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DialogoVivo />
                <PaletaViva />
              </div>
              <div className="mt-3">
                <AvisoQuieto />
              </div>
            </section>
            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong pb-2">
                <h2 className="text-[15px] font-semibold text-strong">Lo irreversible y la tecla de peso</h2>
                <code className="text-[12px] text-muted">DeslizarParaConfirmar · TecladoNumerico</code>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <DeslizarVivo />
                <TecladoVivo />
              </div>
            </section>
          </div>
        ))}
      </div>

      <Bloque titulo={`Contraste medido · ${negocio.nombre}`} cuenta={`${medidas.length} pares`} nota="OKLCH → sRGB → WCAG 2.2 (src/design/contraste.ts)">
        <p className="py-2 text-sm text-muted">
          {fallan.length === 0 ? "Ningún par queda debajo de su mínimo" : `${fallan.length} pares debajo del mínimo`}, en claro y en oscuro, con
          el gris de respaldo y con el gris teñido del negocio. Los más justos:
        </p>
        <ol>
          {justos.map((m) => (
            <li key={`${m.modo}${m.tenido}${m.par.frente}${m.par.fondo}`} className="flex min-h-10 min-w-0 items-center gap-3 border-b border-line text-sm">
              <span aria-hidden className="flex h-7 w-12 shrink-0 items-center justify-center rounded text-xs font-bold ring-1 ring-line" style={{ background: m.fondo, color: m.frente }}>
                {m.par.minimo === 3 ? "▬" : "Aa"}
              </span>
              <span className="min-w-0 flex-1 truncate text-body">
                {m.par.que} <span className="text-muted">({m.modo}{m.tenido ? ", teñido" : ""})</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-strong">
                {m.razon.toFixed(2).replace(".", ",")}:1 <span className="text-muted">/ {String(m.par.minimo).replace(".", ",")}</span>
              </span>
            </li>
          ))}
        </ol>
      </Bloque>
    </div>
  );
}
