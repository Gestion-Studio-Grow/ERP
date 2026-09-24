import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import { getBlueprint } from "@/blueprints";
import {
  setTenantStatus,
  setTenantPlan,
  setTenantBranding,
  setTenantSubdomain,
  setTenantArcaCuit,
  setTenantArcaPuntoVenta,
  cargarCredencialFiscal,
} from "@/lib/operator-actions";
import {
  checklistApertura,
  evaluarListoParaFacturar,
  type EstadoApertura,
  type ItemApertura,
} from "@/lib/operador/checklist-apertura";
import { MODULES, PLANS, TENANT_STATUSES, ACCENT_PRESET_IDS } from "@/lib/operator-config";
import { Card, Field, Input, Select, Textarea, Button, Badge, fmtCuit } from "@/components/ui";
import { modoDesdeEnv } from "@/plugins/arca";
import { operatorReadMustChange } from "@/lib/must-change-password";
import { ResetOwnerPasswordCard } from "./ResetOwnerPasswordCard";
import { catalogo } from "@/modules/catalog";
import {
  appsPorModulo,
  estadoDeApps,
  planFijarAsignacion,
  requiereOkDelDuenio,
  vistaPreviaDeCambio,
  MOTIVO_OK_DEL_DUENIO,
} from "./apps-del-negocio";
import {
  candidatosEnOtraRed,
  flagsDeApps,
  leerInterruptoresDe,
  leerNegocioParaActivar,
  leerRedDeLaFicha,
} from "./negocio.server";
import { InterruptoresCard } from "./InterruptoresCard";
import { INICIO_POR_APPS } from "@/cambios/interruptores";
import { todosApagados } from "@/cambios/interruptores-core";
import { operadorDuenio } from "@/lib/operator-auth";
import { RedDeLocalesCard, type CandidatoLocal } from "./RedDeLocalesCard";
import { MOTIVO_OK_DEL_DUENIO_RED } from "@/lib/multilocal/multilocal-core";
import { AppsDelNegocioCard, type CambioRegistrado, type FilaModuloFicha } from "./AppsDelNegocioCard";
import {
  choqueDePuntoDeVenta,
  listaDePuntosUsados,
  puntosDeVentaUsados,
  type NegocioFiscal,
} from "./candado-punto-venta";

// Estado de la credencial fiscal del tenant (metadata NO sensible). Tolerante a que la
// migración `TenantFiscalCredential` no esté aplicada aún (Gate 2): si la tabla no existe,
// devuelve `null` en vez de romper la ficha.
async function credencialFiscalDe(tenantId: string): Promise<
  { certCuit: string; certNotAfter: Date | null; updatedAt: Date } | null | "pendiente"
> {
  try {
    const r = await operatorPrisma.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certCuit: true, certNotAfter: true, updatedAt: true },
    });
    return r ?? null;
  } catch {
    return "pendiente"; // tabla inexistente (migración sin aplicar)
  }
}

export const dynamic = "force-dynamic";

function blueprintLabel(id: string | null): string {
  if (!id) return "—";
  try { return getBlueprint(id).label; } catch { return id; }
}

const MODO_ARCA_LABEL: Record<string, string> = {
  stub: "Stub (apagado)",
  homologacion: "Homologación (test)",
  real: "Real (producción)",
};

// Fila del "estado fiscal de un vistazo". El ✓/✗ va acompañado de texto (no solo
// color) para accesibilidad. `ok === null` = dato neutro (sin aplicar / no aplica).
function EstadoFiscalRow({ label, ok, valor }: { label: string; ok: boolean | null; valor: string }) {
  const tone = ok === null ? "neutral" : ok ? "success" : "warning";
  const estado = ok === null ? "sin dato" : ok ? "listo" : "falta";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-medium text-strong">
        <span>{valor}</span>
        <Badge tone={tone} dot>
          <span className="sr-only">{estado}: </span>
          {ok === null ? "—" : ok ? "✓" : "✗"}
        </Badge>
      </dd>
    </div>
  );
}

