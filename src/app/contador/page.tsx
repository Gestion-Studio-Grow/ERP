// Panel del contador — SCAFFOLD (ADR-025 §12.2). Plano de operación cross-tenant:
// un contador ve su cartera de clientes monotributistas (cuánto cobró cada uno
// por Mercado Pago, qué está facturado y qué no, y quién se acerca al tope de su
// categoría). Datos SIMULADOS por el pipeline end-to-end (mercadopago-simulador);
// en producción saldrán de la conciliación real por tenant (Gate 2).

import { getCarteraSimulada } from "@/lib/contador-panel";

const ars = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function ContadorPage() {
  const { filas, resumen } = await getCarteraSimulada();

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "2rem 1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>
          arca · panel del contador
        </p>
        <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>Mi cartera</h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
          Facturación automática de Mercado Pago por cliente.{" "}
          <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>
            datos simulados
          </span>
        </p>
      </header>

      {/* Tarjetas resumen */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { k: "Clientes", v: String(resumen.clientes) },
          { k: "Cobrado por MP", v: ars(resumen.cobradoMP) },
          { k: "Facturas emitidas", v: String(resumen.facturadas) },
          { k: "A revisar", v: String(resumen.aRevisar) },
          { k: "En alerta de tope", v: String(resumen.enAlerta) },
        ].map((c) => (
          <div key={c.k} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>{c.k}</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </section>

      {/* Tabla de cartera */}
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
              <th style={{ padding: "10px 12px" }}>Cliente</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Cobrado MP</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Ops</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Facturadas</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>No facturable</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>A revisar</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Facturado</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>% tope</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const alerta = f.pctTope >= 0.8;
              return (
                <tr key={f.clienteId} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{f.nombre}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{ars(f.cobradoMP)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{f.operaciones}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{f.facturadas}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{f.noFacturables}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: f.aRevisar ? "#b45309" : "#64748b" }}>
                    {f.aRevisar}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{ars(f.montoFacturado)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: alerta ? 700 : 400, color: alerta ? "#dc2626" : "#0f172a" }}>
                    {pct(f.pctTope)}{alerta ? " ⚠" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button
          disabled
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed" }}
        >
          Aprobar en lote (próximamente)
        </button>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          ⚠ = cerca del tope de recategorización de monotributo (≥ 80%).
        </span>
      </div>
    </main>
  );
}
