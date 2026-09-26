// Consola del contador (módulo CARTERA — ADR-025 §12 / ADR-045).
// Un estudio contable ve su cartera de clientes (cada uno, un tenant del ERP) en dos
// partes, las dos salidas de UNA pasada por cliente (`monitorCarteraAction`):
//   1. arriba, "de quién me ocupo hoy" (MonitorBandeja): cuántos no pueden emitir y una
//      línea por cliente con su peor señal y la acción que existe;
//   2. abajo, el VOLUMEN: facturado con validez fiscal (separado de lo emitido en
//      prueba), facturas automáticas del mes contra el límite del plan, cuántos clientes
//      tienen el mes anterior cerrado, pendientes de revisión y la tabla con el detalle
//      (incluida la descarga del paquete del mes de cada cliente).
// Server component: junta los datos con las actions de cartera; la interacción vive en
// los client components de la carpeta.
//
// BARRERA DE ACCESO (doble, server-side): capability `cartera:manage` (solo
// OWNER) + módulo `cartera` ASIGNADO al tenant actual (ADR-055) — un admin común
// de un negocio cualquiera NO ve esta pantalla. Las actions repiten el gate.
//
// AISLAMIENTO: el panel NUNCA evade RLS — cada dato de cliente sale de
// tenantTransaction(clienteTenantId) (ver src/lib/cartera-actions.ts). Jamás
// operatorPrisma en este camino.

