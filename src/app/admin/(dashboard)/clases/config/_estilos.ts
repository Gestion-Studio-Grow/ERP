// Las clases de los campos de Ajustes, Alumnos y la Bienvenida (Tanda 3B): 48 px de alto, texto
// de 16 px (el celular no hace zoom al enfocar), foco visible, rojo cuando hay error. PURO.

export const campo =
  "h-12 w-full rounded-xl border border-line bg-surface-raised px-3 text-base text-strong placeholder:text-faint " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export const areaTexto =
  "min-h-28 w-full rounded-xl border border-line bg-surface-raised p-3 text-base leading-relaxed text-strong " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export const rotulo = "mb-1 block text-sm font-semibold text-strong";

/** Un chip que se toca para elegir: 48 px, prendido en tinta (como el Chip del kit). */
export const chipEleccion =
  "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-4 text-sm font-medium text-body " +
  "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-pressed:bg-surface-inverted aria-pressed:text-surface aria-checked:bg-surface-inverted aria-checked:text-surface disabled:opacity-60";
