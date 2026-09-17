// COCKPIT OPERADOR (control-plane, ADR-021 / spec T4). Tablero de mando read-only:
// mapa de tenants, salud de arquitectura, estado de Neon, flujo, alertas críticas y
// plan/roadmap en vivo. 3D via CSS + SVG (cero deps). CERO escrituras.
//
// Reversibilidad: la ruta es aditiva; el link en el nav está detrás de COCKPIT_ENABLED.
// Se accede directo para probar. Datos por poll suave (AutoRefresh), Neon-free-consciente.

import "./cockpit.css";
import Link from "next/link";
import { cargarCockpit } from "@/lib/cockpit/datos";
import { operatorPrisma } from "@/lib/operator-db";
import { modoDesdeEnv } from "@/plugins/arca";
import { checklistApertura, type EstadoApertura } from "@/lib/operador/checklist-apertura";
import { peorEstado } from "@/lib/cockpit/salud";
import AutoRefresh from "./AutoRefresh";
import {
  TenantMap,
  ArchitectureDiagram,
  NeonStatus,
  WorkflowDiagram,
  CriticalPanel,
  PlanRoadmap,
} from "./Widgets";

export const dynamic = "force-dynamic";

const SALUD_HEX: Record<string, string> = { sano: "#10b981", atencion: "#f59e0b", caido: "#ef4444" };

function horaCriolla(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// APERTURAS — una fila por local. Por qué está en el cockpit y no sólo en cada ficha: MAGRA abre
// 5 locales y cada local es un tenant propio; la pregunta del lunes es "¿cuál de los cinco está
// listo?", y esa respuesta no puede exigir entrar de a una en cinco fichas.
//
// Lecturas EN LOTE (4 consultas para TODOS los tenants, no una por tenant): el cockpit se
// auto-refresca cada 30 s contra Neon free, y un N+1 acá se paga en cuota de conexiones.
async function cargarAperturas() {
  const tenants = await operatorPrisma.tenant.findMany({
    select: {
      id: true, name: true, slug: true, blueprintId: true, subdomain: true,
      arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) return [];

  const ids = tenants.map((t) => t.id);
  const [settings, productos, usuarios] = await Promise.all([
    operatorPrisma.businessSettings
      .findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, addressLine: true, instagram: true, whatsapp: true } })
      .catch(() => []),
    operatorPrisma.product
      .findMany({
        where: { tenantId: { in: ids }, deletedAt: null },
        select: { tenantId: true, name: true, price: true, pricePerKg: true },
        take: 2000, // techo defensivo: el chequeo compara contra catálogos semilla de ~20 ítems
      })
      .catch(() => []),
    operatorPrisma.user.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: ids }, active: true, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  // La tabla de credenciales puede no estar aplicada (Gate 2): `null` = "no se sabe", que el
  // evaluador reporta como bloqueo de migración en vez de como "falta cargar el certificado".
  const creds = await operatorPrisma.tenantFiscalCredential
    .findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, certCuit: true } })
    .then((rows) => new Map(rows.map((r) => [r.tenantId, r])))
    .catch(() => null);

  const modoArca = modoDesdeEnv();
  type FilaProducto = (typeof productos)[number];
  const prods = new Map<string, FilaProducto[]>();
  for (const r of productos) {
    const acc = prods.get(r.tenantId);
    if (acc) acc.push(r);
    else prods.set(r.tenantId, [r]);
  }
  const sets = new Map(settings.map((r) => [r.tenantId, r]));
  const users = new Map(usuarios.map((r) => [r.tenantId, r._count._all]));

  return tenants.map((t) => {
    const cred = creds?.get(t.id) ?? null;
    const estado: EstadoApertura = {
      slug: t.slug,
      blueprintId: t.blueprintId,
      subdomain: t.subdomain,
      usuariosActivos: users.get(t.id) ?? 0,
      arcaCuit: t.arcaCuit,
      arcaPuntoVenta: t.arcaPuntoVenta,
      arcaHomologacion: t.arcaHomologacion,
      certificadoCargado: creds === null ? null : Boolean(cred),
      certCuit: cred?.certCuit ?? null,
      modoArca,
      // Ver la nota de la ficha del tenant: la columna `arcaCondicionIva` no existe todavía.
      condicionIvaDisponible: false,
      contacto: sets.get(t.id) ?? null,
      productos: prods.get(t.id) ?? [],
    };
    return { id: t.id, name: t.name, slug: t.slug, ...checklistApertura(estado) };
  });
}