// Fila del checklist de apertura. Muestra el DATO ("12 de 20 al precio del blueprint") y, cuando
// falta, el POR QUÉ: un ítem que sólo dice "falta X" se saltea; uno que dice qué se rompe, no.
function ItemAperturaRow({ item }: { item: ItemApertura }) {
  const tone = item.ok === null ? "neutral" : item.ok ? "success" : "warning";
  const estado = item.ok === null ? "no aplica" : item.ok ? "listo" : "falta";
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-line px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-strong">{item.label}</p>
        <p className="text-xs text-muted">{item.detalle}</p>
        {item.ok === false && <p className="text-xs text-warning mt-0.5">{item.porQue}</p>}
      </div>
      <Badge tone={tone} dot>
        <span className="sr-only">{estado}: </span>
        {item.ok === null ? "—" : item.ok ? "✓" : "✗"}
      </Badge>
    </li>
  );
}

// Los "ok" cortos de las acciones viejas (?ok=estado) se dicen enteros; el resto de las
// acciones ya manda el mensaje armado.
const OK_CORTOS = new Map<string, string>([
  ["estado", "Estado guardado."],
  ["plan", "Plan guardado."],
  ["branding", "Marca guardada."],
  ["link", "Subdominio guardado."],
]);

const ACCIONES_DE_MODULOS = ["module.activate", "module.deactivate", "module.fijar-asignacion"];

/**
 * Un arreglo de ids de la auditoría (`changes` es JSON libre). `null` si el dato no está: una
 * fila vieja sin el antes no puede mostrarse como "no tenía ninguno".
 */
function idsDe(valor: unknown): string[] | null {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : null;
}

/** Los últimos cambios de módulos del negocio, con el antes y el después que dejó la action. */
async function historialDeModulos(tenantId: string): Promise<CambioRegistrado[]> {
  const filas = await operatorPrisma.auditLog.findMany({
    where: { tenantId, action: { in: ACCIONES_DE_MODULOS } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, createdAt: true, actor: true, action: true, changes: true },
  });
  return filas.map((f) => {
    const c = (f.changes && typeof f.changes === "object" && !Array.isArray(f.changes) ? f.changes : {}) as Record<
      string,
      unknown
    >;
    return {
      id: f.id,
      cuando: f.createdAt,
      actor: f.actor,
      accion: f.action,
      modulo: typeof c.modulo === "string" ? c.modulo : null,
      sumados: idsDe(f.action === "module.fijar-asignacion" ? c.agregados : c.incluidos) ?? [],
      antes: idsDe(c.antes),
      // La vidriera del dueño (/admin/modulos) auditaba sólo el resultado, como `modules`.
      despues: idsDe(c.despues) ?? idsDe(c.modules),
    };
  });
}

