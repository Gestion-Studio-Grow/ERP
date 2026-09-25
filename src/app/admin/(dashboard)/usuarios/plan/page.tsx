import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { leerTuPlan } from "@/lib/uso-del-plan";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClasses, ButtonLink } from "@/components/ui/Button";
import { Franja, Renglon, Seccion } from "@/components/ui/Renglon";
import { enlaceQuieroMas, vistaDeTuPlan } from "./tu-plan";

export const dynamic = "force-dynamic";

// "Tu plan" (R3-F3): qué incluye el plan, cuánto se usa y «Quiero más» por WhatsApp. Sólo el dueño
// (la guardia de Usuarios). CH (beauty-spa) no tiene plan del catálogo ni topes nuevos: no ve nada
// nuevo y vuelve a Usuarios, como siempre.
export default async function TuPlanPage({ searchParams }: { searchParams: Promise<{ "no-se-pudo"?: string }> }) {
  await requireApp("usuarios");
  const tenantId = await getCurrentTenantId();
  const [params, leido] = await Promise.all([searchParams, leerTuPlan(tenantId)]);
  if (!leido || leido.limites.motivoSinPlan === "requiere-ok-del-duenio") redirect("/admin/usuarios");

  const vista = vistaDeTuPlan({ limites: leido.limites, uso: leido.uso, noSePudo: params["no-se-pudo"] });
  const quieroMas = enlaceQuieroMas({
    numero: process.env.WHATSAPP_GSG,
    negocio: leido.nombre,
    nombrePlan: vista.tipo === "plan" ? vista.nombrePlan : null,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Tu plan"
        estado={vista.tipo === "plan" ? [vista.nombrePlan, vista.precio] : ["Sin plan asignado"]}
        actions={
          <>
            <ButtonLink href={quieroMas} target="_blank" rel="noopener noreferrer">
              Quiero más
            </ButtonLink>
            <Link href="/admin/usuarios" className={buttonClasses("outline", "md")}>
              Volver a Usuarios
            </Link>
          </>
        }
      />

      {vista.tipo === "plan" && vista.aviso && (
        <Franja tono={vista.aviso.tono} className="mb-6">
          {vista.aviso.texto}
        </Franja>
      )}

      {vista.tipo === "sin-plan" ? (
        <Seccion titulo="Qué incluye">
          <Renglon titulo="Todavía no hay un plan" detalle={vista.texto} />
        </Seccion>
      ) : (
        <Seccion titulo="Qué incluye y cuánto usás" nota="Este mes">
          {vista.filas.map((f) => (
            <Renglon key={f.id} as="div" titulo={f.nombre} detalle={f.detalle} plata={<span data-nivel={f.nivel}>{f.cifra}</span>} />
          ))}
        </Seccion>
      )}

      <p className="mt-6 text-sm text-muted">
        Para sumar personas, locales o facturas, tocá «Quiero más» y te respondemos por WhatsApp. Tus ventas nunca se frenan por el plan.
      </p>
    </PageContainer>
  );
}
