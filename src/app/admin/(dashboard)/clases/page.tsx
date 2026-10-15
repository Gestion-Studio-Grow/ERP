import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { hoy } from "@/lib/padel/datos.server";
import { MEDIO_LABEL, horaHumana, linkWhatsApp, pesos, type MedioPago } from "@/lib/padel/core";
import { BarraClases, ChipEstado, tarjeta, tonoEstado } from "./_vista";
import { AccionesClase, BotonRecordatorio } from "./_acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Hoy", manifest: "/clases/app.webmanifest" };

// La pantalla que el profe abre entre clase y clase: arriba la próxima clase con sus botones
// de un toque, después lo que espera respuesta, el resto del día y mañana.
export default async function ClasesHoy() {
  await requireApp("padel-clases");
  const { proxima, deHoy, deManana, pendientes, caja, negocio } = await hoy();
  const resto = deHoy.filter((c) => c.id !== proxima?.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Hoy</h1>
          <p className="text-sm text-muted">
            {deHoy.length === 0 ? "Sin clases hoy." : `${deHoy.length} clase${deHoy.length > 1 ? "s" : ""} hoy`}
            {caja.total > 0 && ` · cobrado ${pesos(caja.total)}`}
          </p>
        </div>
        <Link href="/admin/clases/agendar" className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center sm:w-auto")} data-qa="agendar">
          + Agendar clase
        </Link>
      </header>

      <BarraClases activa="/admin/clases" pendientes={pendientes} />

      {pendientes > 0 && (
        <Link
          href="/admin/clases/pendientes"
          data-qa="aviso-pendientes"
          className="mb-4 flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-strong"
          style={{ background: "var(--warning-soft)" }}
        >
          <span aria-hidden>🔔</span> {pendientes} cosa{pendientes > 1 ? "s" : ""} esperando tu respuesta (pedidos, comprobantes o cancelaciones)
        </Link>
      )}

      {proxima ? (
        <section className={cn(tarjeta, "mb-5")} style={{ borderLeft: `6px solid ${tonoEstado(proxima.estado)}` }} aria-label="Próxima clase" data-qa="proxima">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Próxima clase</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-3xl font-bold tabular-nums text-strong">{horaHumana(proxima.empiezaEn)}</p>
            <ChipEstado estado={proxima.estado} pago={proxima.pagoEstado} />
          </div>
          <p className="mt-1 text-lg font-semibold text-strong">{proxima.nombre}</p>
          <p className="mb-3 text-sm text-muted">
            {proxima.tipo === "GRUPAL" ? `Grupal · ${proxima.personas} personas` : "Individual"}
            {proxima.precio > 0 && ` · ${pesos(proxima.precio)}`}
            {proxima.dadas > 0 ? ` · ${proxima.dadas} clase${proxima.dadas > 1 ? "s" : ""} con vos` : " · alumno nuevo"}
          </p>
          <AccionesClase c={proxima} />
        </section>
      ) : (
        <div className="mb-5">
          <EmptyState
            title="No tenés más clases por hoy"
            description="Cuando alguien pida clase desde tu link de Instagram, aparece en Pendientes para que la confirmes con un toque."
          />
        </div>
      )}

      {resto.length > 0 && (
        <section className="mb-5" aria-label="El resto de hoy">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">El resto de hoy</h2>
          <ul className="grid gap-2">
            {resto.map((c) => (
              <li key={c.id} className={tarjeta} style={{ borderLeft: `4px solid ${tonoEstado(c.estado)}` }} data-qa="clase-hoy">
                <details>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-lg font-bold text-strong">{horaHumana(c.empiezaEn)}</span>
                      <span className="font-semibold text-strong">{c.nombre}</span>
                    </span>
                    <ChipEstado estado={c.estado} pago={c.pagoEstado} />
                  </summary>
                  <div className="mt-3">
                    <AccionesClase c={c} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {deManana.length > 0 && (
        <section className="mb-5" aria-label="Mañana">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">Mañana</h2>
          <ul className="grid gap-2">
            {deManana.map((c) => (
              <li key={c.id} className={cn(tarjeta, "grid gap-2")}>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-mono font-bold text-strong">{horaHumana(c.empiezaEn)}</span> <span className="font-semibold text-strong">{c.nombre}</span>
                  </span>
                  <ChipEstado estado={c.estado} pago={c.pagoEstado} />
                </span>
                {c.estado === "CONFIRMADA" && <BotonRecordatorio id={c.id} nombre={c.nombre} />}
                {c.estado === "PEDIDA" && <AccionesClase c={c} conProxima={false} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {caja.total > 0 && (
        <p className="text-sm text-muted">
          Cobrado hoy: {Object.entries(caja.porMedio).map(([m, v]) => `${MEDIO_LABEL[m as MedioPago] ?? m} ${pesos(v)}`).join(" · ")}
        </p>
      )}
      {negocio.whatsapp && !linkWhatsApp(negocio.whatsapp, "") && (
        <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Tu celular en «Horarios y precios» no parece un celular argentino: los alumnos no van a poder avisarte.</p>
      )}
    </main>
  );
}
