import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getAuditLog } from "@/lib/audit";
import { todayInBusinessTz } from "@/lib/datetime";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { EmptyState, PageContainer, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { hayFiltros } from "./filtros";
import { Filtros, LibroDeAcciones, ListaDeAcciones, Paginas } from "./partes";
import { disenoNuevo } from "@/lib/diseno/diseno.server";

export const dynamic = "force-dynamic";

// AUDITORÍA — quién hizo qué y cuándo, con filtros y de a páginas.
//
// Antes eran las últimas 100 filas con el detalle en JSON: "las anulaciones de Juan en
// septiembre" no se podían encontrar. Ahora se filtra por período, quién, qué hizo y sobre qué
// (filtros.ts), cada fila se lee como una frase (frase.ts) y el registro técnico queda a pedido.
//
// Los filtros son un formulario GET: viven en la URL, sin JavaScript, y se pueden compartir.
// La guardia es la de siempre: `getAuditLog` exige audit:read antes de leer nada.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AuditoriaPage({ searchParams }: Props) {
  // Guardia de la app en la página; getAuditLog sigue exigiendo audit:read (la misma del registro).
  await requireApp("auditoria");
  const [{ entradas, total, filtros, usuarios, porPagina }, identidad, nuevo] = await Promise.all([
    searchParams.then((p) => getAuditLog(p)),
    getTenantIdentity(),
    disenoNuevo(),
  ]);
  const userNames = new Map(usuarios.map((u) => [u.id, u.name]));
  const hoy = todayInBusinessTz();
  const filtrado = hayFiltros(filtros);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const primera = total === 0 ? 0 : (filtros.pagina - 1) * porPagina + 1;
  const ultima = Math.min(total, filtros.pagina * porPagina);

  // DISEÑO NUEVO («Renglón»): el libro de novedades. Título + una línea de estado (cuántas, qué
  // se ve); los períodos en chips y el resto de los filtros plegado; un bloque por día con la hora
  // en el folio. Los mismos filtros en la URL, la misma lectura, la misma paginación.
  if (nuevo) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          title="Auditoría"
          estado={
            total === 0
              ? [filtrado ? "Nada con estos filtros" : "Todavía sin actividad registrada"]
              : [
                  <strong key="t">
                    {fmtNumberAR(total)} {total === 1 ? "acción" : "acciones"}
                    {filtrado ? " con estos filtros" : ""}
                  </strong>,
                  paginas > 1 ? `de la ${fmtNumberAR(primera)} a la ${fmtNumberAR(ultima)}` : null,
                  "lo más nuevo arriba",
                ]
          }
        />
        <Filtros filtros={filtros} hoy={hoy} usuarios={usuarios} conAgenda={!identidad.isRetail} renglon />
        {total === 0 ? (
          <p data-ui="vacio" className="flex flex-wrap items-center gap-3 border-y border-line py-4 text-sm text-body">
            {filtrado
              ? "No hay acciones con estos filtros: probá con otro período o sacá alguno."
              : "Cada venta, cobro, anulación, cambio de precio o cierre de caja va a quedar acá, con quién lo hizo."}
            {filtrado && (
              <Link href="/admin/auditoria" className={buttonClasses("outline", "md")}>
                Ver todo
              </Link>
            )}
          </p>
        ) : (
          <>
            <LibroDeAcciones entradas={entradas} nombres={userNames} hoy={hoy} />
            {paginas > 1 && <Paginas filtros={filtros} paginas={paginas} />}
          </>
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo: ventas, cobros, anulaciones, precios, cierres de caja y cambios de configuración. Útil ante cualquier duda o disputa."
      />

      <Filtros filtros={filtros} hoy={hoy} usuarios={usuarios} conAgenda={!identidad.isRetail} />

      {total === 0 ? (
        filtrado ? (
          <EmptyState
            title="No hay acciones con estos filtros"
            description="Probá con otro período o sacá alguno de los filtros."
            action={
              <Link href="/admin/auditoria" className={buttonClasses("outline", "md")}>
                Ver todo
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Todavía no hay actividad registrada"
            description="Cada venta, cobro, anulación, cambio de precio o cierre de caja va a quedar acá, con quién lo hizo."
            action={
              <Link href="/admin" className={buttonClasses("outline", "md")}>
                Ir al inicio
              </Link>
            }
          />
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" role="status">
            <span className="font-medium text-strong tabular-nums">{fmtNumberAR(total)}</span>{" "}
            {total === 1 ? "acción" : "acciones"}
            {filtrado ? " con estos filtros" : " registradas"}
            {paginas > 1 && (
              <>
                {" · "}mostrando <span className="tabular-nums">{fmtNumberAR(primera)}</span>–
                <span className="tabular-nums">{fmtNumberAR(ultima)}</span>, lo más nuevo arriba
              </>
            )}
          </p>

          <ListaDeAcciones entradas={entradas} nombres={userNames} />

          {paginas > 1 && <Paginas filtros={filtros} paginas={paginas} />}
        </>
      )}
    </PageContainer>
  );
}
