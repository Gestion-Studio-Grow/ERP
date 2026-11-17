// /admin/cuadrilla — la consola de la cuadrilla en el panel del negocio (GSG-MIA-062).
//
// · Supervisión del cliente (la dueña, que no es usuario de agente): el tablero de SU negocio.
// · Usuario de un agente: su propio hilo y sus excepciones; levanta pedidos, no supervisa ni aprueba.
// · Cualquier otro: no ve nada de la cuadrilla.
// El negocio sale de la sesión; todo se lee en una transacción bajo RLS (`tenantTransaction`) que filtra tenantId.
import type { Metadata } from "next";
import { tenantTransaction } from "@/lib/rls";
import { requireApp } from "@/lib/require-app";
import { actorDelPanel } from "@/lib/cuadrilla/actor-del-panel.server";
import { cargarNegocio } from "@/lib/cuadrilla/cargar";
import { hiloDeAgente, leerHilo, mediana } from "@/lib/cuadrilla/consola-core";
import { avisoDeLaUrl, motivoDelError } from "@/lib/cuadrilla/formulario";
import { pedidosAbiertosDelAgente } from "@/lib/cuadrilla/pedidos-core";
import { RESPUESTA_OPORTUNIDAD, VISTAS_PEDIDOS, type VistaPedidos } from "@/lib/cuadrilla/pedidos";
import { clavePuesto, MANUALES } from "@/lib/cuadrilla/manuales";
import { PedidoDelMensaje, TableroCuadrilla, horaAR } from "@/components/cuadrilla/TableroCuadrilla";
import { atributosBoton, buttonClasses } from "@/components/ui/Button";
import { panelAgente, panelAvanzarPedido, panelCerrarPedido, panelDecidir, panelHablar, panelLevantar, panelLote, panelVencer, panelAccesos } from "./actions";

