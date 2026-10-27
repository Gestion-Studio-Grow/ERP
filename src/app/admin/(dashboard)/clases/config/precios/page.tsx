import { requireApp } from "@/lib/require-app";
import { cn } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { CampoAuto, ChipsAuto } from "../_campo";
import { DURACIONES } from "../reglas/opciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Precios", manifest: "/clases/app.webmanifest" };

// Ajustes → Precios (E2 · M-077): escribís el precio, salís del campo y queda guardado
// («$ 25.000 · guardado»). La duración, en chips. El precio nuevo vale para las clases que se
// agenden de acá en adelante; las ya agendadas conservan el suyo.
export default async function AjustesPrecios() {
  await requireApp("padel-clases");
  const [{ config }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Precios" detalle="Se guarda solo cuando salís del campo." pendientes={numero} />
      <section className={cn(tarjeta, "grid gap-4")} aria-label="Precios y duración">
        <CampoAuto clave="precioIndividual" etiqueta="Clase individual ($)" inicial={config.precioIndividual ? String(config.precioIndividual) : ""} formato="pesos" inputMode="numeric" placeholder="25000" qa="precio-individual" />
        <CampoAuto
          clave="precioGrupal"
          etiqueta="Clase con amigos, por persona ($)"
          inicial={config.precioGrupal ? String(config.precioGrupal) : ""}
          formato="pesos"
          inputMode="numeric"
          placeholder="Vacío = no das clases grupales"
          ayuda="Con 3 personas, cada una paga este precio."
          qa="precio-grupal"
        />
        <ChipsAuto clave="duracionMin" leyenda="Cuánto dura la clase" opciones={[...DURACIONES]} inicial={config.duracionMin} qa="duracion" />
      </section>
      <p className="mt-3 text-sm text-muted">El precio nuevo vale para las clases que agendes de acá en adelante. Las que ya están agendadas quedan con el suyo.</p>
    </main>
  );
}
