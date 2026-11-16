import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { Badge } from "@/components/ui";
import { ETIQUETA_CAMPO, ETIQUETA_ETAPA, CAMPOS_BRIEF, MOTIVOS, faltantesDelBrief, type Etapa } from "@/lib/crm-comercial/motor";
import { PUESTOS } from "@/lib/crm-comercial/permisos";
import { datosLimpios } from "@/lib/crm-comercial/repo";
import { detalleDeFicha, ficha, personasDelCrm } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "../comun";
import { ETIQUETA_PUESTO, ETIQUETA_ROL, TIPOS_DE_TAREA, dia, diaYHora, etiquetaTarea, opcionesDePase, paraInputFecha, plata, puedeEn } from "../crm-core";
import { BorradorTarjeta } from "../BorradorTarjeta";
import { ComprobarIdentidad, ConfirmarDestino, Contactos, DecidirPropuesta, FormularioDatos, NuevaTarea, NuevoBorrador, PanelPases, PedidoDeDatos, RegistrarRespuesta, VerificarFuente } from "./FichaFormularios";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · la ficha de la oportunidad (diseño §4.3): línea de tiempo con personas y puestos mezclados
// (quién hizo qué), brief con los faltantes, puntaje explicado, contactos con su papel, borradores y pases.
// Un id de otro negocio o que la persona no ve: el servidor lo rechaza y se dice por qué, con la salida.

const TIPO_ACTIVIDAD: Record<string, string> = {
  PASE: "Pase de etapa",
  PASE_PROPUESTO: "Propuesta de pase",
  PASE_RECHAZADO: "Pase no aprobado",
  DATOS: "Datos",
  AVISO: "Aviso",
  BORRADOR: "Borrador",
  BORRADOR_APROBADO: "Borrador aprobado",
  BORRADOR_RECHAZADO: "Borrador rechazado",
  BORRADOR_ENVIADO_POR_PERSONA: "Mensaje enviado",
  BORRADOR_EDITADO: "Borrador corregido",
  RESPUESTA_CLIENTE: "Respondió el cliente",
  INSTRUCCION_ANOTADA: "Texto sospechoso anotado",
  IDENTIDAD: "Identidad",
  DESTINO: "Destino",
  CONTACTO: "Contacto",
  CONTACTO_PAPEL: "Papel de contacto",
  PEDIDO_DE_DATOS: "Pedido de datos",
  TAREA: "Tarea",
  TAREA_TOMADA: "Tarea tomada",
  TAREA_CERRADA: "Tarea cerrada",
  ACCION_RECHAZADA: "Intento rechazado",
  DESPERTO: "Despertó",
  ALTA: "Alta",
  UNION: "Unión",
  CREADA: "Alta",
  UNIDA: "Se sumó otra vez la misma marca",
  VERIFICACION: "Verificación de la fuente",
  AVISO_EXCLUSIVIDAD: "Aviso de exclusividad",
  MIEMBRO: "Miembros del CRM",
  BAJA: "Pidió la baja",
  PEDIDO_TOMADO: "Pedido al equipo tomado",
  PEDIDO_CERRADO: "Pedido al equipo cerrado",
};
/** Un tipo sin etiqueta todavía: en minúsculas y sin guiones bajos, nunca en mayúsculas crudas. */
const tipoActividad = (t: string): string => TIPO_ACTIVIDAD[t] ?? (t.charAt(0) + t.slice(1).toLowerCase()).replaceAll("_", " ");
const VERIFICACION: Record<string, { texto: string; tono: "success" | "warning" | "danger" | "neutral" }> = {
  confirmado: { texto: "confirmado", tono: "success" },
  "en duda": { texto: "en duda", tono: "warning" },
  falla: { texto: "falla", tono: "danger" },
  "sin verificar": { texto: "sin verificar", tono: "neutral" },
};