// CONFIGURACIÓN POR TENANT (control-plane, ADR-021). Cross-tenant vía operatorPrisma.
export default async function TenantConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; bootstrap?: string; ok?: string; error?: string; modulo?: string }>;
}) {
  // Guardia en la página, no sólo en el layout: el layout no se vuelve a ejecutar al navegar
  // del lado del cliente, y esta ficha lee y cambia datos de cualquier negocio.
  const operador = await requireOperator();
  const { id } = await params;
  const { created, bootstrap, ok, error, modulo } = await searchParams;

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id },
    select: {
      id: true, name: true, slug: true, status: true, plan: true, blueprintId: true,
      subdomain: true, modules: true, accentPreset: true, frontTheme: true, createdAt: true,
      arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true,
      _count: { select: { users: true, services: true, products: true, appointments: true, orders: true, clients: true } },
    },
  });
  if (!tenant) notFound();

  const credFiscal = await credencialFiscalDe(tenant!.id);

  // OWNER del tenant + estado de su contraseña temporal (para la tarjeta de reset). Cross-tenant
  // vía operatorPrisma; el estado del flag tolera que la migración Gate 2 no esté aplicada.
  const owner = await operatorPrisma.user.findFirst({
    where: { tenantId: tenant!.id, role: "OWNER", active: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  const ownerTempPending = owner
    ? await operatorReadMustChange(operatorPrisma, owner.id)
    : (false as const);

  // Estado fiscal derivado (para el resumen "de un vistazo" y el semáforo).
  const modoArca = modoDesdeEnv();
  const credLoaded = credFiscal && credFiscal !== "pendiente" ? credFiscal : null;
  const cuitOk = !!tenant!.arcaCuit;
  const certOk = !!credLoaded;
  const puntoVentaOk = typeof tenant!.arcaPuntoVenta === "number" && tenant!.arcaPuntoVenta > 0;
  const certVence = credLoaded?.certNotAfter ? credLoaded.certNotAfter.toISOString().slice(0, 10) : null;
  const cuitCertMismatch = !!(credLoaded && cuitOk && credLoaded.certCuit !== tenant!.arcaCuit);

  // Datos de apertura del local: contacto público y catálogo. Tolerantes a que falten (un tenant
  // recién creado puede no tener BusinessSettings) — la ficha no se rompe por eso.
  const contacto = await operatorPrisma.businessSettings
    .findUnique({
      where: { tenantId: tenant!.id },
      select: { addressLine: true, instagram: true, whatsapp: true },
    })
    .catch(() => null);
  const productos = await operatorPrisma.product
    .findMany({
      where: { tenantId: tenant!.id, deletedAt: null },
      select: { name: true, price: true, pricePerKg: true },
      take: 300, // techo defensivo: el chequeo compara contra el catálogo semilla (~20 ítems)
    })
    .catch(() => []);
  const usuariosActivos = await operatorPrisma.user.count({
    where: { tenantId: tenant!.id, active: true, deletedAt: null },
  });

  const estadoApertura: EstadoApertura = {
    slug: tenant!.slug,
    blueprintId: tenant!.blueprintId,
    subdomain: tenant!.subdomain,
    usuariosActivos,
    arcaCuit: tenant!.arcaCuit,
    arcaPuntoVenta: tenant!.arcaPuntoVenta,
    arcaHomologacion: tenant!.arcaHomologacion,
    certificadoCargado: credFiscal === "pendiente" ? null : certOk,
    certCuit: credLoaded?.certCuit ?? null,
    modoArca,
    // HOY siempre false: la columna `arcaCondicionIva` está declarada schema-ahead en
    // src/lib/fiscal.ts:108-119 pero su migración NO está aplicada. Cuando se aplique, esto pasa
    // a leer el dato del tenant. Importa porque en producción fiscal sin condición de IVA
    // `construirPerfilFiscal` LANZA (fiscal.ts:208-217) y la factura no sale.
    condicionIvaDisponible: false,
    contacto,
    productos,
  };

  // El semáforo "listo para facturar" sale del MISMO evaluador que usa el checklist y que copia
  // las condiciones de `construirPerfilFiscal`. Antes miraba sólo CUIT + certificado + modo: daba
  // VERDE sin punto de venta, y ahí el perfil fiscal lanza, la venta se cobra igual (la emisión es
  // best-effort dentro de un try/catch) y la factura no sale hasta que alguien lo nota a fin de mes.
  const fiscal = evaluarListoParaFacturar(estadoApertura);
  const listoParaFacturar = fiscal.listo;
  const apertura = checklistApertura(estadoApertura);

  // Candado fiscal: los otros negocios con este CUIT. Si ya comparten punto de venta (dato
  // cargado antes del candado), se avisa; y al lado del campo se listan los que ya están usados.
  const otrosDelCuit: NegocioFiscal[] = tenant!.arcaCuit
    ? await operatorPrisma.tenant.findMany({
        where: { arcaCuit: tenant!.arcaCuit, id: { not: tenant!.id } },
        select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
      })
    : [];
  const choquePv = choqueDePuntoDeVenta(
    { tenantId: tenant!.id, cuit: tenant!.arcaCuit, puntoVenta: tenant!.arcaPuntoVenta },
    otrosDelCuit,
  );
  const pvUsados = puntosDeVentaUsados(tenant!.id, tenant!.arcaCuit, otrosDelCuit);

  // Apps del negocio: lo que ve hoy, si su asignación lo reproduce con el Inicio por apps, y la
  // vista previa del módulo que se quiere cambiar (`?modulo=`). Todo sale de apps-del-negocio.ts.
  const negocio = await leerNegocioParaActivar(tenant!.id);
  if (!negocio) notFound();
  const cat = catalogo();
  // El interruptor "Trabaja por apps" de este negocio, leído de la base (antes era una variable
  // del deploy, retirada). Si no se pudo leer, la vista previa mira como apagado y la tarjeta
  // no ofrece cambiarlo.
  const interruptores = await leerInterruptoresDe(tenant!.id);
  const flags = flagsDeApps(interruptores?.estado ?? todosApagados());
  const duenio = operadorDuenio();
  const estadoApps = estadoDeApps(negocio!, flags, cat);
  const fijar = planFijarAsignacion(negocio!, flags, cat);
  const appsDeCadaModulo = appsPorModulo();
  const activos = new Set(negocio!.modules);
  const filasModulos: FilaModuloFicha[] = MODULES.map((m) => ({
    id: m.id,
    nombre: m.label,
    descripcion: m.description,
    plugin: !!m.plugin,
    activo: activos.has(m.id),
    apps: appsDeCadaModulo.get(m.id) ?? 0,
  }));
  const moduloPrevia = modulo?.trim() || null;
  const accionPrevia = moduloPrevia && activos.has(moduloPrevia) ? "desactivar" : "activar";
  const previa = moduloPrevia
    ? {
        moduloId: moduloPrevia,
        modulo: filasModulos.find((m) => m.id === moduloPrevia) ?? null,
        accion: accionPrevia,
        plan: vistaPreviaDeCambio(negocio!, { accion: accionPrevia, modulo: moduloPrevia }, flags, cat),
      } as const
    : null;
  const historial = await historialDeModulos(tenant!.id);

  // Red de locales: la del negocio (si es casa) y los negocios que se le pueden sumar. La lista
  // es comodidad del formulario: lo que decide es `validarVinculo`, adentro de la transacción.
  // Se ofrecen los que no son casa ni estudio contable, ni CH (sólo con el OK del dueño). Los
  // que ya son local de OTRA red se muestran sin poder elegirse, con el nombre de esa casa.
  const red = await leerRedDeLaFicha(tenant!.id);
  const esCasa = activos.has("multilocal");
  const posibles = esCasa
    ? (
        await operatorPrisma.tenant.findMany({
          where: { id: { not: tenant!.id } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true, modules: true },
        })
      ).filter((t) => !t.modules.includes("multilocal") && !t.modules.includes("cartera") && !requiereOkDelDuenio(t.slug))
    : [];
  const enOtraRed = await candidatosEnOtraRed(posibles.map((t) => t.id), tenant!.id);
  const candidatosRed: CandidatoLocal[] = posibles.map(({ id, name, slug }) => ({
    id,
    name,
    slug,
    enOtraRed: enOtraRed.get(id) ?? null,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/operador" className="text-sm text-muted hover:text-strong">← Tenants</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-semibold">{tenant!.name}</h1>
          <Badge tone={tenant!.status === "ACTIVE" ? "success" : tenant!.status === "SUSPENDED" ? "danger" : "info"} dot>
            {tenant!.status}
          </Badge>
        </div>
        <p className="text-muted text-sm mt-1">
          /{tenant!.slug} · {blueprintLabel(tenant!.blueprintId)} · {tenant!._count.users} usuarios ·{" "}
          {tenant!._count.clients} clientes
        </p>
      </div>

      {created && (
        <div className="rounded-md bg-success-soft text-success text-sm px-3 py-2">
          Tenant provisionado.
          {bootstrap && (
            <span className="block mt-1">
              🔑 Contraseña de bootstrap del OWNER (se muestra <b>una sola vez</b>, comunicala por canal seguro):{" "}
              <code className="font-mono">{bootstrap}</code>
            </span>
          )}
        </div>
      )}
      {ok && (
        <div role="status" className="rounded-md bg-success-soft text-success text-sm px-3 py-2 break-words">
          {OK_CORTOS.get(ok) ?? ok}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2 whitespace-pre-wrap break-words">
          {error}
        </div>
      )}

      {/* Listo para abrir — el checklist del local (lo que el alta NO automatiza) */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Listo para abrir</h2>
          <Badge tone={apertura.listo ? "success" : "warning"} dot>
            {apertura.listo ? "sin pendientes" : `${apertura.pendientes} pendiente${apertura.pendientes === 1 ? "" : "s"}`}
          </Badge>
        </div>
        <p className="text-sm text-muted">
          El alta automatiza un paso de la apertura; estos son los que quedan a mano y se olvidan
          cuando abren varios locales juntos. Es dato real de este tenant, no una lista escrita a mano.
        </p>
        <ul className="space-y-2">
          {apertura.items.map((i) => <ItemAperturaRow key={i.id} item={i} />)}
        </ul>
      </Card>

      {/* Estado + Plan */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="font-medium">Estado</h2>
          <form action={setTenantStatus} className="flex items-end gap-2">
            <input type="hidden" name="tenantId" value={tenant!.id} />
            <Field label="Estado del tenant" className="flex-1">
              <Select name="status" defaultValue={tenant!.status}>
                {TENANT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="outline" size="sm">Guardar</Button>
          </form>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-medium">Plan</h2>
          <form action={setTenantPlan} className="flex items-end gap-2">
            <input type="hidden" name="tenantId" value={tenant!.id} />
            <Field label="Plan comercial" className="flex-1">
              <Select name="plan" defaultValue={tenant!.plan ?? ""}>
                <option value="">(sin plan)</option>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="outline" size="sm">Guardar</Button>
          </form>
        </Card>
      </div>

      {/* Branding */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Marca / acento</h2>
        <form action={setTenantBranding} className="grid md:grid-cols-3 gap-3 items-end">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Acento">
            <Select name="accentPreset" defaultValue={tenant!.accentPreset ?? ""}>
              <option value="">(default)</option>
              {ACCENT_PRESET_IDS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="Tema vidriera">
            <Select name="frontTheme" defaultValue={tenant!.frontTheme ?? ""}>
              <option value="">(default)</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </Select>
          </Field>
          <Button type="submit" variant="outline" size="sm">Guardar</Button>
        </form>
      </Card>

      {/* Subdominio / link */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Link / subdominio</h2>
        <p className="text-sm text-muted">La URL propia del tenant (cada tenant con su routing). Debe ser único.</p>
        <form action={setTenantSubdomain} className="flex items-end gap-2">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Subdominio" className="flex-1">
            <Input name="subdomain" defaultValue={tenant!.subdomain ?? ""} placeholder="estetica-norte" />
          </Field>
          <Button type="submit" variant="outline" size="sm">Guardar</Button>
        </form>
      </Card>

      {/* Facturación electrónica · ARCA (CUIT + credencial por tenant, ADR-066) */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium">Facturación electrónica · ARCA</h2>
          <p className="text-sm text-muted">
            Para emitir hacen falta tres cosas, <b>en este orden</b>: <b>1)</b> el CUIT del emisor,{" "}
            <b>2)</b> el punto de venta que ARCA le habilitó y <b>3)</b> su certificado ARCA. El sistema firma <b>solo</b> si el CUIT del certificado coincide
            con el del tenant (guard fail-closed, ADR-066). El material nunca se muestra ni se loguea.
          </p>
        </div>

        {/* Estado fiscal de un vistazo */}
        <dl className="grid sm:grid-cols-2 gap-2 text-sm">
          <EstadoFiscalRow
            label="CUIT del emisor"
            ok={cuitOk}
            valor={cuitOk ? fmtCuit(tenant!.arcaCuit) : "sin cargar"}
          />
          <EstadoFiscalRow
            label="Punto de venta"
            ok={puntoVentaOk}
            valor={puntoVentaOk ? String(tenant!.arcaPuntoVenta) : "sin cargar"}
          />
          <EstadoFiscalRow
            label="Certificado"
            ok={credFiscal === "pendiente" ? null : certOk}
            valor={credFiscal === "pendiente" ? "tabla pendiente" : certOk ? "cargado" : "sin cargar"}
          />
          <EstadoFiscalRow
            label="Vence el certificado"
            ok={certVence ? true : null}
            valor={certVence ?? "—"}
          />
          <EstadoFiscalRow
            label="Modo ARCA (plataforma)"
            ok={modoArca !== "stub"}
            valor={MODO_ARCA_LABEL[modoArca]}
          />
        </dl>

        {/* Semáforo: ¿listo para facturar? */}
        {listoParaFacturar ? (
          <div role="status" className="rounded-md bg-success-soft text-success text-sm px-3 py-2">
            ✓ Listo para facturar en modo <b>{MODO_ARCA_LABEL[modoArca]}</b>.
          </div>
        ) : (
          <div role="status" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
            <b>Todavía no está listo para facturar.</b> Si vende así, el cobro entra igual y la
            factura no sale (la emisión es best-effort): el descuadre aparece a fin de mes.
            <ul className="mt-1 space-y-0.5">
              {fiscal.faltantes.map((f) => <li key={f}>• {f}</li>)}
            </ul>
            {fiscal.bloqueadoPorMigracion && (
              <span className="block mt-1 text-xs">
                Hay faltantes que <b>no se resuelven desde acá</b>: necesitan una migración aprobada por el dueño.
              </span>
            )}
          </div>
        )}

        {choquePv && (
          <div role="alert" className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2 break-words">
            El punto de venta <b>{tenant!.arcaPuntoVenta}</b> de este CUIT también lo tiene «{choquePv.name}»
            (/{choquePv.slug}). Los dos numeran el mismo talonario en ARCA y las facturas se rechazan: cargale a
            uno de los dos un punto de venta propio.
          </div>
        )}

        {cuitCertMismatch && (
          <div role="alert" className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            El CUIT del tenant (<code>{fmtCuit(tenant!.arcaCuit)}</code>) no coincide con el del certificado
            cargado (<code>{fmtCuit(credLoaded!.certCuit)}</code>). La firma lo va a rechazar: corregí el CUIT
            o volvé a cargar el certificado del CUIT correcto.
          </div>
        )}

        {/* Paso 1 — CUIT del emisor */}
        <form action={setTenantArcaCuit} className="space-y-2 border-t border-line pt-4">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Paso 1 · CUIT del emisor">
            <div className="flex items-end gap-2">
              <Input
                name="arcaCuit"
                defaultValue={tenant!.arcaCuit ?? ""}
                placeholder="20-30405060-7"
                inputMode="numeric"
                autoComplete="off"
                className="flex-1 font-mono"
                aria-describedby="cuit-hint"
              />
              <Button type="submit" variant="outline" size="sm">Guardar CUIT</Button>
            </div>
          </Field>
          <p id="cuit-hint" className="text-xs text-muted">
            11 números (con o sin guiones/puntos). Se valida el dígito verificador. Dejalo vacío para borrarlo.
          </p>
        </form>

        {/* Paso 2 — Punto de venta habilitado en ARCA */}
        <form action={setTenantArcaPuntoVenta} className="space-y-2 border-t border-line pt-4">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Paso 2 · Punto de venta de ARCA">
            <div className="flex items-end gap-2">
              <Input
                name="arcaPuntoVenta"
                defaultValue={tenant!.arcaPuntoVenta ?? ""}
                placeholder="4"
                inputMode="numeric"
                autoComplete="off"
                className="flex-1 font-mono"
                aria-describedby="pv-hint"
              />
              <Button type="submit" variant="outline" size="sm">Guardar punto de venta</Button>
            </div>
          </Field>
          <p id="pv-hint" className="text-xs text-muted">
            El número que ARCA habilitó para este CUIT (1 a 99999). <b>Sin esto no se puede emitir:</b>{" "}
            el sistema cobra la venta y la factura queda sin salir. Dejalo vacío para borrarlo.
            {pvUsados.length > 0 && (
              <span className="block mt-1 break-words">
                Este CUIT ya usa en otros negocios: {listaDePuntosUsados(pvUsados)}. Cada local va con uno propio.
              </span>
            )}
          </p>
        </form>

        {/* Paso 3 — Certificado ARCA */}
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-medium">Paso 3 · Certificado ARCA</h3>

          {credFiscal === "pendiente" ? (
            <div role="alert" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
              La tabla de credenciales fiscales todavía no está en la base (migración pendiente · Gate 2).
              Aplicá <code>TenantFiscalCredential</code> para poder cargar certificados.
            </div>
          ) : credLoaded ? (
            <div className="rounded-md border border-line px-3 py-2 text-sm">
              <Badge tone="success" dot>Cargada</Badge>{" "}
              CUIT del cert: <code>{fmtCuit(credLoaded.certCuit)}</code>
              {certVence && <> · vence {certVence}</>}
              <span className="block text-xs text-muted mt-1">
                Actualizada {credLoaded.updatedAt.toISOString().slice(0, 10)}.
              </span>
            </div>
          ) : (
            <div className="rounded-md border border-line px-3 py-2 text-sm text-muted">
              <Badge tone="info" dot>Sin credencial</Badge> Cargá primero el CUIT y el punto de venta (Pasos 1 y 2), después el certificado.
            </div>
          )}

          {!cuitOk && credFiscal !== "pendiente" && (
            <div role="alert" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
              Cargá el <b>CUIT (Paso 1)</b> antes del certificado: el guard compara el CUIT del cert contra el del tenant.
            </div>
          )}

          <form action={cargarCredencialFiscal} className="space-y-3">
            <input type="hidden" name="tenantId" value={tenant!.id} />
            <Field label="Certificado (PEM)">
              <Textarea
                name="certPem"
                rows={4}
                required
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Clave privada (PEM)">
              <Textarea
                name="keyPem"
                rows={4}
                required
                placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                className="font-mono text-xs"
              />
            </Field>
            <Button type="submit" variant="outline" size="sm">
              {credLoaded ? "Rotar credencial" : "Cargar credencial"}
            </Button>
          </form>
        </div>
      </Card>

      {/* Contraseña del OWNER — reset con revelado único */}
      <ResetOwnerPasswordCard
        tenantId={tenant!.id}
        ownerEmail={owner?.email ?? null}
        tempPending={ownerTempPending}
      />

      {/* Red de locales: la única puerta para que un negocio lea datos de otro (auditada en los dos) */}
      <RedDeLocalesCard
        tenantId={tenant!.id}
        nombre={tenant!.name}
        esCasa={esCasa}
        tieneCartera={activos.has("cartera")}
        bloqueo={requiereOkDelDuenio(negocio!.slug) ? MOTIVO_OK_DEL_DUENIO_RED : null}
        red={red}
        candidatos={candidatosRed}
      />

      {/* Trabaja por apps: el interruptor por negocio, con vista previa e historial */}
      <InterruptoresCard
        tenantId={tenant!.id}
        slug={tenant!.slug}
        modulosVistos={negocio!.modules}
        estado={interruptores?.estado[INICIO_POR_APPS] ?? null}
        apps={estadoApps}
        historial={interruptores?.historial ?? []}
        candado={requiereOkDelDuenio(negocio!.slug) ? { puedeTocar: operador === duenio, duenio } : null}
      />

      {/* Apps del negocio: módulos con vista previa, activación auditada y "fijar asignación" */}
      <AppsDelNegocioCard
        tenantId={tenant!.id}
        vistos={negocio!.modules}
        estado={estadoApps}
        fijar={fijar}
        modulos={filasModulos}
        previa={previa}
        historial={historial}
        bloqueo={requiereOkDelDuenio(negocio!.slug) ? MOTIVO_OK_DEL_DUENIO : null}
      />
    </div>
  );
}
