import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { prisma } from "@/lib/prisma";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { sellPrice } from "@/lib/order-core";
import ProtocoloSinSenal from "../ProtocoloSinSenal";
import { VENTANA_DEL_CUADERNO, primerDiaDelCuaderno } from "@/lib/cuaderno/hora-de-la-venta";
import type { ProductoDelCuaderno } from "./cuaderno-core";
import CargarCuaderno from "./CargarCuaderno";
import AccesoDelCelular from "./AccesoDelCelular";
import { cargarVentasDelCuaderno } from "./acciones";
import { tarjetaHabilitada } from "@/lib/caja-actions";

// ============================================================================
// CARGAR VENTAS DEL CUADERNO — /admin/vender/cuaderno (Magra, tanda 2 · 2E; E19/E20, MG-060).
// ============================================================================
//
// Detrás del interruptor «mostrador-boutique»: apagado, esta ruta vuelve a Vender y nada cambia (el
// servidor además rechaza el campo de la hora en `createOrder`). Lee UNA vez lo justo (Neon, plan
// gratuito): el catálogo vendible (id, nombre, unidad y precio), y hasta qué día está cerrada la caja
// para decirlo ANTES de tipear. Todo por el `tenantId` de la sesión.

export const dynamic = "force-dynamic";
export const metadata = { title: "Cargar ventas del cuaderno", generator: "Gestión Studio Grow" };

export default async function CuadernoPage() {
  const user = await requireApp("vender");
  const [interruptores, identidad] = await Promise.all([interruptoresDelNegocio(), getTenantIdentity()]);
  if (!identidad.isRetail || !mostradorBoutiquePrendido(interruptores)) redirect("/admin/vender");
  if (!roleHasCapability(user.role, "orders:manage") || VENTANA_DEL_CUADERNO[user.role] === null) redirect("/admin/vender");

  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  // Tarjeta (N2 · M1-C1): la tecla y el protocolo, sólo con `tarjetaHabilitada()`; `createOrder` lo vuelve a exigir.
  const [filas, cerradoHasta, conTarjeta] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true, OR: [{ price: { not: null } }, { pricePerKg: { not: null } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
    }),
    lastClosedDay(tenantId),
    tarjetaHabilitada(),
  ]);
  const productos: ProductoDelCuaderno[] = filas.map((p) => ({
    id: p.id,
    nombre: p.name,
    porPeso: p.saleUnit === "WEIGHT",
    precio: sellPrice(p),
  }));

  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-strong">Cargar ventas del cuaderno</h1>
        <Link
          href="/admin/vender"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Volver a Vender
        </Link>
      </div>
      <p className="text-sm text-body">
        Las ventas que anotaste mientras no había señal, con la hora en que las vendiste: entran en la caja y en el total de ese día, y el stock
        baja igual que en Vender. Si tocás «Cargar» dos veces, no se duplican.
      </p>
      <CargarCuaderno
        productos={productos}
        hoy={hoy}
        primerDia={primerDiaDelCuaderno(user.role, hoy) ?? hoy}
        cerradoHasta={cerradoHasta}
        negocioId={tenantId}
        usuarioId={user.id}
        cargar={cargarVentasDelCuaderno}
        conTarjeta={conTarjeta}
      />
      <ProtocoloSinSenal negocioId={tenantId} siempre conTarjeta={conTarjeta} />
      <AccesoDelCelular />
    </main>
  );
}
