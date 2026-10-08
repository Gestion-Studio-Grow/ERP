import type { Metadata } from "next";
import Link from "next/link";
import { BotonLink, IconoFlecha, Insignia, ModoDemo, Tarjeta } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { FUNCIONES, GRUPOS } from "@/lib/contenido/funciones";

export const metadata: Metadata = {
  title: "Funciones",
  description:
    "Marca de agua automática, búsqueda por número de dorsal, paquetes, cupones, colaboradores y placa para historias. Todo lo que hace buscatufoto, explicado.",
};

export default function PaginaFunciones() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Funciones"
        titulo="Todo lo que hace buscatufoto"
        bajada="Explicado sin vueltas. Lo que está en modo demostración lo decimos, y lo que todavía no está, también."
      />

      {GRUPOS.map((g) => {
        const lista = FUNCIONES.filter((f) => f.grupo === g.id);
        if (lista.length === 0) return null;
        return (
          <section key={g.id} className={s.grupo} aria-labelledby={`grupo-${g.id}`}>
            <div className={s.grupoCabeza}>
              <h2 id={`grupo-${g.id}`} className="titulo-l">
                {g.titulo}
              </h2>
              <p>{g.bajada}</p>
            </div>
            <ul className={s.grilla}>
              {lista.map((f) => (
                <li key={f.id} className={s.tinte} data-tinte={f.tinte}>
                  <Tarjeta as="article" className={s.funcion}>
                    <div className={s.insignias}>
                      {f.pro ? <Insignia tono="acento">Plan Pro</Insignia> : null}
                      {f.demo ? <ModoDemo /> : null}
                      {f.proximamente ? <Insignia>Próximamente</Insignia> : null}
                    </div>
                    <h3>{f.titulo}</h3>
                    <p>{f.largo}</p>
                  </Tarjeta>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className={s.cierre}>
        <BotonLink href="/panel" variante="primario" tam="grande">
          Crear mi álbum
        </BotonLink>
        <Link href="/#precios" className={s.enlace}>
          Ver precios
          <IconoFlecha />
        </Link>
      </div>
    </div>
  );
}
