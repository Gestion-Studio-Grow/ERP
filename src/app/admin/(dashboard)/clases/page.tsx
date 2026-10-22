import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { AvisoError, EmptyState, Esqueleto, Plata } from "@/components/ui";
import { configPadel, franjas, hoy } from "@/lib/padel/datos.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { necesitaBienvenida, RUTA_BIENVENIDA } from "./bienvenida/necesita";
import { MEDIO_LABEL, diaCorto, horaHumana, linkWhatsApp, sumarDias, type MedioPago } from "@/lib/padel/core";
import { plataTexto } from "./_plata";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { TarjetaClase } from "./_vista";
import { Cabecera } from "./_cabecera";
import { AccionesClase, AccionesSinCerrar, BotonReintentar, BotonSuspender, CompartirTurnero, ConfirmarTodos, RecordarTodos } from "./_acciones";
import { aAcciones, delDia, detalleClase, FilaClase, LineaDelDia } from "./_linea-dia";
import { clases as nClases, diaConMes, esUrgente, faltaPara } from "./_agenda-core";
import { primerNombre } from "./_cola";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Hoy", manifest: "/clases/app.webmanifest" };

const titulo = "mb-2 text-sm font-bold uppercase tracking-wide text-strong";

// HOY (matias-DISENO.md §2.3 · M-060..M-068): la pantalla que el profe abre entre clase y clase.
// De arriba abajo, lo que no puede esperar: el pedido que empieza en un rato, lo que quedó sin
// cerrar, los pedidos, la próxima clase con sus botones de un toque, el resto del día con sus
// huecos, mañana con «Recordar a todos» y lo cobrado. Mientras carga, esqueletos; si falla la
// red, «Reintentar» (nunca pantalla en blanco).
export default async function ClasesHoy() {
  await requireApp("padel-clases");
  // Profe que todavía no configuró nada (sin precio ni horarios): a la Bienvenida (M-083).
  const tenantId = await getCurrentTenantId();
  const [config, fr] = await Promise.all([configPadel(tenantId), franjas(tenantId)]);
  if (necesitaBienvenida({ vista: config.bienvenidaVista, precioIndividual: config.precioIndividual, franjas: fr })) redirect(RUTA_BIENVENIDA);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Suspense fallback={<EsqueletoHoy />}>
        <ContenidoHoy />
      </Suspense>
    </main>
  );
}

