"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";
import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";

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
    resenas: (<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9z" />),
    recordatorios: (<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />),
    reportes: (<path d="M5 20V10M12 20V4M19 20v-7" />),
    auditoria: (<><path d="M9 12l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="2" /></>),
    usuarios: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 11l2 2 3-3.5" /></>),
    localizacion: (<><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
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
const ALL_ITEMS: { href: string; label: string; icon: string; exact?: boolean; cap: Capability }[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, cap: "dashboard:read" },
  { href: "/admin/turnos", label: "Agenda", icon: "agenda", cap: "agenda:read" },
  { href: "/admin/clientes", label: "Clientes", icon: "clientes", cap: "clients:read" },
  { href: "/admin/espera", label: "Lista de espera", icon: "espera", cap: "waitlist:manage" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "pedidos", cap: "orders:read" },
  { href: "/admin/caja", label: "Caja", icon: "caja", cap: "orders:read" },
  { href: "/admin/catalogo", label: "Catálogo", icon: "catalogo", cap: "catalog:manage" },
  { href: "/admin/compras", label: "Compras", icon: "compras", cap: "catalog:manage" },
  { href: "/admin/resenas", label: "Reseñas", icon: "resenas", cap: "reviews:manage" },
  { href: "/admin/recordatorios", label: "Recordatorios", icon: "recordatorios", cap: "reminders:manage" },
  { href: "/admin/reportes", label: "Reportes", icon: "reportes", cap: "reports:read" },
  { href: "/admin/auditoria", label: "Auditoría", icon: "auditoria", cap: "audit:read" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", cap: "users:manage" },
  { href: "/admin/localizacion", label: "Localización", icon: "localizacion", cap: "location:manage" },
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
}: {
  children: React.ReactNode;
  role: Role;
  userName: string;
  brandName: string;
  monogram: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = ALL_ITEMS.filter((item) => roleHasCapability(role, item.cap));
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
        <NavLinks items={items} />
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
            <NavLinks items={items} onNavigate={() => setDrawerOpen(false)} />
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
          <span className="ml-auto font-semibold text-muted">{brandName}</span>
        </header>

        {/* Header desktop */}
        <header className="hidden lg:flex bg-surface-raised border-b border-line px-8 h-[58px] items-center justify-between gap-4">
          <span className="font-semibold text-strong whitespace-nowrap">{brandName}</span>
          <span className="text-sm text-muted whitespace-nowrap">Panel de administración</span>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
