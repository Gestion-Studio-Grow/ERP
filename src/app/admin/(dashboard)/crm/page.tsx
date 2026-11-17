import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { Badge, EmptyState, buttonClasses, atributosBoton } from "@/components/ui";
import { colaDeTrabajo, consultasSinOportunidad, hoy, listarBorradores, listarOportunidades } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "./comun";
import { armarBandeja, dia, puedeEn } from "./crm-core";
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

  // GSG-CRM-018c (V8): lo que entró y no abrió oportunidad, y los avisos de consultas. Sólo Dirección.
  const sinOp = miembro.rol === "DIRECCION" ? await consultasSinOportunidad() : null;

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
      {sinOp?.ok && sinOp.esArm && <ConsultasSinOportunidad consultas={sinOp.consultas} avisos={sinOp.avisos} />}
    </Marco>
  );
}

const POR_QUE: Record<string, string> = { NO_CLIENTE: "El clasificador dice que no es un cliente (proveedor o publicidad)." };

/** GSG-CRM-018c (V8): en un ARM no hay Consultas ni Proyectos; esto es lo único que muestra lo que no abrió oportunidad. */
function ConsultasSinOportunidad({
  consultas,
  avisos,
}: {
  consultas: { id: string; nombre: string; empresa: string | null; canal: string; intencion: string; createdAt: Date; texto: string | null }[];
  avisos: { id: string; texto: string; enlace: string | null; createdAt: Date }[];
}) {
  return (
    <section id="consultas-sin-oportunidad" aria-labelledby="consultas-sin-oportunidad-titulo" className="mt-8 grid gap-6">
      <div>
        <h2 id="consultas-sin-oportunidad-titulo" className="text-lg font-semibold text-strong">Consultas que no abrieron oportunidad</h2>
        <p className="mb-3 text-sm text-muted">Entraron por el formulario y no pasaron al embudo. Miralas por si alguna sí era un cliente.</p>
        {consultas.length === 0 ? (
          <p className="text-sm text-muted">No hay ninguna.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {consultas.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="break-words font-medium text-strong">
                  {c.nombre || "Sin nombre"}
                  {c.empresa ? ` · ${c.empresa}` : ""}
                  <span className="ml-2 text-sm font-normal text-muted">{dia(c.createdAt)} · {c.canal === "WEB" ? "formulario web" : c.canal.toLowerCase()}</span>
                </p>
                <p className="text-sm text-muted">{POR_QUE[c.intencion] ?? "No se pudo abrir la oportunidad: cargala a mano si es un cliente."}</p>
                {c.texto && <p className="mt-1 break-words text-sm text-strong">«{c.texto}»</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {avisos.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-strong">Avisos de consultas</h2>
          <ul className="grid gap-1 text-sm">
            {avisos.map((a) => (
              <li key={a.id} className="break-words">
                <span className="text-muted">{dia(a.createdAt)} · </span>
                {a.enlace ? <Link href={a.enlace} className="text-strong underline underline-offset-2">{a.texto}</Link> : <span className="text-strong">{a.texto}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
