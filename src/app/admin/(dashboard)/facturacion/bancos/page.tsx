// Facturación automática (módulo BANCOS) — tablero de la sección: KPIs con
// barra de objetivo, importación de extractos, emisión en lote, cola de
// revisión y últimas importaciones. Server component: junta los datos con las
// actions del contrato (src/lib/bancos-actions) y delega la interacción a los
// client components de la carpeta. Gated por `billing:manage`, hermana de la
// pantalla de Facturación (ARCA + cobros) — misma navegación, mismo módulo.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveModuleIds, moduleGateAllows } from "@/lib/module-gating";
import {
  kpisFacturacionAction,
  listarPropuestasAction,
  type PropuestaVista,
} from "@/lib/bancos-actions";
import { getFacturacion } from "@/lib/facturacion-actions";
import { Badge, PageContainer, PageHeader, SectionGroup, buttonClasses, fmtNumberAR } from "@/components/ui";
import ArcaPill from "./ArcaPill";
import KpisBancos from "./KpisBancos";
import ImportarExtracto from "./ImportarExtracto";
import MercadoPagoSync from "./MercadoPagoSync";
import EmitirFacturas from "./EmitirFacturas";
import ColaRevision from "./ColaRevision";
import RevisarEnCajon from "./RevisarEnCajon";
import EmitirDeslizando from "./EmitirDeslizando";
import { estadoMercadoPagoAction } from "@/lib/mercadopago-actions";
import { fmtDateTimeAr } from "@/lib/datetime";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { Bloque, Franja, LineaDeEstado, Marca, Plata, Renglon, Rotulo, atributosBoton } from "@/components/ui";
import { FranjaDeArca, datosDeArca } from "../EstadoArca";
import { fechaAr } from "./helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Facturación automática",
  // Sello GSG (estándar de marca): el tenant conserva SU marca visible; GSG
  // firma como generador, discreto.
  generator: "Gestión Studio Grow",
};

/** Chip de estado del mapeo de una importación (estado + % de confianza). */
function chipMapeo(estado: string, confianza: number | null) {
  const pct = confianza != null ? `${Math.round(confianza * 100)}%` : null;
  if (estado === "confirmada") {
    return <Badge tone="success" dot>Mapeo confirmado</Badge>;
  }
  if (confianza != null && confianza < 0.8) {
    return <Badge tone="warning" dot>A confirmar · {pct}</Badge>;
  }
  return <Badge tone="neutral" dot>Detectado{pct ? ` · ${pct}` : ""}</Badge>;
}

/** Diseño nuevo: cuántas listas se ven sin desplegar (el resto, a un toque). */
const LISTAS_A_LA_VISTA = 8;

/** Diseño nuevo: una venta lista para facturar, como renglón (fecha, qué dice el banco, monto). */
function RenglonDeLista({ p }: { p: PropuestaVista }) {
  return (
    <Renglon
      folio={<span className="tabular-nums">{fechaAr(p.fecha).slice(0, 5)}</span>}
      titulo={<span className="font-normal">{p.descripcion}</span>}
      detalle={p.contraparte ?? undefined}
      plata={<Plata valor={Math.abs(p.monto)} />}
    />
  );
}

