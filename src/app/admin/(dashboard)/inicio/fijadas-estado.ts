// Lo que devuelve la action de "Mis apps" al alfiler que la llamó. Vive aparte porque un
// archivo "use server" publica como endpoint todo lo que exporta: ahí sólo va la action.

export interface ResultadoFijada {
  ok: boolean;
  /** Qué pasó, en una frase de negocio: se muestra en el aviso tal cual. */
  mensaje: string;
}
