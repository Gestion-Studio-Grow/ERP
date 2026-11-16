import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { EmptyState, Pestanas, buttonClasses, atributosBoton } from "@/components/ui";
import { listarBorradores } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "../comun";
import { puedeEn } from "../crm-core";
import { BorradorTarjeta } from "../BorradorTarjeta";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · «Borradores» (diseño §4.4): los mensajes que escribió el equipo, para aprobar, corregir o
// rechazar con motivo; los aprobados se copian o se abren y, una vez mandados, se marcan como enviados.

const FILTROS = {
  pendientes: { etiqueta: "Por aprobar y por mandar", estados: ["BORRADOR", "APROBADO"] },
  enviados: { etiqueta: "Enviados", estados: ["ENVIADO_POR_PERSONA"] },
  rechazados: { etiqueta: "Rechazados", estados: ["RECHAZADO"] },
} as const;
type Filtro = keyof typeof FILTROS;

export default async function BorradoresPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  const descripcion = "El sistema no manda nada: el mensaje lo mandás vos y después lo marcás como enviado.";
  if (!miembro) return <Marco vista="borradores" miembro={null} descripcion={descripcion}>{bloqueo}</Marco>;
  const { ver } = await searchParams;
  const filtro: Filtro = ver && ver in FILTROS ? (ver as Filtro) : "pendientes";
  const r = await listarBorradores({ estados: [...FILTROS[filtro].estados] });
  if (!r.ok) return <Marco vista="borradores" miembro={miembro} descripcion={descripcion}><NoSePudo motivo={r.motivo} faltaMigracion={r.faltaMigracion} /></Marco>;

  // Quien ve el borrador ya tiene la oportunidad a la vista (el servidor filtró): el botón depende del rol.
  const persona = { tipo: "PROSPECTO", duenoUserId: miembro.userId };
  const puede = { aprobar: puedeEn(miembro, "aprobar_borrador", persona), rechazar: puedeEn(miembro, "rechazar_borrador", persona), enviar: puedeEn(miembro, "marcar_enviado", persona) };

  return (
    <Marco vista="borradores" miembro={miembro} descripcion={descripcion} ancho="max-w-4xl">
      <Pestanas
        etiqueta="Qué borradores ver"
        className="mb-4"
        pestanas={(Object.keys(FILTROS) as Filtro[]).map((k) => ({ href: k === "pendientes" ? "/admin/crm/borradores" : `/admin/crm/borradores?ver=${k}`, etiqueta: FILTROS[k].etiqueta, actual: k === filtro }))}
      />
      {r.borradores.length === 0 ? (
        <EmptyState
          title={filtro === "pendientes" ? "No hay borradores esperando" : "No hay nada acá todavía"}
          description="Los borradores los escribe el equipo (o vos) desde la ficha de cada oportunidad."
          action={<Link href="/admin/crm/embudo" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>Ir al embudo</Link>}
        />
      ) : (
        <ul className="grid gap-4">
          {r.borradores.map((b) => (
            <li key={b.id}>
              <BorradorTarjeta
                b={{ ...b, contexto: [b.marca ?? "Sin marca", b.evento, b.contacto ? `para ${b.contacto}` : null].filter(Boolean).join(" · "), href: `/admin/crm/${b.oportunidadId}` }}
                puede={puede}
              />
            </li>
          ))}
        </ul>
      )}
    </Marco>
  );
}
