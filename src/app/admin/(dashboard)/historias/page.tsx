import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { Input, PageContainer, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { leerPaginaDeFichas } from "@/lib/clientes/lista-fichas.server";
import { clientasDeLaProfesional, type ClientaDelBuscador } from "@/lib/clientes/historia.server";
import { hrefHistoria, vistaDeHistoria } from "@/lib/clientes/historia-core";

export const dynamic = "force-dynamic";

// HISTORIAS (pedido del dueño de CH, 04/11): buscar una clienta y abrir su historia. La dueña y la
// recepción buscan entre todas las fichas (el listado de siempre, lib/clientes/lista-fichas.server);
// la profesional, sólo entre SUS clientas (con al menos un turno con ella). Un formulario GET: sin
// JavaScript, la búsqueda vive en la URL.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim().slice(0, 60);

export default async function HistoriasPage({ searchParams }: Props) {
  const user = await requireApp("historias");
  const [sp, tenantId] = await Promise.all([searchParams, getCurrentTenantId()]);
  const q = uno(sp.q);
  const pagina = Math.max(1, Number.parseInt(uno(sp.pagina), 10) || 1);
  const soloSuyas = vistaDeHistoria(user.role).soloSusClientas;

  let filas: ClientaDelBuscador[] = [];
  let paginas = 1;
  let actual = 1;
  if (soloSuyas) {
    filas = user.professionalId ? await clientasDeLaProfesional(tenantId, user.professionalId, q) : [];
  } else {
    const p = await leerPaginaDeFichas(tenantId, { q, pagina, rubro: "servicios" });
    filas = p.filas.map((f) => ({ id: f.id, nombre: f.name, telefono: f.phone }));
    paginas = p.paginas;
    actual = p.pagina;
  }
  const href = (n: number) => `/admin/historias?${new URLSearchParams({ ...(q ? { q } : {}), ...(n > 1 ? { pagina: String(n) } : {}) })}`;

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Historias"
        description={
          soloSuyas
            ? "Tus clientas: abrí su historia para ver cada turno, con quién se atendió y qué pasó."
            : "Buscá una clienta y abrí su historia: cada turno, con quién se atendió y qué pasó."
        }
      />
      <form method="get" role="search" className="mb-6 flex gap-2">
        <label htmlFor="h-q" className="sr-only">
          Buscar por nombre o teléfono
        </label>
        <Input id="h-q" name="q" type="search" defaultValue={q} placeholder="Nombre o teléfono" autoComplete="off" className="flex-1" />
        <button type="submit" className={buttonClasses("solid", "md")}>
          Buscar
        </button>
      </form>

      {filas.length === 0 ? (
        <p data-ui="vacio" className="border-y border-line py-4 text-sm text-body">
          {q ? `Ninguna clienta con «${q}». Probá con parte del nombre o los últimos números del teléfono.` : soloSuyas ? "Todavía no atendiste a ninguna clienta." : "Todavía no hay clientas cargadas."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line" aria-label="Clientas">
          {filas.map((c) => (
            <li key={c.id}>
              <Link href={hrefHistoria(c.id)} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1 py-2 hover:bg-surface-sunken">
                <span className="font-medium text-strong [overflow-wrap:anywhere]">{c.nombre}</span>
                <span className="text-sm text-muted tabular-nums">{c.telefono}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {paginas > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Páginas">
          {actual > 1 ? <Link href={href(actual - 1)} className={buttonClasses("outline", "md")}>← Anteriores</Link> : <span />}
          <span className="text-sm text-muted tabular-nums">
            Página {fmtNumberAR(actual)} de {fmtNumberAR(paginas)}
          </span>
          {actual < paginas ? <Link href={href(actual + 1)} className={buttonClasses("outline", "md")}>Siguientes →</Link> : <span />}
        </nav>
      )}
    </PageContainer>
  );
}
