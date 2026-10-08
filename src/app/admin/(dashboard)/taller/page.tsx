import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { tablero } from "@/lib/taller/datos.server";
import { ESTADOS, ESTADO_LABEL, MEDIO_LABEL, pesos, waLink, type MedioPago } from "@/lib/taller/core";
import { BarraTaller, Patente, tarjeta, tonoEstado } from "./_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Hoy", manifest: "/taller/app.webmanifest" };

export default async function TallerHoy() {
  await requireApp("taller");
  const { tarjetas, turnos, caja, alertas, conPlata } = await tablero();
  const enTaller = tarjetas.filter((t) => t.estado !== "ENTREGADO");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Hoy en el taller</h1>
          <p className="text-sm text-muted">
            {enTaller.length === 0 ? "No hay autos en el taller." : `${enTaller.length} auto${enTaller.length > 1 ? "s" : ""} en el taller`}
            {turnos.length > 0 && ` · ${turnos.length} turno${turnos.length > 1 ? "s" : ""} hoy`}
          </p>
        </div>
        <Link href="/admin/taller/ingreso" className={cn(buttonClasses("solid", "lg"), "h-14 w-full justify-center text-lg sm:w-auto")}>
          + Ingresar auto
        </Link>
      </header>

      <BarraTaller activa="/admin/taller" conPlata={conPlata} />

      {alertas.length > 0 && (
        <ul className="mb-4 grid grid-cols-1 gap-2">
          {alertas.map((a) => (
            <li key={a.texto}>
              <Link href={a.href} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-strong" style={{ background: "var(--warning-soft)" }}>
                <span aria-hidden>⚠️</span> {a.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className={tarjeta} aria-label="Turnos de hoy">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-strong">Turnos de hoy</h2>
            <Link href="/admin/turnos" className="text-sm underline">Agenda</Link>
          </div>
          {turnos.length === 0 ? (
            <p className="text-sm text-muted">Sin turnos para hoy.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1.5 text-sm">
              {turnos.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-strong">{fmtTime(t.hora)}</span>
                  <span className="min-w-0 flex-1 truncate">{t.cliente} · <span className="text-muted">{t.servicio}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {conPlata && (
          <section className={tarjeta} aria-label="Cobrado hoy">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold text-strong">Cobrado hoy</h2>
              <Link href="/admin/caja" className="text-sm underline">Caja</Link>
            </div>
            <p className="text-3xl font-bold tabular-nums text-strong">{pesos(caja.total)}</p>
            <p className="mt-1 text-sm text-muted">
              {Object.keys(caja.porMedio).length === 0
                ? "Todavía no entró ningún cobro."
                : Object.entries(caja.porMedio).map(([m, v]) => `${MEDIO_LABEL[m as MedioPago] ?? m} ${pesos(v)}`).join(" · ")}
            </p>
          </section>
        )}
      </div>

      {tarjetas.length === 0 ? (
        <EmptyState title="El taller está vacío" description="Cuando entre un auto, tocá «Ingresar auto»: patente, cliente y qué le pasa. Menos de un minuto." />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {ESTADOS.map((estado) => {
            const lista = tarjetas.filter((t) => t.estado === estado);
            if (lista.length === 0) return null;
            return (
              <section key={estado} id={estado} aria-label={ESTADO_LABEL[estado]} className="scroll-mt-20">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-strong">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: tonoEstado(estado) }} />
                  {estado === "ENTREGADO" ? "Entregados hoy" : ESTADO_LABEL[estado]}
                  <span className="font-normal text-muted">({lista.length})</span>
                </h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map((t) => {
                    const wa = waLink(t.telefono, "");
                    return (
                      <li key={t.id} className={cn(tarjeta, "relative flex flex-col gap-2")} style={{ borderLeft: `4px solid ${tonoEstado(estado)}` }}>
                        <Link href={`/admin/taller/orden/${t.id}`} className="flex flex-col gap-2 after:absolute after:inset-0 after:content-['']">
                          <span className="flex items-center justify-between gap-2">
                            <Patente valor={t.patente} />
                            <span className="text-xs text-muted">#{t.numero}{t.dias > 0 && ` · ${t.dias} d`}</span>
                          </span>
                          <span className="font-semibold text-strong">{t.vehiculo || "Vehículo"}</span>
                          <span className="text-sm text-muted">{t.cliente}{t.mecanico && ` · ${t.mecanico}`}</span>
                          {t.problema && <span className="line-clamp-2 text-sm">{t.problema}</span>}
                        </Link>
                        <span className="relative z-10 flex items-center justify-between gap-2 text-sm">
                          {conPlata ? (
                            <span className="tabular-nums">
                              {t.total > 0 ? pesos(t.total) : "Sin presupuesto"}
                              {t.saldo > 0.5 && t.total > 0 && <span className="text-muted"> · debe {pesos(t.saldo)}</span>}
                            </span>
                          ) : <span />}
                          {t.pendientesDeAprobar > 0 && estado === "ESPERANDO_APROBACION" && <span className="text-xs font-semibold">{t.pendientesDeAprobar} sin responder</span>}
                          {wa && conPlata && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center rounded-full border border-line px-3 text-sm font-medium" aria-label={`WhatsApp a ${t.cliente}`}>
                              WhatsApp
                            </a>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