import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { direccionDelPanel, panelesDeLaCartera } from "@/lib/contador/paneles-de-la-cartera";
import { MODULO_CARTERA } from "@/lib/cartera-core";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import { monitorCarteraAction } from "@/lib/cartera-actions";
import { titularMonitor } from "@/lib/monitor-core";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { Badge, KpiTile, PageContainer, PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { nombreDelMes } from "@/lib/libros/fecha-fiscal";
import ThemeToggle from "@/app/admin/(dashboard)/ThemeToggle";
import CarteraPanel from "./CarteraPanel";
import MonitorBandeja from "./MonitorBandeja";
import AltaCliente from "./AltaCliente";
import MonitorMonotributo from "./MonitorMonotributo";
import MesDelEstudio from "./MesDelEstudio";
import { pendientesDelMes } from "./mes-core";
import { pedidosDelEstudio } from "./pedido-soporte.server";
import { pedidosDeAltaDelEstudio } from "./altas-en-curso.server";
import { formatearCuit } from "@/lib/fiscal/cuit";
import { Bloque, Renglon } from "@/components/ui/Renglon";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";

export const dynamic = "force-dynamic";

// Ícono de línea, mismo lenguaje que AdminShell/bancos (stroke 1.85, currentColor).
function Icono({ path }: { path: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export default async function ContadorPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  // `?cliente=` abre la ficha de ese cliente (lo usan los renglones de «El mes»). Si no está en la
  // cartera, la ficha simplemente no abre: el dato nunca se usa para leer nada.
  const { cliente: clienteInicial } = await searchParams;
  // Guarda de rol de la página (las actions la repiten server-side por acción).
  await requireCapability("cartera:manage");
  const nuevoP = disenoNuevo();
  const estudioTenantId = await getCurrentTenantId();

  // Barrera dura por ASIGNACIÓN de módulo (ADR-055): sin `cartera` en
  // Tenant.modules, este panel no existe para el tenant (aunque el rol dé la
  // capability). Chequeo directo, independiente del flag del registry.
  const estudio = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { name: true, modules: true },
  });
  if (!estudio?.modules?.includes(MODULO_CARTERA)) notFound();
  // Con `cartera` Y `multilocal` juntos, el panel tampoco abre (la misma regla que las
  // actions, `decidirAcceso`): se dice qué pasa con su título, en vez de dejar que el
  // rechazo de las actions aparezca bajo "falta el último paso de base de datos".
  const acceso = decidirAcceso(estudio.modules, "estudio");
  if (!acceso.ok) {
    return (
      <PageContainer>
        <PageHeader title="Mi cartera" description="El panel del contador no se puede abrir en este negocio por ahora." />
        <div role="alert" className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-card">
          {acceso.error}
        </div>
      </PageContainer>
    );
  }

  const res = await monitorCarteraAction();

  // Defensa Gate 2: si el código llegó antes que su migración, estado honesto.
  if (!res.ok) {
    return (
      <PageContainer>
        <PageHeader
          title="Mi cartera"
          description="El panel está instalado pero falta el último paso de base de datos."
        />
        <div
          role="alert"
          className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-card"
        >
          {res.error}
        </div>
      </PageContainer>
    );
  }

  const { filas, resumen, monitor } = res;
  // Qué cliente tiene panel propio: la misma regla que rutea el deploy (mapa de hosts o dominio propio).
  const paneles = panelesDeLaCartera(filas.map((f) => f.subdomain));
  // Si NINGÚN cliente emite con validez fiscal (hoy: toda la cartera en homologación), la
  // tarjeta no puede decir "facturado": dice lo que es, emitido en prueba.
  const hayFiscal = filas.some((f) => f.validezFiscal);
  const cierre = resumen.cierreMes;
  const mesCierre = cierre.mes ? nombreDelMes(cierre.mes) : null;
  const nuevo = await nuevoP;
  // El mes de la contadora (hora de Argentina): lo pendiente de toda la cartera, lo más grave primero.
  const mesActual = dateStrInBusinessTz(new Date()).slice(0, 7);
  const inicioDelMes = businessWallTimeToUtc(`${mesActual}-01`, "00:00");
  const tieneDireccion = (f: { subdomain: string | null }) => direccionDelPanel(paneles, f.subdomain, "") !== null;
  const grupos = pendientesDelMes(filas, monitor.filas, mesActual, inicioDelMes, tieneDireccion);
  // Los pedidos a Soporte GSG (abiertos y respondidos): si la lectura falla, la ficha sigue (sin la marca).
  const { abiertos: pedidos, respuestas: respuestasSoporte } = await pedidosDelEstudio(estudioTenantId).catch((e: unknown) => {
    console.error("[contador] no se pudieron leer los pedidos a Soporte GSG", { tenantId: estudioTenantId, error: e instanceof Error ? e.name : "desconocido" });
    return { abiertos: [], respuestas: [] };
  });
  // Los pedidos de alta que Soporte GSG todavía no configuró: sin esto la contadora pide y no ve nada.
  // Y los que Soporte descartó: la contadora ve el motivo en vez de que el pedido desaparezca.
  // Se ven hasta ALTAS_A_LA_VISTA de cada uno; si hay más, el bloque lo dice (nada desaparece callado).
  const {
    enCurso: altasPedidas,
    enCursoTotal: altasPedidasTotal,
    descartadas: altasDescartadas,
    descartadasTotal: altasDescartadasTotal,
  } = await pedidosDeAltaDelEstudio(estudioTenantId).catch((e: unknown) => {
    console.error("[contador] no se pudieron leer los pedidos de alta", { tenantId: estudioTenantId, error: e instanceof Error ? e.name : "desconocido" });
    return { enCurso: [], enCursoTotal: 0, descartadas: [], descartadasTotal: 0 };
  });
  const fmtPedido = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
  // Diseño nuevo: lo que decían las cinco tarjetas pasa a una sola línea de estado bajo el título.
  const titular = titularMonitor(monitor.resumen, monitor.avisos);
  const estado = nuevo
    ? [
        <b key="t">{titular.texto}</b>,
        `${fmtNumberAR(resumen.clientes)} ${resumen.clientes === 1 ? "cliente" : "clientes"}`,
        <span key="m">
          {hayFiscal ? "Facturado este mes " : "Emitido en prueba este mes "}
          <b>{fmtMoneyARS(hayFiscal ? resumen.montoFiscalMes : resumen.montoPruebaMes, 0)}</b>
        </span>,
        `${fmtNumberAR(resumen.facturasMes)} facturas automáticas`,
        <span key="r">
          <b>{fmtNumberAR(resumen.pendientesRevision)}</b> para revisar
        </span>,
        ...(mesCierre ? [`${fmtNumberAR(cierre.congelados)} de ${fmtNumberAR(cierre.activos)} con ${mesCierre} cerrado`] : []),
      ]
    : undefined;

  return (
    <PageContainer>
      <PageHeader
        title="Mi cartera"
        // Diseño nuevo: el nombre del estudio ya está en la cabecera (layout.tsx).
        badge={
          nuevo ? undefined : (
          <Badge tone="accent" dot>
            {estudio.name}
          </Badge>
          )
        }
        estado={estado}
        description={
          nuevo ? undefined : (
          <>
            Primero, de qué cliente te tenés que ocupar hoy y qué hacer. Abajo, cuánto facturó cada
            uno este mes y qué quedó esperando tu revisión.
          </>
          )
        }
        // Diseño nuevo: el tema se cambia desde la cabecera del estudio (layout.tsx).
        actions={nuevo ? undefined : <ThemeToggle />}
      />

      {/* "De quién me ocupo hoy": sale de la misma pasada que el volumen de abajo. */}
      <MonitorBandeja
        filas={monitor.filas}
        resumen={monitor.resumen}
        avisos={monitor.avisos}
        cartera={filas}
        paneles={paneles}
      />

      {/* El mes: quién no puede facturar, lo que vence, cierres y extractos (de lo más grave a lo menos). */}
      <MesDelEstudio grupos={grupos} mesTexto={nombreDelMes(mesActual)} />

      {/* Monotributo: lo facturado en 12 meses contra el tope de la categoría (C3). */}
      <MonitorMonotributo />

      {/* KPIs de VOLUMEN con gap 14px (fix 28); KpiTile ya trae tabular-nums (fix 7). La
          plata y la cantidad van en tarjetas SEPARADAS porque responden a relojes distintos:
          la plata es fiscal (comprobantes con CAE, por su fecha) y la cantidad es la que
          cuenta para el límite de facturas automáticas del plan (todo lo emitido en el mes). */}
      {/* Diseño nuevo: sin tarjetas; su contenido va en la línea de estado de arriba. */}
      {!nuevo && (
      <section
        aria-label="Volumen de la cartera en el mes"
        className="mb-xl grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        {hayFiscal ? (
          <KpiTile
            label="Facturado con validez fiscal"
            value={fmtMoneyARS(resumen.montoFiscalMes, 0)}
            sub={
              resumen.montoPruebaMes > 0
                ? `Aparte, ${fmtMoneyARS(resumen.montoPruebaMes, 0)} emitido en prueba (sin validez fiscal).`
                : "Con CAE de ARCA, por la fecha del comprobante."
            }
            icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
          />
        ) : (
          <KpiTile
            label="Emitido en prueba (sin validez fiscal)"
            value={fmtMoneyARS(resumen.montoPruebaMes, 0)}
            sub="Tiene CAE de prueba: todavía no es facturación."
            icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
          />
        )}
        {/* "Límite de facturas automáticas del plan": una regla comercial del producto, no un
            tope fiscal. La categoría del monotributo va por ingresos de 12 meses. */}
        <KpiTile
          label="Facturas automáticas del mes"
          value={fmtNumberAR(resumen.facturasMes)}
          sub="Todo lo emitido este mes entre todos tus clientes, rechazos incluidos: es lo que cuenta para el límite de facturas automáticas del plan."
          icon={<Icono path={<path d="M5 6h14M5 12h14M5 18h9" />} />}
        />
        <KpiTile
          label={mesCierre ? `Clientes con ${mesCierre} cerrado` : "Cierre del mes"}
          value={`${fmtNumberAR(cierre.congelados)} de ${fmtNumberAR(cierre.activos)}`}
          sub={`${
            cierre.congelados === cierre.activos
              ? "Todos lo congelaron: su paquete es la versión final."
              : `${fmtNumberAR(cierre.activos - cierre.congelados)} sin cerrar todavía.`
          } ${fmtNumberAR(monitor.resumen.sinPoderEmitir)} no ${monitor.resumen.sinPoderEmitir === 1 ? "puede" : "pueden"} facturar hoy.`}
          icon={<Icono path={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>} />}
        />
        <KpiTile
          label="Pendientes de revisión"
          value={
            <span className={resumen.pendientesRevision > 0 ? "text-warning" : undefined}>
              {fmtNumberAR(resumen.pendientesRevision)}
            </span>
          }
          sub={
            resumen.pendientesRevision > 0
              ? "Ventas que necesitan datos del comprador."
              : "Nada para revisar. Todo al día."
          }
          icon={<Icono path={<><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4l3 2" /></>} />}
        />
        <KpiTile
          label="Listas para emitir"
          value={fmtNumberAR(resumen.listasParaEmitir)}
          sub="Propuestas automáticas esperando un clic."
          icon={<Icono path={<><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3z" /><path d="M10 8h4m-4 4h4" /></>} />}
        />
      </section>
      )}

      {/* Cartera: tabla + panel de detalle con acciones */}
      <CarteraPanel
        key={clienteInicial ?? ""}
        filas={filas}
        paneles={paneles}
        monitor={monitor.filas}
        pedidos={pedidos}
        respuestasSoporte={respuestasSoporte}
        inicioDelMes={inicioDelMes.toISOString()}
        clienteInicial={typeof clienteInicial === "string" ? clienteInicial : null}
      />

      {/* Pedidos de alta en curso (Soporte GSG los configura y avisa por WhatsApp) */}
      {(altasPedidasTotal > 0 || altasDescartadasTotal > 0) && (
        <Bloque
          id="altas-en-curso"
          titulo="Pedidos de alta en curso"
          cuenta={altasPedidasTotal}
          nota="Soporte GSG los configura y te avisa por WhatsApp"
        >
          <ul>
            {altasPedidas.map((a) => (
              <li key={a.id}>
                <Renglon
                  titulo={<span className="break-words">{a.nombre}</span>}
                  detalle={`CUIT ${formatearCuit(a.cuit) ?? a.cuit} · pedido el ${fmtPedido.format(a.pedidoEl)}`}
                />
              </li>
            ))}
            {altasPedidasTotal > altasPedidas.length && (
              <li className="py-3 text-sm text-muted">
                Se ven los {altasPedidas.length} pedidos en curso más viejos, de {altasPedidasTotal}. Soporte GSG los tiene todos.
              </li>
            )}
            {altasDescartadas.map((a) => (
              <li key={a.id}>
                <Renglon
                  titulo={<span className="break-words">{a.nombre} · no se dio de alta</span>}
                  detalle={
                    <span className="break-words">
                      CUIT {formatearCuit(a.cuit) ?? a.cuit} · Soporte GSG lo descartó el {fmtPedido.format(a.descartadoEl)}: {a.motivo} Si
                      corresponde, pedilo de nuevo con los datos corregidos.
                    </span>
                  }
                />
              </li>
            ))}
            {altasDescartadasTotal > altasDescartadas.length && (
              <li className="py-3 text-sm text-muted">
                {altasDescartadasTotal - altasDescartadas.length === 1
                  ? "Y 1 pedido descartado más en los últimos 30 días."
                  : `Y ${altasDescartadasTotal - altasDescartadas.length} pedidos descartados más en los últimos 30 días.`}
              </li>
            )}
          </ul>
        </Bloque>
      )}

      {/* Alta de cliente */}
      <AltaCliente />

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">
        Con tecnología de Gestión Studio Grow
      </footer>
    </PageContainer>
  );
}
