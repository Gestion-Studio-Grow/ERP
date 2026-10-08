import type { Metadata } from "next";
import Link from "next/link";
import { IconoFlecha, Tarjeta } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import { FormContacto } from "@/components/inicio/FormContacto";
import s from "@/components/inicio/paginas.module.css";
import { CORREO_CONTACTO } from "@/lib/contenido/textos";

export const metadata: Metadata = {
  title: "Contacto y soporte",
  description: "Escribinos por dudas, sugerencias o problemas con buscatufoto.",
};

export default function PaginaContacto() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Contacto"
        titulo="Escribinos"
        bajada="Dudas, ideas o algo que no anda: leemos todo. Antes, fijate si está en las preguntas frecuentes."
      />
      <div className={s.dosColumnas}>
        <div className={s.datos}>
          <div>
            <p className={s.datosTitulo}>Correo</p>
            <p>
              <a href={`mailto:${CORREO_CONTACTO}`}>{CORREO_CONTACTO}</a>
              <br />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>provisional a confirmar</span>
            </p>
          </div>
          <div>
            <p className={s.datosTitulo}>Antes de escribir</p>
            <Link href="/preguntas" className={s.enlace}>
              Preguntas frecuentes
              <IconoFlecha />
            </Link>
          </div>
          <div>
            <p className={s.datosTitulo}>Si sos corredor</p>
            <p>
              Para dudas sobre una foto puntual, lo más rápido es escribirle al fotógrafo del álbum, que es quien la
              sacó y la vende.
            </p>
          </div>
        </div>
        <section id="soporte" aria-labelledby="titulo-soporte">
          <Tarjeta>
            <FormContacto />
          </Tarjeta>
        </section>
      </div>
    </div>
  );
}
