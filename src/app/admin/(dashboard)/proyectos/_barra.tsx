"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cn } from "@/components/ui";

type Permitidas = { empresa: boolean; direccion: boolean; equipo: boolean; proveedores: boolean; diseno: boolean; ia: boolean };

const APPS: { href: string; label: string; exige?: keyof Permitidas; exacta?: boolean }[] = [
  { href: "/admin/proyectos/inicio", label: "Inicio" },
  { href: "/admin/proyectos", label: "Proyectos", exacta: true },
  { href: "/admin/proyectos/diseno", label: "Diseño", exige: "diseno" },
  { href: "/admin/proyectos/calendario", label: "Calendario" },
  { href: "/admin/proyectos/proveedores", label: "Proveedores", exige: "proveedores" },
  { href: "/admin/proyectos/administracion", label: "Administración", exige: "empresa" },
  { href: "/admin/proyectos/direccion", label: "Dirección", exige: "direccion" },
  { href: "/admin/proyectos/agentes", label: "Agentes IA", exige: "ia" },
  { href: "/admin/proyectos/propuesta-ia", label: "Propuesta con IA", exige: "ia" },
  { href: "/admin/proyectos/mi-liquidacion", label: "Mi liquidación" },
  { href: "/admin/proyectos/equipo", label: "Equipo y permisos", exige: "equipo" },
];

export function BarraGestion({ permitidas, avisos, persona, rol }: { permitidas: Permitidas; avisos: number; persona: string; rol: string }) {
  const ruta = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/admin/proyectos/buscar?q=${encodeURIComponent(q.trim())}`);
  };
  // Una ficha de proyecto pertenece a «Proyectos».
  const activa = (a: (typeof APPS)[number]) =>
    a.exacta ? ruta === a.href || /^\/admin\/proyectos\/(?!inicio|diseno|calendario|proveedores|administracion|direccion|agentes|propuesta-ia|mi-liquidacion|equipo|config|buscar|avisos|reportes|imprimir|presentacion)[^/]+/.test(ruta) : ruta.startsWith(a.href);
  return (
    <aside className="border-b border-line bg-surface-raised lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-3 p-3">
        <form onSubmit={buscar} role="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar proyectos, proveedores, archivos y mensajes"
            placeholder="Buscar…"
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong"
          />
        </form>
        <nav aria-label="Apps de gestión" className="-mx-3 flex gap-1 overflow-x-auto px-3 lg:mx-0 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-0">
          {APPS.filter((a) => !a.exige || permitidas[a.exige]).map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-current={activa(a) ? "page" : undefined}
              className={cn("flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium", activa(a) ? "bg-accent text-on-accent" : "text-strong hover:bg-surface")}
            >
              {a.label}
            </Link>
          ))}
        </nav>
        <div className="hidden gap-2 border-t border-line pt-3 lg:grid">
          <div className="flex gap-2">
            <Link href="/admin/proyectos/avisos" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm text-strong">
              Avisos{avisos > 0 && <span className="ml-2 rounded-full bg-accent px-2 text-xs text-on-accent">{avisos}</span>}
            </Link>
            <Link href="/admin/proyectos/configuracion" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm text-strong">Ajustes</Link>
          </div>
          <p className="text-sm font-medium text-strong">{persona}</p>
          <p className="text-xs text-muted">{rol}</p>
        </div>
        <div className="flex gap-2 lg:hidden">
          <Link href="/admin/proyectos/avisos" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm text-strong">
            Avisos{avisos > 0 && <span className="ml-2 rounded-full bg-accent px-2 text-xs text-on-accent">{avisos}</span>}
          </Link>
          <Link href="/admin/proyectos/configuracion" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm text-strong">Ajustes</Link>
        </div>
      </div>
    </aside>
  );
}
