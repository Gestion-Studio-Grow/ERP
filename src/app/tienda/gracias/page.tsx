// Confirmación de pedido de la vidriera. Muestra el nº de pedido (correlativo por
// tenant) que devolvió `placeOnlineOrder`. Server component; en Next 16
// `searchParams` es una Promise. Usa el acento del tenant para la marca.

import Link from "next/link";
import { getTenantAccent } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const [{ pedido }, accent] = await Promise.all([searchParams, getTenantAccent()]);

  return (
    <div
      style={{
        background: "#f4efe6",
        color: "#2a211c",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e9e1d3",
          borderRadius: 18,
          padding: "40px 32px",
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40 }}>🛍️</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "10px 0 6px", color: accent }}>
          ¡Pedido recibido!
        </h1>
        {pedido && (
          <p style={{ fontSize: 15 }}>
            Tu número de pedido es <strong style={{ color: accent }}>#{pedido}</strong>.
          </p>
        )}
        <p style={{ color: "#6b5d52", marginTop: 10, lineHeight: 1.5 }}>
          Te vamos a contactar para confirmar el pedido y coordinar el retiro o envío. El pago se
          coordina al recibirlo.
        </p>
        <Link
          href="/tienda"
          style={{
            display: "inline-block",
            marginTop: 20,
            background: accent,
            color: "#fff",
            textDecoration: "none",
            padding: "11px 20px",
            borderRadius: 11,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
