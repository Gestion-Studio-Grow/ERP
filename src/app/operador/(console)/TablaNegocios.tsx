"use client";

// La tabla de Negocios de la consola (la tabla densa de «Renglón»): una fila por negocio con su
// estado, su plan, su rubro, cuántas personas entran, qué tan listo está para abrir y cuánto operó.
// La fila entera abre la ficha (clic o Enter); ↑/↓ o j/k mueven el foco; el orden va en la URL
// (`?orden=`) y lo aplica el servidor. En el celular, cada fila son dos líneas.
//
// Recibe filas ya filtradas, ordenadas y dichas en palabras (negocios-core.ts): no decide nada.
//
// Con `buscador`, el celular tiene arriba de la lista su campo «Buscar un negocio» (en la PC está
// en la cabecera): filtra mientras se escribe con la misma regla que el servidor (coincideNegocio)
// y con Enter es un GET a /operador?q= como siempre, así anda también sin JavaScript.

import { useState } from "react";
import Link from "next/link";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { Marca, RielDeEstados, type TipoMarca } from "@/components/ui/Marca";
import { coincideNegocio } from "./negocios-core";

/** Lo que ya se buscó (la URL) y los filtros que el GET tiene que conservar. */
export interface BuscadorNegocios {
  q: string;
  vista: string | null;
  orden: string | null;
}

export interface FilaNegocio {
  id: string;
  nombre: string;
  slug: string;
  subdominio: string | null;
  /** «casa de la red», «local de MAGRA», «estudio contable», o null. */
  papel: string | null;
  estado: { texto: string; marca: TipoMarca };
  plan: { texto: string; nota: string | null };
  rubro: string;
  personas: number;
  listo: { hechos: number; total: number; pasos: string[]; pendientes: number } | null;
  actividad: number;
  conCandado: boolean;
}

const cifra = (n: number) => n.toLocaleString("es-AR");

function Listo({ f }: { f: FilaNegocio }) {
  if (!f.listo) return <span className="text-muted">No se pudo leer</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <RielDeEstados pasos={f.listo.pasos} hechos={f.listo.hechos} />
      {f.listo.pendientes === 0 ? (
        <Marca tipo="hecho">Listo</Marca>
      ) : (
        <span className="text-[13px] font-semibold text-warning">
          {f.listo.pendientes} {f.listo.pendientes === 1 ? "pendiente" : "pendientes"}
        </span>
      )}
    </span>
  );
}

export default function TablaNegocios({
  filas,
  total,
  vacio,
  buscador,
}: {
  filas: FilaNegocio[];
  total: number;
  vacio: React.ReactNode;
  buscador?: BuscadorNegocios;
}) {
  const [texto, setTexto] = useState(buscador?.q ?? "");
  const visibles = buscador ? filas.filter((f) => coincideNegocio(f, texto)) : filas;
  const filtraEnVivo = buscador !== undefined && visibles.length === 0 && filas.length > 0;
  const columnas: ColumnaTabla<FilaNegocio>[] = [
    {
      clave: "nombre",
      titulo: "Negocio",
      ordenable: true,
      movil: "asunto",
      celda: (f) => (
        <span className="block min-w-0">
          <Link
            href={`/operador/tenants/${f.id}`}
            className="inline-flex min-h-11 items-center font-semibold text-strong lg:min-h-0"
          >
            {f.nombre}
          </Link>
          <span className="ml-2 text-[13px] font-normal text-muted">
            {f.subdominio ?? f.slug}
            {f.papel ? ` · ${f.papel}` : ""}
          </span>
        </span>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      movil: "folio",
      celda: (f) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <Marca tipo={f.estado.marca}>{f.estado.texto}</Marca>
          {f.conCandado && <span className="text-[12px] text-muted">con candado</span>}
        </span>
      ),
    },
    {
      clave: "plan",
      titulo: "Plan",
      movil: "oculta",
      celda: (f) => (
        <span className="whitespace-nowrap">
          {f.plan.texto}
          {f.plan.nota && <span className="text-[12px] text-muted"> · {f.plan.nota}</span>}
        </span>
      ),
    },
    { clave: "rubro", titulo: "Rubro", movil: "oculta", celda: (f) => f.rubro },
    {
      clave: "personas",
      titulo: "Personas",
      ordenable: true,
      alinear: "derecha",
      movil: "oculta",
      celda: (f) => <span className="tabular-nums">{cifra(f.personas)}</span>,
    },
    { clave: "pendientes", titulo: "Listo para abrir", ordenable: true, movil: "oculta", celda: (f) => <Listo f={f} /> },
    {
      clave: "actividad",
      titulo: "Actividad",
      ordenable: true,
      alinear: "derecha",
      movil: "plata",
      celda: (f) => (
        <span className="whitespace-nowrap tabular-nums">
          <b className="font-semibold text-strong">{cifra(f.actividad)}</b>{" "}
          <span className="text-[12px] text-muted">{f.actividad === 1 ? "operación" : "operaciones"}</span>
        </span>
      ),
    },
    {
      clave: "abrir",
      titulo: "",
      movil: "tecla",
      celda: (f) => (
        <Link
          href={`/operador/tenants/${f.id}`}
          data-ui="button"
          data-variant="outline"
          data-size="sm"
          className="inline-flex items-center"
          aria-label={`Abrir la ficha de ${f.nombre}`}
        >
          Abrir
        </Link>
      ),
    },
    // Sólo en el celular (en la PC ya están sus columnas): el rubro y qué tan listo está.
    {
      clave: "resumen",
      titulo: "Resumen",
      movil: "detalle",
      className: "hidden",
      celda: (f) => (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{f.rubro}</span>
          <Listo f={f} />
        </span>
      ),
    },
  ];

  const barra = buscador && (
    <form
      id="buscar-negocio"
      role="search"
      action="/operador"
      method="get"
      className="flex min-w-0 flex-1 gap-2 lg:hidden"
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Buscar un negocio por nombre, slug o link</span>
        <input
          name="q"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar un negocio"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-base text-strong placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </label>
      {buscador.vista && <input type="hidden" name="estado" value={buscador.vista} />}
      {buscador.orden && <input type="hidden" name="orden" value={buscador.orden} />}
    </form>
  );

  return (
    <Tabla
      titulo="Negocios de la plataforma"
      filas={visibles}
      clave={(f) => f.id}
      columnas={columnas}
      enlace={(f) => `/operador/tenants/${f.id}`}
      barra={barra || undefined}
      vacio={
        filtraEnVivo ? (
          <>
            Ningún negocio de esta lista coincide con «{texto.trim()}». Tocá «Buscar» en el teclado para buscar en
            todos.
          </>
        ) : (
          vacio
        )
      }
      cuenta={
        <>
          {cifra(visibles.length)} de {cifra(total)} {total === 1 ? "negocio" : "negocios"}
        </>
      }
    />
  );
}
