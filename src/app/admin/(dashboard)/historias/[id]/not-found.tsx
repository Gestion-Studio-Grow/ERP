import Link from "next/link";
import { PageContainer, buttonClasses } from "@/components/ui";

// La historia que no se abre: no es de este negocio, no existe, o (a una profesional) no es de una
// clienta que atendió. Se dice lo mismo en los tres casos: no se confirma que la clienta existe.
export default function HistoriaNoEncontrada() {
  return (
    <PageContainer width="narrow">
      <h1 className="text-2xl font-semibold text-strong">No encontramos esa historia</h1>
      <p className="mt-2 text-body">Puede que la ficha no exista o que no sea de una clienta que atendiste. Buscala entre tus historias.</p>
      <Link href="/admin/historias" className={buttonClasses("outline", "md", "mt-4")}>
        Ir a Historias
      </Link>
    </PageContainer>
  );
}
