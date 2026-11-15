// PROFETURNOS · Buscador de profes (/profeturnos/profes). Público, sin sesión.
//
// Dos caminos conviven: el link propio de cada profe (su turnero, /clases en su subdominio) y este
// buscador, donde la gente encuentra profe por zona y día y ve sus próximos horarios libres. Sale
// sólo quien se anotó (Ajustes → Buscador de profes; por defecto NO). «Reservar» lleva a SU turnero
// con el horario elegido (`?hora=`). La lectura entre negocios y sus reglas: directorio.server.ts.
// Filtros por GET (sin JavaScript): anda en cualquier celular y el link filtrado se comparte.

import type { Metadata } from "next";
import Link from "next/link";
import { PieProfeTurnos } from "@/app/profeturnos/_pie";
import { diaCorto, sumarDias } from "@/lib/padel/core";
import { horaCorta, plata } from "@/app/clases/cinta";
import { todayInBusinessTz } from "@/lib/datetime";
import { directorioDeProfes } from "@/lib/profeturnos/directorio.server";
import { requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  DIAS_DEL_FILTRO,
  fechaValida,
  filtrarDirectorio,
  linkReservar,
  normalizarZona,
  proximosHorarios,
  zonasDe,
  type ProfePublico,
} from "@/lib/profeturnos/directorio-core";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profes de pádel cerca tuyo",
  description: "Buscá profe de pádel por zona y día, mirá sus horarios libres y reservá tu clase en su turnero.",
};

const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const CAMPO = `h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-strong ${FOCO}`;

// Freno por conexión (CERT 13/11), el mismo limitador en memoria que /mis-clases: 300 búsquedas cada
// 10 minutos por IP y por instancia (300 y no 60: celulares detrás de la misma IP de la operadora; CERT-2 13/11).
// El directorio ya sale de la caché de 10 min; esto corta a un bot
// que martille la página. Sin store compartido (deuda anotada en src/lib/rate-limit.ts).
const freno = createRateLimiter({ max: 300, windowMs: 10 * 60 * 1000 });

type Busqueda = { zona?: string | string[]; dia?: string | string[] };
const uno = (x: string | string[] | undefined): string | null => (typeof x === "string" ? x : null);

