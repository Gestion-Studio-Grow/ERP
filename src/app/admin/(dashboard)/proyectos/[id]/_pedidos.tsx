// TALLER DE STANDS (GSG-MIA-004 · T4) — sección «Pedidos de materiales» de la pestaña Despiece: pedir materiales a un
// proveedor para el stand, recibirlos (deja UN gasto «Materiales» impago en Costos) o anularlos. Sólo se monta con el
// taller activo, igual que el despiece. Server component: los formularios llaman server actions.
import { randomUUID } from "node:crypto";
import { Button, EmptyState } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { ETIQUETA_ESTADO, type EstadoPedido } from "@/lib/taller-stands/pedidos";
import { pedidosDelProyecto } from "@/lib/taller-stands/datos.server";
import { anularPedido, crearPedido, recibirPedido } from "@/lib/taller-stands/acciones";
import { campo, etiqueta, tarjeta } from "../_vista";

const fechaCorta = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

export async function SeccionPedidos({ tenantId, proyectoId, edita, paga }: { tenantId: string; proyectoId: string; edita: boolean; paga: boolean }) {
  const { sinMigrar, pedidos } = await pedidosDelProyecto(tenantId, proyectoId);
  if (sinMigrar) {
    return <EmptyState title="Los pedidos de materiales todavía no están habilitados" description="Falta un paso de instalación del taller. Ya está anotado; cuando esté, vas a poder pedir materiales a tus proveedores desde acá." />;
  }
  const anula = edita || paga;

  return (
    <section className={`${tarjeta} mt-4`} aria-labelledby="titulo-pedidos">
      <h2 id="titulo-pedidos" className="text-lg font-semibold text-strong">Pedidos de materiales</h2>
      <p className="text-sm text-muted">
        Cuando llega el material, marcalo como recibido: queda cargado como gasto de «Materiales» del stand, impago, y se paga desde Costos.
      </p>

      {pedidos.length === 0 ? (
        <p className="mt-4 text-sm">Todavía no pediste materiales para este stand.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-2">Pedido</th>
              <th scope="col" className="py-2">Proveedor</th>
              <th scope="col" className="py-2">Materiales</th>
              <th scope="col" className="py-2 text-right">Neto</th>
              <th scope="col" className="py-2 text-right">IVA</th>
              <th scope="col" className="py-2">Estado</th>
              {anula && <th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="py-2">{fechaCorta(p.pedidoEl)}</td>
                <td className="py-2">{p.proveedorNombre}</td>
                <td className="py-2">{p.descripcion}</td>
                <td className="py-2 text-right">{pesos(p.total)}</td>
                <td className="py-2 text-right">{p.iva > 0 ? pesos(p.iva) : "—"}</td>
                <td className="py-2">
                  {ETIQUETA_ESTADO[p.estado as EstadoPedido] ?? p.estado}
                  {p.recibidoEl && <span className="block text-xs text-muted">el {fechaCorta(p.recibidoEl)}</span>}
                </td>
                {anula && (
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      {paga && p.estado === "PEDIDO" && (
                        <form action={recibirPedido}>
                          <input type="hidden" name="proyectoId" value={proyectoId} />
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" variant="outline" size="sm" aria-label={`Marcar recibido el pedido a ${p.proveedorNombre}`}>Recibido</Button>
                        </form>
                      )}
                      {p.estado !== "ANULADO" && (
                        <form action={anularPedido}>
                          <input type="hidden" name="proyectoId" value={proyectoId} />
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" variant="ghost" size="sm" aria-label={`Anular el pedido a ${p.proveedorNombre}`}>Anular</Button>
                        </form>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pedidos.some((p) => p.estado === "PEDIDO") && !paga && (
        <p className="mt-2 text-xs text-muted">Marcar un pedido como recibido carga el gasto: lo hace quien maneja los pagos del evento.</p>
      )}

      {edita && (
        <form action={crearPedido} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_8rem_7rem_auto] sm:items-end">
          <input type="hidden" name="proyectoId" value={proyectoId} />
          <input type="hidden" name="envioId" value={randomUUID()} />
          <label className={etiqueta}>Proveedor<input name="proveedor" required maxLength={120} className={campo} placeholder="Maderera Sur" /></label>
          <label className={etiqueta}>Materiales<input name="descripcion" required maxLength={200} className={campo} placeholder="20 placas MDF 18 mm" /></label>
          <label className={etiqueta}>Total neto<input name="total" inputMode="decimal" required className={campo} placeholder="250000" /></label>
          <label className={etiqueta}>IVA<input name="iva" inputMode="decimal" className={campo} placeholder="Opcional" /></label>
          <Button type="submit" variant="outline">Cargar pedido</Button>
        </form>
      )}
    </section>
  );
}
