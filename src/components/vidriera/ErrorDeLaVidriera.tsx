"use client";

// El error de una vidriera (ronda 2, §4.5 «estados obligatorios»): si la base no responde, la tienda o el sitio caen
// acá en vez de a la pantalla genérica de Next. Sin datos del negocio (justamente no se pudieron leer) y sin inventar
// canales: el aviso, «Volver a intentar» y, si la bolsa estaba guardada, la tranquilidad de que no se perdió.
// Neutra a propósito (papel y tinta): un error no puede pintar la marca de otro negocio.
export default function ErrorDeLaVidriera({ reset, que = "la tienda", inicio = "/tienda" }: { reset: () => void; que?: string; inicio?: string }) {
  return (
    <main className="gsg-err" role="alert">
      <style>{CSS}</style>
      <div className="gsg-err-hoja">
        <p className="gsg-err-et">Algo falló</p>
        <h1 className="gsg-err-h">No pudimos cargar {que}</h1>
        <p className="gsg-err-p">Puede ser un corte momentáneo. Lo que tenías en la bolsa sigue guardado en este teléfono: probá de nuevo en unos segundos.</p>
        <div className="gsg-err-acc">
          <button type="button" className="gsg-err-b gsg-err-s" onClick={() => reset()}>
            Volver a intentar
          </button>
          <a className="gsg-err-b gsg-err-l" href={inicio}>
            Ir al inicio
          </a>
        </div>
      </div>
    </main>
  );
}

const CSS = `.gsg-err{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f6f4ef;color:#1d1c1a;font:400 17px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.gsg-err-hoja{max-width:32rem;width:100%}
.gsg-err-et{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#5c5a55}
.gsg-err-h{margin:0;font-size:clamp(2rem,1.5rem + 2.5vw,3rem);line-height:1.05;letter-spacing:-.015em;font-weight:600;text-wrap:balance}
.gsg-err-p{margin:16px 0 0;color:#3d3b37;text-wrap:pretty}
.gsg-err-acc{margin-top:28px;display:flex;flex-wrap:wrap;gap:12px}
.gsg-err-b{min-height:56px;padding:0 22px;border-radius:10px;font:600 16px/1 inherit;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}
.gsg-err-s{background:#1d1c1a;color:#fff;border:0}
.gsg-err-l{border:1px solid #b9b5ac;color:#1d1c1a}
.gsg-err-b:focus-visible{outline:3px solid #1d1c1a;outline-offset:2px}`;
