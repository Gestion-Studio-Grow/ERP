import { PLANTILLAS, getPlantilla, BUNDLE } from "../../../data/catalogo";

// Página de gracias / entrega. A esta URL redirige Lemon Squeezy tras el pago.
export function generateStaticParams() {
  return [...PLANTILLAS.map((p) => ({ slug: p.slug })), { slug: BUNDLE.slug }];
}

export default function GraciasPage({ params }: { params: { slug: string } }) {
  const p = getPlantilla(params.slug);
  const nombre = p?.nombre ?? BUNDLE.nombre;
  // Sugerencia de upsell: otra plantilla destacada distinta a la comprada.
  const upsell = PLANTILLAS.find((x) => x.destacada && x.slug !== params.slug);

  return (
    <section>
      <div className="contenedor centro" style={{ maxWidth: 720 }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: "50%", background: "var(--accent-soft)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 24px", fontSize: "2rem",
          }}
          aria-hidden
        >
          ✓
        </div>
        <h1>¡Gracias por tu compra! 🎉</h1>
        <p className="lead">
          Tu <strong>{nombre}</strong> ya está en camino a tu email.
        </p>

        <div className="card" style={{ textAlign: "left", margin: "32px 0" }}>
          <h3>Cómo empezar a usarla</h3>
          <ol style={{ color: "var(--ink-soft)", paddingLeft: 20 }}>
            <li>Revisá tu casilla (y la carpeta de spam/promociones) — te llegó un email con el archivo o el link.</li>
            <li>
              Si es Google Sheets: abrí el link y hacé <strong>Archivo → Crear una copia</strong> para tener
              tu versión editable. Si es Notion: tocá <strong>Duplicar</strong> arriba a la derecha.
            </li>
            <li>Si es Excel: descargá el archivo adjunto y abrilo con Excel, Google Sheets o LibreOffice.</li>
            <li>Empezá por la hoja <strong>“Instrucciones”</strong> — te guía paso a paso.</li>
          </ol>
          <p style={{ fontSize: ".9rem", color: "var(--ink-soft)", marginBottom: 0 }}>
            ¿No te llegó en 10 minutos? Escribinos y te lo reenviamos al toque.
          </p>
        </div>

        {upsell && (
          <div className="card" style={{ textAlign: "left" }}>
            <span className="badge" style={{ marginBottom: 10 }}>Te puede servir</span>
            <h3>{upsell.nombre}</h3>
            <p style={{ color: "var(--ink-soft)" }}>{upsell.gancho}</p>
            <a className="btn btn-secundario" href={`/producto/${upsell.slug}`}>
              Ver plantilla →
            </a>
          </div>
        )}

        <p style={{ marginTop: 32 }}>
          <a href="/#catalogo">← Volver al catálogo</a>
        </p>
      </div>
    </section>
  );
}
