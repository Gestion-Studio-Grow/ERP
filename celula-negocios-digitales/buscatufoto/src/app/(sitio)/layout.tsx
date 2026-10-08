import { Barra } from "@/components/sitio/Barra";
import { Pie } from "@/components/sitio/Pie";

/** Marco del sitio público y del recorrido del comprador. El panel tiene el suyo. */
export default function LayoutSitio({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Barra />
      <main id="contenido">{children}</main>
      <Pie />
    </>
  );
}
