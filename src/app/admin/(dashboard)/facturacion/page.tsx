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
import EmitirDelPanel from "./EmitirDelPanel";
import { datosDelFacturador, tieneFacturacionElectronica } from "@/lib/facturacion/emision-manual.server";
import CobrarConLink from "./CobrarConLink";
import LinksDeCobro from "./LinksDeCobro";
import { FranjaDeArca, datosDeArca } from "./EstadoArca";
import { getCurrentTenantId } from "@/lib/tenant";
import { AsistenteArca } from "@/components/fiscal/AsistenteArca";
import { leerAsistente } from "@/lib/fiscal/asistente-arca.server";
import { leerPuestaAPunto } from "@/lib/facturacion/puesta-a-punto.server";
import { serviciosParaFacturar } from "@/lib/facturacion/servicios-del-negocio.server";
import PuestaAPunto, { CabeceraDePuesta } from "@/components/facturacion/PuestaAPunto";
import FacturaDePrueba from "./FacturaDePrueba";
import {
  cargarCertificadoArcaAction,
  generarPedidoArcaAction,
  pedirPaseArcaAction,
  pedirContadorArcaAction,
  cancelarContadorArcaAction,
  probarCertificadoArcaAction,
} from "@/lib/fiscal/asistente-arca-actions";

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
  const arcaPedido = sp.vista === "arca";
  const emitirPedido = sp.vista === "emitir";
  const [{ estado, filtros, lista, fallo }, { modo }, activos, nuevo, linksPedidos] = await Promise.all([
    getPanelDeFacturacion(linkPedido ? {} : sp),
    estadoCobros(),
    getActiveModuleIds(),
    disenoNuevo(),
    linkPedido ? getLinksDeCobro(sp) : null,
  ]);
  // Asistente ARCA (pestaña «Conectar con ARCA»): sólo con el módulo arca activo. La guardia fina de
  // sus actions vive en asistente-arca-actions.ts; acá se lee con el negocio de la sesión.
  const arcaActivo = moduleGateAllows("arca", activos);
  const conArca = arcaPedido && arcaActivo;
  // «Emitir» (el facturador guiado común): sólo con la facturación electrónica asignada.
  // La regla explícita (módulo `arca` en la lista del negocio), la misma que vuelve a exigir la acción.
  const negocioId = arcaActivo ? await getCurrentTenantId() : null;
  const emiteAMano = negocioId ? await tieneFacturacionElectronica(negocioId) : false;
  const conEmitir = emitirPedido && emiteAMano;
  const tenantId = conEmitir ? negocioId : null;
  const [facturador, servicios] = tenantId
    ? await Promise.all([datosDelFacturador(tenantId), serviciosParaFacturar(tenantId).catch(() => [])])
    : [null, []];
  const conLink = !conArca && !conEmitir && vistaDeFacturacion(sp, estado.hayComprobantes) === "cobrar-con-link";
  // Puesta a punto: el checklist en su pestaña y, en la lista de comprobantes, su cabecera de banner
  // mientras no está listo. Sólo con el módulo arca (lee la ficha fiscal y el certificado).
  const conLista = !conLink && !conArca && !conEmitir;
  const asistente = conArca || (conLista && negocioId) ? await leerAsistenteDelCliente(sp, estado.facturaDePrueba, conArca) : null;
  const banner = conLista && asistente && !asistente.puesta.listo ? <div className="mb-4"><CabeceraDePuesta puesta={asistente.puesta} comoBanner /></div> : null;
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
      // A 390 px las 4 vistas no entran: se acomodan en dos renglones en vez de esconder «Puesta a punto».
      className="mb-5 flex-wrap sm:flex-nowrap"
      pestanas={[
        { href: "/admin/facturacion?vista=comprobantes", etiqueta: "Comprobantes", actual: !conLink && !conArca && !conEmitir },
        ...(emiteAMano ? [{ href: "/admin/facturacion?vista=emitir", etiqueta: "Emitir factura", actual: conEmitir }] : []),
        { href: "/admin/facturacion?vista=cobrar-con-link", etiqueta: "Cobrar con link", actual: conLink },
        ...(arcaActivo ? [{ href: "/admin/facturacion?vista=arca", etiqueta: "Puesta a punto", actual: conArca }] : []),
      ]}
    />
  );
  const comprobantes = tenantId && facturador ? (
    <EmitirDelPanel tenantId={tenantId} condicionEmisor={facturador.condicionEmisor} hoy={facturador.hoy} regimenFacturaA={facturador.regimenFacturaA} servicios={servicios} />
  ) : conArca && asistente?.pantalla ? (
    asistente.pantalla
  ) : (
    <>
      {banner}
      <ComprobantesArca lista={lista} filtros={filtros} estado={estado} hoy={hoy} fallo={fallo} />
    </>
  );
  const aviso = bancosActivo && !conLink && !conArca && !conEmitir && (
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

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * La puesta a punto del negocio de la sesión: su estado (para el banner) y, en su pestaña, el checklist
 * con el asistente ARCA y la factura de prueba adentro. `requireApp("facturacion")` de la página ya
 * exige billing:manage; las actions lo vuelven a exigir.
 */
async function leerAsistenteDelCliente(sp: Sp, conPrueba: boolean, conPantalla: boolean) {
  const tenantId = await getCurrentTenantId();
  const vista = await leerAsistente(tenantId);
  if (!vista) return null;
  const puesta = await leerPuestaAPunto(tenantId, vista);
  if (!conPantalla) return { puesta, pantalla: null };
  const conexion = (
    <AsistenteArca
      vista={vista}
      plano="cliente"
      aviso={{ ok: primero(sp.ok)?.slice(0, 600), error: primero(sp.error)?.slice(0, 600) }}
      acciones={{
        generarPedido: generarPedidoArcaAction,
        cargarCertificado: cargarCertificadoArcaAction,
        probar: probarCertificadoArcaAction,
        pedirPase: pedirPaseArcaAction,
        pedirAsistencia: pedirContadorArcaAction,
        cancelarAsistencia: cancelarContadorArcaAction,
      }}
    />
  );
  return { puesta, pantalla: <PuestaAPunto puesta={puesta} conexion={conexion} prueba={conPrueba ? <FacturaDePrueba /> : null} /> };
}
