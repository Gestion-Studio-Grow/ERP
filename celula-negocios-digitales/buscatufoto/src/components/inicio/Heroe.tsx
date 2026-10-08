import Link from "next/link";
import { BotonLink, IconoFlecha } from "@/components/ui";
import s from "./inicio.module.css";

/** Héroe a pantalla completa, alineado a la izquierda. El titular es el LCP: nunca arranca invisible. */
export function Heroe() {
  return (
    <section className={s.heroe} aria-labelledby="titulo-inicio">
      <div className={`contenedor ${s.heroeInterior}`}>
        <p className="rotulo">Carreras · torneos · fiestas</p>
        <h1 id="titulo-inicio" className={`titulo-xl ${s.heroeTitulo}`}>
          Subí las fotos del evento. Que cada uno encuentre <span className={s.visor}>la suya</span> y la pague.
        </h1>
        <p className={`bajada ${s.heroeBajada}`}>
          La marca de agua se pone sola, la gente se busca por su número de dorsal, elige y paga. Todo desde el
          navegador, sin instalar nada.
        </p>
        <div className={s.heroeAcciones}>
          <BotonLink href="/panel" variante="primario" tam="grande">
            Crear mi álbum
          </BotonLink>
          <Link href="/a/10k-costanera-muestra" className={s.enlaceSuave}>
            Ver un álbum de muestra
            <IconoFlecha />
          </Link>
        </div>
      </div>
      <div className={s.heroePie}>
        <div className={`contenedor ${s.heroePieInterior}`}>
          <span>
            Probá buscar el <span className="mono">1043</span> en la muestra.
          </span>
          <a href="#como-funciona" className={s.enlaceSuave}>
            ¿Cómo funciona?
          </a>
        </div>
      </div>
    </section>
  );
}
