// El esqueleto de Vender copia su forma real (auditoría 8.2): a la izquierda el buscador y las
// teclas de «Más vendidos», a la derecha el ticket con su total y el botón. Nada de tarjetas con
// números: lo que llega ocupa el mismo lugar y la pantalla no salta.

export default function CargandoVender() {
  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-[1240px] px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        Abriendo Vender…
      </span>
      <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]">
        <div className="space-y-4">
          <div data-ui="esqueleto" className="h-11 w-full rounded bg-surface-sunken motion-safe:animate-pulse" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} data-ui="esqueleto" className="h-16 rounded bg-surface-sunken motion-safe:animate-pulse" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded border border-line p-3">
          <div data-ui="esqueleto" className="h-9 w-40 rounded bg-surface-sunken motion-safe:animate-pulse" />
          <div data-ui="esqueleto" className="h-12 w-full rounded bg-surface-sunken motion-safe:animate-pulse" />
          <div data-ui="esqueleto" className="ml-auto h-12 w-48 rounded bg-surface-sunken motion-safe:animate-pulse" />
          <div data-ui="esqueleto" className="h-12 w-full rounded bg-surface-sunken motion-safe:animate-pulse" />
        </div>
      </div>
    </main>
  );
}
