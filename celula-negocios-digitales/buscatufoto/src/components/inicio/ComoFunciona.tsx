import { Ilustracion } from "./Ilustracion";
import s from "./inicio.module.css";

const PASOS = [
  {
    titulo: "Registrate y cargá tus datos de cobro",
    texto: "Creás tu cuenta, ponés a nombre de quién cobrás y tu alias. En esta demo el cobro es simulado.",
  },
  {
    titulo: "Creá el álbum y subí las fotos",
    texto: "Nombre del evento, fecha y precio. Subís fotos y videos y la marca de agua se pone sola; el original queda guardado aparte.",
  },
  {
    titulo: "Compartí el enlace",
    texto: "Lo mandás al grupo o lo subís a historias. Cada uno escribe su número, elige sus fotos y paga.",
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className={s.seccion} aria-labelledby="titulo-como">
      <div className={`contenedor ${s.comoGrid}`}>
        <div>
          <div className={s.cabezaSeccion}>
            <p className="rotulo">En tres pasos</p>
            <h2 id="titulo-como" className="titulo-l">
              ¿Cómo funciona?
            </h2>
          </div>
          <ol className={s.pasos}>
            {PASOS.map((p, i) => (
              <li key={p.titulo} className={s.paso}>
                <span className={`mono ${s.pasoNum}`} aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="titulo-m">{p.titulo}</h3>
                  <p>{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Ilustracion />
      </div>
    </section>
  );
}
