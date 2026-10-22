import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { getProfessionalsWithServices } from "@/lib/actions";
import { PageContainer, PageHeader, buttonClasses } from "@/components/ui";
import MostradorTabs from "../pedidos/MostradorTabs";
import MostradorDeVenta from "./MostradorDeVenta";
import { Suspense } from "react";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { cargarKpi } from "@/apps/kpis/index.server";
import { LineaDeEstado } from "@/components/ui";
import type { Role } from "@/lib/capabilities";
import { reglaALaVista } from "@/lib/caja/reglas-a-la-vista";
import { getAperturaEnVender } from "@/lib/caja-actions";
import { mostradorBoutiqueDelNegocio, pedidoDeVentaDesdeLaFicha } from "@/lib/clientes/fiado.server";
import { leerPedidoDeVenta } from "@/lib/clientes/fiado";
import { VENTANA_DEL_CUADERNO } from "@/lib/cuaderno/hora-de-la-venta";
import AbrirCajaEnLinea from "./AbrirCajaEnLinea";
import ProtocoloSinSenal, { RUTA_DEL_CUADERNO } from "./ProtocoloSinSenal";


/**
 * Diseño nuevo: arriba del ticket, cómo está la caja y cuánto se vendió hoy (los mismos números del
 * Inicio, cacheados). Con la caja cerrada, dice lo que de verdad pasa: se puede cobrar en efectivo, y
 * esa plata se anota en el libro del día sin turno, fuera del arqueo de un cajero
 * (caja/cash-sale.ts). El cartel no prohíbe lo que el sistema deja hacer.
 */
async function EstadoDelMostrador({ role, mostrador }: { role: Role; mostrador: boolean }) {
  const [caja, vender] = await Promise.all([cargarKpi("caja-del-dia", role), cargarKpi("vender", role)]);
  const datos: React.ReactNode[] = [];
  if (caja?.estado === "ok") {
    datos.push(
      caja.valor === "Cerrada" ? (
        <span key="caja">
          <strong>Caja cerrada</strong>: lo que cobres en efectivo se anota en el libro del día, sin turno ·{" "}
          <Link href="/admin/caja" className="font-semibold text-accent-ink underline">
            Abrir la caja
          </Link>
        </span>
      ) : (
        <strong key="caja">{`Caja ${caja.valor.toLowerCase()}${caja.detalle ? ` ${caja.detalle}` : ""}`}</strong>
      ),
    );
  }
  if (vender?.estado === "ok") datos.push(`${vender.valor} ${vender.detalle ?? ""}`.trim());
  // La regla del día cerrado, sólo en un mostrador (reglas-a-la-vista.ts).
  datos.push(reglaALaVista("vender", mostrador));
  return <LineaDeEstado datos={datos} className="mb-4" />;
}

export const dynamic = "force-dynamic";

// VENDER — el mostrador en su propia pantalla (antes era la solapa de arriba de Pedidos).
//
// En CH la solapa de /admin/pedidos queda igual hasta que el dueño apruebe el modelo nuevo:
// esta pantalla existe para todos, pero sólo se ofrece desde el Inicio por apps. La guardia es
// `requireApp("vender")` (rol, módulo pos, rubro): esconder la app no la protegería.
export const metadata = { title: "Vender", generator: "Gestión Studio Grow" };

type ParametrosDeVender = { modo?: string | string[]; cliente?: string | string[]; repetir?: string | string[] };