const motivo = (m: string | null | undefined): string | null => (m ? (MOTIVOS[m as keyof typeof MOTIVOS] ?? m) : null);

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  if (!miembro) return <Marco vista="ficha" miembro={null}>{bloqueo}</Marco>;
  const { id } = await params;
  if (!id || id.length > 100) notFound();

  const [f, x, p] = await Promise.all([ficha(id), detalleDeFicha(id), personasDelCrm()]);
  if (!f.ok) return <Marco vista="ficha" miembro={miembro} ancho="max-w-4xl"><NoSePudo motivo={f.motivo} faltaMigracion={f.faltaMigracion} /></Marco>;
  const o = f.oportunidad;
  const d = x.ok ? x : null;
  const personas = p.ok ? p.personas : [];
  const nombre = new Map(personas.map((q) => [q.userId, q]));
  const comerciales = personas.filter((q) => q.activo && (q.rol === "COMERCIAL" || q.rol === "DIRECCION")).map((q) => ({ userId: q.userId, nombre: q.nombre }));
  const ahora = new Date();

  const titulo = [f.brief.marca ?? (o.tipo === "CONSULTA" ? "Consulta sin marca" : "Sin marca"), f.brief.evento].filter(Boolean).join(" · ");
  const etapa = o.etapa as Etapa;
  const cerrada = ["GANADA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"].includes(o.etapa);
  const vista = { tipo: o.tipo, duenoUserId: o.duenoUserId };
  const opciones = opcionesDePase(miembro, { ...o, pasePropuesto: o.pasePropuesto });
  const faltan = faltantesDelBrief(f.brief);
  const datos = datosLimpios(o.datos);
  const propuestaDatos = (o.pasePropuestoDatos ?? {}) as Record<string, string | null>;
  const puedeDecidir = !!o.pasePropuesto && puedeEn(miembro, "aplicar_pase", vista, o.pasePropuesto as Etapa);
  const persona = miembro.rol !== "PUESTO";
  const puedeDatos = { puntuar: puedeEn(miembro, "puntuar", vista), brief: puedeEn(miembro, "editar_brief", vista), persona };
  const puedeBorrador = { aprobar: puedeEn(miembro, "aprobar_borrador", vista), rechazar: puedeEn(miembro, "rechazar_borrador", vista), enviar: puedeEn(miembro, "marcar_enviado", vista) };
  const quien = (usuarioId: string, puesto: string | null) => {
    const q = nombre.get(usuarioId);
    const papel = puesto ? ETIQUETA_PUESTO[puesto as keyof typeof ETIQUETA_PUESTO] ?? puesto : q ? (q.rol === "PUESTO" && q.puesto ? ETIQUETA_PUESTO[q.puesto] : ETIQUETA_ROL[q.rol]) : null;
    return { nombre: q?.nombre ?? "Otra persona del negocio", papel, esPuesto: !!puesto || q?.rol === "PUESTO" };
  };
  const colas = [
    ...PUESTOS.filter((x) => x !== "contactos").map((x) => ({ valor: x as string, etiqueta: ETIQUETA_PUESTO[x] })),
    { valor: "PERSONA", etiqueta: "Una persona (comercial o Dirección)" },
    { valor: "DIRECCION", etiqueta: "Dirección" },
  ];

  return (
    <Marco vista="ficha" miembro={miembro} ancho="max-w-4xl">
      <nav aria-label="Volver" className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/crm" className="text-muted underline-offset-2 hover:underline">← Hoy</Link>
        <Link href="/admin/crm/embudo" className="text-muted underline-offset-2 hover:underline">← Embudo</Link>
      </nav>

      <header className="mb-6">
        <h2 className="break-words text-2xl font-semibold text-strong">{titulo}</h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={cerrada ? "neutral" : "accent"}>{ETIQUETA_ETAPA[etapa] ?? o.etapa}</Badge>
          <Badge tone="neutral">{o.tipo === "CONSULTA" ? "Consulta entrante" : "Prospecto"}</Badge>
          <Badge tone={f.puntaje.califica ? "success" : "neutral"}>Puntaje {f.puntaje.puntaje}</Badge>
          {o.destino && <Badge tone={o.destinoConfirmado ? "success" : "warning"}>{o.destino === "AGENCIA" ? "Agencia" : "Taller"}{o.destinoConfirmado ? "" : " (propuesto)"}</Badge>}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">Próximo paso: </dt><dd className={`inline ${o.proximoPasoEl && o.proximoPasoEl < ahora && !cerrada ? "text-danger" : ""}`}>{o.proximoPaso ?? "—"} {o.proximoPasoEl && `(${dia(o.proximoPasoEl)})`}</dd></div>
          <div><dt className="inline text-muted">Atiende: </dt><dd className="inline">{o.duenoUserId ? nombre.get(o.duenoUserId)?.nombre ?? "Un comercial" : "Sin comercial todavía"}</dd></div>
          <div><dt className="inline text-muted">En la etapa: </dt><dd className="inline">{o.diasEnEtapa == null ? "—" : `${o.diasEnEtapa} días`}{o.sinSeguimiento && " · sin seguimiento"}</dd></div>
          <div><dt className="inline text-muted">Monto: </dt><dd className="inline tabular-nums">{o.monto != null ? `${plata(o.monto, o.moneda)}${o.montoPonderado != null ? ` · ponderado ${plata(o.montoPonderado, o.moneda)} (${o.probabilidad} %)` : ""}` : "sin cargar"}</dd></div>
          {o.cierreEsperadoEl && <div><dt className="inline text-muted">Cierre esperado: </dt><dd className="inline">{dia(o.cierreEsperadoEl)}</dd></div>}
          {d?.fechaLimite && <div><dt className="inline text-muted">Entrega de la licitación: </dt><dd className="inline">{dia(d.fechaLimite)}</dd></div>}
          {d?.motivo && <div><dt className="inline text-muted">Motivo: </dt><dd className="inline">{motivo(d.motivo)}{d.nota ? ` · ${d.nota}` : ""}</dd></div>}
        </dl>
      </header>

      <div className="grid gap-8">
        {o.pasePropuesto && (
          <section id="pase" aria-labelledby="t-propuesta" className="rounded-lg border border-warning/50 bg-warning-soft p-4">
            <h3 id="t-propuesta" className="font-semibold text-strong">Propuesta: pasar a «{ETIQUETA_ETAPA[o.pasePropuesto as Etapa] ?? o.pasePropuesto}»</h3>
            <p className="mt-1 text-sm text-body">
              {o.pasePropuestoPor ? `La propuso ${quien(o.pasePropuestoPor, null).nombre}.` : ""} {propuestaDatos.motivo ? `Motivo: ${motivo(propuestaDatos.motivo)}.` : ""} {propuestaDatos.nota ?? ""}
            </p>
            <div className="mt-3">
              {puedeDecidir ? (
                <DecidirPropuesta oportunidadId={o.id} version={o.version} destino={ETIQUETA_ETAPA[o.pasePropuesto as Etapa] ?? o.pasePropuesto} esAsignada={o.pasePropuesto === "ASIGNADA"} comerciales={comerciales} />
              ) : (
                <p className="text-sm text-muted">La decide Dirección.</p>
              )}
            </div>
          </section>
        )}

        {!cerrada && (
          <section aria-labelledby="t-pases">
            <h3 id="t-pases" className="mb-2 text-lg font-semibold text-strong">Mover de etapa</h3>
            {o.etapa === "ASIGNADA" ? (
              <p className="text-sm text-muted">Ya es un proyecto: se gana o se pierde desde su proyecto, no desde acá.</p>
            ) : opciones.length === 0 ? (
              <p className="text-sm text-muted">{o.pasePropuesto ? "Primero hay que decidir la propuesta de arriba." : "Desde tu puesto no movés esta oportunidad."}</p>
            ) : (
              <PanelPases oportunidadId={o.id} version={o.version} opciones={opciones} comerciales={comerciales} />
            )}
            {o.destinoConfirmado && o.destino ? (
              <p className="mt-4 text-sm text-muted">Destino confirmado por Dirección: <span className="font-medium text-strong">{o.destino === "AGENCIA" ? "Agencia" : "Taller"}</span>.</p>
            ) : (
              puedeEn(miembro, "confirmar_destino", vista) &&
              o.etapa !== "ASIGNADA" && (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-muted">Destino {o.destino ? `propuesto: ${o.destino === "AGENCIA" ? "Agencia" : "Taller"}` : "sin proponer"}. Lo confirma Dirección.</p>
                  <ConfirmarDestino oportunidadId={o.id} actual={null} />
                </div>
              )
            )}
          </section>
        )}

        {o.tipo === "CONSULTA" && (
          <section aria-labelledby="t-consulta">
            <h3 id="t-consulta" className="mb-2 text-lg font-semibold text-strong">La consulta</h3>
            {d?.consultaTexto ? (
              <blockquote className="whitespace-pre-wrap break-words rounded-md border-l-2 border-line-strong bg-surface-sunken px-3 py-2 text-sm text-body">{d.consultaTexto}</blockquote>
            ) : (
              <p className="text-sm text-muted">Sin texto cargado.</p>
            )}
            <p className="mt-2 text-sm">
              {o.identidadComprobada ? <Badge tone="success">Quién escribe: comprobado</Badge> : <Badge tone="warning">Quién escribe: sin comprobar</Badge>}
            </p>
            {!o.identidadComprobada && !cerrada && puedeEn(miembro, "comprobar_identidad", vista) && <div className="mt-3"><ComprobarIdentidad oportunidadId={o.id} /></div>}
          </section>
        )}

        {(o.tipo === "PROSPECTO" || d?.evento) && (
          <section aria-labelledby="t-verificacion">
            <h3 id="t-verificacion" className="mb-1 text-lg font-semibold text-strong">Verificación de la fuente</h3>
            <p className="mb-3 text-sm text-muted">Para pasar a «Verificada» hacen falta la marca en el evento y el evento como «confirmado», cada uno con la URL donde se ve.</p>
            {!d?.evento ? (
              <p className="text-sm text-muted">Esta oportunidad no tiene evento: la marca se verifica en el evento donde se la vio.</p>
            ) : (
              <div className="grid gap-4">
                {([
                  ["marca", "La marca en el evento", d.marcaEnEvento ?? null],
                  ["evento", "El evento", { verificacion: d.evento.verificacion, urlFuente: d.evento.urlFuente }],
                ] as const).map(([que, rotulo, actual]) => {
                  const v = VERIFICACION[actual?.verificacion ?? "sin verificar"] ?? VERIFICACION["sin verificar"];
                  return (
                    <div key={que} className="rounded-lg border border-line bg-surface p-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-strong">{rotulo}:</span>
                        <Badge tone={v.tono}>{actual ? v.texto : "sin verificar"}</Badge>
                        {actual?.urlFuente && <a href={actual.urlFuente} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline underline-offset-2">ver la fuente</a>}
                      </p>
                      {!cerrada && puedeEn(miembro, "verificar", vista) && (
                        <div className="mt-3"><VerificarFuente oportunidadId={o.id} que={que} actual={actual} /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="t-brief" className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 id="t-brief" className="mb-2 text-lg font-semibold text-strong">Brief</h3>
            <dl className="grid gap-1 text-sm">
              {CAMPOS_BRIEF.map((k) => (
                <div key={k} className="flex flex-wrap gap-x-2">
                  <dt className="text-muted first-letter:uppercase">{ETIQUETA_CAMPO[k]}:</dt>
                  <dd className={f.brief[k] ? "break-words text-strong" : "text-warning"}>{f.brief[k] || "falta"}</dd>
                </div>
              ))}
            </dl>
            {faltan.length > 0 && !cerrada && puedeEn(miembro, "marcar_faltantes", vista) && <div className="mt-3"><PedidoDeDatos oportunidadId={o.id} /></div>}
          </div>
          <div>
            <h3 className="mb-2 text-lg font-semibold text-strong">Puntaje: {f.puntaje.puntaje}</h3>
            <p className="mb-2 text-sm text-muted">{f.puntaje.califica ? "Alcanza para calificar." : "Todavía no alcanza para calificar."} Sale sólo de datos cargados, nunca del texto de la consulta.</p>
            <ul className="grid gap-1 text-sm">
              {f.puntaje.detalle.map((c) => (
                <li key={c.criterio} className="flex gap-2">
                  <span className={`w-10 shrink-0 text-right tabular-nums ${c.suma > 0 ? "text-success" : "text-muted"}`}>+{c.suma}</span>
                  <span className="break-words">{c.explicacion}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {!cerrada && (puedeDatos.puntuar || puedeDatos.brief || persona) && (
          <FormularioDatos
            oportunidadId={o.id}
            version={o.version}
            puede={puedeDatos}
            inicial={{
              fechaEvento: datos.fechaEvento ?? "",
              tipoTrabajo: datos.tipoTrabajo ?? "",
              presupuestoMin: datos.presupuestoMin != null ? String(datos.presupuestoMin) : "",
              presupuestoMax: datos.presupuestoMax != null ? String(datos.presupuestoMax) : "",
              quienDecide: datos.quienDecide ?? "",
              encaje: datos.encaje === true ? "si" : datos.encaje === false ? "no" : "",
              objetivo: f.brief.objetivo ?? "",
              proximoPaso: o.proximoPaso ?? "",
              proximoPasoEl: paraInputFecha(o.proximoPasoEl),
              monto: o.monto != null ? String(o.monto) : "",
              moneda: o.moneda,
              cierreEsperadoEl: paraInputFecha(o.cierreEsperadoEl),
              fuenteUrl: "",
            }}
          />
        )}

        <section aria-labelledby="t-contactos">
          <h3 id="t-contactos" className="mb-2 text-lg font-semibold text-strong">Contactos</h3>
          <Contactos
            oportunidadId={o.id}
            contactos={f.contactos}
            puedeCargar={!cerrada && puedeEn(miembro, "crear_contacto", vista)}
            puedeBaja={puedeEn(miembro, "suprimir_contacto")}
            deConsulta={o.tipo === "CONSULTA"}
          />
          {!cerrada && persona && <div className="mt-3"><RegistrarRespuesta oportunidadId={o.id} /></div>}
        </section>

        <section id="borradores" aria-labelledby="t-borradores">
          <h3 id="t-borradores" className="mb-2 text-lg font-semibold text-strong">Borradores</h3>
          {f.borradores.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay borradores.</p>
          ) : (
            <ul className="grid gap-3">
              {f.borradores.map((b) => <li key={b.id}><BorradorTarjeta b={b} puede={puedeBorrador} /></li>)}
            </ul>
          )}
          {!cerrada && puedeEn(miembro, "escribir_borrador", vista) && <div className="mt-3"><NuevoBorrador oportunidadId={o.id} contactos={f.contactos} /></div>}
          {!cerrada && puedeEn(miembro, "crear_tarea_seguimiento", vista) && (
            <div className="mt-3">
              <NuevaTarea oportunidadId={o.id} colas={colas} tipos={TIPOS_DE_TAREA.map((t) => ({ valor: t, etiqueta: etiquetaTarea(t) }))} />
            </div>
          )}
        </section>

        <section aria-labelledby="t-linea">
          <h3 id="t-linea" className="mb-2 text-lg font-semibold text-strong">Línea de tiempo</h3>
          <p className="mb-2 text-sm text-muted">Personas y puestos del equipo, en orden: quién hizo qué y cuándo.</p>
          {f.actividades.length === 0 ? (
            <p className="text-sm text-muted">Sin movimientos todavía.</p>
          ) : (
            <ol className="grid gap-3 border-l border-line pl-4">
              {f.actividades.map((a) => {
                const q = quien(a.usuarioId, a.puesto);
                return (
                  <li key={a.id} className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-strong">{q.nombre}</span>
                      {q.papel && <Badge tone={q.esPuesto ? "info" : "neutral"}>{q.papel}</Badge>}
                      <span className="text-muted">· {diaYHora(a.createdAt)} · {tipoActividad(a.tipo)}</span>
                    </p>
                    <p className={`mt-0.5 whitespace-pre-wrap break-words ${a.tipo === "ACCION_RECHAZADA" ? "text-danger" : "text-body"}`}>{a.texto}</p>
                    {a.fuenteUrl && <a href={a.fuenteUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">Ver fuente</a>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Marco>
  );
}