export default async function FacturacionBancosPage() {
  // Guarda de rol de la página (las actions la repiten server-side por acción).
  await requireCapability("billing:manage");
  // Gate por módulo (ADR-054/055, OBS-1 del Gate): un tenant sin el módulo
  // `bancos` asignado no ve esta pantalla (con el registry apagado pasa todo).
  const activos = await getActiveModuleIds();
  if (!moduleGateAllows("bancos", activos)) notFound();
  const tenantId = await getCurrentTenantId();

  // Defensa Gate 2 (OBS-1): si el código llegó a prod ANTES que su migración
  // (tablas de bancos inexistentes), no reventamos con un 500 — mostramos el
  // estado honesto y el camino (runbook). Cualquier otro error re-lanza.
  let datos;
  try {
    datos = await Promise.all([
      kpisFacturacionAction(),
      listarPropuestasAction({ estadoPropuesta: "revision" }),
      listarPropuestasAction({ estadoPropuesta: "auto" }),
      getFacturacion(), // mismo estado fiscal que la pantalla de Facturación (consistencia)
      estadoMercadoPagoAction(),
    ]);
  } catch (e) {
    // P2021/P2022: la tabla o columna no existe todavía (migración sin aplicar).
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return (
        <PageContainer>
          <PageHeader
            title="Facturación automática"
            description="El módulo está instalado pero falta el último paso de base de datos."
            actions={
              <Link href="/admin/facturacion" className={buttonClasses("ghost", "sm")}>
                ← Facturación y cobros
              </Link>
            }
          />
          <div role="alert" className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-card">
            Falta aplicar la migración <code className="text-strong">20260711120000_add_bancos_importacion</code>{" "}
            (paso del dueño). Cuando se aplique, esta pantalla se enciende sola.
          </div>
        </PageContainer>
      );
    }
    throw e;
  }
  const [kpis, enRevision, listas, { estado }, estadoMP] = datos;

  // % de confianza del mapeo por importación: lectura liviana del mapeoJson
  // (solo los 5 ids del KPI, tenantId explícito — ADR-018). No hay action de
  // lectura para esto y la regla del frente admite solo UNA action nueva (la
  // de config), así que la página lo lee directo, como ya hace auditoria/.
  const idsImportaciones = kpis.ultimasImportaciones.map((i) => i.id);
  const mapeos = idsImportaciones.length
    ? await prisma.importacionBancaria.findMany({
        where: { tenantId, id: { in: idsImportaciones } },
        select: { id: true, mapeoJson: true },
      })
    : [];
  const confianzaPorImportacion = new Map(
    mapeos.map((m) => [m.id, (m.mapeoJson as { confianza?: number } | null)?.confianza ?? null]),
  );

  const totalListas = listas.reduce((acc, p) => acc + Math.abs(p.monto), 0);

  // DISEÑO NUEVO («Renglón»): las mismas piezas, en el orden del trabajo. Primero lo que pide una
  // mano (la cola de revisión), después lo que está listo para facturar, después traer movimientos.
  // Los cuatro números del mes van en la línea de estado; el tope del plan, en una franja sólo
  // cuando importa (90 % o más). El modo de ARCA, en la franja de siempre.
  if (await disenoNuevo()) {
    const pct = kpis.capFacturasMes > 0 ? Math.round((kpis.facturasMes / kpis.capFacturasMes) * 100) : 0;
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Facturación automática</h1>
            <LineaDeEstado
              datos={[
                datosDeArca(estado)[0],
                `${fmtNumberAR(kpis.facturasMes)} de ${fmtNumberAR(kpis.capFacturasMes)} facturas del plan este mes`,
                kpis.montoFacturadoMes > 0 ? (
                  <span key="f">
                    <Plata valor={kpis.montoFacturadoMes} sinCentavos /> con CAE{estado.modo !== "real" ? " (de prueba)" : ""}
                  </span>
                ) : null,
                enRevision.length > 0 ? <Marca key="r" tipo="atencion">{`${fmtNumberAR(enRevision.length)} para revisar`}</Marca> : "nada para revisar",
              ]}
            />
          </div>
          <Link href="/admin/facturacion/bancos/configuracion" className={buttonClasses("ghost", "md")} {...atributosBoton("ghost", "md")}>
            Configuración
          </Link>
        </header>
        <FranjaDeArca estado={estado} className="mb-3" />
        {pct >= 90 && (
          <Franja tono={pct >= 100 ? "peligro" : "atencion"} className="mb-3">
            {pct >= 100
              ? "Se alcanzó el límite de facturas automáticas del plan: este mes no se emiten más."
              : `Estás cerca del límite de facturas automáticas del plan: ${kpis.facturasMes} de ${kpis.capFacturasMes}.`}
          </Franja>
        )}
        <div className="mt-5 flex flex-col gap-10">
          {enRevision.length > 0 && (
            <Bloque id="cola-revision" titulo="Para revisar" cuenta={fmtNumberAR(enRevision.length)} nota="Superan el umbral o parecen repetidas: completá el comprador o marcalas como no facturables">
              <RevisarEnCajon propuestas={enRevision} />
            </Bloque>
          )}
          <Bloque titulo="Listas para facturar" cuenta={fmtNumberAR(listas.length)} nota={listas.length > 0 ? <Plata valor={totalListas} /> : "nada por ahora"}>
            {listas.length === 0 ? (
              <p className="py-3 text-sm text-muted">No hay facturas listas para emitir. Subí un extracto o completá las ventas para revisar.</p>
            ) : (
              <>
                {listas.slice(0, LISTAS_A_LA_VISTA).map((p) => (
                  <RenglonDeLista key={p.id} p={p} />
                ))}
                {listas.length > LISTAS_A_LA_VISTA && (
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer items-center py-2 text-sm font-semibold text-accent">
                      Ver las otras {fmtNumberAR(listas.length - LISTAS_A_LA_VISTA)}
                    </summary>
                    {listas.slice(LISTAS_A_LA_VISTA).map((p) => (
                      <RenglonDeLista key={p.id} p={p} />
                    ))}
                  </details>
                )}
                <div className="pt-4">
                  <EmitirDeslizando cantidad={listas.length} total={totalListas} modoPrueba={estado.modo !== "real"} />
                </div>
              </>
            )}
          </Bloque>
          <Bloque titulo="Traer movimientos" nota="El mismo extracto dos veces no duplica nada">
            <div className="grid gap-8 pt-4 lg:grid-cols-2">
              <div className="min-w-0">
                <Rotulo className="mb-2">Extracto del banco</Rotulo>
                <ImportarExtracto />
              </div>
              <div className="min-w-0">
                <Rotulo className="mb-2">Cobros de Mercado Pago</Rotulo>
                <MercadoPagoSync estado={estadoMP} />
              </div>
            </div>
          </Bloque>
          <Bloque titulo="Últimas importaciones" cuenta={kpis.ultimasImportaciones.length || undefined}>
            {kpis.ultimasImportaciones.length === 0 ? (
              <p className="py-3 text-sm text-muted">Todavía no subiste ningún extracto: el primero se importa acá arriba.</p>
            ) : (
              kpis.ultimasImportaciones.map((imp) => {
                const confianza = confianzaPorImportacion.get(imp.id) ?? null;
                return (
                  <Renglon
                    key={imp.id}
                    folio={fmtDateTimeAr(imp.createdAt).slice(0, 5)}
                    titulo={<span className="font-normal">{imp.nombreArchivo}</span>}
                    detalle={
                      imp.estado === "confirmada"
                        ? "columnas confirmadas"
                        : confianza != null && confianza < 0.8
                          ? `columnas a confirmar (${Math.round(confianza * 100)} % seguro)`
                          : `columnas detectadas${confianza != null ? ` (${Math.round(confianza * 100)} % seguro)` : ""}`
                    }
                    plata={<span className="text-sm tabular-nums text-muted">{fmtNumberAR(imp.totalMovimientos)} mov.</span>}
                  />
                );
              })
            )}
          </Bloque>
        </div>
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Facturación automática"
        badge={<ArcaPill estado={estado} />}
        description={
          <>
            Subí el extracto de tu banco y el sistema arma las facturas solo: detecta las columnas,
            separa lo que no se factura y te pide una mano únicamente cuando una venta necesita los
            datos del comprador.
          </>
        }
        actions={
          <>
            <Link href="/admin/facturacion" className={buttonClasses("ghost", "sm")}>
              ← Facturación y cobros
            </Link>
            <Link href="/admin/facturacion/bancos/configuracion" className={buttonClasses("outline", "sm")}>
              Configuración
            </Link>
          </>
        }
      />

      <div className="mb-xl">
        <KpisBancos kpis={kpis} />
      </div>

      <SectionGroup
        title="Importar extracto"
        description="El archivo tal cual lo baja el homebanking. Los movimientos repetidos se detectan solos: podés subir el mismo extracto dos veces sin miedo."
      >
        <ImportarExtracto />
      </SectionGroup>

      <SectionGroup
        title="Cobros de Mercado Pago"
        description="Lo que cobrás por Mercado Pago entra al mismo tablero y se factura por las mismas reglas. Si el mismo cobro aparece también en el extracto del banco, se detecta y no se duplica."
      >
        <MercadoPagoSync estado={estadoMP} />
      </SectionGroup>

      <SectionGroup
        title="Emitir facturas"
        description="Las ventas clasificadas y por debajo del umbral se facturan en lote, respetando el límite de facturas automáticas del plan."
      >
        <EmitirFacturas cantidad={listas.length} total={totalListas} />
      </SectionGroup>

      <div id="cola-revision">
        <SectionGroup
          title={
            <>
              Cola de revisión{" "}
              {enRevision.length > 0 && (
                <span className="text-sm font-medium tabular-nums text-muted">
                  · {fmtNumberAR(enRevision.length)}
                </span>
              )}
            </>
          }
          description="Estas ventas superan el umbral de identificación o parecen duplicadas: completá los datos del comprador o marcalas como no facturables."
        >
          <ColaRevision propuestas={enRevision} />
        </SectionGroup>
      </div>

      <SectionGroup
        title="Últimas importaciones"
        description="Los últimos extractos procesados y cómo quedó el reconocimiento de columnas."
      >
        {kpis.ultimasImportaciones.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no subiste ningún extracto. El primero se importa acá arriba.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <caption className="sr-only">Últimos extractos bancarios importados</caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Archivo</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Movimientos</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Mapeo</th>
                </tr>
              </thead>
              <tbody>
                {kpis.ultimasImportaciones.map((imp) => (
                  <tr key={imp.id} className="border-b border-line last:border-b-0">
                    <td className="max-w-64 truncate px-4 py-3 font-medium text-strong">
                      {imp.nombreArchivo}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                      {fmtDateTimeAr(imp.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-strong">
                      {fmtNumberAR(imp.totalMovimientos)}
                    </td>
                    <td className="px-4 py-3">
                      {chipMapeo(imp.estado, confianzaPorImportacion.get(imp.id) ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionGroup>

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">
        Con tecnología de Gestión Studio Grow
      </footer>
    </PageContainer>
  );
}
