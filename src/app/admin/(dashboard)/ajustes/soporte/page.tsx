import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireUser } from "@/lib/authz";
import { soporteGsgPrendidoEn } from "@/lib/soporte/interruptor.server";
import { PageContainer, PageHeader } from "@/components/ui";
import { leerConsentimiento, leerEstadoDelPermiso, ultimaCopiaEnBorrador } from "@/lib/soporte/consentimiento.server";
import PermisoSoporte from "./PermisoSoporte";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Soporte GSG",
  // Sello GSG (estándar de marca): el tenant conserva SU marca visible; GSG firma como generador.
  generator: "Gestión Studio Grow",
};

// SOPORTE GSG — el permiso del titular para la IA de soporte (MANT-003, D4). La app es sólo del
// titular (`users:manage` en el registro); lo CAMBIA sólo el OWNER, y eso lo vuelve a decidir la action en el
// servidor con la sesión, no esta pantalla. El negocio es el de la sesión. Sin la tabla (Gate 2 sin
// aplicar) se dice claro y no se ofrece guardar.
//
// Detrás del interruptor «Soporte GSG» (apagado por defecto, decisión del dueño 14/11/2026): apagado
// en el negocio de la sesión, la ruta responde «no encontrado» ANTES de la guardia de la app, para no
// contar a nadie que la pantalla existe. EXCEPCIÓN: el titular con un permiso vigente (dado antes del
// apagado) entra EN PAUSA, sólo para sacarlo; el servidor rechaza dar con el interruptor apagado.
export default async function SoportePage() {
  const sesion = await requireUser();
  const prendido = await soporteGsgPrendidoEn(sesion.tenantId);
  if (!prendido) {
    const vigente = sesion.role === "OWNER" ? await leerConsentimiento(sesion.tenantId) : null;
    if (!vigente || !(vigente.n1 || vigente.n2)) notFound();
  }
  const enPausa = !prendido;
  const user = await requireApp("permiso-soporte");
  const esTitular = user.role === "OWNER";
  // La copia lleva el mail del titular: sólo la ve él.
  const [estado, copia] = await Promise.all([leerEstadoDelPermiso(user.tenantId), esTitular ? ultimaCopiaEnBorrador(user.tenantId) : null]);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Soporte GSG"
        description="Si querés, asistentes de IA preparan las respuestas a tus pedidos de soporte. Una persona de GSG las revisa antes de mandártelas."
      />
      <PermisoSoporte
        habilitado={estado.habilitado}
        vigente={estado.vigente}
        esTitular={esTitular}
        enPausa={enPausa}
        ultimaCopia={copia ? { para: copia.para, asunto: copia.asunto, cuerpo: copia.cuerpo } : null}
      />
    </PageContainer>
  );
}
