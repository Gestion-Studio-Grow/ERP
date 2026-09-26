import Link from "next/link";
import { formatearCuit } from "@/lib/fiscal/cuit";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { Bloque, Franja, Renglon } from "@/components/ui/Renglon";
import { NOMBRE_CONDICION_IVA, NOMBRE_TAMANIO } from "@/lib/cartera-alta-reglas";
import { listarSolicitudesPendientes } from "./configurador.server";

export const dynamic = "force-dynamic";

// BANDEJA DE PEDIDOS DE ALTA (Soporte GSG): lo que los estudios pidieron desde «Agregar un cliente».
// Del más viejo al más nuevo. Cada pedido abre el configurador. Sólo la consola ve si el CUIT ya existe.
// De a PEDIDOS_POR_PAGINA, con el total arriba: `?desde=` es el último pedido de la página anterior.
const LINK_PAGINA =
  "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline underline-offset-4 hover:bg-surface-2";

export default async function SolicitudesPage({ searchParams }: { searchParams: Promise<{ desde?: string | string[] }> }) {
  await requireSesionOperador();
  const { desde: crudo } = await searchParams;
  const desde = typeof crudo === "string" && crudo.length > 0 && crudo.length <= 64 ? crudo : null;
  const { pedidos, total, siguiente } = await listarSolicitudesPendientes(operatorPrisma, { desde });
  const fmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-strong">Pedidos de alta de los estudios</h1>
        <p className="text-sm text-muted">
          Cada estudio pide acá los clientes nuevos de su cartera. Abrí un pedido para configurarlo; al terminar, avisale a
          la contadora por WhatsApp.
        </p>
        <nav aria-label="Pedidos de los estudios" className="flex flex-wrap gap-2 pt-1">
          <Link href="/operador/solicitudes" aria-current="page" className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline-offset-4 hover:underline aria-[current=page]:bg-surface-2">
            Altas de clientes nuevos
          </Link>
          <Link href="/operador/pedidos-cartera" className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline-offset-4 hover:underline aria-[current=page]:bg-surface-2">
            Pedidos sobre un cliente
          </Link>
        </nav>
      </header>
      {total === 0 ? (
        <Franja>No hay pedidos pendientes.</Franja>
      ) : pedidos.length === 0 ? (
        <Franja>
          No hay más pedidos pendientes después de ése.{" "}
          <Link href="/operador/solicitudes" className={LINK_PAGINA}>
            Volver a los más viejos
          </Link>
        </Franja>
      ) : (
        <Bloque titulo="Pendientes" cuenta={total}>
          <ul>
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/operador/solicitudes/${encodeURIComponent(p.id)}`}
                  className="block min-h-11 rounded hover:bg-surface-2 focus-visible:outline focus-visible:outline-2"
                >
                  <Renglon
                    titulo={<span className="break-words">{p.datos.nombre}</span>}
                    detalle={
                      <span className="break-words">
                        {p.estudio.nombre} · CUIT {formatearCuit(p.datos.cuit) ?? p.datos.cuit}
                        {p.datos.condicionIva ? ` · ${NOMBRE_CONDICION_IVA[p.datos.condicionIva]}` : ""}
                        {p.datos.tamanio ? ` · ${NOMBRE_TAMANIO[p.datos.tamanio]}` : ""}
                        {p.yaExisten.length > 0 ? " · ese CUIT ya tiene negocio" : ""}
                        {p.parecidos.length > 0 ? " · puede haber un negocio igual sin CUIT" : ""}
                      </span>
                    }
                    plata={<span className="text-[13px] text-muted">{fmt.format(p.creado)}</span>}
                  />
                </Link>
              </li>
            ))}
          </ul>
          {(siguiente || desde) && (
            <nav aria-label="Más pedidos" className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-sm text-muted">
                {pedidos.length} de {total} pendientes, del más viejo al más nuevo.
              </span>
              {siguiente && (
                <Link href={`/operador/solicitudes?desde=${encodeURIComponent(siguiente)}`} className={LINK_PAGINA}>
                  Ver los siguientes
                </Link>
              )}
              {desde && (
                <Link href="/operador/solicitudes" className={LINK_PAGINA}>
                  Volver a los más viejos
                </Link>
              )}
            </nav>
          )}
        </Bloque>
      )}
    </div>
  );
}
