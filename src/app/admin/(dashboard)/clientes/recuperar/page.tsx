import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { roleHasCapability } from "@/lib/capabilities";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import {
  Bloque,
  EmptyState,
  LineaDeEstado,
  Marca,
  PageHeader,
  Plata,
  Renglon,
  buttonClasses,
  fmtMoneyARS,
} from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { cargarBandeja } from "@/lib/crm/lecturas";
import { contextoCrm } from "@/lib/crm/cargas.server";
import { explicarCiclo } from "@/lib/crm/ciclo";
import { diasEntre, haceDias } from "@/lib/crm/fechas";
import { explicarSegmento, porRecuperar } from "@/lib/crm/segmentos";
import { CRM_REGLAS } from "@/lib/crm/reglas";
import EnlacesClientes from "../EnlacesClientes";
import PasarABandeja from "./PasarABandeja";

export const dynamic = "force-dynamic";

// CLIENTES POR RECUPERAR — quiénes pasaron su ciclo de siempre sin volver.
//
// Sin puntajes: cada fila dice cuántos días hace que no viene y cada cuánto venía (su ciclo,
// src/lib/crm/ciclo.ts). "En riesgo" es entre 1,5 y 3 ciclos sin volver y sin turno reservado.
// La lista es la del número del Inicio (misma lectura, `cargarBandeja` → `porRecuperar`); lo
// que se pierde por año sólo lo ve quien ve plata. Desde acá se suman a la bandeja de hoy.

const REGLA = `Entre ${String(CRM_REGLAS.riesgoDesdeCiclos).replace(".", ",")} y ${CRM_REGLAS.perdidaDespuesDeCiclos} veces su ciclo sin volver`;

