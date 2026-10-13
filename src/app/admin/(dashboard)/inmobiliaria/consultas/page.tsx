import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { configInmo, equipo, listaConsultas, listaPropiedades, negocioInmo, veLaPlata } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { cargarConsulta, guardarConsulta, moverConsulta } from "@/lib/inmobiliaria/acciones";
import {
  armarMensaje,
  CONSULTA_ABIERTA,
  esEstadoConsulta,
  ESTADO_CONSULTA_LABEL,
  ESTADOS_CONSULTA,
  haceCuanto,
  ORIGEN_LABEL,
  ORIGENES,
  TIPO_CONSULTA_LABEL,
  TIPOS_CONSULTA,
  urgencia,
  type Origen,
  type TipoConsulta,
} from "@/lib/inmobiliaria/core";
import { BarraInmo, ChipConsulta, RAIZ, subtitulo, tarjeta, titulo, tonoConsulta, tonoUrgencia } from "../_vista";
import { BotonEnviar, FormAccion, Responder } from "../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Consultas" };

/** La fecha y hora de una visita como la quiere un <input type="datetime-local"> (hora de Argentina). */
const paraElCampo = (d: Date | null): string => (d ? new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16) : "");

export default async function Consultas({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireApp("inmobiliaria");
  const { estado: crudo } = await searchParams;
  const estado = esEstadoConsulta(crudo) ? crudo : undefined;
  const tenantId = await getCurrentTenantId();
  const conPlata = veLaPlata(user);
  const [{ consultas, porEstado }, config, negocio, origen, fichas, gente] = await Promise.all([
    listaConsultas({ estado }),
    configInmo(tenantId),
    negocioInmo(tenantId),
    origenDelSitio(),
    listaPropiedades({}),
    conPlata ? equipo() : Promise.resolve([]),
  ]);
  const abiertas = CONSULTA_ABIERTA.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4">
        <h1 className={titulo}>Consultas</h1>
        <p className="text-sm text-muted">
          {abiertas} en curso · {porEstado.NUEVA ?? 0} sin responder
        </p>
      </header>

      <BarraInmo activa={`${RAIZ}/consultas`} conPlata={conPlata} esDuenio={roleHasCapability(user.role, "users:manage")} />

      <nav aria-label="Filtrar por estado" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={`${RAIZ}/consultas`} aria-current={!estado ? "page" : undefined} className={cn("flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium", !estado ? "border-transparent bg-accent text-on-accent" : "border-line text-strong")}>
          En curso ({abiertas})
        </Link>
        {ESTADOS_CONSULTA.map((e) => (
          <Link
            key={e}
            href={`${RAIZ}/consultas?estado=${e}`}
            aria-current={e === estado ? "page" : undefined}
            className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium", e === estado ? "border-transparent bg-accent text-on-accent" : "border-line text-strong")}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: tonoConsulta(e) }} />
            {ESTADO_CONSULTA_LABEL[e]} ({porEstado[e] ?? 0})
          </Link>
        ))}
      </nav>

      {consultas.length === 0 ? (
        <EmptyState title="No hay consultas acá" description="Las que llegan por el sitio aparecen solas. Las de la oficina, WhatsApp o un portal se cargan abajo." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {consultas.map((c) => {
            const u = urgencia(c.esperando);
            const texto = armarMensaje(c.tipo === "TASACION" ? config.plantillas.tasacion : config.plantillas.consulta, {
              nombre: c.nombre.split(" ")[0],
              agente: user.name.split(" ")[0],
              inmobiliaria: negocio.nombre,
              propiedad: c.propiedad?.titulo ?? "nuestras propiedades",
              link: c.propiedad ? `${origen}/propiedades/${c.propiedad.slug}` : `${origen}/propiedades`,
            });
            const siguientes = ESTADOS_CONSULTA.filter((e) => e !== c.estado && e !== "NUEVA");
            return (
              <li key={c.id} className={cn(tarjeta, "flex flex-col gap-2")} style={{ borderLeft: `4px solid ${c.estado === "NUEVA" ? tonoUrgencia(u) : tonoConsulta(c.estado)}` }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-strong">{c.nombre}</span>
                  <ChipConsulta estado={c.estado} />
                </div>
                <p className="text-sm text-muted">
                  {TIPO_CONSULTA_LABEL[c.tipo as TipoConsulta] ?? c.tipo} · {ORIGEN_LABEL[c.origen as Origen] ?? c.origen} · {fmtDateTimeAr(c.creada)}
                  {c.estado === "NUEVA" && (
                    <strong style={{ color: tonoUrgencia(u) }}> · espera {haceCuanto(c.esperando).replace("hace ", "")}</strong>
                  )}
                </p>
                {c.propiedad && (
                  <Link href={`${RAIZ}/propiedades/${c.propiedad.id}`} className="flex min-h-11 items-center self-start text-sm underline">
                    {c.propiedad.codigo} · {c.propiedad.titulo}
                  </Link>
                )}
                {c.mensaje && <p className="text-sm">“{c.mensaje}”</p>}
                <p className="text-sm text-muted">
                  {[c.telefono, c.email].filter(Boolean).join(" · ")}
                  {c.asignada ? ` · la atiende ${c.asignada}` : " · sin asignar"}
                </p>
                <Responder consultaId={c.id} telefono={c.telefono} texto={texto} chico />

                <details className="rounded-xl border border-line px-3 py-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">
                    Seguimiento{c.visitaEl ? ` · visita ${fmtDateTimeAr(c.visitaEl)}` : ""}
                    {c.notas ? " · con notas" : ""}
                  </summary>
                  <form action={guardarConsulta} className="grid grid-cols-1 gap-2 pb-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Field label="Visita" htmlFor={`visita-${c.id}`} hint="Al cargarla, la consulta pasa a «Visita coordinada».">
                      <Input id={`visita-${c.id}`} type="datetime-local" name="visitaEl" defaultValue={paraElCampo(c.visitaEl)} />
                    </Field>
                    <Field label="Notas" htmlFor={`notas-${c.id}`}>
                      <Textarea id={`notas-${c.id}`} name="notas" defaultValue={c.notas} rows={3} maxLength={2000} />
                    </Field>
                    {conPlata && (
                      <Field label="La atiende" htmlFor={`asignada-${c.id}`}>
                        <Select id={`asignada-${c.id}`} name="asignadaUserId" defaultValue={c.asignadaUserId ?? ""}>
                          <option value="">Sin asignar</option>
                          {gente.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nombre}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <BotonEnviar variant="outline" size="md" pendingText="Guardando…">
                      Guardar seguimiento
                    </BotonEnviar>
                  </form>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                    {siguientes.map((e) => (
                      <form key={e} action={moverConsulta}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="estado" value={e} />
                        <button type="submit" className={cn(buttonClasses("ghost", "sm"), "h-11")}>
                          → {ESTADO_CONSULTA_LABEL[e]}
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <section className={cn(tarjeta, "mt-6")} aria-label="Cargar una consulta">
        <h2 className={cn(subtitulo, "mb-3")}>Cargar una consulta que entró por otro lado</h2>
        <FormAccion accion={cargarConsulta} vaciar mensajeOk="Consulta cargada." className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="c-nombre" required>
            <Input id="c-nombre" name="nombre" required minLength={2} maxLength={80} />
          </Field>
          <Field label="Teléfono" htmlFor="c-telefono" required>
            <Input id="c-telefono" name="telefono" type="tel" inputMode="tel" required />
          </Field>
          <Field label="Por dónde entró" htmlFor="c-origen">
            <Select id="c-origen" name="origen" defaultValue="MOSTRADOR">
              {ORIGENES.filter((o) => o !== "WEB").map((o) => (
                <option key={o} value={o}>
                  {ORIGEN_LABEL[o]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qué quiere" htmlFor="c-tipo">
            <Select id="c-tipo" name="tipo" defaultValue="CONSULTA">
              {TIPOS_CONSULTA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_CONSULTA_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Propiedad" htmlFor="c-propiedad" className="sm:col-span-2">
            <Select id="c-propiedad" name="propiedadId" defaultValue="">
              <option value="">Ninguna en particular</option>
              {fichas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.titulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qué dijo" htmlFor="c-mensaje" className="sm:col-span-2">
            <Textarea id="c-mensaje" name="mensaje" rows={3} maxLength={1000} />
          </Field>
          <BotonEnviar pendingText="Guardando…" className="sm:justify-self-start">
            Cargar consulta
          </BotonEnviar>
        </FormAccion>
      </section>
    </main>
  );
}
