// Las piezas de la pantalla de Auditoría (server components sin lecturas): los filtros, la
// lista y las páginas. Separadas de page.tsx para poder dibujarlas con datos de prueba y
// medirlas a 412 px (una página de Next sólo puede exportar la página).

import Link from "next/link";
import { fmtDateTime, fmtDateTimeAr } from "@/lib/datetime";
import { formatActor } from "@/lib/audit-actor";
import { Bloque, Button, Field, Input, Renglon, Select, buttonClasses, fmtNumberAR } from "@/components/ui";
import { chipLinkAtributos } from "@/components/ui/Chip";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { diaLargo, diaRelativo } from "../caja/_renglon/fechas";
import {
  QUIEN_FIJOS,
  TIPOS,
  atajosDePeriodo,
  hayFiltros,
  hrefAuditoria,
  opcionesSobre,
  valorDeQuien,
  type FiltrosAuditoria,
} from "./filtros";
import { describirAccion, type FilaParaDescribir } from "./frase";

/** Una fila de AuditLog, lo que la lista necesita. */
export type EntradaDeAuditoria = FilaParaDescribir & { id: string; createdAt: Date };

/** Las acciones, de la más nueva a la más vieja: tabla en la PC, tarjetas en el celular. */
export function ListaDeAcciones({ entradas, nombres }: { entradas: readonly EntradaDeAuditoria[]; nombres: Map<string, string> }) {
  return (
    <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
      <table className="block sm:table w-full text-left text-sm">
        <caption className="sr-only">Acciones registradas, de la más nueva a la más vieja</caption>
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-line bg-surface-sunken text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-2 font-medium">Cuándo</th>
            <th scope="col" className="px-4 py-2 font-medium">Quién</th>
            <th scope="col" className="px-4 py-2 font-medium">Qué pasó</th>
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {entradas.map((e) => {
            const d = describirAccion(e);
            return (
              <tr
                key={e.id}
                className="block sm:table-row rounded-lg border border-line sm:border-0 sm:border-b sm:border-line sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0"
              >
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 align-top text-muted sm:text-body whitespace-nowrap tabular-nums">
                  <time dateTime={e.createdAt.toISOString()} title={fmtDateTime(e.createdAt)}>
                    {fmtDateTimeAr(e.createdAt)}
                  </time>
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 align-top text-body">
                  <span className="sm:hidden text-xs uppercase tracking-wide text-muted mr-1.5">Quién:</span>
                  {formatActor(e.actor, nombres)}
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 align-top">
                  <p className="text-strong break-words">{d.frase}</p>
                  {d.detalle.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-xs text-muted break-words">
                      {d.detalle.map((linea, i) => (
                        <li key={i}>{linea}</li>
                      ))}
                    </ul>
                  )}
                  {d.tecnico && <RegistroTecnico e={e} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * DISEÑO NUEVO («Renglón»): el libro de novedades. Un bloque por día («Jueves 24 de septiembre ·
 * hoy»), un renglón por acción con la hora en el folio, la frase como título y quién la hizo en el
 * detalle. El registro técnico sigue a pedido, debajo. Las mismas entradas, en el mismo orden.
 */
export function LibroDeAcciones({ entradas, nombres, hoy }: { entradas: readonly EntradaDeAuditoria[]; nombres: Map<string, string>; hoy: string }) {
  const dias: { dia: string; filas: EntradaDeAuditoria[] }[] = [];
  for (const e of entradas) {
    const dia = dateStrInBusinessTz(e.createdAt);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.filas.push(e);
    else dias.push({ dia, filas: [e] });
  }
  return (
    <div className="space-y-6">
      {dias.map(({ dia, filas }) => {
        const relativo = diaRelativo(dia, hoy);
        return (
          <Bloque
            key={dia}
            id={`dia-${dia}`}
            titulo={diaLargo(dia)}
            cuenta={filas.length === 1 ? "1 acción" : `${fmtNumberAR(filas.length)} acciones`}
            nota={relativo === "hoy" || relativo === "ayer" ? relativo : undefined}
          >
            <ul>
              {filas.map((e) => {
                const d = describirAccion(e);
                return (
                  <Renglon
                    key={e.id}
                    as="li"
                    folio={
                      <time dateTime={e.createdAt.toISOString()} title={fmtDateTime(e.createdAt)} className="tabular-nums">
                        {fmtTime(e.createdAt)}
                      </time>
                    }
                    titulo={<span className="break-words">{d.frase}</span>}
                    detalle={
                      <>
                        {d.detalle.map((linea, i) => (
                          <span key={i} className="block break-words">
                            {linea}
                          </span>
                        ))}
                        {d.tecnico ? (
                          <RegistroTecnico e={e} quien={formatActor(e.actor, nombres)} />
                        ) : (
                          <span className="text-body">{formatActor(e.actor, nombres)}</span>
                        )}
                      </>
                    }
                  />
                );
              })}
            </ul>
          </Bloque>
        );
      })}
    </div>
  );
}

/**
 * Los filtros. Un formulario GET: al filtrar se vuelve a la página 1. Los atajos de período
 * ("Septiembre", "Hoy") son links que conservan quién, qué y sobre qué.
 */
export function Filtros({
  filtros,
  hoy,
  usuarios,
  conAgenda,
  renglon = false,
}: {
  filtros: FiltrosAuditoria;
  hoy: string;
  usuarios: { id: string; name: string; active: boolean }[];
  conAgenda: boolean;
  /** Diseño nuevo: los períodos en chips de una fila y el resto de los filtros plegado. */
  renglon?: boolean;
}) {
  const atajos = atajosDePeriodo(hoy);
  if (renglon) {
    const otros = [filtros.quien, filtros.tipo, filtros.sobre].filter((x) => x !== null).length;
    const periodoPropio = (filtros.desde !== null || filtros.hasta !== null) && !atajos.some((a) => filtros.desde === a.desde && filtros.hasta === a.hasta);
    return (
      <section aria-label="Filtrar la auditoría" className="mb-6 space-y-2">
        <nav aria-label="Período" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {atajos.map((a) => {
            const activo = filtros.desde === a.desde && filtros.hasta === a.hasta;
            return (
              <Link key={a.id} href={hrefAuditoria(filtros, { desde: a.desde, hasta: a.hasta, pagina: 1 })} {...chipLinkAtributos(activo, "shrink-0")}>
                {a.etiqueta}
              </Link>
            );
          })}
        </nav>
        <details open={otros > 0 || periodoPropio} className="border-b border-line">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-strong">
            Buscar por fecha, persona o tipo de acción
            {otros > 0 && <span className="text-muted">({otros === 1 ? "1 filtro" : `${otros} filtros`})</span>}
          </summary>
          <div className="pb-4 pt-2">
            <FormularioDeFiltros filtros={filtros} hoy={hoy} usuarios={usuarios} conAgenda={conAgenda} />
          </div>
        </details>
      </section>
    );
  }
  return (
    <section aria-label="Filtrar la auditoría" className="mb-lg space-y-3">
      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {atajos.map((a) => {
          const activo = filtros.desde === a.desde && filtros.hasta === a.hasta;
          return (
            <Link
              key={a.id}
              href={hrefAuditoria(filtros, { desde: a.desde, hasta: a.hasta, pagina: 1 })}
              aria-current={activo ? "true" : undefined}
              className={buttonClasses(activo ? "solid" : "outline", "sm")}
            >
              {a.etiqueta}
            </Link>
          );
        })}
      </nav>

      <FormularioDeFiltros filtros={filtros} hoy={hoy} usuarios={usuarios} conAgenda={conAgenda} />
    </section>
  );
}

/** El formulario GET de los filtros (período propio, quién, qué hizo, sobre qué): al filtrar se vuelve a la página 1. */
function FormularioDeFiltros({
  filtros,
  hoy,
  usuarios,
  conAgenda,
}: {
  filtros: FiltrosAuditoria;
  hoy: string;
  usuarios: { id: string; name: string; active: boolean }[];
  conAgenda: boolean;
}) {
  return (
    <form method="get" action="/admin/auditoria" className="grid grid-cols-2 gap-3 lg:grid-cols-[9.5rem_9.5rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-end">
      <Field label="Desde" htmlFor="au-desde">
        <Input id="au-desde" type="date" name="desde" defaultValue={filtros.desde ?? ""} max={hoy} />
      </Field>
      <Field label="Hasta" htmlFor="au-hasta">
        <Input id="au-hasta" type="date" name="hasta" defaultValue={filtros.hasta ?? ""} max={hoy} />
      </Field>
      <Field label="Quién" htmlFor="au-quien" className="col-span-2 lg:col-span-1">
        <Select id="au-quien" name="quien" defaultValue={valorDeQuien(filtros.quien)}>
          <option value="">Todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={`u:${u.id}`}>
              {u.name}
              {u.active ? "" : " (dado de baja)"}
            </option>
          ))}
          {QUIEN_FIJOS.map((q) => (
            <option key={q.valor} value={q.valor}>
              {q.etiqueta}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Qué hizo" htmlFor="au-tipo" className="col-span-2 lg:col-span-1">
        <Select id="au-tipo" name="tipo" defaultValue={filtros.tipo ?? ""}>
          <option value="">Todo</option>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sobre qué" htmlFor="au-sobre" className="col-span-2 lg:col-span-1">
        <Select id="au-sobre" name="sobre" defaultValue={filtros.sobre ?? ""}>
          <option value="">Todo</option>
          {opcionesSobre(conAgenda).map((s) => (
            <option key={s.id} value={s.id}>
              {s.etiqueta}
            </option>
          ))}
        </Select>
      </Field>
      <div className="col-span-2 flex gap-2 lg:col-span-1">
        <Button type="submit" className="flex-1">
          Filtrar
        </Button>
        {hayFiltros(filtros) && (
          <Link href="/admin/auditoria" className={buttonClasses("outline", "md", "flex-1")}>
            Limpiar
          </Link>
        )}
      </div>
    </form>
  );
}

/** El registro tal cual quedó guardado, para soporte o una disputa: a pedido, no a la vista. */
function RegistroTecnico({
  e,
  quien,
}: {
  e: { action: string; entity: string; entityId: string | null; changes: unknown };
  /** Diseño nuevo: quién lo hizo va en la misma línea que el pedido del registro (un toque, no dos filas). */
  quien?: string;
}) {
  if (quien !== undefined) {
    return (
      <details className="text-[13px] text-muted">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 sm:min-h-7 [&::-webkit-details-marker]:hidden">
          <span className="text-body">{quien}</span>
          <span aria-hidden>·</span>
          <span className="underline decoration-line-strong underline-offset-2 hover:text-strong">registro técnico</span>
        </summary>
        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all bg-surface-sunken p-2 font-mono text-[11px] text-body">
          {JSON.stringify({ accion: e.action, sobre: e.entity, id: e.entityId, cambios: e.changes ?? null }, null, 2)}
        </pre>
      </details>
    );
  }
  return (
    <details className="mt-1 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md sm:min-h-8 hover:text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Ver el registro técnico
      </summary>
      <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-sunken p-2 font-mono text-[11px] text-body">
        {JSON.stringify({ accion: e.action, sobre: e.entity, id: e.entityId, cambios: e.changes ?? null }, null, 2)}
      </pre>
    </details>
  );
}

/** Más nuevas / más viejas, y en qué página se está. */
export function Paginas({ filtros, paginas }: { filtros: FiltrosAuditoria; paginas: number }) {
  const p = filtros.pagina;
  return (
    <nav aria-label="Páginas de la auditoría" className="mt-md flex flex-wrap items-center justify-between gap-3">
      {p > 1 ? (
        <Link href={hrefAuditoria(filtros, { pagina: p - 1 })} rel="prev" className={buttonClasses("outline", "md")}>
          ← Más nuevas
        </Link>
      ) : (
        <span aria-hidden />
      )}
      <p className="text-sm text-muted tabular-nums">
        Página {fmtNumberAR(p)} de {fmtNumberAR(paginas)}
      </p>
      {p < paginas ? (
        <Link href={hrefAuditoria(filtros, { pagina: p + 1 })} rel="next" className={buttonClasses("outline", "md")}>
          Más viejas →
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}
