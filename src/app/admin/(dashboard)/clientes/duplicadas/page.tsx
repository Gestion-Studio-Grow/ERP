import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { cargarDuplicadas, cargarUnificacionesRecientes } from "@/lib/crm/cargas.server";
import EnlacesClientes from "../EnlacesClientes";
import UnificarGrupo, { type FichaDelGrupo } from "./UnificarGrupo";

export const dynamic = "force-dynamic";

// UNIFICAR FICHAS DUPLICADAS — la misma persona cargada dos veces con el número escrito distinto
// ("11 4000-7919" y "+54 9 11 4000 7919"). Mientras estén partidas, su historial está repartido
// y todos los números de clientes mienten (una frecuente aparece como dos "nuevas").
//
// Los grupos salen de la clave del teléfono (src/lib/crm/identidad.ts), la misma con la que el
// alta de turno ya busca la ficha. Unificar es de la dueña o el dueño (requireApp), mueve todo
// en UNA transacción y deja en la auditoría lo necesario para deshacerlo a mano.

export default async function DuplicadasPage() {
  const user = await requireApp("unificar-fichas");
  const [grupos, recientes] = await Promise.all([cargarDuplicadas(), cargarUnificacionesRecientes()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Fichas duplicadas"
        description={
          grupos.length === 0
            ? "No hay fichas duplicadas."
            : `${grupos.length} ${grupos.length === 1 ? "persona tiene" : "personas tienen"} más de una ficha con el mismo teléfono.`
        }
      />
      <EnlacesClientes role={user.role} actual="unificar-fichas" />

      {recientes.length > 0 && (
        <section className="mb-6 rounded-lg border border-line bg-surface-raised p-4 text-sm">
          <h2 className="mb-2 font-medium text-strong">Unificaciones recientes</h2>
          <ul className="space-y-1 text-muted">
            {recientes.map((u) => (
              <li key={u.id}>
                {fmtDateTimeAr(u.el)} · {u.por}: {u.eliminadas.join(", ")} → {u.queda} ({u.turnos} {u.turnos === 1 ? "turno" : "turnos"},{" "}
                {u.pedidos} {u.pedidos === 1 ? "pedido" : "pedidos"}
                {u.fiado > 0 ? `, ${u.fiado} de fiado` : ""})
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            El detalle (la ficha borrada completa y cada turno y pedido movido) está en{" "}
            <Link href="/admin/auditoria" className="underline">
              Auditoría
            </Link>
            , para poder deshacerlo.
          </p>
        </section>
      )}

      {grupos.length === 0 ? (
        <EmptyState
          title="No hay fichas duplicadas"
          description="Cada teléfono tiene una sola ficha. El alta de turnos y la tienda ya buscan por el número, así que no deberían aparecer nuevas."
          action={
            <Link href="/admin/clientes" className={buttonClasses("outline", "md")}>
              Volver a Clientes
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {grupos.map((g) => {
            const fichas: FichaDelGrupo[] = g.fichas.map((f) => ({
              id: f.id,
              name: f.name,
              phone: f.phone,
              email: f.email,
              creada: f.createdAt.toISOString(),
              turnos: f.turnos,
              pedidos: f.pedidos,
              fiado: f.fiado,
            }));
            return (
              <li key={g.clave} className="rounded-lg border border-line bg-surface-raised p-4">
                <p className="mb-2 text-sm font-medium text-strong">Teléfono {g.clave}</p>
                <UnificarGrupo fichas={fichas} sugeridaId={g.sugerida.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