export default async function BuscadorDeProfes({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams;
  const hoy = todayInBusinessTz();
  const dias = Array.from({ length: DIAS_DEL_FILTRO }, (_, i) => {
    const fecha = sumarDias(hoy, i);
    return { fecha, rotulo: i === 0 ? "Hoy" : i === 1 ? "Mañana" : diaCorto(fecha) };
  });
  const diaPedido = fechaValida(uno(sp.dia));
  const dia = diaPedido && dias.some((d) => d.fecha === diaPedido) ? diaPedido : null;

  const clave = `profeturnos-profes:${(await requestIp()) ?? "sin-ip"}`;
  const frenado = freno.blocked(clave);
  let todos: ProfePublico[] | null = null;
  if (!frenado) {
    freno.fail(clave);
    try {
      todos = await directorioDeProfes();
    } catch {
      todos = null;
    }
  }
  const zonas = todos ? zonasDe(todos) : [];
  const zonaPedida = (uno(sp.zona) ?? "").trim();
  const zona = zonas.find((z) => normalizarZona(z) === normalizarZona(zonaPedida)) ?? null;
  const profes = todos ? filtrarDirectorio(todos, { zona, dia }) : [];
  const filtrado = Boolean(zona || dia);

  return (
    <>
      <main className="mx-auto max-w-3xl px-5 pb-8 pt-10 sm:pt-16">
        <Link href="/profeturnos" className={`inline-flex min-h-12 items-center text-sm font-semibold uppercase tracking-wide text-accent ${FOCO}`}>
          ProfeTurnos
        </Link>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-strong sm:text-5xl">Encontrá profe de pádel</h1>
        <p className="mt-3 max-w-2xl text-lg text-body">Elegí tu zona y el día. Ves los horarios libres de cada profe y reservás en su turnero.</p>

        <form method="get" action="/profeturnos/profes" className="mt-8 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="search" aria-label="Buscar profe">
          <div>
            <label htmlFor="zona" className="mb-1 block text-sm font-semibold text-strong">Zona</label>
            <select id="zona" name="zona" defaultValue={zona ?? ""} className={CAMPO}>
              <option value="">Todas las zonas</option>
              {zonas.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dia" className="mb-1 block text-sm font-semibold text-strong">Día</label>
            <select id="dia" name="dia" defaultValue={dia ?? ""} className={CAMPO}>
              <option value="">Cualquier día</option>
              {dias.map((d) => (
                <option key={d.fecha} value={d.fecha}>{d.rotulo}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={`h-12 rounded-xl bg-accent px-6 font-semibold text-on-accent hover:bg-accent-hover ${FOCO}`}>
            Buscar
          </button>
        </form>

        <section aria-labelledby="resultados" className="mt-8">
          <h2 id="resultados" className="sr-only">Profes</h2>
          {todos === null ? (
            <p role="status" className="rounded-2xl border border-line bg-surface-sunken p-5 text-body">
              {frenado ? "Hiciste muchas búsquedas seguidas desde esta conexión. Probá de nuevo en unos minutos." : "No pudimos cargar los profes en este momento. Probá de nuevo en un rato."}
            </p>
          ) : profes.length === 0 ? (
            <Vacio filtrado={filtrado} />
          ) : (
            <>
              <p role="status" className="mb-3 text-sm text-muted">
                {profes.length === 1 ? "1 profe" : `${profes.length} profes`}
                {zona ? ` en ${zona}` : ""}
                {dia ? ` con horarios libres ${paraElDia(dias.findIndex((d) => d.fecha === dia), dia)}` : ""}
              </p>
              <ul className="grid gap-3">
                {profes.map((p) => (
                  <Tarjeta key={p.clave} p={p} dia={dia} />
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="sos-profe" className="mt-12 rounded-2xl border border-line bg-surface p-5">
          <h2 id="sos-profe" className="text-xl font-bold text-strong">¿Sos profe?</h2>
          <p className="mt-1 text-body">Con ProfeTurnos tenés tu propio turnero y, si querés, aparecés acá.</p>
          <Link href="/profeturnos" className={`mt-3 inline-flex min-h-12 items-center font-semibold text-accent-ink underline underline-offset-4 ${FOCO}`}>
            Conocé ProfeTurnos
          </Link>
        </section>
      </main>
      <PieProfeTurnos />
    </>
  );
}

/** «para hoy», «para mañana», «para el jue 20». */
const paraElDia = (i: number, fecha: string): string => (i === 0 ? "para hoy" : i === 1 ? "para mañana" : `para el ${diaCorto(fecha)}`);

function Vacio({ filtrado }: { filtrado: boolean }) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-lg font-semibold text-strong">Todavía no hay profes en tu zona</p>
      <p className="mt-1 text-body">
        {filtrado ? "Probá con otro día o con todas las zonas." : "Estamos sumando profes. Volvé en unos días."}
      </p>
      {filtrado && (
        <Link href="/profeturnos/profes" className={`mt-3 inline-flex min-h-12 items-center font-semibold text-accent-ink underline underline-offset-4 ${FOCO}`}>
          Ver todos los profes
        </Link>
      )}
    </div>
  );
}

function Tarjeta({ p, dia }: { p: ProfePublico; dia: string | null }) {
  const horarios = proximosHorarios(p, dia);
  const titulo = `profe-${p.clave}`;
  const primero = horarios[0]?.iso ?? null;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <article aria-labelledby={titulo}>
        <h3 id={titulo} className="text-xl font-bold text-strong">{p.nombre}</h3>
        <p className="mt-0.5 text-sm text-muted">
          {p.zona}
          {p.clubes.length > 0 && ` · ${p.clubes.join(" · ")}`}
        </p>
        {p.precioIndividual > 0 && (
          <p className="mt-2 text-body">
            Clase individual <strong className="text-strong">{plata(p.precioIndividual)}</strong>
            {p.precioGrupal > 0 && <> · con amigos <strong className="text-strong">{plata(p.precioGrupal)}</strong> c/u</>}
          </p>
        )}
        {horarios.length > 0 ? (
          <>
            <p className="mt-3 text-sm font-semibold text-strong">Próximos horarios libres</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {horarios.map((h) => (
                <li key={h.iso}>
                  <a
                    href={linkReservar(p.turnero, h.iso)}
                    className={`inline-flex min-h-12 items-center rounded-full border border-line-strong bg-surface-raised px-4 text-sm font-medium text-body hover:bg-surface-sunken ${FOCO}`}
                    aria-label={`Reservar con ${p.nombre}: ${h.etiqueta} ${horaCorta(h.iso)}${h.club ? ` en ${h.club}` : ""}`}
                  >
                    {h.etiqueta} {horaCorta(h.iso)}
                    {h.club ? ` · ${h.club}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">Sin horarios libres por ahora: en su turnero le podés dejar un mensaje.</p>
        )}
        <a
          href={linkReservar(p.turnero, primero)}
          className={`mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent px-6 font-semibold text-on-accent hover:bg-accent-hover sm:w-auto ${FOCO}`}
          aria-label={primero ? `Reservar con ${p.nombre}, ${horarios[0]!.etiqueta} ${horaCorta(primero)}` : `Ver el turnero de ${p.nombre}`}
        >
          {primero ? "Reservar" : "Ver su turnero"}
        </a>
      </article>
    </li>
  );
}
