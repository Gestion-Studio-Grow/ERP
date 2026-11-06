"use client";

// «Modo simple» por persona (src/lib/modo-simple.ts): la dueña lo prende o lo apaga para cada uno. No
// es un permiso: sólo achica la barra a Hoy, Agenda, Clientes y Caja y esconde lo raro de la plata.
// Cada persona puede salir con «Ver todo» o cambiarlo desde su menú («Ver menos»). Graba con
// `setUserPermission` (la clave `ui:modo-simple`, excepción `ui:` de `decidirCambioDePermiso`).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserPermission } from "@/lib/user-actions";
import { PREFERENCIA_MODO_SIMPLE } from "@/lib/modo-simple";

export type PersonaModoSimple = { id: string; name: string; rol: string; simple: boolean };

export default function ModoSimplePorPersona({ personas, conTabla }: { personas: PersonaModoSimple[]; conTabla: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function cambiar(p: PersonaModoSimple, simple: boolean) {
    setAviso(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("userId", p.id);
        fd.set("capability", PREFERENCIA_MODO_SIMPLE);
        fd.set("allowed", String(simple));
        const r = await setUserPermission(fd);
        if (!r.ok) return setAviso({ ok: false, texto: r.error });
        setAviso({ ok: true, texto: simple ? `${p.name} entra en modo simple.` : `${p.name} ve todo el panel.` });
        router.refresh();
      } catch {
        setAviso({ ok: false, texto: `No se pudo guardar el modo simple de ${p.name}. Probá de nuevo.` });
      }
    });
  }

  return (
    <section aria-labelledby="modo-simple-titulo" className="mt-8">
      <h3 id="modo-simple-titulo" className="text-lg font-semibold text-strong">Modo simple</h3>
      <p className="mb-3 text-sm text-muted">
        Menos botones: Hoy, Agenda, Clientes y Caja. No quita permisos; cada uno vuelve con «Ver todo».
      </p>
      {!conTabla && <p className="mb-3 text-sm text-muted">Todavía no se puede guardar en este negocio: por ahora todos ven el panel completo.</p>}
      <ul className="divide-y divide-line">
        {personas.map((p) => (
          <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
            <label htmlFor={`ms-${p.id}`} className="flex-1">
              <span className="font-medium text-strong">{p.name}</span> <span className="text-sm text-muted">· {p.rol}</span>
            </label>
            <input
              id={`ms-${p.id}`}
              type="checkbox"
              className="h-6 w-6"
              checked={p.simple}
              disabled={!conTabla || pendiente}
              onChange={(e) => cambiar(p, e.target.checked)}
            />
          </li>
        ))}
      </ul>
      <p aria-live="polite" className={aviso ? (aviso.ok ? "mt-2 text-sm text-success" : "mt-2 text-sm text-danger") : "sr-only"}>
        {aviso?.texto ?? ""}
      </p>
    </section>
  );
}
