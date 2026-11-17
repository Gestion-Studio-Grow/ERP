// CONSOLA DE LA CUADRILLA · el tablero (GSG-MIA-062). Componente de servidor, formularios comunes (anda sin JS).
//
// Lo usan el operador GSG (/operador/cuadrilla, varios negocios) y la supervisión del cliente
// (/admin/cuadrilla, sólo su negocio). Pensado para quien controla muchos agentes:
//   · la bandeja de excepciones arriba, la más urgente primero; al entrar ya está abierta la primera;
//   · filtros por negocio, agente, estado y tipo (en la URL: se comparten y sobreviven al recargar);
//   · hilo por agente o por equipo, estilo chat, con las excepciones de ese agente dentro del hilo;
//   · lote: rechazar, aprobar (nunca plata ni envíos a terceros), reasignar y pausar;
//   · pedidos (criterio 8): cada mensaje a un agente es un pedido con tope; negados y oportunidades, filtrables.
// Las acciones llegan por props: cada lado pasa las suyas (las del operador corren con `enElNegocio`,
// las del panel con el negocio de la sesión). Esta pieza no decide permisos: los decide el servidor.
import Link from "next/link";
import { atributosBoton, buttonClasses } from "@/components/ui/Button";
import { esNivel0 } from "@/lib/cuadrilla/permisos";
import type { ExcepcionVista, MensajeVista, Tablero } from "@/lib/cuadrilla/consola-core";
import type { PedidoVista } from "@/lib/cuadrilla/pedidos-core";
import { TOPE, VISTAS_PEDIDOS } from "@/lib/cuadrilla/pedidos";

type Accion = (fd: FormData) => Promise<void>;

export type NegocioDelTablero = { id: string; nombre: string; tablero: Tablero | null; falla?: string; pedidos?: PedidoVista[] };

export type PropsTablero = {
  modo: "operador" | "supervisor";
  base: string;
  negocios: NegocioDelTablero[];
  filtros: { negocio?: string; agente?: string; estado?: string; tipo?: string; hilo?: string; en?: string; pedidos?: string };
  seleccion: { excepcion: ExcepcionVista; negocio: string } | null;
  hilo: { clave: string; tenantId: string; titulo: string; mensajes: MensajeVista[]; excepciones: ExcepcionVista[] } | null;
  respuestaMedianaSeg: number | null;
  aviso: { ok?: string; error?: string };
  acciones: { decidir: Accion; lote: Accion; agente: Accion; hablar: Accion };
};

const TIPO: Record<string, string> = {
  APROBACION: "Pide aprobación",
  FRENADO: "Agente frenado",
  RECHAZO: "Rechazo del sistema",
  ESCALADO: "Escalado",
};
const CATEGORIA: Record<string, string> = { PLATA: "Plata", ENVIO_TERCEROS: "Envío a terceros", OTRA: "" };
const ESTADO_AGENTE: Record<string, string> = { ACTIVO: "Trabajando", PAUSADO: "Pausado", FRENADO: "Frenado" };

