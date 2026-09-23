import { getDashboardData, getRetailDashboardData } from "@/lib/actions";
import Link from "next/link";
import { fmtTime, fmtDateTimeAr } from "@/lib/datetime";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getActiveProfile } from "@/lib/profile-gating";
import { getActiveModuleIds } from "@/lib/module-gating";
import { dashboardMode } from "@/lib/dashboard-mode";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getProductoActual } from "@/lib/producto";
import { kpisFacturacionAction } from "@/lib/bancos-actions";
import type { KpisFacturacionBancaria } from "@/lib/bancos-glue";
import { getFacturacion, type EstadoFiscal } from "@/lib/facturacion-actions";
import ArcaPill from "./facturacion/bancos/ArcaPill";
import {
  buttonClasses,
  KpiTile,
  fmtMoneyARS,
  fmtNumberAR,
  PageContainer,
  PageHeader,
  SectionGroup,
} from "@/components/ui";

export const dynamic = "force-dynamic";

// Set chico de íconos de línea para los KPI (dirección B). currentColor → toman
// el acento del tenant dentro del chip que arma KpiTile (ADR-059 D6).
const KPI_ICONS: Record<string, React.ReactNode> = {
  agenda: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18" /></>),
  reloj: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  barras: (<path d="M5 20V10M12 20V4M19 20v-7" />),
  cliente: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>),
  caja: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M8 15h3" /></>),
  alerta: (<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>),
  factura: (<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>),
};

function KpiIcon({ name }: { name: keyof typeof KPI_ICONS }) {
  return (
    <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {KPI_ICONS[name]}
    </svg>
  );
}

// Envoltorio local: el tile en sí vive en `KpiTile` (design system, D6) —
// acá solo queda lo propio de esta página (qué ícono, a qué ruta linkea).
function Kpi({ label, value, href, icon, sub }: { label: string; value: string; href?: string; icon: keyof typeof KPI_ICONS; sub?: string }) {
  const tile = <KpiTile label={label} value={value} icon={<KpiIcon name={icon} />} sub={sub} />;
  return href ? <Link href={href} className="block h-full">{tile}</Link> : tile;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Reservado", cls: "bg-warning-soft text-warning" },
  CONFIRMED: { label: "Confirmado", cls: "bg-success-soft text-success" },
  COMPLETED: { label: "Completado", cls: "bg-info-soft text-info" },
  NO_SHOW: { label: "No se presentó", cls: "bg-danger-soft text-danger" },
};