export default async function VenderPage({ searchParams }: { searchParams: Promise<ParametrosDeVender> }) {
  const user = await requireApp("vender");
  const { modo, cliente, repetir } = await searchParams;
  const tenantId = await getCurrentTenantId();
  const [identidad, nuevo, boutique] = await Promise.all([getTenantIdentity(), disenoNuevo(), mostradorBoutiqueDelNegocio()]);
  // MOSTRADOR BOUTIQUE (Magra, tanda 2 · 2D): con la caja cerrada, la tarjeta «Abrí la caja: ayer
  // quedaron $X» arriba de todo, para abrirla sin salir de Vender (MG-057). Apagado, nada cambia.
  const apertura = boutique && roleHasCapability(user.role, "orders:manage") ? await getAperturaEnVender() : null;
  const tarjetaCaja = apertura ? <AbrirCajaEnLinea esperado={apertura.esperado} ultimoCierre={apertura.ultimoCierre} hoy={apertura.hoy} /> : null;
  // «Venderle» / «Repetir» desde la ficha (2D): `?cliente=&repetir=`. Sólo el boutique y quien
  // toma pedidos (la acción lo vuelve a exigir y acota la ficha y el pedido al negocio). Sin la
  // dirección, o con una ficha de otro negocio, Vender arranca vacío como siempre.
  const desdeLaFicha =
    boutique && roleHasCapability(user.role, "orders:manage") && leerPedidoDeVenta({ cliente, repetir }).clienteId
      ? await pedidoDeVentaDesdeLaFicha({ cliente, repetir })
      : null;
  // RESPALDO SIN SEÑAL (2E): la tarjeta del protocolo (aparece sola si se corta) y el enlace fijo a
  // «Cargar ventas del cuaderno», arriba del mostrador. Sólo el boutique; el enlace, sólo a quien
  // la pantalla del cuaderno deja entrar (la misma regla que su page.tsx).
  const respaldo = boutique ? (
    <div data-vender="respaldo-sin-senal" className="mb-4 space-y-2">
      <ProtocoloSinSenal negocioId={tenantId} />
      {roleHasCapability(user.role, "orders:manage") && VENTANA_DEL_CUADERNO[user.role] !== null && (
        <p className="text-sm">
          <Link
            href={RUTA_DEL_CUADERNO}
            className="inline-flex min-h-11 items-center font-medium text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Cargar ventas del cuaderno
          </Link>
        </p>
      )}
    </div>
  ) : null;
  // Los servicios se cobran creando un turno (ver MostradorTabs): sólo en un negocio de
  // servicios y sólo para quien puede dar turnos. En un comercio no hay solapa de Servicios.
  const conServicios = !identidad.isRetail;
  const professionals =
    conServicios && roleHasCapability(user.role, "agenda:manage") ? await getProfessionalsWithServices() : [];
  // El formulario es el MISMO que el mostrador de Pedidos de un comercio (MostradorDeVenta).
  const formProductos = (conVendedor: boolean) => (
    <MostradorDeVenta
      user={user}
      tenantId={tenantId}
      pedidoInicial={modo === "pedido"}
      conVendedor={conVendedor}
      desdeLaFicha={desdeLaFicha}
    />
  );

  // DISEÑO NUEVO («Renglón»): el ticket que crece. Sin encabezado ni párrafo (el nombre de la app ya
  // está en la cabecera y en la barra del celular; «Pedidos» y «Ventas del día» son las pestañas del
  // espacio); arriba sólo la línea de la caja, que es lo que cambia cómo se cobra en efectivo.
  if (nuevo) {
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <h1 className="sr-only">Vender</h1>
        {tarjetaCaja}
        <Suspense fallback={<p data-ui="linea-estado" aria-hidden>&nbsp;</p>}>
          <EstadoDelMostrador role={user.role} mostrador={identidad.isRetail} />
        </Suspense>
        {respaldo}
        <MostradorTabs
          viewer={{ role: user.role, professionalId: user.professionalId }}
          products={[]}
          stockById={{}}
          professionals={professionals}
          conServicios={conServicios}
          formProductos={formProductos(true)}
        />
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Vender"
        description="Buscá el producto o tocá uno de los más vendidos, cargá el peso o la cantidad, elegí cómo pagó y cobrá."
        actions={
          <>
            <Link href="/admin/pedidos" className={buttonClasses("outline", "md")}>
              Pedidos para preparar
            </Link>
            <Link href="/admin/ventas" className={buttonClasses("outline", "md")}>
              Ventas del día
            </Link>
          </>
        }
      />
      {tarjetaCaja}
      {respaldo}
      <MostradorTabs
        viewer={{ role: user.role, professionalId: user.professionalId }}
        // El formulario de productos es el de Vender (abajo): el de la bandeja no se usa, así
        // que no se le mandan los productos dos veces al navegador.
        products={[]}
        stockById={{}}
        professionals={professionals}
        conServicios={conServicios}
        formProductos={formProductos(false)}
      />
    </PageContainer>
  );
}
