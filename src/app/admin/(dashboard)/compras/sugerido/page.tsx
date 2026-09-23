import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getSugeridoData } from "@/lib/suppliers/sugerido-loader";
import { CICLO_DIAS, DEMORA_DIAS, DIAS_DE_SEGURIDAD, DIAS_DE_VENTA, cantidadParaPedir, type LineaSugerida } from "@/lib/suppliers/sugerido";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { formatearCantidad } from "@/lib/pos-peso";
import { EmptyState, KpiTile, PageHeader, buttonClasses } from "@/components/ui";
import PedidoProveedor, { type LineaDelPedido } from "./PedidoProveedor";

export const dynamic = "force-dynamic";

const unidadDe = (l: LineaSugerida) => (l.kilo ? "kg" : l.unidad.trim() || "u");

function lineaParaMostrar(l: LineaSugerida): LineaDelPedido {
  return {
    productId: l.productId,
    nombre: l.nombre,
    hay: `hay ${formatearCantidad(l.stock)} ${unidadDe(l)}`,
    venta: l.ventaDiaria > 0 ? `se venden ~${formatearCantidad(l.ventaDiaria)} ${unidadDe(l)} por día` : null,
    pedir: cantidadParaPedir(l),
    cantidad: l.sugerido,
  };
}

// SUGERIDO DE COMPRA: qué pedir hoy y a quién. La cuenta es la de suppliers/sugerido.ts, la
// misma del número del Inicio. Sin plata: son cantidades, así que la abre el encargado.
export default async function SugeridoPage() {
  const user = await requireApp("sugerido-de-compra");
  const [tenantId, negocio, rubro] = await Promise.all([getCurrentTenantId(), getNegocioApps(user.role), getCurrentTenantRubro()]);
  const datos = await getSugeridoData(tenantId, new Date());
  const ve = {
    compras: appPermitida(appPorId("recibir-mercaderia"), negocio),
    proveedores: appPermitida(appPorId("proveedores"), negocio),
    catalogo: appPermitida(appPorId("catalogo"), negocio),
  };
  const sustantivo = rubro.rubro?.wording.itemNoun?.trim() || "producto";
  const plural = sustantivo.endsWith("s") ? sustantivo : `${sustantivo}s`;
  const aPedir = datos.pedidos.reduce((s, p) => s + p.lineas.length, 0);
  const conProveedor = datos.pedidos.filter((p) => p.proveedor).length;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Sugerido de compra"
        description={`Lo que conviene pedir hoy según lo que se vendió en los últimos ${DIAS_DE_VENTA} días y lo que hay, agrupado por el proveedor al que se lo compraste la última vez.`}
        actions={
          ve.compras ? (
            <Link href="/admin/compras" className={buttonClasses("outline", "md")}>
              Recibir mercadería
            </Link>
          ) : undefined
        }
      />

      {datos.productos === 0 ? (
        <EmptyState
          title={`Ningún ${sustantivo} controla stock`}
          description={
            ve.catalogo
              ? `El sugerido se arma con los ${plural} que controlan stock. Activá el control de stock en el catálogo y volvé.`
              : `El sugerido se arma con los ${plural} que controlan stock. Pedile a la dueña o al dueño que lo active en el catálogo.`
          }
          action={
            ve.catalogo ? (
              <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
                Ir al catálogo
              </Link>
            ) : undefined
          }
        />
      ) : aPedir === 0 ? (
        <EmptyState
          title="Hoy no hace falta pedir nada"
          description={`Con lo que se vende y lo que hay, ningún ${sustantivo} llega al mínimo antes del próximo pedido.`}
          action={
            ve.compras ? (
              <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
                Recibir mercadería
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label={`${plural[0].toUpperCase()}${plural.slice(1)} para pedir`} value={aPedir} />
            <KpiTile label="Proveedores" value={conProveedor} sub={conProveedor < datos.pedidos.length ? "y algunos sin proveedor habitual" : undefined} />
          </div>
          <p className="text-xs text-muted">
            La cuenta: lo que se vende por día × {DEMORA_DIAS + CICLO_DIAS} días ({DEMORA_DIAS} de entrega y {CICLO_DIAS} hasta el
            próximo pedido, provisorios a confirmar con cada proveedor) más un colchón (el mínimo cargado o {DIAS_DE_SEGURIDAD} días de
            venta, lo que sea mayor), menos lo que hay. Revisá las cantidades en el chat antes de mandar.
          </p>
          {!datos.conProveedores && (
            <p role="status" className="rounded-md border border-warning-soft bg-warning-soft/40 px-3 py-2 text-sm text-body">
              Los proveedores todavía no están habilitados en este negocio: el pedido sale sin agrupar.
            </p>
          )}
          {datos.pedidos.map((p) => {
            const tel = p.proveedor?.telefono ?? null;
            const waHref = p.proveedor ? waLinkClienta(tel, p.texto) : null;
            return (
              <PedidoProveedor
                key={p.proveedor?.id ?? "sin-proveedor"}
                proveedorId={p.proveedor?.id ?? null}
                titulo={p.proveedor?.nombre ?? "Sin proveedor habitual"}
                subtitulo={p.proveedor ? tel : "Nunca se compraron a un proveedor de la lista"}
                lineas={p.lineas.map(lineaParaMostrar)}
                texto={p.texto}
                waHref={waHref}
                sinTelefono={
                  p.proveedor
                    ? {
                        texto: tel
                          ? "El teléfono cargado no sirve para WhatsApp (tiene que tener característica y número)."
                          : "El proveedor no tiene teléfono cargado.",
                        href: ve.proveedores ? `/admin/proveedores/${p.proveedor.id}` : null,
                      }
                    : null
                }
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
