import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { tableroInmo, configInmo, negocioInmo } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { armarMensaje, diaCorto, haceCuanto, nombrePeriodo, pesos, TIPO_CONSULTA_LABEL, urgencia, type TipoConsulta } from "@/lib/inmobiliaria/core";
import { BarraInmo, Dato, RAIZ, subtitulo, tarjeta, titulo, tonoUrgencia } from "./_vista";
import { Avisar, Responder } from "./_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Hoy" };

export default async function InmobiliariaHoy() {
  const user = await requireApp("inmobiliaria");
  const tenantId = await getCurrentTenantId();
  const [t, config, negocio, origen] = await Promise.all([tableroInmo(), configInmo(tenantId), negocioInmo(tenantId), origenDelSitio()]);
  const publicadas = (t.cartera.PUBLICADA ?? 0) + (t.cartera.RESERVADA ?? 0);
  const sinNada = t.consultas.length === 0 && t.visitas.length === 0 && t.vencidas.length === 0 && t.porVencer.length === 0 && t.avisos.length === 0;
  const linkDe = (token: string) => `${origen}/alquiler/${token}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={titulo}>Hoy en la inmobiliaria</h1>
          <p className="text-sm text-muted">
            {t.consultas.length === 0 ? "Ninguna consulta esperando respuesta." : `${t.consultas.length} consulta${t.consultas.length > 1 ? "s" : ""} esperando respuesta`}
            {t.conPlata && t.vencidas.length > 0 && ` · ${t.vencidas.length} alquiler${t.vencidas.length > 1 ? "es" : ""} vencido${t.vencidas.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href={`${RAIZ}/propiedades/nueva`} className={cn(buttonClasses("solid", "lg"), "h-14 w-full justify-center text-lg sm:w-auto")}>
          + Cargar propiedad
        </Link>
      </header>

      <BarraInmo activa={RAIZ} conPlata={t.conPlata} esDuenio={t.esDuenio} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato valor={publicadas} leyenda="propiedades a la vista" href={`${RAIZ}/propiedades?estado=PUBLICADA`} />
        <Dato valor={t.cartera.BORRADOR ?? 0} leyenda="borradores sin publicar" href={`${RAIZ}/propiedades?estado=BORRADOR`} />
        <Dato valor={t.consultasEnCurso} leyenda="consultas en curso" href={`${RAIZ}/consultas`} />
        {t.conPlata ? (
          <Dato valor={pesos(t.cobradoMes).replace(",00", "")} leyenda="cobrado este mes" href={`${RAIZ}/alquileres`} />
        ) : (
          <Dato valor={t.visitas.length} leyenda="visitas en los próximos días" />
        )}
      </div>

      {sinNada && <EmptyState title="Todo al día" description="No hay consultas sin responder, visitas próximas ni alquileres por cobrar. Buen momento para completar las fichas en borrador." />}

      {t.consultas.length > 0 && (
        <section className="mb-6" aria-label="Consultas sin responder">
          <h2 className={cn(subtitulo, "mb-2")}>Sin responder — el que contesta primero suele quedarse con el cliente</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {t.consultas.map((c) => {
              const u = urgencia(c.esperando);
              const texto = armarMensaje(c.tipo === "TASACION" ? config.plantillas.tasacion : config.plantillas.consulta, {
                nombre: c.nombre.split(" ")[0],
                agente: user.name.split(" ")[0],
                inmobiliaria: negocio.nombre,
                propiedad: c.propiedad?.titulo ?? "nuestras propiedades",
                link: c.propiedad ? `${origen}/propiedades/${c.propiedad.slug}` : `${origen}/propiedades`,
              });
              return (
                <li key={c.id} className={cn(tarjeta, "flex flex-col gap-2")} style={{ borderLeft: `4px solid ${tonoUrgencia(u)}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-strong">{c.nombre}</span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: tonoUrgencia(u) }}>
                      {haceCuanto(c.esperando)}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {TIPO_CONSULTA_LABEL[c.tipo as TipoConsulta] ?? c.tipo}
                    {c.propiedad ? ` · ${c.propiedad.codigo} · ${c.propiedad.titulo}` : ""}
                  </p>
                  {c.mensaje && <p className="line-clamp-3 text-sm">“{c.mensaje}”</p>}
                  <Responder consultaId={c.id} telefono={c.telefono} texto={texto} chico />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {t.visitas.length > 0 && (
        <section className={cn(tarjeta, "mb-6")} aria-label="Próximas visitas">
          <div className="mb-2 flex items-center justify-between">
            <h2 className={subtitulo}>Próximas visitas</h2>
            <Link href={`${RAIZ}/consultas?estado=VISITA`} className="text-sm underline">
              Ver todas
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 text-sm">
            {t.visitas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono font-semibold text-strong">{v.visitaEl ? fmtDateTimeAr(v.visitaEl) : ""}</span>
                <span className="min-w-0 flex-1">
                  {v.nombre} · <span className="text-muted">{v.propiedad?.titulo ?? "Sin propiedad"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.conPlata && t.avisos.length > 0 && (
        <section className="mb-6" aria-label="Contratos que piden atención">
          <h2 className={cn(subtitulo, "mb-2")}>Contratos que piden atención</h2>
          <ul className="grid grid-cols-1 gap-2">
            {t.avisos.map((a) => (
              <li key={`${a.contratoId}-${a.tipo}`}>
                <Link href={`${RAIZ}/alquileres/${a.contratoId}`} className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-strong" style={{ background: "var(--warning-soft)" }}>
                  <span aria-hidden>⚠️</span>
                  {a.tipo === "ajuste"
                    ? a.faltan < 0
                      ? `Falta aplicar la actualización del ${diaCorto(a.dia)} (hace ${-a.faltan} días)`
                      : `Se actualiza el alquiler el ${diaCorto(a.dia)} (en ${a.faltan} días)`
                    : a.faltan < 0
                      ? `El contrato venció el ${diaCorto(a.dia)}`
                      : `El contrato vence el ${diaCorto(a.dia)} (en ${a.faltan} días)`}
                  <span className="font-normal text-muted">
                    · Nº {a.contratoNumero} · {a.propiedad} · {a.inquilino}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.conPlata && (t.vencidas.length > 0 || t.porVencer.length > 0) && (
        <section className="mb-6" aria-label="Alquileres por cobrar">
          <div className="mb-2 flex items-center justify-between">
            <h2 className={subtitulo}>Alquileres por cobrar</h2>
            <Link href={`${RAIZ}/alquileres`} className="text-sm underline">
              Todos los contratos
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {[...t.vencidas, ...t.porVencer].map((q) => {
              const vencida = q.vence < t.hoy;
              const texto = armarMensaje(vencida ? config.plantillas.mora : config.plantillas.vencimiento, {
                nombre: q.inquilino.split(" ")[0],
                propiedad: q.propiedad,
                periodo: nombrePeriodo(q.periodo),
                fecha: diaCorto(q.vence),
                total: pesos(q.saldo + q.mora.monto),
                saldo: pesos(q.saldo + q.mora.monto),
                link: linkDe(q.token),
              });
              return (
                <li key={q.id} className={cn(tarjeta, "flex flex-wrap items-center gap-3")} style={{ borderLeft: `4px solid ${vencida ? "var(--danger)" : "var(--info)"}` }}>
                  <Link href={`${RAIZ}/alquileres/${q.contratoId}`} className="min-w-0 flex-1">
                    <span className="block font-semibold text-strong">{q.propiedad}</span>
                    <span className="block text-sm text-muted">
                      {q.inquilino} · {nombrePeriodo(q.periodo)} · {vencida ? `venció el ${diaCorto(q.vence)}` : `vence el ${diaCorto(q.vence)}`}
                    </span>
                  </Link>
                  <span className="text-right">
                    <span className="block font-bold tabular-nums text-strong">{pesos(q.saldo)}</span>
                    {q.mora.monto > 0 && <span className="block text-xs text-muted">+ {pesos(q.mora.monto)} de mora</span>}
                  </span>
                  <Avisar telefono={q.telefono} texto={texto} etiqueta={vencida ? "Reclamar" : "Recordar"} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {t.conPlata && t.liquidacionesPendientes > 0 && (
        <Link href={`${RAIZ}/liquidaciones`} className={cn(tarjeta, "block text-sm font-medium text-strong")}>
          Hay {t.liquidacionesPendientes} liquidaci{t.liquidacionesPendientes > 1 ? "ones emitidas" : "ón emitida"} sin pagarle al propietario →
        </Link>
      )}
    </main>
  );
}
