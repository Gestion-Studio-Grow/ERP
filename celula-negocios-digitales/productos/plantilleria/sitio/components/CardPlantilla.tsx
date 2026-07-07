import type { Plantilla } from "../data/catalogo";

export default function CardPlantilla({ p }: { p: Plantilla }) {
  return (
    <a href={`/producto/${p.slug}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="badge badge-ar">Normativa AR</span>
        {p.formato.slice(0, 2).map((f) => (
          <span key={f} className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>
            {f}
          </span>
        ))}
      </div>

      <h3 style={{ fontSize: "1.35rem" }}>{p.nombre}</h3>
      <p style={{ color: "var(--ink-soft)", flexGrow: 1 }}>{p.gancho}</p>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 16 }}>
        <div>
          <span className="precio">US${p.precioUSD}</span>
          <div className="precio-ars">≈ ${p.precioARSref.toLocaleString("es-AR")} ARS</div>
        </div>
        <span className="btn-secundario btn" style={{ padding: "10px 18px", fontSize: ".9rem" }}>
          Ver plantilla →
        </span>
      </div>
    </a>
  );
}
