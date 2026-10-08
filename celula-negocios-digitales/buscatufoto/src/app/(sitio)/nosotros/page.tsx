import type { Metadata } from "next";
import Link from "next/link";
import { BotonLink, IconoFlecha } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";

export const metadata: Metadata = {
  title: "Sobre nosotros",
  description: "Por qué hacemos buscatufoto y cómo trabajamos. Un producto de Gestión Studio Grow.",
};

export default function PaginaNosotros() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Nosotros"
        titulo="Hacemos que la foto llegue a quien sale en ella"
        bajada="buscatufoto es un producto de Gestión Studio Grow, hecho en Argentina."
      />
      <article className={s.hoja}>
        <div className={s.prosa}>
          <h2>Por qué existe</h2>
          <p>
            Después de una carrera o un torneo pasa siempre lo mismo: el fotógrafo tiene cientos de fotos buenas y la gente
            que sale en ellas no sabe dónde encontrarlas. Las que circulan, circulan por capturas de pantalla, y el que
            trabajó no cobra. Queremos que el camino corto sea el correcto: buscarte por tu número, ver tu foto con marca y
            pagarla en un par de toques.
          </p>

          <h2>Cómo lo pensamos</h2>
          <ul>
            <li>
              <strong>El número es la llave.</strong> El dorsal ordena todo: se etiqueta por número y se busca por número.
            </li>
            <li>
              <strong>El original no se muestra antes de pagar.</strong> Es la regla que no se negocia.
            </li>
            <li>
              <strong>Simple para el que está apurado.</strong> El fotógrafo con 800 fotos el lunes y el corredor que entra
              desde el grupo de WhatsApp.
            </li>
          </ul>

          <h2>Cómo trabajamos</h2>
          <p>
            Preferimos decir lo que todavía no está antes que fingirlo. Por eso esta versión es una{" "}
            <strong>demostración</strong>: funciona entera en tu navegador, los pagos y el WhatsApp están simulados y los
            precios de los planes son provisionales a confirmar. La búsqueda por selfie la vamos a sumar cuando esté
            resuelta y probada, no antes.
          </p>
          <p>
            Tampoco vas a ver acá testimonios, logos de clientes ni cifras de usuarios: cuando los tengamos de verdad, los
            vamos a contar.
          </p>

          <h2>Quiénes somos</h2>
          <p>
            buscatufoto es un producto de <strong>Gestión Studio Grow</strong>, un estudio argentino que diseña y construye
            productos digitales. Si querés contarnos cómo trabajás o qué te falta, nos sirve mucho.
          </p>
        </div>
        <div className={s.cierre} style={{ marginTop: 28 }}>
          <BotonLink href="/panel" variante="primario">
            Crear mi álbum
          </BotonLink>
          <Link href="/contacto" className={s.enlace}>
            Escribinos
            <IconoFlecha />
          </Link>
        </div>
      </article>
    </div>
  );
}
