"use client";

// Si la base no responde, la página del taller cae acá en vez de a la pantalla genérica. Sin datos del negocio
// (justamente no se pudieron leer): barra lisa, el aviso y «Volver a intentar». No inventa un WhatsApp.
export default function ErrorDelTaller({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <header className="agr-barra">
        <div className="agr-cont agr-barra__in">
          <a href="/taller" className="agr-barra__logo">Taller</a>
        </div>
      </header>
      <main className="agr-falla">
        <div className="agr-cont">
          <p className="agr-etiqueta">Algo falló</p>
          <h1 className="agr-h2">No pudimos cargar la página del taller</h1>
          <p>Puede ser un corte momentáneo. Probá de nuevo en unos segundos.</p>
          <button type="button" className="agr-btn" onClick={() => reset()}>
            Volver a intentar
          </button>
        </div>
      </main>
    </>
  );
}
