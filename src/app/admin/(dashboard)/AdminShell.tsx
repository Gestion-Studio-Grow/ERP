"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";
import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";

// Cada ítem declara la capacidad que lo habilita; se filtra por el rol del
// usuario. Ocultar acá es UX (ADR-017 §2.e) — la seguridad real la aplican los
// guardas server-side (`requireCapability`) en cada loader/acción.
const ALL_ITEMS: { href: string; label: string; exact?: boolean; cap: Capability }[] = [
  { href: "/admin", label: "Dashboard", exact: true, cap: "dashboard:read" },
  { href: "/admin/turnos", label: "Agenda", cap: "agenda:read" },
  { href: "/admin/clientes", label: "Clientes", cap: "clients:read" },
  { href: "/admin/espera", label: "Lista de espera", cap: "waitlist:manage" },
  { href: "/admin/pedidos", label: "Pedidos", cap: "orders:read" },
  { href: "/admin/catalogo", label: "Catálogo", cap: "catalog:manage" },
  { href: "/admin/resenas", label: "Reseñas", cap: "reviews:manage" },
  { href: "/admin/recordatorios", label: "Recordatorios", cap: "reminders:manage" },
  { href: "/admin/reportes", label: "Reportes", cap: "reports:read" },
  { href: "/admin/auditoria", label: "Auditoría", cap: "audit:read" },
  { href: "/admin/usuarios", label: "Usuarios", cap: "users:manage" },
  { href: "/admin/localizacion", label: "Localización", cap: "location:manage" },
];

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dueña",
  RECEPTION: "Recepción",
  PROFESSIONAL: "Profesional",
};

type NavItem = { href: string; label: string; exact?: boolean };

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

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const isActive = useActive();
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-md px-3 py-3 text-sm ${
              active ? "bg-black text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
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
  return (
    <div className="mt-8 px-3 space-y-3">
      <div className="border-t pt-3">
        <p className="text-sm font-medium text-neutral-700 truncate">{userName}</p>
        <p className="text-xs text-neutral-400">{roleLabel}</p>
      </div>
      <Link
        href="/"
        onClick={onNavigate}
        className="block text-xs text-neutral-500 hover:underline"
      >
        Ver sitio público →
      </Link>
      <form action={logout}>
        <button type="submit" className="text-xs text-neutral-500 hover:underline">
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
}: {
  children: React.ReactNode;
  role: Role;
  userName: string;
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
    <div className="min-h-screen flex bg-white text-neutral-900">
      {/* Sidebar fijo — solo desktop (lg+) */}
      <nav className="hidden lg:flex w-56 shrink-0 flex-col border-r px-3 py-5">
        <div className="px-3 mb-6 font-semibold text-lg text-neutral-800">CH Estética</div>
        <NavLinks items={items} />
        <NavFooter userName={userName} roleLabel={roleLabel} />
      </nav>

      {/* Cajón móvil */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <nav className="relative w-64 max-w-[80%] bg-white h-full px-3 py-5 flex flex-col shadow-xl">
            <div className="px-3 mb-6 flex items-center justify-between">
              <span className="font-semibold text-lg text-neutral-800">CH Estética</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menú"
                className="text-2xl leading-none text-neutral-500 px-2"
              >
                ×
              </button>
            </div>
            <NavLinks items={items} onNavigate={() => setDrawerOpen(false)} />
            <NavFooter
              userName={userName}
              roleLabel={roleLabel}
              onNavigate={() => setDrawerOpen(false)}
            />
          </nav>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar móvil con hamburguesa */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur border-b px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="flex flex-col justify-center gap-1.5 w-9 h-9 -ml-1 items-center rounded-md hover:bg-neutral-100"
          >
            <span className="block h-0.5 w-5 bg-neutral-800" />
            <span className="block h-0.5 w-5 bg-neutral-800" />
            <span className="block h-0.5 w-5 bg-neutral-800" />
          </button>
          <span className="font-medium text-neutral-800">{currentLabel(pathname, items)}</span>
          <span className="ml-auto font-semibold text-neutral-700">CH Estética</span>
        </header>

        {/* Header desktop */}
        <header className="hidden lg:flex border-b px-6 py-4 items-center justify-between gap-4">
          <span className="font-medium text-neutral-700 whitespace-nowrap">CH Estética</span>
          <span className="text-sm text-neutral-500 whitespace-nowrap">Panel de administración</span>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
