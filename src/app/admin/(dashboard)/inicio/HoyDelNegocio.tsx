// «Hoy» — el día del negocio en una tarjeta de sólo lectura (venta-agenda-simple, T1;
// docs/producto/venta-agenda/PLAN.md §3, fila «Dueño»). Turnos de hoy, lo cobrado por medio, las
// ventas de productos y las señas pedidas que siguen sin entrar, con la salida a la Agenda y al
// Cierre del día. El armado es puro (src/lib/hoy-del-negocio/hoy-core.ts); esto sólo lo pinta.
//
// La pide InicioApps sólo con el interruptor prendido y para quien ve los números de plata
// (`reports:read`). Una parte que no se pudo leer dice «No se pudo leer», nunca un cero.

import Link from "next/link";
import { Suspense } from "react";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { ventaAgendaSimplePrendida } from "@/cambios/interruptores";
import { fmtTime, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { leerHoyDelNegocio } from "@/lib/hoy-del-negocio/lector";
import { pesosDelHoy, type TarjetaHoy } from "@/lib/hoy-del-negocio/hoy-core";
import { AvisoError } from "@/components/ui/AvisoError";
import { getNegocioApps } from "@/apps/contexto.server";
import { motivoNoDisponible } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";

const TITULO_ID = "hoy-del-negocio";
const TOPE_DE_SENIAS = 5;

const ENLACE =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold text-strong hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-raised p-4">
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[.06em] text-muted">{titulo}</h3>
      {children}
    </div>
  );
}

function SinLeer() {
  return <p className="text-sm text-muted">No se pudo leer.</p>;
}

