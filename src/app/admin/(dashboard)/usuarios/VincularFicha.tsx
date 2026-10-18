import { vincularProfesional } from "@/lib/user-actions";
import SubmitButton from "@/components/SubmitButton";
import { Select, buttonClasses } from "@/components/ui";

// «Su ficha de profesional»: con qué profesional de la agenda entra este usuario. Sin ficha ve la
// agenda vacía. Sólo se ofrecen las fichas libres y la propia.
export default function VincularFicha({
  usuario,
  fichas,
}: {
  usuario: { id: string; name: string; professionalId: string | null };
  fichas: readonly { id: string; nombre: string; usuarioId: string | null }[];
}) {
  const elegibles = fichas.filter((f) => !f.usuarioId || f.usuarioId === usuario.id);
  return (
    <form action={vincularProfesional} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={usuario.id} />
      <Select
        name="professionalId"
        defaultValue={usuario.professionalId ?? ""}
        aria-label={`Ficha de profesional de ${usuario.name}`}
        className="min-w-[9rem] flex-1"
      >
        <option value="">Sin ficha (ve la agenda vacía)</option>
        {elegibles.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nombre}
          </option>
        ))}
      </Select>
      <SubmitButton pendingText="Guardando…" className={buttonClasses("outline", "md", "whitespace-nowrap")}>
        Guardar ficha
      </SubmitButton>
    </form>
  );
}