export default async function PorRecuperarPage() {
  const user = await requireApp("clientas-por-recuperar");
  const [c, nuevo] = await Promise.all([contextoCrm(), disenoNuevo()]);
  const { base, constancias } = await cargarBandeja(prisma, c);
  const enRiesgo = porRecuperar(base);
  const verPlata = roleHasCapability(user.role, "reports:read");
  const puedeSumar = roleHasCapability(user.role, "clients:manage");
  const total = enRiesgo.reduce((s, x) => s + x.ev.valorAnual, 0);

  // DISEÑO NUEVO («Renglón»): el folio es lo que mide el riesgo (días sin venir), el detalle cada
  // cuánto venía, a la derecha lo que gasta por año (sólo quien ve plata) y una tecla por renglón.
  // La regla, en una línea de estado en vez de un párrafo. La misma lectura (cargarBandeja).
  if (nuevo) {
    return (
      <main
        data-ui="pagina"
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
      >
        <PageHeader title="Clientes por recuperar" />
        <LineaDeEstado
          className="-mt-2 mb-4"
          datos={[
            <strong key="n">{enRiesgo.length} en riesgo de no volver</strong>,
            verPlata && total > 0 ? (
              <span key="p">
                unos <Plata valor={total} sinCentavos /> por año en juego
                (estimado)
              </span>
            ) : null,
            `${REGLA.toLowerCase()}, sin turno`,
          ]}
        />
        <div className="mt-4">
          <EnlacesClientes role={user.role} actual="clientas-por-recuperar" />
        </div>
        <Bloque
          titulo="Días sin venir"
          nota={verPlata ? "A la derecha, lo que gasta por año" : undefined}
          className="mt-6"
        >
          {enRiesgo.length === 0 ? (
            <p
              data-ui="vacio"
              className="flex flex-wrap items-center gap-3 border-b border-line py-4 text-sm text-body"
            >
              Nadie en riesgo: los que venían seguido volvieron o ya tienen
              turno.
              <Link
                href="/admin/clientes"
                className={buttonClasses("outline", "sm")}
              >
                Ver todos los clientes
              </Link>
            </p>
          ) : (
            <ul>
              {enRiesgo.map(({ persona, ev }) => {
                const baja = constancias.bajas.has(persona.id);
                const ultimo = constancias.ultimoContacto.get(persona.id);
                const diasContacto = ultimo ? diasEntre(ultimo, c.hoy) : null;
                const reciente =
                  diasContacto !== null &&
                  diasContacto < CRM_REGLAS.contactoRecienteDias;
                const celular = waLinkClienta(persona.telefono) !== null;
                return (
                  <Renglon
                    key={persona.id}
                    as="li"
                    folio={
                      <span className="tabular-nums">
                        {ev.diasSinVenir === null
                          ? "—"
                          : `${ev.diasSinVenir} d`}
                      </span>
                    }
                    titulo={
                      <Link
                        href={`/admin/clientes/${persona.id}`}
                        className="hover:underline"
                      >
                        {persona.nombre}
                      </Link>
                    }
                    detalle={`venía cada ${ev.ciclo.dias} días · ${String(ev.ciclosSinVenir ?? 0).replace(".", ",")} ciclos sin volver · ${ev.cantidadVisitas} ${ev.cantidadVisitas === 1 ? "visita" : "visitas"}`}
                    plata={
                      verPlata && ev.valorAnual > 0 ? (
                        <Plata valor={ev.valorAnual} sinCentavos />
                      ) : undefined
                    }
                    tecla={
                      baja ? (
                        <Marca tipo="anulado">no quiere mensajes</Marca>
                      ) : reciente ? (
                        <Marca tipo="hecho">
                          contactada {haceDias(diasContacto!)}
                        </Marca>
                      ) : !celular ? (
                        <Link
                          href={`/admin/clientes/${persona.id}`}
                          className={buttonClasses("outline", "sm")}
                        >
                          Corregir celular
                        </Link>
                      ) : puedeSumar ? (
                        <PasarABandeja
                          clientId={persona.id}
                          yaEsta={constancias.pasadasHoy.has(persona.id)}
                          corto
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
        </Bloque>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Clientes por recuperar"
        description={`${enRiesgo.length} en riesgo de no volver${verPlata && total > 0 ? ` · unos ${fmtMoneyARS(total, 0)} por año en juego (estimado)` : ""}.`}
      />
      <EnlacesClientes role={user.role} actual="clientas-por-recuperar" />
      <p className="mb-4 text-sm text-muted">
        {REGLA}, sin turno reservado. El ciclo es la mediana de los días entre
        sus visitas; si vino una sola vez, lo que tardan en volver las demás por
        ese servicio; si no, {CRM_REGLAS.cicloPorDefectoDias} días
        (provisional).
      </p>

      {enRiesgo.length === 0 ? (
        <EmptyState
          title="Nadie en riesgo por ahora"
          description="Todos los que venían seguido volvieron dentro de su ciclo o ya tienen turno. Revisá de nuevo en unos días."
          action={
            <Link
              href="/admin/clientes"
              className={buttonClasses("outline", "md")}
            >
              Ver todos los clientes
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line/60 rounded-lg border border-line bg-surface-raised">
          {enRiesgo.map(({ persona, ev }) => {
            const baja = constancias.bajas.has(persona.id);
            const ultimo = constancias.ultimoContacto.get(persona.id);
            const diasContacto = ultimo ? diasEntre(ultimo, c.hoy) : null;
            const reciente =
              diasContacto !== null &&
              diasContacto < CRM_REGLAS.contactoRecienteDias;
            const celular = waLinkClienta(persona.telefono) !== null;
            return (
              <li
                key={persona.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <Link
                    href={`/admin/clientes/${persona.id}`}
                    className="inline-flex min-h-11 items-center font-medium text-strong hover:underline"
                  >
                    {persona.nombre}
                  </Link>
                  <p className="text-muted">{explicarSegmento(ev)}</p>
                  <p className="text-xs text-muted">
                    {ev.cantidadVisitas}{" "}
                    {ev.cantidadVisitas === 1 ? "visita" : "visitas"};{" "}
                    {explicarCiclo(ev.ciclo)}
                    {verPlata && ev.valorAnual > 0
                      ? ` · gasta unos ${fmtMoneyARS(ev.valorAnual, 0)} por año`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-sm">
                  {baja ? (
                    <span className="text-danger">No quiere mensajes</span>
                  ) : reciente ? (
                    <span className="text-muted">
                      Contactada {haceDias(diasContacto!)}
                    </span>
                  ) : !celular ? (
                    <Link
                      href={`/admin/clientes/${persona.id}`}
                      className="inline-flex min-h-11 items-center text-warning underline"
                    >
                      Sin celular válido: corregilo en su ficha
                    </Link>
                  ) : puedeSumar ? (
                    <PasarABandeja
                      clientId={persona.id}
                      yaEsta={constancias.pasadasHoy.has(persona.id)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
