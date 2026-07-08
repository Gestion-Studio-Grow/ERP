"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";
import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";
import { moduleGateAllows } from "@/modules/gating";
import { perfilGateAllows, type Perfil } from "@/modules/perfil";
import { NAV_ITEM_GROUPS, readyEnterpriseNavItems, groupNavItems, type NavGroupId } from "@/modules/nav-groups";
import { ProfileBadge } from "@/components/ui";

// Íconos de línea (dirección B): un set chico inline, sin dependencias. Se
// eligen por href. `currentColor` para que hereden el color del ítem (activo =
// acento del tenant, inactivo = muted).
function Icon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
    agenda: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
    clientes: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>),
    espera: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    pedidos: (<><path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 01-8 0" /></>),
    caja: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>),
    catalogo: (<><path d="M4 6h16M4 12h16M4 18h10" /></>),
    compras: (<><path d="M4 5h2l1.2 11a1.5 1.5 0 001.5 1.3h8.1a1.5 1.5 0 001.5-1.2L20 8H7" /><circle cx="9.5" cy="20" r="1" /><circle cx="17" cy="20" r="1" /><path d="M13 4v4M11 6h4" /></>),
    ajustes: (<><path d="M4 8h9M17 8h3M4 16h3M11 16h9" /><circle cx="15" cy="8" r="2" /><circle cx="9" cy="16" r="2" /></>),
    resenas: (<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9z" />),
    recordatorios: (<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />),
    reportes: (<path d="M5 20V10M12 20V4M19 20v-7" />),
    facturacion: (<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>),
    auditoria: (<><path d="M9 12l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="2" /></>),
    usuarios: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 11l2 2 3-3.5" /></>),
    localizacion: (<><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
    modulos: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
    // Ítems Empresa (perfilMin=enterprise). Mismo lenguaje de línea que el resto.
    "cuentas-a-pagar": (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M12 17v-4M10 15l2-2 2 2" /></>),
    contabilidad: (<><path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2z" /><path d="M9 8h7M9 12h7M9 16h4" /></>),
    devoluciones: (<><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 010 10h-2" /></>),
  };
  return (
    <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name] ?? p.dashboard}
    </svg>
  );
}

// Cada ítem declara la capacidad que lo habilita; se filtra por el rol del
// usuario. Ocultar acá es UX (ADR-017 §2.e) — la seguridad real la aplican los
// guardas server-side (`requireCapability`) en cada loader/acción.
// `module` (opcional) ata el ítem a un módulo del catálogo (src/modules): cuando el
// gating está encendido (flag), el ítem se esconde si ese módulo está apagado para el
// tenant. Los ítems SIN `module` son core/config (Dashboard, Ajustes, Usuarios, la
// propia vidriera de Módulos…) y nunca se gatean por módulo — solo por rol.
// `perfilMin`/`grupo` son opcionales: los 17 ítems base no los traen (viven en el set
// Comercio y su grupo lo resuelve `NAV_ITEM_GROUPS`); los ítems Empresa
// (`ENTERPRISE_NAV_ITEMS`) sí, para gatearse por perfil y caer en su grupo.
type ShellItem = { href: string; label: string; icon: string; exact?: boolean; cap: Capability; module?: string; perfilMin?: Perfil; grupo?: NavGroupId };
const ALL_ITEMS: ShellItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, cap: "dashboard:read" },
  { href: "/admin/turnos", label: "Agenda", icon: "agenda", cap: "agenda:read", module: "agenda" },
  { href: "/admin/clientes", label: "Clientes", icon: "clientes", cap: "clients:read", module: "clients" },
  { href: "/admin/espera", label: "Lista de espera", icon: "espera", cap: "waitlist:manage", module: "waitlist" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "pedidos", cap: "orders:read", module: "pos" },
  { href: "/admin/caja", label: "Caja", icon: "caja", cap: "orders:read", module: "pos" },
  { href: "/admin/catalogo", label: "Catálogo", icon: "catalogo", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/compras", label: "Compras", icon: "compras", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "ajustes", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/resenas", label: "Reseñas", icon: "resenas", cap: "reviews:manage", module: "reviews" },
  { href: "/admin/recordatorios", label: "Recordatorios", icon: "recordatorios", cap: "reminders:manage", module: "reminders" },
  { href: "/admin/facturacion", label: "Facturación", icon: "facturacion", cap: "billing:manage", module: "arca" },
  { href: "/admin/reportes", label: "Reportes", icon: "reportes", cap: "reports:read", module: "reports" },
  { href: "/admin/auditoria", label: "Auditoría", icon: "auditoria", cap: "audit:read" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", cap: "users:manage" },
  { href: "/admin/localizacion", label: "Localización", icon: "localizacion", cap: "location:manage" },
  { href: "/admin/modulos", label: "Módulos", icon: "modulos", cap: "modules:manage" },
];

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dueña",
  RECEPTION: "Recepción",
  PROFESSIONAL: "Profesional",
};

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

function useActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

function currentLabel(pathname: string, items: NavItem[]) {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return match?.label ?? "Panel";
}

// Logo del tenant: monograma sobre el acento (contraste AA garantizado por el
// par accent/on-accent del preset) + nombre. Reemplazable por un asset SVG real.
function Brand({ monogram, name }: { monogram: string; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-accent text-on-accent text-[13px] font-bold shadow-xs">{monogram}</span>
      <span className="text-[15px] font-bold tracking-tight text-strong">{name}</span>
    </div>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const isActive = useActive();
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-accent-soft text-accent font-semibold"
                : "text-body font-medium hover:bg-surface-sunken"
            }`}
          >
            <span className={active ? "text-accent" : "text-faint"}><Icon name={item.icon} /></span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// Nav AGRUPADA en 5 grupos de negocio (ADR-059 D3) — detrás del flag maestro
// `NAV_GROUPING_ENABLED` (default OFF; el layout server-side lo resuelve y lo
// pasa como prop `navGrouping`). Reusa `groupNavItems` (S4, `@/modules/nav-groups`)
// sobre los ítems YA filtrados por rol×módulo, y el MISMO <NavLinks> por grupo
// (icono / estado activo / acento idénticos a la nav plana legada). `ungrouped`
// es la red de seguridad de S4: un ítem sin grupo asignado se sigue viendo, no
// desaparece en silencio. Con el flag OFF este componente ni se monta.
function NavGroups({ items, onNavigate }: { items: ShellItem[]; onNavigate?: () => void }) {
  const { groups, ungrouped } = groupNavItems(
    // Grupo de los 17 base: `NAV_ITEM_GROUPS`. Ítems Empresa: traen su propio `grupo`.
    items.map((it) => ({ ...it, grupo: NAV_ITEM_GROUPS[it.href] ?? it.grupo })),
  );
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {g.label}
          </p>
          <NavLinks items={g.items} onNavigate={onNavigate} />
        </div>
      ))}
      {ungrouped.length > 0 && <NavLinks items={ungrouped} onNavigate={onNavigate} />}
    </div>
  );
}

function NavFooter({
  userName,
  roleLabel,
  onNavigate,
}: {
  userName: string;
  roleLabel: string;
  onNavigate?: () => void;
}) {
  const initial = userName.trim().charAt(0).toUpperCase() || "U";
  return (
    <div className="mt-6 pt-4 border-t border-line space-y-1">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-soft text-accent text-sm font-bold shrink-0">{initial}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong truncate">{userName}</p>
          <p className="text-xs text-faint">{roleLabel}</p>
        </div>
      </div>
      <Link
        href="/"
        onClick={onNavigate}
        className="block rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-sunken"
      >
        Ver sitio público →
      </Link>
      <form action={logout}>
        <button type="submit" className="w-full text-left rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-sunken">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

export default function AdminShell({
  children,
  role,
  userName,
  brandName,
  monogram,
  activeModules = null,
  navGrouping = false,
  activeProfile = null,
}: {
  children: React.ReactNode;
  role: Role;
  userName: string;
  brandName: string;
  monogram: string;
  // Ids de módulos activos del tenant, o `null` si el gating está apagado (flag OFF)
  // → no se gatea por módulo. Se resuelve server-side en el layout.
  activeModules?: string[] | null;
  // ¿Nav agrupada en 5 grupos (ADR-059 D3)? Default false = nav plana legada. El
  // layout lo resuelve con `navGroupingEnabled()` (flag `NAV_GROUPING_ENABLED`,
  // default OFF). Reversible de un golpe: OFF → shell idéntico al de hoy.
  navGrouping?: boolean;
  // Perfil activo del tenant (3ª dimensión, ADR-058/059), o `null` si el motor está
  // apagado (flag `PROFILES_ENABLED` OFF, default) → NO se gatea por perfil. Lo
  // resuelve `getActiveProfile()` server-side en el layout. Con `null` la nav es
  // idéntica a la legada (no se suman ítems Empresa). El cliente ve "Comercio"/
  // "Empresa", nunca lite/enterprise (ADR-059 D7).
  activeProfile?: Perfil | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeSet = activeModules === null ? null : new Set(activeModules);
  // Eje PERFIL (ADR-058/059, 3ª dimensión). Con `activeProfile===null` (PROFILES OFF,
  // default) NO se suman ítems Empresa y `perfilGateAllows` deja pasar todo → nav
  // idéntica a la legada. Con perfil Empresa se concatenan los `enterprise-only` cuya
  // PANTALLA ya existe (`readyEnterpriseNavItems`, regla de oro de S1: nada sin ruta →
  // cero callejones sin salida); con perfil Comercio `perfilGateAllows` los filtra.
  // Garantiza `enterprise ⊇ lite`: el Comercio nunca ve MÁS que la nav de hoy, la
  // Empresa ve eso + lo aditivo YA construido. Hoy no hay ítems `ready` → Empresa día-1
  // = piso Comercio re-frameado, sin ítems nuevos (exactamente lo que valida S1).
  const candidateItems: ShellItem[] =
    activeProfile === null ? ALL_ITEMS : [...ALL_ITEMS, ...readyEnterpriseNavItems()];
  const items = candidateItems.filter(
    (item) =>
      roleHasCapability(role, item.cap) &&
      moduleGateAllows(item.module, activeSet) &&
      perfilGateAllows(item.perfilMin, activeProfile),
  );
  const roleLabel = ROLE_LABEL[role];

  // Cerrar el cajón al navegar (cambia el pathname) y con Escape.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-surface text-body">
      {/* Sidebar fijo — solo desktop (lg+) */}
      <nav className="hidden lg:flex w-60 shrink-0 flex-col border-r border-line bg-surface-raised px-3 py-5">
        <div className="px-2 mb-6"><Brand monogram={monogram} name={brandName} /></div>
        {navGrouping ? <NavGroups items={items} /> : <NavLinks items={items} />}
        <div className="mt-auto"><NavFooter userName={userName} roleLabel={roleLabel} /></div>
      </nav>

      {/* Cajón móvil */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-strong/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <nav className="relative w-64 max-w-[80%] bg-surface-raised h-full px-3 py-5 flex flex-col shadow-overlay">
            <div className="px-2 mb-6 flex items-center justify-between">
              <Brand monogram={monogram} name={brandName} />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menú"
                className="text-2xl leading-none text-muted px-2"
              >
                ×
              </button>
            </div>
            {navGrouping ? (
              <NavGroups items={items} onNavigate={() => setDrawerOpen(false)} />
            ) : (
              <NavLinks items={items} onNavigate={() => setDrawerOpen(false)} />
            )}
            <div className="mt-auto">
              <NavFooter
                userName={userName}
                roleLabel={roleLabel}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </nav>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar móvil con hamburguesa */}
        <header className="lg:hidden sticky top-0 z-30 bg-surface-raised/90 backdrop-blur border-b border-line px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="flex flex-col justify-center gap-1.5 w-9 h-9 -ml-1 items-center rounded-md hover:bg-surface-sunken"
          >
            <span className="block h-0.5 w-5 bg-strong" />
            <span className="block h-0.5 w-5 bg-strong" />
            <span className="block h-0.5 w-5 bg-strong" />
          </button>
          <span className="font-medium text-strong">{currentLabel(pathname, items)}</span>
          <span className="ml-auto flex items-center gap-2 min-w-0">
            <span className="font-semibold text-muted truncate">{brandName}</span>
            {/* Edición del tenant (Comercio/Empresa) en canal NEUTRO — solo si el motor
                de perfiles está encendido (activeProfile != null). ADR-059 D5/D7. */}
            {activeProfile && <ProfileBadge profile={activeProfile} />}
          </span>
        </header>

        {/* Header desktop */}
        <header className="hidden lg:flex bg-surface-raised border-b border-line px-8 h-[58px] items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-strong whitespace-nowrap">{brandName}</span>
            {/* Edición (Comercio/Empresa), canal neutro (ADR-059 D5). Default OFF: sin
                perfil activo no se renderiza → header idéntico al legado. */}
            {activeProfile && <ProfileBadge profile={activeProfile} />}
          </div>
          <span className="text-sm text-muted whitespace-nowrap">Panel de administración</span>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