function Renglon({ rotulo, monto, fuerte }: { rotulo: string; monto: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-sm ${fuerte ? "font-semibold text-strong" : "text-body"}`}>
      <dt className="min-w-0 truncate">{rotulo}</dt>
      <dd className="shrink-0 tabular-nums">{pesosDelHoy(monto)}</dd>
    </div>
  );
}

function Turnos({ t }: { t: TarjetaHoy["turnos"] }) {
  if (!t) return <SinLeer />;
  if (t.total === 0) return <p className="text-sm text-muted">No hay turnos para hoy.</p>;
  return (
    <>
      <p className="text-[27px] font-semibold leading-tight tracking-[-0.03em] text-strong tabular-nums">{t.total}</p>
      <p className="text-sm text-muted">
        {t.atendidos} {t.atendidos === 1 ? "atendido" : "atendidos"} · {t.faltan} {t.faltan === 1 ? "falta" : "faltan"}
        {t.noVinieron > 0 && ` · ${t.noVinieron} no ${t.noVinieron === 1 ? "vino" : "vinieron"}`}
      </p>
    </>
  );
}

function Cobrado({ c }: { c: TarjetaHoy["cobrado"] }) {
  if (!c) return <SinLeer />;
  if (c.filas.length === 0) return <p className="text-sm text-muted">Todavía no entró plata hoy.</p>;
  return (
    <dl>
      {c.filas.map((f) => (
        <Renglon key={f.medio} rotulo={f.etiqueta} monto={f.monto} />
      ))}
      {c.tarjeta && (
        <Renglon rotulo={c.tarjeta.sinDetalle !== 0 ? "Tarjeta (débito, crédito y sin detalle)" : "Tarjeta (débito + crédito)"} monto={c.tarjeta.monto} />
      )}
      <div className="mt-1 border-t border-line pt-1">
        <Renglon rotulo="Total cobrado" monto={c.total} fuerte />
      </div>
    </dl>
  );
}

function Ventas({ v }: { v: TarjetaHoy["ventas"] }) {
  if (!v) return <SinLeer />;
  if (v.cantidad === 0) return <p className="text-sm text-muted">Todavía no hubo ventas de productos hoy.</p>;
  return (
    <>
      <p className="text-[27px] font-semibold leading-tight tracking-[-0.03em] text-strong tabular-nums">{pesosDelHoy(v.total)}</p>
      <p className="text-sm text-muted">
        {v.cantidad} {v.cantidad === 1 ? "venta" : "ventas"}
      </p>
    </>
  );
}

function Senias({ s, hoy }: { s: TarjetaHoy["senias"]; hoy: string }) {
  if (!s) return <SinLeer />;
  if (s.length === 0) return <p className="text-sm text-muted">No hay señas pendientes para hoy ni para mañana.</p>;
  const resto = s.length - TOPE_DE_SENIAS;
  return (
    <>
      <ul className="divide-y divide-line">
        {s.slice(0, TOPE_DE_SENIAS).map((x) => (
          <li key={x.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-strong">{x.clienta}</span>
              <span className="block truncate text-[12px] text-muted">
                {dateStrInBusinessTz(x.startsAt) === hoy ? "Hoy" : "Mañana"} {fmtTime(x.startsAt)} · {x.servicio}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{pesosDelHoy(x.monto)}</span>
          </li>
        ))}
      </ul>
      {resto > 0 && <p className="mt-1 text-[12px] text-muted">Y {resto} más en la agenda.</p>}
    </>
  );
}

export function HoyDelNegocioCargando() {
  return (
    <section aria-labelledby={TITULO_ID} className="mb-xl" aria-busy="true">
      <h2 id={TITULO_ID} className="mb-sm text-lg font-semibold tracking-tight text-strong">
        Hoy
      </h2>
      <p role="status" className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
        Juntando el día…
      </p>
    </section>
  );
}

/**
 * `conAgenda` = el negocio tiene Agenda (aunque esta persona no la abra). Una tienda no (UAT retail
 * 07-08/11, callejón C1): ni Turnos, ni Señas pendientes, ni «Ir a la Agenda»; la salida es Ventas del día.
 */
export default async function HoyDelNegocio({ tenantId, conAgenda = true }: { tenantId: string; conAgenda?: boolean }) {
  const hoy = todayInBusinessTz();
  const t = await leerHoyDelNegocio(tenantId, hoy);
  return (
    <section aria-labelledby={TITULO_ID} className="mb-xl">
      <h2 id={TITULO_ID} className="mb-sm text-lg font-semibold tracking-tight text-strong">
        Hoy
      </h2>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${conAgenda ? "lg:grid-cols-4" : ""}`}>
        {conAgenda && (
          <Bloque titulo="Turnos">
            <Turnos t={t.turnos} />
          </Bloque>
        )}
        <Bloque titulo="Cobrado hoy">
          <Cobrado c={t.cobrado} />
        </Bloque>
        <Bloque titulo="Ventas de productos">
          <Ventas v={t.ventas} />
        </Bloque>
        {conAgenda && (
          <Bloque titulo="Señas pendientes">
            <Senias s={t.senias} hoy={hoy} />
          </Bloque>
        )}
      </div>
      {t.sinLeer.length > 0 && (
        <AvisoError
          tono="aviso"
          className="mt-3"
          titulo={`No se pudo leer ${t.sinLeer.join(", ")}`}
          comoSeguir={`Lo demás está al día. Volvé al Inicio en un rato o mirá ${conAgenda ? "la Agenda" : "Ventas del día"} y el Cierre del día.`}
        />
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {conAgenda ? (
          <Link href="/admin/turnos" className={ENLACE}>
            Ir a la Agenda
          </Link>
        ) : (
          <Link href="/admin/ventas" className={ENLACE}>
            Ir a Ventas del día
          </Link>
        )}
        <Link href="/admin/caja/cierre" className={ENLACE}>
          Ir a Caja · Cierre del día
        </Link>
      </div>
    </section>
  );
}

/**
 * «Hoy» donde corresponde: sólo con `venta-agenda-simple` prendido y para quien ve la plata
 * (`reports:read`). Lo montan los tres Inicios (por apps, Renglón y el de siempre); apagado no lee
 * nada nuevo y no pinta nada.
 */
export async function HoySiCorresponde({ role }: { role: Role }) {
  if (!roleHasCapability(role, "reports:read")) return null;
  if (!ventaAgendaSimplePrendida(await interruptoresDelNegocio())) return null;
  const [tenantId, negocio] = await Promise.all([getCurrentTenantId(), getNegocioApps(role)]);
  // Sólo un comercio (mostrador) se queda sin el bloque de agenda, y sólo si no tiene la app: CH (servicios)
  // queda siempre como estaba. «Rol» no cuenta: el negocio tiene Agenda aunque esta persona no la abra.
  const motivo = negocio.esMostrador ? motivoNoDisponible(appPorId("agenda"), negocio) : null;
  const conAgenda = motivo === null || motivo === "rol";
  return (
    <Suspense fallback={<HoyDelNegocioCargando />}>
      <HoyDelNegocio tenantId={tenantId} conAgenda={conAgenda} />
    </Suspense>
  );
}
