"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Las apps viven en la barra del panel (src/apps/catalogo/comercial.ts). Acá queda lo que acompaña a todas: buscador y avisos.
export function BarraGestion({ avisos, persona, rol }: { avisos: number; persona: string; rol: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/admin/proyectos/buscar?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      <form onSubmit={buscar} role="search" className="min-w-0 flex-1 basis-56">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar proyectos, proveedores, archivos y mensajes"
          placeholder="Buscar proyectos, proveedores, archivos, mensajes…"
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong"
        />
      </form>
      <Link href="/admin/proyectos/avisos" className="flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-strong">
        Avisos{avisos > 0 && <span className="ml-2 rounded-full bg-accent px-2 text-xs text-on-accent">{avisos}</span>}
      </Link>
      <Link href="/admin/proyectos/configuracion" className="flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-strong">Ajustes</Link>
      <p className="hidden text-sm text-muted xl:block">{persona} · {rol}</p>
    </div>
  );
}
