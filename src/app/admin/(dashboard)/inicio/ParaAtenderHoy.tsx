// "Para atender hoy": arriba de todo, SÓLO lo que pide acción (entregados sin cobrar, días
// sin cerrar, stock en negativo). Junta los números en alerta de todas las apps que la
// persona ve. No consulta nada propio: pide los mismos números que los tiles y `cargarKpi`
// (react.cache) hace que la base se lea una sola vez por número.
//
// Si algún número no se pudo calcular, no dice "nada pendiente": avisa cuál quedó sin
// revisar, porque justo ahí podría haber algo.

import Link from "next/link";
import type { AppDescriptor } from "@/apps/contract";
import type { Role } from "@/lib/capabilities";
import { cargarKpi } from "@/apps/kpis/index.server";
import { IconoApp } from "@/components/iconos-apps";
import { KpiTile } from "@/components/ui";
import { AvisoError } from "@/components/ui/AvisoError";
import { listaDeNombres, paraAtenderHoy } from "./secciones";

const TITULO_ID = "para-atender-hoy";

function Encabezado() {
  return (
    <h2 id={TITULO_ID} className="mb-sm text-lg font-semibold tracking-tight text-strong">
      Para atender hoy
    </h2>
  );
}

export function ParaAtenderHoyCargando() {
  return (
    <section aria-labelledby={TITULO_ID} className="mb-xl" aria-busy="true">
      <Encabezado />
      <p className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
        Revisando lo pendiente…
      </p>
    </section>
  );
}

export default async function ParaAtenderHoy({ apps, role }: { apps: readonly AppDescriptor[]; role: Role }) {
  const items = await Promise.all(apps.map(async (app) => ({ app, resultado: await cargarKpi(app.id, role) })));
  const { alertas, sinRevisar } = paraAtenderHoy(items);

  return (
    <section aria-labelledby={TITULO_ID} className="mb-xl">
      <Encabezado />
      {alertas.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alertas.map(({ app, alerta }) => (
            <li key={app.id}>
              <Link
                href={app.ruta}
                className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <KpiTile
                  label={app.nombre}
                  value={alerta.valor}
                  icon={<IconoApp nombre={app.icono} />}
                  sub={<span className="text-[13px] font-semibold text-danger">{alerta.texto}</span>}
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : sinRevisar.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
          <svg className="h-4 w-4 shrink-0 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Nada pide atención ahora.
        </p>
      ) : null}
      {sinRevisar.length > 0 && (
        <AvisoError
          tono="aviso"
          className={alertas.length > 0 ? "mt-3" : undefined}
          titulo={`No se pudo revisar ${listaDeNombres(sinRevisar)}`}
          comoSeguir="Puede haber algo pendiente ahí. Entrá desde su botón para verlo, o volvé al Inicio en un rato."
        />
      )}
    </section>
  );
}
