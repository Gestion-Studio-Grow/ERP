// Confirmación de pedido de la vidriera. Muestra el nº de pedido (correlativo por
// tenant) que devolvió `placeOnlineOrder`. Server component; en Next 16
// `searchParams` es una Promise.

import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido } = await searchParams;

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
        <div style={{ fontSize: 40 }}>🥩</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "10px 0 6px", color: "#5a1216" }}>
          ¡Pedido recibido!
        </h1>
        {pedido && (
          <p style={{ fontSize: 15 }}>
            Tu número de pedido es{" "}
            <strong style={{ color: "#5a1216" }}>#{pedido}</strong>.
          </p>
        )}
        <p style={{ color: "#6b5d52", marginTop: 10, lineHeight: 1.5 }}>
          Te vamos a contactar por WhatsApp para confirmar los cortes y coordinar el retiro o
          envío. El pago se coordina al recibirlo.
        </p>
        <Link
          href="/carniceria"
          style={{
            display: "inline-block",
            marginTop: 20,
            background: "#5a1216",
            color: "#fff",
            textDecoration: "none",
            padding: "11px 20px",
            borderRadius: 11,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Volver a la vidriera
        </Link>
      </div>
    </div>
  );
}