function StatusBadge({ status }: { status?: string }) {
  const b = (status && STATUS_BADGE[status]) || null;
  if (!b) return null;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME DE MOSTRADOR — lo primero que se ve un sábado a la mañana con cola.
// ─────────────────────────────────────────────────────────────────────────────
//
// Tres decisiones de producto, con su porqué, porque son las que alguien "ordena":
//
// 1. CUATRO tiles, no cinco. La grilla es de 4 columnas; el quinto tile caía solo a
//    una segunda fila. Se fue "Clientes": en un mostrador el que compra es anónimo
//    (el POS no obliga a cargarlo) y el número es un acumulado que no se mueve en
//    todo el día ni tiene una acción atrás. La pantalla de Clientes SIGUE en el menú
//    —MAGRA vende también por la vidriera, con nombre y teléfono—, lo que no tiene
//    lugar es su CONTADOR en el tablero del que atiende.
//    "Ingresos 7 días" no se perdió: bajó a la línea de abajo de "Ingresos hoy". En un
//    mostrador la semana es contexto, no titular.
//
// 2. "CAJA CERRADA" ES UNA ALERTA, NO UN SUBTÍTULO GRIS DE 11 px. Vender con la caja
//    cerrada NO está bloqueado: el movimiento se graba igual pero con `sessionId: null`
//    (src/lib/caja/cash-sale.ts:125-129 y :143-149), y el arqueo del turno suma SÓLO
//    `session.movements` (src/lib/caja-actions.ts:225-230) → esa plata no entra en el
//    conteo del cajón de nadie. Es decir: cada venta en efectivo hecha antes de abrir la
//    caja es un descuadre silencioso al cierre. Por eso, con la caja cerrada, el home
//    muestra una banda con el link para abrirla (mismo patrón que la banda de ausencias
//    del home de agenda, acá abajo) en vez de un `sub` que nadie lee.
//
// 3. EL VOCABULARIO SALE DEL RUBRO, NO DE UN `if`. `itemNoun` viene de la config del
//    rubro (src/blueprints/retail/rubros.ts → wording.itemNoun): "corte" en carnicería,
//    "producto" en velas/pádel, "prenda" en indumentaria. Una carnicería lee "Cortes para
//    reponer"; una tienda de velas, "Productos para reponer". Cero código por rubro.
//
// Lo que NO se pudo poner y haría falta en una carnicería: KILOS vendidos hoy y lo que
// VENCE esta semana. Los kilos existen en el dato (`OrderItem.saleUnit`/`quantity`,
// schema.prisma:1197-1199) pero el loader `getRetailDashboardData` (src/lib/actions.ts:1806)
// no los agrega y ese archivo no es de este frente. Los vencimientos NO existen: no hay
// tabla de lotes en el schema (por eso /admin/lotes muestra "En preparación").

/** Plural simple del sustantivo del rubro: "corte"→"Cortes", "prenda"→"Prendas". */
function pluralTitulo(noun: string): string {
  const n = noun.trim() || "producto";
  const plural = n.endsWith("s") ? n : `${n}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/**
 * Cantidad de stock con formato argentino. El stock es `Float` (schema.prisma:516) porque
 * en un local que vende por peso son KILOS: 12,5 kg de vacío, no 12 paquetes. Sin formatear,
 * `{p.stock}` imprime el float crudo de JavaScript —punto decimal en vez de coma, y la
 * basura de la suma flotante ("12.299999999999999")— en la pantalla donde se decide qué
 * reponer. Entero → sin decimales (no tiene sentido "40,00 un."); fraccionario → dos, que
 * es el detalle útil de un total en kilos.
 */
function fmtCantidadStock(qty: number): string {
  return fmtNumberAR(qty, Number.isInteger(qty) ? 0 : 2);
}

/** "kg" se deja como está; la unidad por defecto ("u"/"unidades") se abrevia legible. */
function unidadCorta(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "u" || u === "unidad" || u === "unidades") return "un.";
  return unit.trim() || "un.";
}

async function RetailHome({
  canSeeRevenue,
  canSeeStock,
  itemNoun,
}: {
  canSeeRevenue: boolean;
  /**
   * `catalog:read`. Sin esa capacidad, /admin/inventario y /admin/compras REDIRIGEN al
   * home (authz.ts:29-35): un tile o un link a esas pantallas sería un botón que te
   * devuelve al mismo lugar del que saliste. Hoy la RECEPCIÓN no la tiene, así que el que
   * atiende el mostrador ve el número de faltantes —sirve para no prometer lo que no hay—
   * pero sin link ni listado. (Que la recepción de un mostrador NO pueda ver el stock es
   * una discusión de capacidades, no de esta pantalla: acá sólo se evita el callejón.)
   */
  canSeeStock: boolean;
  itemNoun: string;
}) {
  const d = await getRetailDashboardData();
  const plural = pluralTitulo(itemNoun);
  // Ticket promedio del día: el número con el que un mostrador se da cuenta de si hoy
  // vendió picada o vendió lomo. Sale de datos que el loader YA trae (no hay consulta
  // nueva). Sin ventas todavía no se muestra: un "$0" de ticket promedio a las 9 de la
  // mañana no informa nada, miente sobre el día.
  const ticketPromedio = d.todaySalesCount > 0 ? d.todayRevenue / d.todaySalesCount : null;
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-strong tracking-tight mb-1">Inicio</h1>
          <p className="text-muted text-sm">Resumen del mostrador.</p>
        </div>
        <Link href="/admin/pedidos" className={buttonClasses("solid", "sm", "whitespace-nowrap")}>
          + Nueva venta
        </Link>
      </div>

      {!d.cashOpen && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg bg-warning-soft border border-warning/25 px-4 py-2.5 text-sm text-warning">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 9v4M12 16h.01" /></svg>
          <span className="flex-1">
            <span className="font-semibold">La caja está cerrada. </span>
            Se puede cobrar igual, pero lo que entre en efectivo no va a figurar en el arqueo
            del turno.
          </span>
          <Link href="/admin/caja" className="font-semibold whitespace-nowrap hover:underline">
            Abrir caja →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Con la caja cerrada no se repite acá: lo dice la banda de arriba, que además
            explica qué se rompe y lleva a abrirla. */}
        <Kpi label="Ventas hoy" value={String(d.todaySalesCount)} href="/admin/pedidos" icon="caja"
          sub={d.cashOpen ? "Caja abierta." : undefined} />
        {canSeeRevenue && (
          // A /admin/caja, no a /admin/reportes: lo que entró HOY, medio por medio, está
          // en la caja del día; reportes es la pantalla del mes.
          <Kpi label="Ingresos hoy" value={fmtMoneyARS(d.todayRevenue, 0)} href="/admin/caja" icon="caja"
            sub={ticketPromedio != null ? `Ticket promedio ${fmtMoneyARS(ticketPromedio, 0)}` : undefined} />
        )}
        {canSeeRevenue && (
          <Kpi label="Ingresos 7 días" value={fmtMoneyARS(d.weekRevenue, 0)} href="/admin/reportes" icon="barras" />
        )}
        <Kpi label={`${plural} para reponer`} value={String(d.lowStockCount)}
          href={canSeeStock ? "/admin/inventario" : undefined} icon="alerta"
          sub={d.lowStockCount > 0 ? "Bajo el mínimo." : "Todo en orden."} />
      </div>

      {canSeeStock && (
      <section className="rounded-xl border border-line bg-surface-raised shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="text-[15px] font-semibold text-strong">{plural} para reponer</h2>
          <Link href="/admin/compras" className="text-[13px] font-medium text-accent hover:underline">Ir a compras →</Link>
        </div>
        {d.lowStock.length === 0 && (
          <p className="text-sm text-muted px-5 py-6">No hay nada por debajo del mínimo.</p>
        )}
        {d.lowStock.slice(0, 8).map((p, i) => (
          <Link key={p.id} href="/admin/inventario"
            className={`flex items-center gap-4 px-5 py-3 text-sm hover:bg-surface-sunken transition-colors ${i > 0 ? "border-t border-line" : ""}`}>
            <span className="flex-1 min-w-0 font-semibold text-strong truncate">{p.name}</span>
            <span className="text-danger font-semibold whitespace-nowrap tabular-nums">
              {fmtCantidadStock(p.stock)} {unidadCorta(p.unit)}
            </span>
            <span className="text-faint text-[13px] whitespace-nowrap tabular-nums">
              mín. {fmtCantidadStock(p.lowStockAt)}
            </span>
          </Link>
        ))}
      </section>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIO POR PRODUCTO (frente identidad-por-producto). El Inicio del backoffice
// deja de ser SIEMPRE la vidriera de estética/agenda: cada producto ve un Inicio
// COHERENTE con lo que es. La `page` elige por producto (getProductoActual):
//   - "comerciante" → Inicio de FACTURACIÓN (KPIs de facturación + estado ARCA +
//                     accesos a la facturación automática). Sin turnos ni agenda.
//   - "vertical"    → el dashboard de agenda de siempre (`InicioVertical`), BYTE-
//                     idéntico para chestetica/magra/etc.
//   - "contador"/"facturita" → el layout ya los redirigió a su casa; si por algún
//                     borde llegan acá, caen al Inicio vertical (genérico y seguro).
// ─────────────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const producto = await getProductoActual();
  if (producto === "comerciante") return <InicioComerciante />;
  return <InicioVertical />;
}

// Inicio del ERP VERTICAL (servicios/agenda o mostrador/retail) — el dashboard de
// SIEMPRE, movido tal cual a su propia función para no tocar su comportamiento. La
// salida es byte-idéntica a la anterior para los verticales.
async function InicioVertical() {
  const user = await requireCapability("dashboard:read");
  // Ingresos = dato financiero: solo quien puede ver reportes (OWNER). La
  // recepción ve el resto del dashboard sin la cifra de facturación.
  const canSeeRevenue = roleHasCapability(user.role, "reports:read");

  // QUIÉN DECIDE SI ESTE LOCAL VE MOSTRADOR O AGENDA.
  //
  // Los módulos activos mandan CUANDO EXISTEN; con el registro apagado —el estado de hoy—
  // manda el RUBRO. El porqué completo (y por qué prender `MODULE_REGISTRY_ENABLED` NO es
  // la salida: dejaría sin menú a beauty-spa, el único tenant vivo) está en
  // src/lib/dashboard-mode.ts. Antes de esto, `dashboardModeForModules(null)` devolvía
  // siempre "servicios" y el home de mostrador —escrito y completo— no se disparaba nunca:
  // una carnicería abría el sistema y veía la agenda de una estética.
  //
  // El rubro se lee con `getCurrentTenantRubro`, la MISMA función con la que el layout
  // resuelve el `isRetail` del menú (layout.tsx:54 → prop del AdminShell). Si el home y la
  // barra usaran resolvedores distintos podrían discrepar y quedaría un home de mostrador
  // con menú de agenda. Si esa lectura fallara, el layout ya habría fallado antes que esta
  // página: no hay nada que el home pueda salvar acá.
  const [activeModules, rubro] = await Promise.all([getActiveModuleIds(), getCurrentTenantRubro()]);
  if (dashboardMode({ activeModules, isRetail: rubro.isRetail }) === "retail") {
    return (
      <RetailHome
        canSeeRevenue={canSeeRevenue}
        canSeeStock={roleHasCapability(user.role, "catalog:read")}
        itemNoun={rubro.rubro?.wording.itemNoun ?? "producto"}
      />
    );
  }
  // Home ANALÍTICO por rol (ADR-059 D8, P1.c del set Empresa): el tenant perfil
  // "Empresa" con rol de visión financiera (OWNER) ve un panel analítico/ejecutivo
  // —lidera lo financiero + un indicador derivado—; el Comercio y los roles
  // operativos ven el home de UNA acción (resumen del día). Es un RE-LAYOUT sobre
  // los MISMOS datos (`getDashboardData`): no hay módulo ni consulta nueva, no toca
  // Neon. Con el motor de perfiles OFF (`profile===null`, default) es byte-idéntico
  // al home de hoy → default-off-identical. El naming al cliente (badge "Empresa")
  // lo pone el shell en canal neutro (ADR-059 D5/D7).
  const profile = await getActiveProfile();
  const analytical = profile === "enterprise" && canSeeRevenue;
  const data = await getDashboardData();

  const confirmedToday = data.todayAppointments.filter((a) => a.status === "CONFIRMED").length;
  const confirmedPct =
    data.todayAppointments.length > 0
      ? `${Math.round((confirmedToday / data.todayAppointments.length) * 100)}%`
      : "—";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-strong tracking-tight mb-1">Inicio</h1>
          <p className="text-muted text-sm">
            {analytical ? "Vista analítica del negocio." : "Resumen del día."}
          </p>
        </div>
        {/* Home de una acción (Comercio): el atajo a la tarea más frecuente es el
            héroe (botón sólido). Home analítico (Empresa): la acción cede el
            protagonismo a los indicadores → botón secundario (ADR-059 D8). */}
        {/* A /turnos/LISTA, no a /turnos: el calendario no tiene formulario de alta
            (el alta vive en la pestaña Lista), así que el atajo a la acción más
            frecuente del negocio caía en una pantalla desde la que NO se puede hacer
            justamente eso. */}
        <Link
          href="/admin/turnos/lista"
          className={buttonClasses(analytical ? "outline" : "solid", "sm", "whitespace-nowrap")}
        >
          + Nuevo turno
        </Link>
      </div>

      {analytical ? (
        // Panel analítico Empresa: lidera lo financiero + un indicador derivado
        // (% de confirmación de hoy), sobre los mismos datos del día.
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi label="Ingresos 7 días" value={fmtMoneyARS(data.weekRevenue, 0)} href="/admin/reportes" icon="barras" sub="ver rentabilidad" />
          <Kpi label="Confirmación hoy" value={confirmedPct} href="/admin/turnos" icon="reloj"
            sub={data.todayAppointments.length > 0 ? `${confirmedToday} de ${data.todayAppointments.length} turnos` : undefined} />
          <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} href="/admin/turnos" icon="agenda" />
          <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" icon="cliente" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi label="Turnos hoy" value={String(data.todayAppointments.length)} href="/admin/turnos" icon="agenda"
            sub={data.todayAppointments.length > 0 ? `${confirmedToday} confirmados` : undefined} />
          {/* Reservados que todavía no llegaron (ver getDashboardData), no todos los PENDING de la
              historia. "a confirmar" y no "a confirmar pago": la seña se cobra al reservar y el
              estado del turno no habla de plata. Va a la LISTA, que es donde están los
              reservados para confirmar; el calendario no los lista. */}
          <Kpi label="Reservados" value={String(data.pendingCount)} href="/admin/turnos/lista" icon="reloj"
            sub={data.pendingCount > 0 ? "a confirmar" : undefined} />
          {canSeeRevenue && (
            <Kpi
              label="Ingresos 7 días"
              value={fmtMoneyARS(data.weekRevenue, 0)}
              href="/admin/reportes"
              icon="barras"
            />
          )}
          <Kpi label="Clientes" value={String(data.clientsCount)} href="/admin/clientes" icon="cliente" />
        </div>
      )}

      {data.blocksToday.length > 0 && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg bg-warning-soft border border-warning/25 px-4 py-2.5 text-sm text-warning">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 9v4M12 16h.01" /></svg>
          <span>
            <span className="font-semibold">Ausencias de hoy: </span>
            {data.blocksToday.map((b, i) => (
              <span key={i}>
                {b.professional.name} ({b.reason})
                {i < data.blocksToday.length - 1 ? " · " : ""}
              </span>
            ))}
          </span>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface-raised shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="text-[15px] font-semibold text-strong">Agenda de hoy</h2>
          <Link href="/admin/turnos" className="text-[13px] font-medium text-accent hover:underline">Ver agenda completa →</Link>
        </div>
        {data.todayAppointments.length === 0 && (
          <p className="text-sm text-muted px-5 py-6">No hay turnos programados para hoy.</p>
        )}
        {/* LA FILA SE APILA EN EL TELÉFONO.
            Antes eran cuatro columnas en una sola línea sin breakpoint: hora (62px fijos),
            cliente+servicio (`flex-1 min-w-0`), badge de estado y profesional
            (`whitespace-nowrap`). El único que podía encogerse era el del cliente, así que
            con una profesional de 19 caracteres su columna caía a 11px y con 23 a 0px: el
            nombre del cliente desbordaba su caja y se pintaba ENCIMA del badge, ilegibles
            los dos. Es la primera pantalla que se abre a la mañana y decía todo menos de
            quién era el turno.
            Ahora en móvil la profesional baja a una segunda línea junto al badge, y el
            nombre del cliente se queda con el ancho completo de la fila. Desde `sm:` vuelve
            la fila de cuatro columnas de siempre, pero con `truncate` en la profesional:
            que se corte con puntos suspensivos el dato secundario, nunca el principal. */}
        {data.todayAppointments.map((a, i) => (
          <Link
            key={a.id}
            href="/admin/turnos"
            className={`flex flex-col items-start gap-1.5 px-5 py-3.5 text-sm transition-colors hover:bg-surface-sunken sm:flex-row sm:items-center sm:gap-4 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="font-semibold text-accent text-xs bg-accent-soft rounded-md px-2 py-1 min-w-[62px] text-center">{fmtTime(a.startsAt)}</span>
            <span className="min-w-0 max-w-full flex-1">
              <span className="font-semibold text-strong">{a.client.name}</span>
              <span className="text-muted"> — {a.service.name}</span>
            </span>
            <span className="flex min-w-0 max-w-full items-center gap-2 sm:contents">
              <StatusBadge status={(a as { status?: string }).status} />
              <span className="min-w-0 truncate text-[13px] text-muted">{a.professional.name}</span>
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIO DEL COMERCIANTE — Inicio de FACTURACIÓN, no la vidriera de un spa.
// Reusa la MISMA data que la pantalla de Facturación automática (kpisFacturacionAction
// / kpisFacturacionBancaria) y el MISMO estado ARCA (getFacturacion + ArcaPill),
// sin consultas nuevas ni tocar la lógica del motor (bancos/MP/ARCA) — solo lectura.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGEN_IMPORTACION_LABEL: Record<string, string> = {
  banco: "Extracto del banco",
  mercadopago: "Mercado Pago",
};

async function InicioComerciante() {
  const user = await requireCapability("dashboard:read");
  // Solo quien puede facturar (OWNER) carga estado fiscal + KPIs: las actions exigen
  // `billing:manage` y su redirect, estando ya en /admin, haría loop. Una recepción de
  // Comerciante (borde raro) ve un Inicio simple, sin las cifras de facturación.
  const canBill = roleHasCapability(user.role, "billing:manage");

  let estado: EstadoFiscal | null = null;
  let kpis: KpisFacturacionBancaria | null = null;
  // La migración de bancos puede no estar aplicada todavía (Gate 2): sus tablas de
  // importación no existen y los KPIs no cargan. En ese caso mostramos el estado honesto
  // + el camino, sin tumbar el Inicio (mismo criterio defensivo que la pantalla de bancos).
  let baseSinAplicar = false;
  if (canBill) {
    estado = (await getFacturacion()).estado;
    try {
      kpis = await kpisFacturacionAction();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "P2021" || code === "P2022") baseSinAplicar = true;
      else throw e;
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Inicio"
        badge={estado ? <ArcaPill estado={estado} /> : undefined}
        description="Tu facturación al día: lo que cobrás por el banco y por Mercado Pago se factura solo."
        actions={
          canBill ? (
            <Link href="/admin/facturacion/bancos" className={buttonClasses("solid", "sm", "whitespace-nowrap")}>
              Subir extracto
            </Link>
          ) : undefined
        }
      />

      {!canBill ? (
        <p className="text-sm text-muted">
          Tu usuario no tiene permiso de facturación. Pedile al dueño del negocio que te habilite
          para ver el tablero de facturación.
        </p>
      ) : baseSinAplicar || !kpis ? (
        <div role="status" className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-xs">
          <p className="mb-2 font-semibold text-strong">Tu facturación automática está por arrancar.</p>
          <p className="mb-4">
            Subí el extracto de tu banco o conectá Mercado Pago y el sistema arma las facturas solo:
            detecta las columnas, separa lo que no se factura y te pide una mano solo cuando hace falta.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/facturacion/bancos" className={buttonClasses("solid", "sm")}>Subir extracto</Link>
            <Link href="/admin/facturacion/bancos" className={buttonClasses("outline", "sm")}>Conectar Mercado Pago</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-xl">
            <Kpi label="Facturado del mes" value={fmtMoneyARS(kpis.montoFacturadoMes, 0)} href="/admin/facturacion" icon="barras" />
            <Kpi label="Facturas emitidas" value={`${fmtNumberAR(kpis.facturasMes)} / ${fmtNumberAR(kpis.capFacturasMes)}`} href="/admin/facturacion" icon="factura"
              sub={`${fmtNumberAR(kpis.capRestante)} disponibles este mes`} />
            <Kpi label="Pendientes de revisión" value={fmtNumberAR(kpis.pendientesRevision)} href="/admin/facturacion/bancos#cola-revision" icon="alerta"
              sub={kpis.pendientesRevision > 0 ? "necesitan tus datos" : "todo al día"} />
            <Kpi label="Listas para emitir" value={fmtNumberAR(kpis.listasParaEmitir)} href="/admin/facturacion/bancos" icon="reloj"
              sub={kpis.listasParaEmitir > 0 ? "en un clic" : undefined} />
          </div>

          <SectionGroup
            title="Facturación automática"
            description="Subí el extracto de tu banco o conectá Mercado Pago: el sistema detecta las columnas, separa lo que no se factura y arma las facturas solo."
          >
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/facturacion/bancos" className={buttonClasses("solid", "sm")}>Subir extracto</Link>
              <Link href="/admin/facturacion/bancos" className={buttonClasses("outline", "sm")}>Conectar Mercado Pago</Link>
              <Link href="/admin/facturacion" className={buttonClasses("ghost", "sm")}>Ver facturas emitidas</Link>
            </div>
          </SectionGroup>

          <section className="rounded-xl border border-line bg-surface-raised shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
              <h2 className="text-[15px] font-semibold text-strong">Últimas importaciones</h2>
              <Link href="/admin/facturacion/bancos" className="text-[13px] font-medium text-accent hover:underline">Ver facturación automática →</Link>
            </div>
            {kpis.ultimasImportaciones.length === 0 ? (
              <p className="text-sm text-muted px-5 py-6">
                Todavía no subiste ningún extracto. El primero se importa desde “Subir extracto”.
              </p>
            ) : (
              kpis.ultimasImportaciones.map((imp, i) => (
                <Link
                  key={imp.id}
                  href="/admin/facturacion/bancos"
                  className={`flex items-center gap-4 px-5 py-3.5 text-sm hover:bg-surface-sunken transition-colors ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-semibold text-strong">{imp.nombreArchivo}</span>
                    <span className="text-[13px] text-muted">{ORIGEN_IMPORTACION_LABEL[imp.origen] ?? imp.origen}</span>
                  </span>
                  <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{fmtNumberAR(imp.totalMovimientos)} mov.</span>
                  <span className="whitespace-nowrap text-[13px] tabular-nums text-faint">{fmtDateTimeAr(imp.createdAt)}</span>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}
