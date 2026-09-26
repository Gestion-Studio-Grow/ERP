// Facturación y Cobros — módulos ARCA (facturación electrónica) + Mercado Pago
// (links de pago). Gated por `billing:manage` (ARCA) y `payments:manage` (cobros).
// Ambos módulos corren en modo sandbox por defecto: la pantalla funciona sin
// credenciales; el dueño las carga en el entorno para pasar a real (ver
// docs/arquitectura/propuesta-activacion-arca-mp.md).

import Link from "next/link";
import { getPanelDeFacturacion } from "@/lib/facturacion-actions";
import { vistaDeFacturacion } from "@/lib/facturacion/lista-core";
import { todayInBusinessTz } from "@/lib/datetime";
import { estadoCobros, getLinksDeCobro } from "@/lib/cobros-actions";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import { PageContainer, PageHeader } from "@/components/ui";
import CobrosSection from "./CobrosSection";
import { requireApp } from "@/lib/require-app";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { LineaDeEstado, Marca, Pestanas } from "@/components/ui";
import ComprobantesArca from "./ComprobantesArca";
import CobrarConLink from "./CobrarConLink";
import LinksDeCobro from "./LinksDeCobro";
import { FranjaDeArca, datosDeArca } from "./EstadoArca";

export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<Sp> }) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  await requireApp("facturacion");
  const sp = await searchParams;
  // Cada pestaña lee sólo lo suyo: la lista de comprobantes o la de links (las dos paginadas).
  // Sin pestaña pedida, abre la lista si el negocio tiene comprobantes; si no tiene ninguno (CH,
  // con ARCA apagado), «Cobrar con link», como antes (`vistaDeFacturacion`, lista-core.ts).
  const linkPedido = sp.vista === "cobrar-con-link";
  const [{ estado, filtros, lista, fallo }, { modo }, activos, nuevo, linksPedidos] = await Promise.all([
    getPanelDeFacturacion(linkPedido ? {} : sp),
    estadoCobros(),
    getActiveModuleIds(),
    disenoNuevo(),
    linkPedido ? getLinksDeCobro(sp) : null,
  ]);
  const conLink = vistaDeFacturacion(sp, estado.hayComprobantes) === "cobrar-con-link";
  const links = linksPedidos ?? (conLink ? await getLinksDeCobro(sp) : null);
  const listaDeLinks = links && <LinksDeCobro pagina={links.pagina} filtros={links.filtros} fallo={links.fallo} />;
  const hoy = todayInBusinessTz();
  // Primero el trabajo del día (la lista y lo que necesita atención); cobrar con link es la otra
  // pestaña. Los DOS diseños usan la MISMA lista (ComprobantesArca), paginada en el servidor.
  const bancosActivo = moduleGateAllows("bancos", activos);
  const pestanas = (
    <Pestanas
      etiqueta="Vistas de Facturación"
      conRaya
      className="mb-5"
      pestanas={[
        { href: "/admin/facturacion?vista=comprobantes", etiqueta: "Comprobantes", actual: !conLink },
        { href: "/admin/facturacion?vista=cobrar-con-link", etiqueta: "Cobrar con link", actual: conLink },
      ]}
    />
  );
  const comprobantes = <ComprobantesArca lista={lista} filtros={filtros} estado={estado} hoy={hoy} fallo={fallo} />;
  const aviso = bancosActivo && !conLink && (
    <p className="mt-6 text-sm text-muted">
      Las ventas que entran al banco se facturan desde{" "}
      <Link href="/admin/facturacion/bancos" className="font-medium text-accent-ink underline underline-offset-4">
        Facturación automática
      </Link>
      : ahí aparecen como comprobantes cuando se emiten.
    </p>
  );

  // DISEÑO NUEVO («Renglón»): el modo prueba de ARCA, en una franja fija.
  if (nuevo) {
    const t = lista.totales.porEstado;
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-3">
          <h1 className="text-2xl font-bold text-strong">Facturación</h1>
          <LineaDeEstado
            datos={[
              ...datosDeArca(estado),
              estado.pendientes > 0 ? `${estado.pendientes} ${estado.pendientes === 1 ? "pendiente" : "pendientes"}` : null,
              t.REJECTED.cantidad > 0 ? <Marca key="r" tipo="anulado">{t.REJECTED.cantidad === 1 ? "1 rechazada en el período" : `${t.REJECTED.cantidad} rechazadas en el período`}</Marca> : null,
            ]}
          />
        </header>
        <FranjaDeArca estado={estado} className="mb-4" />
        {pestanas}
        {conLink ? (
          <>
            <CobrarConLink modo={modo} />
            {listaDeLinks}
          </>
        ) : (
          comprobantes
        )}
        {aviso}
      </main>
    );
  }

  // DISEÑO VIEJO: misma lista y mismas pestañas, con la cabecera de siempre. La tarjeta de
  // Facturación automática (módulo BANCOS) queda como una línea debajo de la lista.
  return (
    <PageContainer>
      <PageHeader
        title="Facturación y cobros"
        description="Tus comprobantes y su estado ante ARCA. Los links de cobro por Mercado Pago, en su pestaña."
      />
      {pestanas}
      {conLink ? (
        <>
          <CobrosSection modo={modo} />
          {listaDeLinks}
        </>
      ) : (
        comprobantes
      )}
      {aviso}
    </PageContainer>
  );
}