export default async function CockpitPage() {
  const [d, aperturas] = await Promise.all([cargarCockpit(), cargarAperturas()]);

  // Salud global: el peor entre tenants y componentes (el "¿anda todo?" del dueño).
  const global = peorEstado([
    d.resumenTenants.peor,
    ...d.componentes.map((c) => c.estado),
  ]);

  return (
    <div className="space-y-6">
      {/* Encabezado con salud global */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`h-3.5 w-3.5 rounded-full ${global !== "sano" ? "cockpit-pulse" : ""}`}
              style={{ background: SALUD_HEX[global] }}
              aria-hidden
            />
            <h1 className="text-2xl font-semibold">Cockpit</h1>
            <span className="text-sm" style={{ color: SALUD_HEX[global] }}>
              {global === "sano" ? "Anda todo" : global === "atencion" ? "Necesita tu ojo" : "Algo caído"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Estado de la plataforma — solo lectura. No muestra datos de negocio de ningún cliente.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AutoRefresh seconds={30} />
          <span className="text-xs text-faint">última lectura {horaCriolla(d.ts)}</span>
        </div>
      </div>

      {/* Tablero 3D */}
      <div className="cockpit-board space-y-5">
        {/* Fila 1 — lo que el dueño mira primero: qué necesita su ojo */}
        <CriticalPanel alertas={d.alertas} />

        {/* Fila 1.5 — ¿cuál de los locales está listo para abrir? Una fila por tenant. */}
        <section className="rounded-lg border border-line bg-elevated p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Listo para abrir · por local</h2>
            <span className="text-xs text-faint">
              {aperturas.filter((a) => a.listo).length} de {aperturas.length} sin pendientes
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Cada local es un tenant propio. Lo que falta sale del dato real del tenant (precios,
            contacto, fiscal, link, usuarios), no de una lista escrita a mano.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-2 py-2 font-medium">Local</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium">Qué le falta</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {aperturas.map((a) => {
                  const faltan = a.items.filter((i) => i.ok === false);
                  return (
                    <tr key={a.id} className="border-b border-line/50 last:border-0 align-top">
                      <td className="px-2 py-2 text-strong">
                        {a.name} <span className="text-faint text-xs">/{a.slug}</span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span style={{ color: a.listo ? SALUD_HEX.sano : SALUD_HEX.atencion }}>
                          {a.listo ? "✓ listo" : `${a.pendientes} pendiente${a.pendientes === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {faltan.length === 0 ? "—" : faltan.map((i) => i.label).join(" · ")}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <Link href={`/operador/tenants/${a.id}`} className="text-accent hover:underline">
                          Abrir ficha →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {aperturas.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-3 text-muted">Todavía no hay tenants.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fila 2 — mapa de tenants + plan en vivo */}
        <div className="grid gap-5 lg:grid-cols-2">
          <TenantMap tenants={d.tenants} resumen={d.resumenTenants} />
          <PlanRoadmap plan={d.plan} horizontes={d.horizontes} />
        </div>

        {/* Fila 3 — arquitectura + Neon */}
        <div className="grid gap-5 lg:grid-cols-2">
          <ArchitectureDiagram componentes={d.componentes} />
          <NeonStatus neon={d.neon} />
        </div>

        {/* Fila 4 — flujo de trabajo */}
        <WorkflowDiagram flujo={d.flujo} />
      </div>

      {/* Nota de aislamiento (transparencia, ADR-021) */}
      <p className="text-xs text-faint">
        Plano de control (super-admin). Señala lo que requiere tu atención; no ejecuta nada
        irreversible — publicar, migrar y rotar secretos siguen siendo decisión tuya.
      </p>
    </div>
  );
}
