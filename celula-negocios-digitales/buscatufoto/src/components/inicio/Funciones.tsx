import Link from "next/link";
import { IconoFlecha, Tarjeta } from "@/components/ui";
import { FUNCIONES_EXTRA, FUNCIONES_PRINCIPALES } from "@/lib/contenido/funciones";
import { Carrusel } from "./Carrusel";
import { Muestra } from "./Muestra";
import s from "./inicio.module.css";

export function Funciones() {
  return (
    <section id="funciones" className={s.seccion} aria-labelledby="titulo-funciones">
      <div className="contenedor">
        <div className={s.cabezaSeccion}>
          <p className="rotulo">Funciones</p>
          <h2 id="titulo-funciones" className="titulo-l">
            Lo que necesitás para vender el lunes lo que sacaste el domingo
          </h2>
        </div>

        <ul className={s.grilla}>
          {FUNCIONES_PRINCIPALES.map((f) => (
            <li key={f.id} className={s.conTinte} data-tinte={f.tinte}>
              <Tarjeta as="article" className={s.funcion}>
                <Muestra id={f.id} />
                <h3 className="titulo-m">{f.titulo}</h3>
                <p>{f.corto}</p>
              </Tarjeta>
            </li>
          ))}
        </ul>

        <Carrusel funciones={FUNCIONES_EXTRA} titulo="Y además" />

        <p className={s.verTodas}>
          <Link href="/funciones" className={s.enlaceSuave}>
            Ver todas las funciones
            <IconoFlecha />
          </Link>
        </p>
      </div>
    </section>
  );
}
