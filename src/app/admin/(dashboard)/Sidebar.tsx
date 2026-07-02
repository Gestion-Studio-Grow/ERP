"use client";

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
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-40 sm:w-56 shrink-0 border-r px-2 sm:px-3 py-5">
      <div className="px-3 mb-6 font-semibold text-lg text-neutral-800">Beauty &amp; Spa</div>
      <div className="space-y-1">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-8 px-3 space-y-2">
        <Link href="/reserva" className="block text-xs text-neutral-500 hover:underline">
          Ver reserva pública →
        </Link>
        <form action={logout}>
          <button type="submit" className="text-xs text-neutral-500 hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </nav>
  );
}
