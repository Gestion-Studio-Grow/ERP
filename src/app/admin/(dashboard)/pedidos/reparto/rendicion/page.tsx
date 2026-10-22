import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { CobroDelNegocio } from "../../CobroDelPedido";
import { leerDatosDelReparto } from "../datos.server";
import { resumenDeLaRendicion } from "../reparto-core";
import RendicionDelCadete, { type SalidaEnLaCalle } from "./RendicionDelCadete";

// ============================================================================
// RENDICIÓN DEL CADETE — lo que salió, lo que volvió, por medio (Magra, tanda 2 · 2C · MG-056).
// ============================================================================
//
// Los envíos que están en la calle, agrupados por salida, cada uno con el PIE DE COBRO (el mismo de
// Vender y de la bandeja) y las otras tres salidas: ya pagó, lo dejó sin cobrar, volvió. Abajo, lo
// rendido hoy sumado por medio: lo que el cadete tiene que entregar en efectivo. Detrás del
// interruptor «mostrador-boutique»; apagado, vuelve a la bandeja.

export const dynamic = "force-dynamic";
export const metadata = { title: "Rendición del cadete", generator: "Gestión Studio Grow" };

export default async function RendicionPage() {
  const user = await requireApp("pedidos");
  const [identidad, interruptores] = await Promise.all([getTenantIdentity(), interruptoresDelNegocio()]);
  if (!identidad.isRetail || !mostradorBoutiquePrendido(interruptores)) redirect("/admin/pedidos");

  const datos = await leerDatosDelReparto(await getCurrentTenantId());
  const porSalida = new Map<string, SalidaEnLaCalle>();
  for (const e of datos.envios) {
    if (!e.salida) continue;
    const s = porSalida.get(e.salida.reparto) ?? { reparto: e.salida.reparto, desde: e.salida.desde, cadete: e.salida.cadete, franja: e.franja.texto, envios: [] };
    s.envios.push({ id: e.id, code: e.code, cliente: e.cliente, telefono: e.telefono, direccion: e.direccion, zona: e.zona, total: e.total, cobrado: e.cobrado, resumen: e.resumen });
    porSalida.set(e.salida.reparto, s);
  }
  const salidas = [...porSalida.values()].sort((a, b) => a.desde.localeCompare(b.desde));

  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4">
        ← Pedidos
      </Link>
      <header className="mt-1 mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl leading-none text-strong">Rendición del cadete</h1>
        <Link
          href="/admin/pedidos/reparto"
          className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-sm font-semibold text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Armar reparto
        </Link>
      </header>
      <CobroDelNegocio boutique negocio={datos.negocio}>
        <RendicionDelCadete
          salidas={salidas}
          rendidos={datos.rendidosHoy.map((r) => ({ id: r.id, code: r.code, cliente: r.cliente, total: r.total, resultado: r.resultado, pagos: r.pagos, aCuenta: r.aCuenta === true }))}
          resumen={resumenDeLaRendicion(datos.rendidosHoy)}
          puedeOperar={roleHasCapability(user.role, "orders:manage")}
        />
      </CobroDelNegocio>
    </main>
  );
}
