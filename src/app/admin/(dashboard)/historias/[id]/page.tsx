import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { isDemoSandbox } from "@/lib/demo-flag";
import { roleHasCapability } from "@/lib/capabilities";
import { fmtDateTimeAr } from "@/lib/datetime";
import { Badge, Field, Input, PageContainer, PageHeader, Select, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { abrirHistoriaDeLaClienta, leerHistoriaDeLaClienta, type HistoriaDeLaClienta } from "@/lib/clientes/historia.server";
import {
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
// Se abre desde el cajón del turno, desde la ficha y desde Historias. Son datos de salud: cada
// apertura queda auditada (`historia_vista`) y cada intento que no se abre también
// (`historia_denegada`, con el motivo), en MODO ESTRICTO: si el registro no se escribe, no se muestra
// la historia (lib/clientes/historia.server.ts → `abrirHistoriaDeLaClienta`).
//
// En la DEMO (`DEMO_MODE_ENABLED`) no se audita, igual que el resto del ERP: el sandbox de preventa
// no persiste nada (las acciones devuelven `ok` sin escribir, src/lib/actions.ts) y sus datos y su
// usuaria son ficticios (src/lib/demo-sandbox.ts), así que no hay a quién ni qué rastrear. Es un
// deploy aislado: ningún negocio real tiene la flag.

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const TONO = { ok: "success", alerta: "warning", neutro: "neutral" } as const;

export default async function HistoriaDeLaClientaPage({ params, searchParams }: Props) {
  const user = await requireApp("historias");
  const [{ id }, sp, tenantId] = await Promise.all([params, searchParams, getCurrentTenantId()]);
  const filtros = leerFiltrosDeHistoria(sp);
  const quien = { role: user.role, professionalId: user.professionalId };
  let h: HistoriaDeLaClienta | null;
  if (isDemoSandbox()) {
    h = await leerHistoriaDeLaClienta(tenantId, id, quien, filtros);
  } else {
    try {
      h = await abrirHistoriaDeLaClienta(tenantId, id, quien, filtros, `user:${user.id}`);
    } catch (err) {
      logger.error("historia", "no se pudo registrar el acceso a la historia: no se muestra", err, { clienteId: id });
      return <AccesoSinRegistrar href={hrefHistoria(id, filtros)} />;
    }
  }
  if (!h) notFound();

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

      <form method="get" className="mb-6 grid grid-cols-2 items-end gap-3" aria-label="Filtrar la historia">
        <Field label="Profesional" htmlFor="h-profesional">
          <Select className="w-full" id="h-profesional" name="profesional" defaultValue={filtros.profesional ?? ""}>
            <option value="">Todas</option>
            {h.opciones.profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Servicio" htmlFor="h-servicio">
          <Select className="w-full" id="h-servicio" name="servicio" defaultValue={filtros.servicio ?? ""}>
            <option value="">Todos</option>
            {h.opciones.servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde" htmlFor="h-desde">
          <Input className="w-full min-w-0" id="h-desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} />
        </Field>
        <Field label="Hasta" htmlFor="h-hasta">
          <Input className="w-full min-w-0" id="h-hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
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
                {t.cobrado !== null && t.cobrado > 0 && <> · cobrado <span className="tabular-nums text-body">{fmtMoneyARS(t.cobrado, 0)}</span></>}
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

// Si el acceso no quedó registrado, la historia no se muestra (datos de salud). No dice nada de la
// clienta: la misma pantalla para cualquier id.
function AccesoSinRegistrar({ href }: { href: string }) {
  return (
    <PageContainer width="narrow">
      <div role="alert">
        <h1 className="text-2xl font-semibold text-strong">No pudimos registrar el acceso; probá de nuevo</h1>
        <p className="mt-2 text-body">
          Cada vez que alguien abre una historia queda anotado quién y cuándo. Esta vez no se pudo anotar, así que no te la mostramos. Si vuelve a pasar, avisale a la dueña.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={href} className={buttonClasses("solid", "md")}>
          Probar de nuevo
        </Link>
        <Link href="/admin/historias" className={buttonClasses("outline", "md")}>
          Ir a Historias
        </Link>
      </div>
    </PageContainer>
  );
}
