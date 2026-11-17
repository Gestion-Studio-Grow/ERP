import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { AvisoError } from "@/components/ui";
import { eventosParaElegir } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco } from "../comun";
import { etiquetaDeEvento, fechaDeManana, puedeEn } from "../crm-core";
import { FormularioNueva } from "./FormularioNueva";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · «Cargar»: una consulta que entró (una persona) o un prospecto (una persona o un puesto que
// propone). Quien no puede proponer no ve la pestaña; si entra por la dirección, se le dice y tiene la salida.

export default async function NuevaPage() {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  const descripcion = "Toda oportunidad nace con su próximo paso y una fecha.";
  if (!miembro) return <Marco vista="nueva" miembro={null} descripcion={descripcion}>{bloqueo}</Marco>;
  if (!puedeEn(miembro, "proponer_oportunidad")) {
    return (
      <Marco vista="nueva" miembro={miembro} descripcion={descripcion} ancho="max-w-3xl">
        <AvisoError tono="aviso" titulo="Desde tu puesto no se cargan oportunidades" comoSeguir="Las cargan Dirección, los comerciales y los puestos que buscan marcas." accion={<Link href="/admin/crm" className="text-accent underline underline-offset-2">Volver a Hoy</Link>} />
      </Marco>
    );
  }
  const ev = await eventosParaElegir();
  const eventos = ev.ok ? ev.eventos.map((e) => ({ id: e.id, etiqueta: etiquetaDeEvento(e) })) : [];
  const persona = miembro.rol !== "PUESTO";
  return (
    <Marco vista="nueva" miembro={miembro} descripcion={descripcion} ancho="max-w-3xl">
      <FormularioNueva puedeConsulta={persona} puedeContacto={puedeEn(miembro, "crear_contacto")} eventos={eventos} manana={fechaDeManana()} />
    </Marco>
  );
}
