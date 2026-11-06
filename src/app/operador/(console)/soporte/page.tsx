import Link from "next/link";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { Button, Select } from "@/components/ui";
import { Marca } from "@/components/ui/Marca";
import { Bloque, Franja, Renglon } from "@/components/ui/Renglon";
import { ESTADO, ESTADOS, PRIORIDAD, PRIORIDADES, TIPO, TIPOS_TICKET } from "@/lib/soporte/config";
import { filtrosDesdeQuery, semaforo, TEXTO_SEMAFORO } from "@/lib/soporte/tickets-core";
import { listarTickets } from "@/lib/soporte/tickets.server";
import { TraerPedidos } from "./AccionesTicket";

export const dynamic = "force-dynamic";

const PESTANA = "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline-offset-4 hover:underline aria-[current=page]:bg-surface-2";

// CONSOLA DE SOPORTE GSG (T1): los tickets de todos los negocios, P1 y lo que vence antes arriba.
// Filtros en la URL (`?estado=&prioridad=&tipo=`): un formulario GET, sin JS. Sin estado elegido se
// ven los abiertos. Sólo con sesión de operador (la de Soporte GSG).
export default async function SoportePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSesionOperador();
  const filtros = filtrosDesdeQuery(await searchParams);
  const r = await listarTickets(operatorPrisma, filtros);
  const ahora = new Date();
  const fmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-strong">Tickets de soporte</h1>
        <p className="text-sm text-muted">
          Cada pedido a Soporte GSG con su número, prioridad y estado. Primero los urgentes y los que vencen antes.
        </p>
        <nav aria-label="Pedidos de los estudios" className="flex flex-wrap gap-2 pt-1">
          <Link href="/operador/solicitudes" className={PESTANA}>
            Altas de clientes nuevos
          </Link>
          <Link href="/operador/pedidos-cartera" className={PESTANA}>
            Pedidos sobre un cliente
          </Link>
          <Link href="/operador/soporte" aria-current="page" className={PESTANA}>
            Tickets de soporte
          </Link>
        </nav>
      </header>

      {"sinTabla" in r ? (
        <Franja tono="atencion">
          Todavía no está la tabla de tickets: falta aplicar la migración 20261106120000_support_ticket. Mientras tanto, los
          pedidos siguen en «Pedidos sobre un cliente».
        </Franja>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtrar tickets">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-strong">Estado</span>
              <Select name="estado" defaultValue={filtros.estado ?? "abiertos"} className="min-h-11">
                <option value="abiertos">Abiertos</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO[e].nombre}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-strong">Prioridad</span>
              <Select name="prioridad" defaultValue={filtros.prioridad ?? ""} className="min-h-11">
                <option value="">Todas</option>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p} · {PRIORIDAD[p].nombre}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-strong">Tipo</span>
              <Select name="tipo" defaultValue={filtros.tipo ?? ""} className="min-h-11">
                <option value="">Todos</option>
                {TIPOS_TICKET.map((t) => (
                  <option key={t} value={t}>
                    {TIPO[t].nombre}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" size="md" variant="outline" className="min-h-11">
              Filtrar
            </Button>
          </form>

          {r.tickets.length === 0 ? (
            <Franja>No hay tickets con esos filtros. Cuando una contadora pida algo a Soporte GSG, aparece acá.</Franja>
          ) : (
            <Bloque titulo="Tickets" cuenta={r.tickets.length}>
              <ul>
                {r.tickets.map((t) => {
                  const s = semaforo(t, ahora);
                  return (
                    <li key={t.id} className="border-b border-line py-1">
                      <Link
                        href={`/operador/soporte/${encodeURIComponent(t.negocio.id)}/${t.numero}`}
                        className="block min-h-11 rounded focus-visible:outline focus-visible:outline-2"
                      >
                        <Renglon
                          folio={`#${t.numero}`}
                          titulo={<span className="break-words">{t.asunto}</span>}
                          detalle={
                            <span className="break-words">
                              {t.negocio.nombre} · {TIPO[t.tipo].nombre} · {t.prioridad} ({PRIORIDAD[t.prioridad].nombre})
                              {t.asignadoA ? ` · lo tiene ${t.asignadoA}` : " · sin asignar"}
                            </span>
                          }
                          plata={
                            <span className="grid justify-items-end gap-1 text-[13px]">
                              <Marca tipo={ESTADO[t.estado].marca}>{ESTADO[t.estado].nombre}</Marca>
                              {s !== "sin_reloj" && (
                                <Marca tipo={s === "vencido" ? "atencion" : s === "por_vencer" ? "medias" : "info"}>
                                  {TEXTO_SEMAFORO[s]}
                                  {t.venceEl ? ` · ${fmt.format(t.venceEl)}` : ""}
                                </Marca>
                              )}
                            </span>
                          }
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Bloque>
          )}
          <TraerPedidos />
        </>
      )}
    </div>
  );
}
