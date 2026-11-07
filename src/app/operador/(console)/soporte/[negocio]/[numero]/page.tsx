import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { Marca } from "@/components/ui/Marca";
import { Bloque, Franja } from "@/components/ui/Renglon";
import { linkWhatsapp } from "@/lib/fiscal/contador-arca";
import { CANAL, ESTADO, PRIORIDAD, TIPO } from "@/lib/soporte/config";
import { estadoLeido, prioridadLeida, semaforo, TEXTO_SEMAFORO } from "@/lib/soporte/tickets-core";
import { fichaDeTicket, type EventoDeTicket } from "@/lib/soporte/tickets.server";
import { CambiarEstadoYPrioridad, NotaInterna, Respuesta } from "../../AccionesTicket";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

/** «operator:Ana» → «Ana (Soporte)»; «user:…» → «la persona del negocio». No se muestran ids. */
function quien(actor: string): string {
  if (actor.startsWith("operator:")) return `${actor.slice("operator:".length)} (Soporte)`;
  if (actor.startsWith("user:")) return "la persona del negocio";
  return "el sistema";
}

function campo(x: unknown, k: string): unknown {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>)[k] : undefined;
}

/** Una línea del historial, en criollo. */
function queHizo(e: EventoDeTicket): string {
  const de = campo(e.datos, "de");
  const a = campo(e.datos, "a");
  switch (e.tipo) {
    case "creado":
      return "Abrió el ticket";
    case "estado":
      return `Pasó de «${ESTADO[estadoLeido(de)].nombre}» a «${ESTADO[estadoLeido(a)].nombre}»`;
    case "prioridad":
      return `Cambió la prioridad de ${prioridadLeida(de)} a ${prioridadLeida(a)}`;
    case "nota":
      return "Nota interna";
    case "respuesta":
      return "Guardó la respuesta al cliente";
    case "asignado":
      return "Tomó el ticket";
    case "borrador_ia":
      return "Pidió una sugerencia a la IA (borrador)";
    default:
      return e.tipo;
  }
}

// FICHA DE UN TICKET (Soporte GSG): qué se pidió, cómo viene contra el tiempo objetivo, el historial y
// lo que se puede hacer. La URL lleva el negocio (el ticket se lee parado en él, RLS) y su número.
export default async function FichaDeTicketPage({ params }: { params: Promise<{ negocio: string; numero: string }> }) {
  const sesion = await requireSesionOperador();
  const { negocio, numero } = await params;
  const t = await fichaDeTicket(operatorPrisma, decodeURIComponent(negocio), Number(numero));
  if (!t) notFound();
  const s = semaforo(t, new Date());
  const enlace = t.respuesta ? linkWhatsapp(t.whatsappDelNegocio, t.respuesta) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <Link href="/operador/soporte" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2">
          Volver a los tickets
        </Link>
        <h1 className="text-xl font-semibold text-strong break-words">
          #{t.numero} · {t.asunto}
        </h1>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <Marca tipo={ESTADO[t.estado].marca}>{ESTADO[t.estado].nombre}</Marca>
          <span>
            {t.prioridad} · {PRIORIDAD[t.prioridad].nombre}
          </span>
          {s !== "sin_reloj" && t.venceEl && (
            <Marca tipo={s === "vencido" ? "atencion" : s === "por_vencer" ? "medias" : "info"}>
              {TEXTO_SEMAFORO[s]} · vence {fmt.format(t.venceEl)}
            </Marca>
          )}
        </p>
      </header>

      <Bloque titulo="Qué se pidió">
        <dl className="grid gap-2 py-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted">Negocio</dt>
          <dd>
            <Link href={`/operador/tenants/${encodeURIComponent(t.negocio.id)}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
              {t.negocio.nombre}
            </Link>
          </dd>
          {t.cliente && (
            <>
              <dt className="text-muted">Cliente de su cartera</dt>
              <dd>
                <Link href={`/operador/tenants/${encodeURIComponent(t.cliente.id)}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                  {t.cliente.nombre}
                </Link>
              </dd>
            </>
          )}
          <dt className="text-muted">Tipo</dt>
          <dd>{TIPO[t.tipo].nombre}</dd>
          <dt className="text-muted">Entró</dt>
          <dd>
            {fmt.format(t.createdAt)} · {t.canal ? CANAL[t.canal] : "canal desconocido"} · {quien(t.creadoPor)}
          </dd>
          <dt className="text-muted">Lo tiene</dt>
          <dd>{t.asignadoA ?? "Nadie todavía"}</dd>
          <dt className="text-muted">Detalle</dt>
          <dd className="whitespace-pre-wrap break-words">{t.detalle ?? "Sin detalle."}</dd>
        </dl>
        {t.canal === "pedido_cartera" && (
          <Franja>
            Viene de «Pedir a Soporte GSG». Para que la contadora vea la respuesta en la ficha del cliente, cerrá también el
            pedido en <Link href="/operador/pedidos-cartera" className="underline">Pedidos sobre un cliente</Link>.
          </Franja>
        )}
      </Bloque>

      <Bloque titulo="Qué hacer">
        <div className="py-3">
          <CambiarEstadoYPrioridad
            negocio={t.negocio.id}
            numero={t.numero}
            estado={t.estado}
            prioridad={t.prioridad}
            asignadoA={t.asignadoA}
            operador={sesion.nombre}
          />
        </div>
      </Bloque>

      <Bloque titulo="Respuesta">
        <div className="py-3">
          <Respuesta negocio={t.negocio.id} numero={t.numero} respuesta={t.respuesta} borrador={t.borradorIa} enlaceWhatsapp={enlace} />
        </div>
      </Bloque>

      <Bloque titulo="Historial" cuenta={t.eventos.length}>
        <ol className="py-2">
          {t.eventos.map((e) => (
            <li key={e.id} className="border-b border-line py-2 text-sm">
              <p>
                <span className="text-muted">{fmt.format(e.createdAt)}</span> · {quien(e.actor)}: {queHizo(e)}
              </p>
              {e.texto && <p className="whitespace-pre-wrap break-words pt-1">{e.texto}</p>}
            </li>
          ))}
        </ol>
        <div className="py-3">
          <NotaInterna negocio={t.negocio.id} numero={t.numero} />
        </div>
      </Bloque>
    </div>
  );
}
