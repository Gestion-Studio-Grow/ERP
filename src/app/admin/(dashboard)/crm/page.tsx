import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { Badge, EmptyState, buttonClasses, atributosBoton } from "@/components/ui";
import { colaDeTrabajo, hoy, listarBorradores, listarOportunidades } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "./comun";
import { armarBandeja, puedeEn } from "./crm-core";
import { AccionesHoy } from "./AccionesHoy";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · «Hoy»: qué hago ahora, por urgencia, con la acción en un toque (diseño §4.1). Dirección ve
// todo; el comercial, lo suyo; un puesto, lo que creó, lo que tiene en curso y su cola.

export default async function HoyPage() {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  const descripcion = "Lo que pide una acción tuya, lo más urgente arriba.";
  if (!miembro) return <Marco vista="hoy" miembro={null} descripcion={descripcion}>{bloqueo}</Marco>;

  const [h, l, b, c] = await Promise.all([hoy(), listarOportunidades(), listarBorradores({ estados: ["BORRADOR", "APROBADO"] }), colaDeTrabajo()]);
  const fallo = [h, l, b, c].find((r) => !r.ok);
  if (fallo && !fallo.ok) return <Marco vista="hoy" miembro={miembro} descripcion={descripcion}><NoSePudo motivo={fallo.motivo} faltaMigracion={fallo.faltaMigracion} /></Marco>;
  if (!h.ok || !l.ok || !b.ok || !c.ok) return null;

  const items = armarBandeja({ miembro, entradas: h.entradas, filas: l.filas, borradores: b.borradores, enCola: c.enCola, enCurso: c.enCurso, pedidosEnCola: c.pedidosEnCola, pedidosEnCurso: c.pedidosEnCurso, ahora: new Date() });

  return (
    <Marco vista="hoy" miembro={miembro} descripcion={descripcion}>
      {items.length === 0 ? (
        <EmptyState
          title="Nada urgente por ahora"
          description={miembro.rol === "PUESTO" ? "Tu cola está vacía y no tenés nada en curso." : "No hay borradores ni pases esperando, ni pasos vencidos."}
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <Link href="/admin/crm/embudo" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>Ver el embudo</Link>
              {puedeEn(miembro, "proponer_oportunidad") && <Link href="/admin/crm/nueva" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>Cargar una oportunidad</Link>}
            </span>
          }
        />
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label="Lo que pide una acción, por urgencia">
          {items.map((it) => (
            <li key={it.clave} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:gap-6">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  {it.urgencia >= 80 && <Badge tone="danger">Urgente</Badge>}
                  {it.href ? (
                    <Link href={it.href} className="break-words font-medium text-strong underline-offset-2 hover:underline">{it.titulo}</Link>
                  ) : (
                    <span className="break-words font-medium text-strong">{it.titulo}</span>
                  )}
                </p>
                <ul className="mt-1 grid gap-0.5 text-sm text-muted">
                  {it.por.map((p, i) => <li key={i} className="break-words">{p}</li>)}
                </ul>
              </div>
              <div className="lg:max-w-md">
                {(it.acciones.length > 0 || it.href) && <AccionesHoy acciones={it.acciones} href={it.href} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Marco>
  );
}
