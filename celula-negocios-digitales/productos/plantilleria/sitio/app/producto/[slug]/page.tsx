import { notFound } from "next/navigation";
import BotonComprar from "../../../components/BotonComprar";
import FAQ from "../../../components/FAQ";
import { PLANTILLAS, getPlantilla } from "../../../data/catalogo";

// Genera una página estática por cada plantilla (SSG).
export function generateStaticParams() {
  return PLANTILLAS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const p = getPlantilla(params.slug);
  if (!p) return {};
  return { title: `${p.nombre} — Plantillería AR`, description: p.gancho };
}

export default function ProductoPage({ params }: { params: { slug: string } }) {
  const p = getPlantilla(params.slug);
  if (!p) notFound();

  return (
    <section>
      <div className="contenedor" style={{ maxWidth: 920 }}>
        <a href="/#catalogo" style={{ fontSize: ".9rem" }}>← Volver al catálogo</a>

        <div style={{ display: "grid", gap: 40, gridTemplateColumns: "1fr", marginTop: 20 }}>
          {/* Encabezado */}
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <span className="badge badge-ar">Normativa AR</span>
              {p.formato.map((f) => (
                <span key={f} className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                  {f}
                </span>
              ))}
            </div>
            <h1>{p.nombre}</h1>
            <p className="lead">{p.gancho}</p>
          </div>

          {/* Bloque de compra */}
          <div className="card" style={{ background: "var(--bg-alt)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <span className="precio">US${p.precioUSD}</span>
              <span className="precio-ars">≈ ${p.precioARSref.toLocaleString("es-AR")} ARS</span>
            </div>
            <BotonComprar checkoutUrl={p.checkoutUrl} label="Comprar y descargar" block />
            <p style={{ fontSize: ".85rem", color: "var(--ink-soft)", marginTop: 12, marginBottom: 0 }}>
              Descarga inmediata por email · Pago único · Sin suscripción
            </p>
          </div>

          {/* Para quién es */}
          <div>
            <h2>¿Para quién es?</h2>
            <p style={{ color: "var(--ink-soft)" }}>{p.publico}</p>
            <h3 style={{ marginTop: 20 }}>El problema que resuelve</h3>
            <p style={{ color: "var(--ink-soft)" }}>{p.dolor}</p>
          </div>

          {/* Qué incluye */}
          <div>
            <h2>Qué incluye</h2>
            <ul className="lista-check">
              {p.incluye.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>

          {/* Normativa cubierta */}
          <div className="card" style={{ background: "var(--accent-soft)", borderColor: "#bbf7d0" }}>
            <h3>Normativa argentina embebida</h3>
            <ul className="lista-check">
              {p.normativa.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="disclaimer">
            Herramienta de organización. No reemplaza el asesoramiento de un contador matriculado.
            Verificá siempre los valores vigentes en ARCA/AFIP.
          </p>

          {/* CTA final */}
          <div className="centro">
            <BotonComprar checkoutUrl={p.checkoutUrl} label={`Llevar ${p.nombre} — US$${p.precioUSD}`} />
          </div>

          {/* FAQ */}
          <div>
            <h2 className="centro" style={{ marginBottom: 24 }}>Preguntas frecuentes</h2>
            <FAQ />
          </div>
        </div>
      </div>
    </section>
  );
}
