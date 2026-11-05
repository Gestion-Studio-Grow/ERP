import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import { roleHasCapability } from "@/lib/capabilities";
import { fmtDateTimeAr } from "@/lib/datetime";
import { Badge, Field, Input, PageContainer, PageHeader, Select, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { leerHistoriaDeLaClienta } from "@/lib/clientes/historia.server";
import {
  ACCION_HISTORIA_VISTA,
  TURNOS_POR_PAGINA,
  duracionEnCriollo,
  hayFiltrosDeHistoria,
  hrefHistoria,
  leerFiltrosDeHistoria,
} from "@/lib/clientes/historia-core";

export const dynamic = "force-dynamic";

// LA HISTORIA DE UNA CLIENTA (pedido del dueño de CH, 04/11): cada turno, nuevo arriba, con quién la
// atendió, en qué box, cómo terminó y quién lo cerró; la plata y las notas a quien hoy las ve; y
// debajo de cada turno el rastro de la auditoría en criollo. Qué ve cada rol: lib/clientes/historia-core.ts.
// Se abre desde el cajón del turno, desde la ficha y desde Historias. Cada apertura queda auditada
// (`historia_vista`): son datos de salud.

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const TONO = { ok: "success", alerta: "warning", neutro: "neutral" } as const;

export default async function HistoriaDeLaClientaPage({ params, searchParams }: Props) {
  const user = await requireApp("historias");
  const [{ id }, sp, tenantId] = await Promise.all([params, searchParams, getCurrentTenantId()]);
  const filtros = leerFiltrosDeHistoria(sp);
  const h = await leerHistoriaDeLaClienta(tenantId, id, { role: user.role, professionalId: user.professionalId }, filtros);
  if (!h) notFound();
  if (!isDemoSandbox()) {
    await auditAdmin({ action: ACCION_HISTORIA_VISTA, entity: "Client", entityId: h.clienta.id, changes: { pagina: h.pagina, filtros: hayFiltrosDeHistoria(filtros) } });
  }

  const volver = roleHasCapability(user.role, "clients:read")
    ? { href: `/admin/clientes/${encodeURIComponent(h.clienta.id)}`, texto: "← Su ficha" }
    : { href: "/admin/historias", texto: "← Historias" };
  const filtrado = hayFiltrosDeHistoria(filtros);
  const primera = h.total === 0 ? 0 : (h.pagina - 1) * TURNOS_POR_PAGINA + 1;
  const ultima = Math.min(h.total, h.pagina * TURNOS_POR_PAGINA);

  return (
    <PageContainer width="narrow">
      <Link href={volver.href} className="text-sm text-muted hover:text-strong hover:underline inline-flex min-h-11 items-center">
        {volver.texto}
      </Link>
      <PageHeader
        title={`Historia de ${h.clienta.nombre}`}
        estado={[
          h.total === 0 ? (filtrado ? "Ningún turno con estos filtros" : "Todavía sin turnos") : `${fmtNumberAR(h.total)} ${h.total === 1 ? "turno" : "turnos"}${filtrado ? " con estos filtros" : ""}`,
          h.paginas > 1 ? `del ${fmtNumberAR(primera)} al ${fmtNumberAR(ultima)}` : null,
          "lo más nuevo arriba",
        ]}
      />

      <form method="get" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end" aria-label="Filtrar la historia">
        <Field label="Profesional" htmlFor="h-profesional">
          <Select id="h-profesional" name="profesional" defaultValue={filtros.profesional ?? ""}>
            <option value="">Todas</option>
            {h.opciones.profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Servicio" htmlFor="h-servicio">
          <Select id="h-servicio" name="servicio" defaultValue={filtros.servicio ?? ""}>
            <option value="">Todos</option>
            {h.opciones.servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde" htmlFor="h-desde">
          <Input id="h-desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} />
        </Field>
        <Field label="Hasta" htmlFor="h-hasta">
          <Input id="h-hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} />
        </Field>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className={buttonClasses("solid", "md", "flex-1 sm:flex-none")}>
            Filtrar
          </button>
          {filtrado && (
            <Link href={hrefHistoria(h.clienta.id)} className={buttonClasses("outline", "md", "flex-1 sm:flex-none")}>
              Ver todo
            </Link>
          )}
        </div>
      </form>

      {h.turnos.length === 0 ? (
        <p data-ui="vacio" className="border-y border-line py-4 text-sm text-body">
          {filtrado ? "No hay turnos con estos filtros: probá con otras fechas o sacá alguno." : "Cuando tenga su primer turno, su historia empieza acá."}
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Turnos, del más nuevo al más viejo">
          {h.turnos.map((t) => (
            <li key={t.id} className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <p className="font-medium text-strong">
                  <span className="tabular-nums">{t.fecha} · {t.hora}</span> · {t.servicio}
                </p>
                <Badge tone={TONO[t.estado.tono]}>{t.estado.texto}</Badge>
              </div>
              <p className="text-muted">
                {t.profesional} · {t.box} · {duracionEnCriollo(t.duracionMin)}
                {t.cobrado !== null && <> · cobrado <span className="tabular-nums text-body">{fmtMoneyARS(t.cobrado, 0)}</span></>}
              </p>
              {t.estado.quien && <p className="text-muted">{t.estado.quien}</p>}
              {t.notaDeLaClienta && (
                <p className="mt-1 whitespace-pre-line rounded-md border border-line px-2 py-1 text-body">Del cliente: {t.notaDeLaClienta}</p>
              )}
              {t.notaDelEquipo && (
                <p className="mt-1 whitespace-pre-line rounded-md bg-warning-soft px-2 py-1 text-body">Nota del equipo: {t.notaDelEquipo}</p>
              )}
              {t.rastro.length > 0 && (
                <details className="mt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted hover:text-strong">
                    Qué pasó con este turno ({t.rastro.length})
                  </summary>
                  <ul className="mt-1 space-y-1 border-l-2 border-line pl-3">
                    {t.rastro.map((r, i) => (
                      <li key={i}>
                        <span className="tabular-nums text-muted">{fmtDateTimeAr(r.cuando)}</span> · <span className="text-body">{r.quien}</span>: {r.frase}
                        {r.detalle.length > 0 && <span className="text-muted"> · {r.detalle.join(" · ")}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      {h.paginas > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Páginas de la historia">
          {h.pagina > 1 ? (
            <Link href={hrefHistoria(h.clienta.id, { ...filtros, pagina: h.pagina - 1 })} className={buttonClasses("outline", "md")}>
              ← Más nuevos
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted tabular-nums">
            Página {h.pagina} de {h.paginas}
          </span>
          {h.pagina < h.paginas ? (
            <Link href={hrefHistoria(h.clienta.id, { ...filtros, pagina: h.pagina + 1 })} className={buttonClasses("outline", "md")}>
              Más viejos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageContainer>
  );
}
