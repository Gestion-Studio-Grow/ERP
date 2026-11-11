// Lee, parado en el negocio (`enElNegocio`, con RLS), las personas no borradas y las fichas de agenda, y
// arma la tarjeta «Editar una persona». Componente de servidor aparte para no sumar otra lectura al
// `Promise.all` de la ficha. Si la lectura falla, no se ofrece editar (la tarjeta no aparece).
import { enElNegocio } from "@/lib/operator-db";
import { EditarPersonaCard, type FichaDeAgenda, type PersonaEditable } from "./EditarPersonaCard";

export async function EditarPersonaBloque({
  tenantId,
  slug,
  soloLectura,
}: {
  tenantId: string;
  slug: string;
  soloLectura: string | null;
}) {
  const datos = await enElNegocio(tenantId, async (tx) => {
    const personas: PersonaEditable[] = await tx.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, active: true, professionalId: true },
      take: 200, // techo defensivo: la consola edita de a una; un negocio real tiene decenas
    });
    const fichas: FichaDeAgenda[] = (
      await tx.professional.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, user: { select: { id: true } } },
      })
    ).map((f) => ({ id: f.id, nombre: f.name, usuarioId: f.user?.id ?? null }));
    return { personas, fichas };
  }).catch(() => null);
  if (!datos) return null;
  return <EditarPersonaCard tenantId={tenantId} slug={slug} personas={datos.personas} fichas={datos.fichas} soloLectura={soloLectura} />;
}