function hace(d: Date): string {
  const min = Math.max(0, Math.round((Date.now() - +d) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Día y hora en Argentina (el servidor corre en UTC). */
export function horaAR(d: Date): string {
  return d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function Cuando({ d }: { d: Date }) {
  return (
    <time dateTime={d.toISOString()} title={horaAR(d)}>
      {hace(d)} · {horaAR(d)}
    </time>
  );
}

function duracion(seg: number | null): string {
  if (seg == null) return "sin datos";
  if (seg < 90) return `${seg} s`;
  return `${Math.round(seg / 60)} min`;
}

/** Un enlace de la consola: los filtros de ahora, los cambios y el ancla (en el celular baja directo ahí). */
function href(base: string, actuales: PropsTablero["filtros"], cambios: Record<string, string | undefined>, ancla?: string): string {
  const q = new URLSearchParams();
  const todo = { ...actuales, ex: undefined, ...cambios } as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(todo)) if (v) q.set(k, v);
  const s = q.toString();
  return (s ? `${base}?${s}` : base) + (ancla ? `#${ancla}` : "");
}

/** Los filtros viajan con cada formulario para volver a la misma vista. */
function FiltrosOcultos({ filtros }: { filtros: PropsTablero["filtros"] }) {
  return (
    <>
      {Object.entries(filtros).map(([k, v]) => (v ? <input key={k} type="hidden" name={`f_${k}`} value={v} /> : null))}
    </>
  );
}

function Etiqueta({ children, tono }: { children: React.ReactNode; tono: "alerta" | "peligro" | "neutro" | "ok" }) {
  const cls = {
    alerta: "border-warning bg-warning-soft text-warning",
    peligro: "border-danger bg-danger-soft text-danger",
    neutro: "border-line text-muted",
    ok: "border-line bg-success-soft text-success",
  }[tono];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function EtiquetasDe({ e }: { e: Pick<ExcepcionVista, "tipo" | "categoria"> }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Etiqueta tono={e.tipo === "APROBACION" ? "alerta" : e.tipo === "FRENADO" || e.tipo === "RECHAZO" ? "peligro" : "neutro"}>{TIPO[e.tipo] ?? e.tipo}</Etiqueta>
      {esNivel0(e.categoria) ? <Etiqueta tono="peligro">{CATEGORIA[e.categoria]} · de a una</Etiqueta> : null}
    </span>
  );
}

/** La excepción abierta, con su contenido completo y la decisión. Se usa igual en el detalle y en el hilo. */
function Decision({ e, negocio, props, ancla }: { e: ExcepcionVista; negocio: string; props: PropsTablero; ancla: "decision" | "hilo" }) {
  const pendiente = e.estado === "PENDIENTE";
  return (
    <article
      aria-labelledby={`ex-${e.id}`}
      className={`space-y-3 rounded-lg border ${pendiente ? "border-line-strong" : "border-line"} bg-surface-raised p-4`}
      data-excepcion={e.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <EtiquetasDe e={e} />
          <h3 id={`ex-${e.id}`} className="font-semibold text-strong">
            {e.titulo}
          </h3>
          <p className="text-sm text-muted">
            {e.agenteNombre}
            {props.modo === "operador" && negocio ? ` · ${negocio}` : ""} · <Cuando d={e.createdAt} />
          </p>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Lo que se va a hacer</p>
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface-sunken p-3 font-sans text-sm text-body">
          {e.contenido}
        </pre>
      </div>
      {pendiente ? (
        <form action={props.acciones.decidir} className="space-y-2">
          <FiltrosOcultos filtros={props.filtros} />
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="tenantId" value={e.tenantId} />
          <input type="hidden" name="huella" value={e.huella} />
          <input type="hidden" name="ancla" value={ancla} />
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Motivo o indicación (opcional, le llega al agente)</span>
            <input name="motivo" maxLength={500} className="min-h-11 rounded border border-line bg-surface px-3" />
          </label>
          {esNivel0(e.categoria) && e.tipo === "APROBACION" ? (
            <p className="text-sm text-warning">Es {CATEGORIA[e.categoria].toLowerCase()}: se aprueba sólo así, de a una, con el contenido a la vista. El envío lo hace una persona, no el sistema.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {e.tipo === "APROBACION" ? (
              <button type="submit" name="op" value="aprobar" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
                Aprobar
              </button>
            ) : (
              <button type="submit" name="op" value="resolver" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
                Dar por resuelta
              </button>
            )}
            <button type="submit" name="op" value="rechazar" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
              Rechazar
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">
          {e.estado === "APROBADA" ? "Aprobada" : e.estado === "RECHAZADA" ? "Rechazada" : "Resuelta"} por {e.decididaPor ?? "—"}
          {e.decididaEn ? ` · ${horaAR(e.decididaEn)}` : ""}
          {e.motivo ? ` · «${e.motivo}»` : ""}
        </p>
      )}
    </article>
  );
}

function Contador({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono?: "alerta" }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tono === "alerta" ? "border-warning bg-warning-soft" : "border-line bg-surface-raised"}`}>
      <p className={`text-xl font-semibold ${tono === "alerta" ? "text-warning" : "text-strong"}`}>{valor}</p>
      <p className="text-xs text-muted">{etiqueta}</p>
    </div>
  );
}

function Hilo({ props }: { props: PropsTablero }) {
  const h = props.hilo!;
  return (
    <section id="hilo" aria-labelledby="titulo-hilo" className="scroll-mt-20 space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-hilo" className="font-semibold text-strong">
          {h.titulo}
        </h2>
        <Link href={href(props.base, props.filtros, { hilo: undefined, en: undefined })} className="min-h-11 content-center text-sm text-muted underline">
          Cerrar hilo
        </Link>
      </div>
      {h.excepciones.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Esperando decisión en este hilo</p>
          {h.excepciones.map((e) => (
            <Decision key={e.id} e={e} negocio="" props={props} ancla="hilo" />
          ))}
        </div>
      ) : null}
      <ol className="max-h-[28rem] space-y-2 overflow-auto" aria-label="Mensajes del hilo">
        {h.mensajes.length === 0 ? <li className="text-sm text-muted">Todavía nadie escribió en este hilo.</li> : null}
        {h.mensajes.map((m) => (
          <li key={m.id} className={`rounded-lg border px-3 py-2 ${m.autorTipo === "AGENTE" ? "border-line bg-surface-raised" : m.autorTipo === "SISTEMA" ? "border-line bg-surface-sunken" : "border-accent bg-surface"}`}>
            <p className="text-xs text-muted">
              <span className="font-medium text-strong">{m.autor}</span> · {m.autorTipo === "AGENTE" ? "agente" : m.autorTipo === "SISTEMA" ? "aviso" : "persona"} · <Cuando d={m.createdAt} />
            </p>
            <p className="whitespace-pre-wrap break-words text-sm text-body">{m.texto}</p>
          </li>
        ))}
      </ol>
      <form action={props.acciones.hablar} className="space-y-2">
        <FiltrosOcultos filtros={props.filtros} />
        <input type="hidden" name="hilo" value={h.clave} />
        <input type="hidden" name="tenantId" value={h.tenantId} />
        <input type="hidden" name="ancla" value="hilo" />
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Escribile a {h.clave.startsWith("equipo:") ? "todo el equipo" : "este agente"}</span>
          <textarea name="texto" required maxLength={2000} rows={3} className="rounded border border-line bg-surface p-3" />
        </label>
        {h.clave.startsWith("agente:") ? (
          <fieldset className="flex flex-wrap items-end gap-3">
            <legend className="text-xs text-muted">Es un pedido: si el agente llega al tope, se frena y te lo pasa.</legend>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Tope (minutos)</span>
              <input type="number" name="topeMinutos" min={TOPE.minutos.min} max={TOPE.minutos.max} defaultValue={TOPE.minutos.porDefecto} className="min-h-11 w-24 rounded border border-line bg-surface px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Tope (turnos)</span>
              <input type="number" name="topeTurnos" min={TOPE.turnos.min} max={TOPE.turnos.max} defaultValue={TOPE.turnos.porDefecto} className="min-h-11 w-24 rounded border border-line bg-surface px-2" />
            </label>
          </fieldset>
        ) : null}
        <button type="submit" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
          Mandar
        </button>
      </form>
    </section>
  );
}

const VISTA: Record<string, string> = {
  todos: "Todos",
  abiertos: "Abiertos",
  negados: "Negados",
  oportunidades: "Oportunidades",
  topes: "Llegaron al tope",
};

function EstadoDelPedido({ p }: { p: PedidoVista }) {
  if (p.estado === "NEGADO") return <Etiqueta tono="neutro">Negado · fuera del servicio</Etiqueta>;
  if (p.estado === "ESCALADO" && p.salida === "OPORTUNIDAD") return <Etiqueta tono="alerta">Oportunidad · dueño {p.duenio}</Etiqueta>;
  if (p.estado === "ESCALADO") return <Etiqueta tono="peligro">Llegó al tope · escalado</Etiqueta>;
  if (p.estado === "HECHO") return <Etiqueta tono="ok">Hecho</Etiqueta>;
  return <Etiqueta tono="neutro">Abierto</Etiqueta>;
}

/** Los pedidos a los agentes: lo que el cliente pide, incluido lo que hoy no ofrecemos (negados y oportunidades). */
function Pedidos({ props, pedidos }: { props: PropsTablero; pedidos: { p: PedidoVista; negocio: string }[] }) {
  const vista = props.filtros.pedidos ?? "todos";
  return (
    <section id="pedidos" aria-labelledby="titulo-pedidos" className="scroll-mt-20 space-y-2">
      <h2 id="titulo-pedidos" className="font-semibold text-strong">
        Pedidos a los agentes ({pedidos.length})
      </h2>
      <nav aria-label="Ver pedidos" className="flex flex-wrap gap-2">
        {VISTAS_PEDIDOS.map((v) => (
          <Link
            key={v}
            href={href(props.base, props.filtros, { pedidos: v === "todos" ? undefined : v }, "pedidos")}
            aria-current={vista === v ? "page" : undefined}
            className={buttonClasses(vista === v ? "solid" : "subtle", "sm")}
            {...atributosBoton(vista === v ? "solid" : "subtle", "sm")}
          >
            {VISTA[v]}
          </Link>
        ))}
      </nav>
      {pedidos.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">No hay pedidos en esta vista.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label="Pedidos">
          {pedidos.map(({ p, negocio }) => (
            <li key={p.id} className="space-y-1 px-3 py-2" data-pedido={p.id} data-estado={p.estado} data-salida={p.salida ?? ""}>
              <EstadoDelPedido p={p} />
              <p className="whitespace-pre-wrap break-words text-sm text-body">{p.texto}</p>
              <p className="text-xs text-muted">
                A {p.agenteNombre}
                {props.modo === "operador" ? ` · ${negocio}` : ""} · pidió {p.pedidoPor} · <Cuando d={p.createdAt} /> · tope {p.topeMinutos} min, {p.turnosUsados}/{p.topeTurnos} turnos
              </p>
              {p.regla ? <p className="text-xs text-muted">Regla: {p.regla}</p> : null}
              {p.respuesta ? <p className="text-xs text-muted">Respuesta: «{p.respuesta}»</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TableroCuadrilla(props: PropsTablero) {
  const { negocios, filtros, base } = props;
  const conTablero = negocios.filter((n) => n.tablero);
  const soloPendientes = (filtros.estado ?? "PENDIENTE") !== "TODAS";
  // Entre negocios, la misma regla que adentro de cada uno: pendientes de la más vieja a la más nueva.
  const excepciones = conTablero
    .flatMap((n) => n.tablero!.excepciones.map((e) => ({ e, negocio: n.nombre })))
    .sort((a, b) => (soloPendientes ? +a.e.createdAt - +b.e.createdAt : +b.e.createdAt - +a.e.createdAt));
  const pedidos = conTablero
    .flatMap((n) => (n.pedidos ?? []).map((p) => ({ p, negocio: n.nombre })))
    .sort((a, b) => +b.p.createdAt - +a.p.createdAt);
  const agentes = conTablero.flatMap((n) => n.tablero!.agentes.map((a) => ({ a, negocio: n })));
  const pendientes = conTablero.reduce((s, n) => s + n.tablero!.pendientes, 0);
  const frenados = conTablero.reduce((s, n) => s + n.tablero!.frenados, 0);
  const equipos = [...new Map(agentes.map(({ a, negocio }) => [`${negocio.id}|${a.equipo}`, { equipo: a.equipo, negocio }])).values()];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-strong">Cuadrilla</h1>
          <p className="text-sm text-muted">
            {props.modo === "operador"
              ? "Los agentes de todos los negocios: lo que espera una persona va primero."
              : "Los agentes de tu negocio: lo que espera tu decisión va primero."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Contador valor={String(pendientes)} etiqueta="Esperan una persona" tono={pendientes > 0 ? "alerta" : undefined} />
          <Contador valor={String(frenados)} etiqueta="Agentes frenados" tono={frenados > 0 ? "alerta" : undefined} />
          <Contador valor={String(agentes.length)} etiqueta={props.modo === "operador" ? `Agentes en ${conTablero.length} ${conTablero.length === 1 ? "negocio" : "negocios"}` : "Agentes"} />
          <Contador valor={duracion(props.respuestaMedianaSeg)} etiqueta="Respuesta a un mensaje (mediana, 7 días)" />
        </div>
      </header>

      {props.aviso.error ? (
        <p role="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {props.aviso.error}
        </p>
      ) : props.aviso.ok ? (
        <p role="status" className="rounded-lg border border-line bg-success-soft px-3 py-2 text-sm text-success">
          {props.aviso.ok}
        </p>
      ) : null}
      {negocios
        .filter((n) => n.falla)
        .map((n) => (
          <p key={n.id} role="alert" className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">
            {n.nombre}: {n.falla}
          </p>
        ))}

      <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3" aria-label="Filtros">
        {props.modo === "operador" ? (
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Negocio</span>
            <select name="negocio" defaultValue={filtros.negocio ?? ""} className="min-h-11 rounded border border-line bg-surface px-2">
              <option value="">Todos</option>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Agente</span>
          <select name="agente" defaultValue={filtros.agente ?? ""} className="min-h-11 rounded border border-line bg-surface px-2">
            <option value="">Todos</option>
            {agentes.map(({ a, negocio }) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
                {props.modo === "operador" ? ` · ${negocio.nombre}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Estado</span>
          <select name="estado" defaultValue={filtros.estado ?? "PENDIENTE"} className="min-h-11 rounded border border-line bg-surface px-2">
            <option value="PENDIENTE">Esperan decisión</option>
            <option value="TODAS">Todas (también decididas)</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Tipo</span>
          <select name="tipo" defaultValue={filtros.tipo ?? ""} className="min-h-11 rounded border border-line bg-surface px-2">
            <option value="">Todos</option>
            {Object.entries(TIPO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
          Filtrar
        </button>
      </form>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-5">
          {props.seleccion ? (
            <section id="decision" aria-label="Excepción abierta" className="scroll-mt-20 space-y-2">
              <Decision e={props.seleccion.excepcion} negocio={props.seleccion.negocio} props={props} ancla="decision" />
              <Link
                href={href(base, filtros, { hilo: `agente:${props.seleccion.excepcion.agenteId}`, en: props.seleccion.excepcion.tenantId }, "hilo")}
                className="inline-flex min-h-11 items-center text-sm text-accent underline"
              >
                Abrir el hilo de {props.seleccion.excepcion.agenteNombre}
              </Link>
            </section>
          ) : null}

          <section id="bandeja" aria-labelledby="titulo-bandeja" className="scroll-mt-20 space-y-2">
            <h2 id="titulo-bandeja" className="font-semibold text-strong">
              {soloPendientes ? `Excepciones que esperan (${excepciones.length})` : `Excepciones (${excepciones.length})`}
            </h2>
            {excepciones.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">Nada espera una persona. La cuadrilla sigue sola.</p>
            ) : (
              <form action={props.acciones.lote} className="space-y-2">
                <FiltrosOcultos filtros={filtros} />
                <input type="hidden" name="ancla" value="bandeja" />
                <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                  {excepciones.map(({ e, negocio }) => {
                    const abierta = props.seleccion?.excepcion.id === e.id;
                    return (
                      <li key={e.id} className={`flex items-start gap-3 px-3 py-2 ${abierta ? "bg-surface-sunken" : ""}`}>
                        {e.estado === "PENDIENTE" ? (
                          <input type="checkbox" name="sel" value={`${e.tenantId}:${e.id}`} aria-label={`Elegir «${e.titulo}»`} className="mt-3 size-5" />
                        ) : (
                          <span className="mt-3 size-5" aria-hidden />
                        )}
                        <Link
                          href={href(base, filtros, { en: e.tenantId, ex: e.id }, "decision")}
                          className="block min-h-11 flex-1 rounded py-1 focus-visible:outline focus-visible:outline-2"
                          aria-current={abierta ? "true" : undefined}
                        >
                          <EtiquetasDe e={e} />
                          <span className="mt-1 block font-medium text-strong">{e.titulo}</span>
                          <span className="block text-sm text-muted">
                            {e.agenteNombre}
                            {props.modo === "operador" ? ` · ${negocio}` : ""} · <Cuando d={e.createdAt} />
                            {e.estado !== "PENDIENTE" ? ` · ${e.estado.toLowerCase()}` : ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <fieldset className="space-y-2 rounded-lg border border-line bg-surface p-3">
                  <legend className="px-1 text-sm font-medium text-strong">Con las elegidas</legend>
                  <div className="flex flex-wrap items-end gap-2">
                    <button type="submit" name="op" value="rechazar" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                      Rechazar
                    </button>
                    <button type="submit" name="op" value="aprobar" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                      Aprobar (sin plata ni envíos)
                    </button>
                    <button type="submit" name="op" value="pausar" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                      Pausar sus agentes
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted">Pasarlas a</span>
                      <select name="destino" className="min-h-11 rounded border border-line bg-surface px-2">
                        {agentes.map(({ a, negocio }) => (
                          <option key={a.id} value={`${negocio.id}:${a.id}`}>
                            {a.nombre}
                            {props.modo === "operador" ? ` · ${negocio.nombre}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" name="op" value="reasignar" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                      Reasignar
                    </button>
                  </div>
                  <p className="text-xs text-muted">Plata y envíos a terceros no se aprueban en lote: se abren y se aprueban de a uno.</p>
                </fieldset>
              </form>
            )}
          </section>

          <Pedidos props={props} pedidos={pedidos} />
        </div>

        <div className="space-y-5">
          {props.hilo ? <Hilo props={props} /> : null}

          <section aria-labelledby="titulo-agentes" className="space-y-2">
            <h2 id="titulo-agentes" className="font-semibold text-strong">
              Agentes ({agentes.length})
            </h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {agentes.map(({ a, negocio }) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Link href={href(base, filtros, { hilo: `agente:${a.id}`, en: negocio.id }, "hilo")} className="block min-h-11 flex-1 py-1">
                    <span className="block font-medium text-strong">{a.nombre}</span>
                    <span className="block text-sm text-muted">
                      {a.puesto} · {a.equipo}
                      {props.modo === "operador" ? ` · ${negocio.nombre}` : ""}
                      {a.pendientes ? ` · ${a.pendientes} esperando` : ""}
                    </span>
                  </Link>
                  <Etiqueta tono={a.estado === "ACTIVO" ? "ok" : a.estado === "FRENADO" ? "peligro" : "alerta"}>{ESTADO_AGENTE[a.estado] ?? a.estado}</Etiqueta>
                  <form action={props.acciones.agente}>
                    <FiltrosOcultos filtros={filtros} />
                    <input type="hidden" name="tenantId" value={negocio.id} />
                    <input type="hidden" name="agenteId" value={a.id} />
                    <input type="hidden" name="estado" value={a.estado === "ACTIVO" ? "PAUSADO" : "ACTIVO"} />
                    <button type="submit" className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")} aria-label={`${a.estado === "ACTIVO" ? "Pausar" : "Reanudar"} a ${a.nombre}`}>
                      {a.estado === "ACTIVO" ? "Pausar" : "Reanudar"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          {equipos.length > 0 ? (
            <section aria-labelledby="titulo-equipos" className="space-y-2">
              <h2 id="titulo-equipos" className="font-semibold text-strong">
                Hilos de equipo
              </h2>
              <ul className="flex flex-wrap gap-2">
                {equipos.map(({ equipo, negocio }) => (
                  <li key={`${negocio.id}|${equipo}`}>
                    <Link href={href(base, filtros, { hilo: `equipo:${equipo}`, en: negocio.id }, "hilo")} className={buttonClasses("subtle", "sm")} {...atributosBoton("subtle", "sm")}>
                      {equipo}
                      {props.modo === "operador" ? ` · ${negocio.nombre}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
