"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";

const items = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/turnos", label: "Agenda" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/catalogo", label: "Catálogo" },
  { href: "/admin/resenas", label: "Reseñas" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/auditoria", label: "Auditoría" },
];

function useActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

function currentLabel(pathname: string) {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return match?.label ?? "Panel";
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
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

function NavFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mt-8 px-3 space-y-3">
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

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        <NavLinks />
        <NavFooter />
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
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <NavFooter onNavigate={() => setDrawerOpen(false)} />
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
          <span className="font-medium text-neutral-800">{currentLabel(pathname)}</span>
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