export const metadata: Metadata = { title: "Cuadrilla", generator: "Gestión Studio Grow" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const TIPO: Record<string, string> = { APROBACION: "Pedido de aprobación", FRENADO: "Me frené", RECHAZO: "El sistema me rechazó", ESCALADO: "Escalo a una persona" };
const ESTADO: Record<string, string> = { PENDIENTE: "esperando", APROBADA: "aprobada", RECHAZADA: "rechazada", RESUELTA: "resuelta" };

export default async function CuadrillaPanelPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireApp("cuadrilla");
  const { actor, tenantId } = await actorDelPanel();
  const sp = await searchParams;
  const aviso = avisoDeLaUrl({ ok: uno(sp.ok), error: uno(sp.error), f: uno(sp.f) });

  if (!actor) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold text-strong">Cuadrilla</h1>
        <p className="mt-2 text-sm text-muted">La consola de la cuadrilla es para la dueña del negocio. Si tenés que verla, pedíselo a ella.</p>
      </div>
    );
  }

  if (actor.tipo === "agente") {
    let datos: {
      mensajes: Awaited<ReturnType<typeof leerHilo>>;
      pedidos: Awaited<ReturnType<typeof pedidosAbiertosDelAgente>>;
      mias: { id: string; tipo: string; categoria: string; titulo: string; estado: string; motivo: string | null; decididaPor: string | null }[];
      puesto: string;
    } | null = null;
    let falla: string | null = null;
    try {
      datos = await tenantTransaction(
        async (tx) => ({
          puesto: (await tx.agenteCuadrilla.findFirst({ where: { id: actor.agenteId, tenantId }, select: { puesto: true } }))?.puesto ?? "",
          mensajes: await leerHilo(tx, tenantId, hiloDeAgente(actor.agenteId)),
          pedidos: await pedidosAbiertosDelAgente(tx, tenantId, actor.agenteId),
          mias: await tx.excepcionCuadrilla.findMany({
            where: { tenantId, agenteId: actor.agenteId },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: { id: true, tipo: true, categoria: true, titulo: true, estado: true, motivo: true, decididaPor: true },
          }),
        }),
        { tenantId },
      );
    } catch (e) {
      falla = motivoDelError(e);
    }
    const manual = datos ? MANUALES[clavePuesto(datos.puesto)] : undefined;
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-semibold text-strong">Mi hilo · {actor.nombre}</h1>
          <p className="text-sm text-muted">Sos un usuario de agente: acá leés lo que te dicen y levantás pedidos. Aprobar lo hace una persona.</p>
        </header>
        {aviso.error || falla ? (
          <p id="aviso" role="alert" className="scroll-mt-20 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {aviso.error ?? falla}
          </p>
        ) : aviso.ok ? (
          <p id="aviso" role="status" className="scroll-mt-20 rounded-lg border border-line bg-success-soft px-3 py-2 text-sm text-success">
            {aviso.ok}
          </p>
        ) : null}
        <section aria-labelledby="t-mensajes" className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <h2 id="t-mensajes" className="font-semibold text-strong">
            Mensajes
          </h2>
          <ol className="space-y-2" aria-label="Mensajes de mi hilo">
            {(datos?.mensajes ?? []).map((m) => (
              <li key={m.id} className="rounded-lg border border-line px-3 py-2" data-autor={m.autorTipo}>
                <p className="text-xs text-muted">
                  <span className="font-medium text-strong">{m.autor}</span> · <time dateTime={m.createdAt.toISOString()}>{horaAR(m.createdAt)}</time>
                </p>
                <PedidoDelMensaje m={m} />
                <p className="whitespace-pre-wrap break-words text-sm text-body">{m.texto}</p>
              </li>
            ))}
          </ol>
          <form action={panelHablar} className="space-y-2">
            <input type="hidden" name="hilo" value={hiloDeAgente(actor.agenteId)} />
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              <span className="text-muted">Responder</span>
              <textarea name="texto" required maxLength={2000} rows={3} className="rounded border border-line bg-surface p-3" />
            </label>
            <button type="submit" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
              Mandar
            </button>
          </form>
        </section>
        <section id="pedidos" aria-labelledby="t-pedidos" className="scroll-mt-20 space-y-3">
          <h2 id="t-pedidos" className="font-semibold text-strong">
            Pedidos abiertos ({datos?.pedidos.length ?? 0})
          </h2>
          <p className="text-sm text-muted">
            Hacé sólo lo que dice tu manual. Si te piden otra cosa, cerralo por una de las dos salidas: ajeno al servicio (con la regla de tu manual) o
            posible servicio de GSG (se contesta un texto fijo; no prometas precio ni plazo).
          </p>
          {(datos?.pedidos ?? []).map((p) => (
            <article key={p.id} className="space-y-3 rounded-lg border border-line bg-surface p-4" data-pedido={p.id}>
              <div>
                <p className="whitespace-pre-wrap break-words text-sm text-body">{p.texto}</p>
                <p className="text-xs text-muted">
                  Pidió {p.pedidoPor} · {horaAR(p.createdAt)} · tope {p.topeMinutos} min · turnos {p.turnosUsados}/{p.topeTurnos}
                </p>
              </div>
              <form action={panelAvanzarPedido} className="grid gap-2">
                <input type="hidden" name="pedidoId" value={p.id} />
                <input type="hidden" name="ancla" value="pedidos" />
                <label className="grid min-w-0 max-w-full gap-1 text-sm">
                  <span className="text-muted">Qué avanzaste (usa un turno)</span>
                  <input name="texto" required maxLength={2000} className="min-h-11 rounded border border-line bg-surface px-3" />
                </label>
                <button type="submit" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                  Avancé
                </button>
              </form>
              <form action={panelCerrarPedido} className="grid gap-2">
                <input type="hidden" name="pedidoId" value={p.id} />
                <input type="hidden" name="salida" value="HECHO" />
                <input type="hidden" name="ancla" value="pedidos" />
                <label className="grid min-w-0 max-w-full gap-1 text-sm">
                  <span className="text-muted">Qué hiciste</span>
                  <input name="respuesta" required maxLength={2000} className="min-h-11 rounded border border-line bg-surface px-3" />
                </label>
                <button type="submit" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
                  Terminado
                </button>
              </form>
              <form action={panelCerrarPedido} className="grid gap-2 border-t border-line pt-3">
                <input type="hidden" name="pedidoId" value={p.id} />
                <input type="hidden" name="salida" value="AJENO" />
                <input type="hidden" name="ancla" value="pedidos" />
                <label className="grid min-w-0 max-w-full gap-1 text-sm">
                  <span className="text-muted">{manual ? `Regla de tu manual: «${manual.nombre} §n», de §1 a §${manual.ultimo}` : "Tu puesto no tiene manual cargado: traspasalo a GSG"}</span>
                  <input name="regla" required maxLength={120} className="min-h-11 rounded border border-line bg-surface px-3" />
                </label>
                <label className="grid min-w-0 max-w-full gap-1 text-sm">
                  <span className="text-muted">Lo que sí podés hacer</span>
                  <input name="queSi" required minLength={10} maxLength={600} className="min-h-11 rounded border border-line bg-surface px-3" />
                </label>
                <button type="submit" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                  Fuera de mi puesto: negar con amabilidad
                </button>
              </form>
              <form action={panelCerrarPedido} className="grid gap-2 border-t border-line pt-3">
                <input type="hidden" name="pedidoId" value={p.id} />
                <input type="hidden" name="salida" value="OPORTUNIDAD" />
                <input type="hidden" name="ancla" value="pedidos" />
                <p className="text-sm text-muted">Se contesta, tal cual: «{RESPUESTA_OPORTUNIDAD}»</p>
                <button type="submit" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                  Puede ser un servicio de GSG: traspasar
                </button>
              </form>
            </article>
          ))}
        </section>
        <section aria-labelledby="t-levantar" className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <h2 id="t-levantar" className="font-semibold text-strong">
            Levantar una excepción
          </h2>
          <form action={panelLevantar} className="grid gap-2">
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              <span className="text-muted">Qué pasa</span>
              <select name="tipo" className="min-h-11 w-full min-w-0 max-w-full rounded border border-line bg-surface px-2">
                {Object.entries(TIPO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              <span className="text-muted">Toca plata o un envío a terceros</span>
              <select name="categoria" className="min-h-11 w-full min-w-0 max-w-full rounded border border-line bg-surface px-2">
                <option value="OTRA">No</option>
                <option value="PLATA">Plata</option>
                <option value="ENVIO_TERCEROS">Envío a terceros</option>
              </select>
            </label>
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              <span className="text-muted">Título</span>
              <input name="titulo" required maxLength={160} className="min-h-11 rounded border border-line bg-surface px-3" />
            </label>
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              <span className="text-muted">Contenido completo (lo que se va a hacer)</span>
              <textarea name="contenido" required maxLength={4000} rows={4} className="rounded border border-line bg-surface p-3" />
            </label>
            <button type="submit" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
              Levantar
            </button>
          </form>
        </section>
        <section aria-labelledby="t-mias" className="space-y-2">
          <h2 id="t-mias" className="font-semibold text-strong">
            Mis excepciones
          </h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {(datos?.mias ?? []).map((e) => (
              <li key={e.id} className="px-3 py-2 text-sm">
                <span className="font-medium text-strong">{e.titulo}</span> · {TIPO[e.tipo] ?? e.tipo} · {ESTADO[e.estado] ?? e.estado}
                {e.decididaPor ? ` por ${e.decididaPor}` : ""}
                {e.motivo ? ` · «${e.motivo}»` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const filtros = {
    agente: uno(sp.agente),
    estado: uno(sp.estado),
    tipo: uno(sp.tipo),
    hilo: uno(sp.hilo),
    pedidos: VISTAS_PEDIDOS.find((v) => v === uno(sp.pedidos) && v !== "todos") as VistaPedidos | undefined,
  };
  const ex = uno(sp.ex);
  let carga = null;
  let falla: string | undefined;
  try {
    carga = await tenantTransaction(
      (tx) => cargarNegocio(tx, tenantId, { agenteId: filtros.agente, estado: filtros.estado, tipo: filtros.tipo, pedidos: filtros.pedidos }, { ex, hilo: filtros.hilo, abrirPrimera: !ex && !filtros.hilo }),
      { tenantId },
    );
  } catch (e) {
    falla = motivoDelError(e);
  }
  return (
    <TableroCuadrilla
      modo="supervisor"
      base="/admin/cuadrilla"
      negocios={[{ id: tenantId, nombre: "Tu negocio", tablero: carga?.tablero ?? null, falla, pedidos: carga?.pedidos, accesos: carga?.accesos, personas: carga?.personas }]}
      filtros={filtros}
      seleccion={carga?.seleccion ? { excepcion: carga.seleccion, negocio: "Tu negocio" } : null}
      hilo={carga?.hilo ? { ...carga.hilo, tenantId } : null}
      respuestaMedianaSeg={mediana(carga?.tiempos ?? [])}
      aviso={aviso}
      acciones={{ decidir: panelDecidir, lote: panelLote, agente: panelAgente, hablar: panelHablar, vencer: panelVencer, accesos: panelAccesos }}
    />
  );
}
