import Link from "next/link";
import { Barra } from "@/components/sitio/Barra";
import { Pie } from "@/components/sitio/Pie";

export default function NoEncontrado() {
  return (
    <>
      <Barra />
      <main id="contenido" className="contenedor" style={{ paddingBlock: "18vh 8vh", display: "grid", gap: 16 }}>
        <p className="rotulo">Error 404</p>
        <h1 className="titulo-xl">Esta página se fue de la foto.</h1>
        <p className="bajada">Revisá el enlace o volvé al inicio.</p>
        <p>
          <Link href="/">Ir al inicio</Link>
        </p>
      </main>
      <Pie />
    </>
  );
}
