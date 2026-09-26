import { formatearCuit } from "@/lib/fiscal/cuit";
import Link from "next/link";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { Bloque, Franja, Renglon } from "@/components/ui/Renglon";
import { TEXTO_PEDIDO } from "@/app/contador/pedido-soporte";
import { listarPedidosDeCartera } from "./pedidos-cartera.server";
import { ResolverPedido } from "./ResolverPedido";

export const dynamic = "force-dynamic";

// BANDEJA DE PEDIDOS DE LA CARTERA (Soporte GSG): lo que las contadoras pidieron desde la ficha de un
// cliente (corregir el CUIT, la dirección propia, un plan). Del más viejo al más nuevo. Se resuelve
// en la ficha del negocio en la consola y se cierra acá, con una respuesta que la contadora lee.
export default async function PedidosCarteraPage() {
  await requireSesionOperador();
  const pedidos = await listarPedidosDeCartera(operatorPrisma);
  const fmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-strong">Pedidos de las contadoras</h1>
        <p className="text-sm text-muted">
          Lo que un estudio no puede cambiar solo en un cliente de su cartera. Resolvelo en la ficha del negocio y después
          cerrá el pedido: mientras esté abierto, la contadora lo ve marcado y no puede repetirlo.
        </p>
        <nav aria-label="Pedidos de los estudios" className="flex flex-wrap gap-2 pt-1">
          <Link href="/operador/solicitudes" className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline-offset-4 hover:underline aria-[current=page]:bg-surface-2">
            Altas de clientes nuevos
          </Link>
          <Link href="/operador/pedidos-cartera" aria-current="page" className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-strong underline-offset-4 hover:underline aria-[current=page]:bg-surface-2">
            Pedidos sobre un cliente
          </Link>
        </nav>
      </header>
      {pedidos.length === 0 ? (
        <Franja>No hay pedidos pendientes. Cuando una contadora pida algo desde la ficha de un cliente, aparece acá.</Franja>
      ) : (
        <Bloque titulo="Pendientes" cuenta={pedidos.length}>
          <ul>
            {pedidos.map((p) => (
              <li key={p.id} className="border-b border-line py-2">
                <Renglon
                  titulo={<span className="break-words">{TEXTO_PEDIDO[p.tipo].pedido}: {p.cliente.alias}</span>}
                  detalle={
                    <span className="break-words">
                      {p.estudio.nombre}
                      {p.pedidoPor ? ` · pidió ${p.pedidoPor.nombre} (${p.pedidoPor.email})` : ""}
                      {p.tipo === "corregir_cuit" ? ` · CUIT hoy: ${p.cliente.cuitActual ? (formatearCuit(p.cliente.cuitActual) ?? p.cliente.cuitActual) : "sin cargar"} · CUIT correcto: ${p.cuit ? (formatearCuit(p.cuit) ?? p.cuit) : "—"}` : ""}
                      {p.tipo === "direccion_propia" ? ` · dirección hoy: ${p.cliente.subdominio ?? "ninguna"}` : ""}
                      {p.tipo === "asignar_plan" ? ` · plan hoy: ${p.cliente.plan ?? "ninguno"}` : ""}
                      {p.nota ? ` · «${p.nota}»` : ""}
                    </span>
                  }
                  plata={<span className="text-[13px] text-muted">{fmt.format(new Date(p.pedidoEl))}</span>}
                />
                <div className="flex flex-wrap items-start gap-2 px-4">
                  <Link
                    href={`/operador/tenants/${encodeURIComponent(p.cliente.id)}`}
                    className="inline-flex min-h-11 items-center rounded px-2 underline focus-visible:outline focus-visible:outline-2"
                  >
                    Abrir el negocio
                  </Link>
                  <ResolverPedido pedidoId={p.id} estudioTenantId={p.estudio.id} />
                </div>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
}