async function ContenidoHoy() {
  let d: Awaited<ReturnType<typeof hoy>>;
  try {
    d = await hoy();
  } catch (e) {
    unstable_rethrow(e);
    return (
      <>
        <Cabecera titulo="Hoy" pendientes={0} />
        <AvisoError
          titulo="No pudimos cargar tu día"
          comoSeguir="Puede ser la señal. Tus clases están guardadas: probá de nuevo en un momento."
          accion={<BotonReintentar />}
        />
      </>
    );
  }

  const ahora = new Date();
  const { fecha, proxima, deHoy, deManana, pendientes, caja, negocio, sinCerrar, pedidos, huecos, recordadas } = d;
  const resto = deHoy.filter((c) => c.id !== proxima?.id);
  const otrasDeHoy = delDia(deHoy);
  const otrasDeManana = delDia(deManana);
  const urgentes = pedidos.filter((p) => esUrgente(p.empiezaEn, ahora));
  const otrosPedidos = pedidos.filter((p) => !urgentes.includes(p));
  const ayer = sinCerrar.every((c) => dateStrInBusinessTz(c.empiezaEn) === sumarDias(fecha, -1));
  const cuandoPedido = (c: (typeof pedidos)[number]) => `${diaCorto(dateStrInBusinessTz(c.empiezaEn))} ${horaHumana(c.empiezaEn)}`;
  const aRecordar = deManana.filter((c) => c.estado === "CONFIRMADA" && !recordadas.includes(c.id));
  const vivasHoy = deHoy.filter((c) => ["PEDIDA", "CONFIRMADA"].includes(c.estado) && c.empiezaEn.getTime() > ahora.getTime());

  return (
    <>
      <Cabecera
        titulo={`Hoy · ${diaConMes(fecha)}`}
        detalle={
          <>
            {deHoy.length === 0 ? "Sin clases hoy" : nClases(deHoy.length)}
            {caja.total > 0 && <> · cobrado <Plata valor={caja.total} sinCentavos /></>}
          </>
        }
        pendientes={pendientes}
      />

      {/* M-063: el pedido que empieza en un rato, arriba y en rojo. */}
      {urgentes.map((c) => (
        <section key={c.id} className="mb-4 grid gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4" aria-label={`${c.nombre} espera respuesta`} data-qa="pedido-urgente">
          <p className="font-bold text-strong">
            <span aria-hidden>⏰ </span>
            {primerNombre(c.nombre)} espera respuesta: <span className="tabular-nums">{horaHumana(c.empiezaEn)}</span>
            <span className="font-normal text-body"> · {faltaPara(c.empiezaEn, ahora)}</span>
          </p>
          <AccionesClase c={aAcciones(c)} conProxima={false} otras={otrasDeHoy} />
        </section>
      ))}

      {/* F10 · M-044: lo que quedó sin cerrar, Dada o No vino de un toque. */}
      {sinCerrar.length > 0 && (
        <section className="mb-5 rounded-2xl border border-danger/40 bg-danger-soft p-4" aria-label="Clases sin cerrar" data-qa="sin-cerrar">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-strong">
            {ayer ? "Ayer" : "Estos días"} {sinCerrar.length === 1 ? "quedó 1 sin cerrar" : `quedaron ${sinCerrar.length} sin cerrar`}
          </h2>
          <ul className="grid gap-3">
            {sinCerrar.map((c) => (
              <li key={c.id} className="grid gap-2" data-qa="fila-sin-cerrar">
                <p className="flex items-baseline gap-2 text-strong">
                  <span className="font-bold tabular-nums">
                    {!ayer && `${diaCorto(dateStrInBusinessTz(c.empiezaEn))} · `}
                    {horaHumana(c.empiezaEn)}
                  </span>
                  <span className="font-semibold">{c.nombre}</span>
                </p>
                <AccionesSinCerrar c={aAcciones(c)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* F6 · M-034: los pedidos, con «Confirmar todos». */}
      {otrosPedidos.length > 0 && (
        <section className="mb-5" aria-label="Esperan tu respuesta" data-qa="pedidos">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-strong">
              <span aria-hidden>⏳ </span>Esperan tu respuesta ({pedidos.length})
            </h2>
            {pedidos.length > 1 && <ConfirmarTodos pedidos={pedidos.map((c) => ({ id: c.id, cuando: cuandoPedido(c) }))} />}
          </div>
          <ul className="grid gap-2">
            {otrosPedidos.map((c) => (
              <li key={c.id}>
                <TarjetaClase estado={c.estado} hora={cuandoPedido(c)} nombre={c.nombre} detalle={detalleClase(c)} qa="pedido">
                  <AccionesClase c={aAcciones(c)} conProxima={false} />
                </TarjetaClase>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proxima ? (
        <section className="mb-5" aria-label="Próxima clase" data-qa="proxima">
          <h2 className={titulo}>Próxima clase</h2>
          <TarjetaClase destacada estado={proxima.estado} pago={proxima.pagoEstado} hora={horaHumana(proxima.empiezaEn)} nombre={proxima.nombre} detalle={detalleProxima(proxima)}>
            <AccionesClase c={aAcciones(proxima)} otras={otrasDeHoy} />
          </TarjetaClase>
        </section>
      ) : (
        <div className="mb-5">
          <EmptyState
            title="No tenés más clases por hoy"
            description={huecos.length ? "Tocá un horario libre para agendar, o compartí tu turnero para que te pidan." : "Compartí tu turnero: cuando alguien pida, aparece acá para confirmarlo con un toque."}
          />
        </div>
      )}

      {(resto.length > 0 || huecos.length > 0) && (
        <section className="mb-5" aria-label="El resto de hoy">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-strong">El resto de hoy</h2>
            {(vivasHoy.length > 0 || huecos.length > 0) && <BotonSuspender fecha={fecha} etiquetaDia="hoy" clases={otrasDeHoy} />}
          </div>
          <LineaDelDia fecha={fecha} clases={resto} huecos={huecos} otras={otrasDeHoy} qa="clase-hoy" />
        </section>
      )}

      {deManana.length > 0 && (
        <section className="mb-5" aria-label="Mañana" data-qa="manana">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-strong">Mañana ({deManana.length})</h2>
            <RecordarTodos clases={aRecordar.map((c) => ({ id: c.id, cuando: `mañana ${horaHumana(c.empiezaEn)}` }))} />
          </div>
          <ul className="grid gap-2">
            {deManana.map((c) => (
              <FilaClase key={c.id} c={c} otras={otrasDeManana} recordada={recordadas.includes(c.id)} qa="clase-manana" />
            ))}
          </ul>
        </section>
      )}

      {pedidos.length === 0 && (
        <section className="mb-5" aria-label="Tu turnero">
          <CompartirTurnero negocio={negocio.nombre} />
        </section>
      )}

      {caja.total > 0 && (
        <p className="text-sm text-muted" data-qa="cobrado-hoy">
          Cobrado hoy: <Plata valor={caja.total} sinCentavos />
          {" · "}
          {Object.entries(caja.porMedio).map(([m, v], i) => (
            <span key={m}>
              {i > 0 && " · "}
              {MEDIO_LABEL[m as MedioPago] ?? m} <Plata valor={v} sinCentavos />
            </span>
          ))}
        </p>
      )}
      {negocio.whatsapp && !linkWhatsApp(negocio.whatsapp, "") && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-strong">
          Tu celular en «Ajustes» no parece un celular argentino: los alumnos no van a poder avisarte.
        </p>
      )}
    </>
  );
}

function detalleProxima(c: Awaited<ReturnType<typeof hoy>>["deHoy"][number]): string {
  return [
    c.tipo === "GRUPAL" ? `Con amigos · ${c.personas}` : "Individual",
    c.precio > 0 ? plataTexto(c.precio) : null,
    c.dadas > 0 ? `${nClases(c.dadas)} con vos` : "alumno nuevo",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Mientras llega: la cabecera y tres tarjetas del mismo alto (no salta al llegar). */
function EsqueletoHoy() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Cargando tu día…</span>
      <Esqueleto className="mb-2 h-8 w-48" />
      <Esqueleto className="mb-5 h-4 w-40" />
      {[0, 1, 2].map((i) => (
        <Esqueleto key={i} className="mb-3 h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}
