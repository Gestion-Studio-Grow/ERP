import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import FormularioObsequio from "./FormularioObsequio";

// La pieza es de CH: su copy, su fecha, su barrio. El proyecto de Vercel es uno
// solo para los cuatro tenants, así que sin esta guarda la campaña de CH
// aparecería también en el sitio de Magra, Shine y Ados Manos.
const TENANT_DE_LA_CAMPANIA = "beauty-spa";

// ============================================================================
// CAMPAÑA DADA DE BAJA (2026-08-16) — la pantalla pública ya no recibe anotados.
// ============================================================================
//
// El obsequio de apertura terminó: 74 personas se anotaron entre el 15 y el 16 de
// agosto. La página se apaga, pero NO se borra ni se borran los datos:
//
//   * los 74 anotados siguen en `LeadCampania`, se ven en /admin/campania y se
//     descargan en CSV desde ahí. Dar de baja la puerta de entrada no toca lo que
//     ya entró — son datos reales de clientas, con su consentimiento fechado;
//   * el formulario queda en el repo, listo para la próxima acción: reactivarlo es
//     poner `CAMPANIA_OBSEQUIO_ACTIVA=true` en el entorno, sin tocar código ni
//     volver a escribirlo.
//
// Mientras esté apagada, la ruta responde 404: para quien llegue por un QR viejo
// es lo mismo que si la página no existiera, que es exactamente lo que queremos
// (una pantalla de "la campaña terminó" invitaría a preguntar por un premio que ya
// se entregó).
function campaniaActiva(): boolean {
  const v = (process.env.CAMPANIA_OBSEQUIO_ACTIVA ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Obsequio de apertura · CH Estética & Spa",
  description: "Completá tus datos para participar del obsequio de apertura.",
  // La página se difunde por QR y por WhatsApp: no queremos que la indexen.
  robots: { index: false, follow: false },
};

export default async function ObsequioPage() {
  if (!campaniaActiva()) notFound();
  const slug = await getCurrentTenantSlug();
  if (slug !== TENANT_DE_LA_CAMPANIA) notFound();

  return <FormularioObsequio />;
}
