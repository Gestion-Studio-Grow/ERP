// LA HOJA DE INGRESO («Renglón») — el marco común de las pantallas de antes de entrar al panel:
// el ingreso (`LoginRenglon`) y el cambio de contraseña obligatorio (`/admin/cambiar-password`).
// Sólo con el interruptor «Diseño nuevo».
//
// Arriba el renglón de la marca (monograma sobre el acento, sin halo ni sombra) con el día como
// folio; abajo una raya y el sello de GSG. Anclada arriba y alineada a la izquierda: en el celular el
// teclado tapa la mitad de abajo y el campo con foco tiene que quedar a la vista.

export default function HojaDeIngreso({
  marcaNombre,
  marcaMonograma,
  hoy,
  lema,
  children,
}: {
  marcaNombre: string;
  marcaMonograma: string;
  /** El folio de la hoja: `folioDelDia()` («jueves 24 de septiembre»). */
  hoy: string;
  /** La frase del producto (Facturita, Contador…); en los negocios, nada. */
  lema?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <header className="flex items-center gap-3 border-b border-line-strong pb-3">
        <span
          aria-hidden
          className="grid h-9 min-w-9 place-items-center rounded-[4px] bg-accent px-1.5 text-[15px] font-semibold text-on-accent"
        >
          {marcaMonograma}
        </span>
        <span className="min-w-0 truncate text-[15px] font-semibold text-strong">{marcaNombre}</span>
        <span data-parte="folio" className="ml-auto shrink-0 text-[13px] text-muted">
          {hoy}
        </span>
      </header>

      {children}

      <footer className="mt-12 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-faint">
        {lema && <span>{lema}</span>}
        <span>Con tecnología de Gestión Studio Grow</span>
      </footer>
    </div>
  );
}

/** La clase de la raíz (`<main>`) de una hoja de ingreso: anclada arriba, no centrada. */
export const RAIZ_HOJA_DE_INGRESO = "min-h-screen bg-surface text-body px-4 pt-8 pb-10 sm:px-6 sm:pt-[12vh]";
