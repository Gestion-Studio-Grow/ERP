import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBrandSheet } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { siteGateEnabled } from "@/lib/site-gate";
import { entrarAlSitio } from "./actions";

// Pantalla del portón del sitio (ver `@/lib/site-gate`): pide la clave compartida
// mientras la vidriera no está abierta al público.
//
// Deliberadamente sobria y sin datos del negocio: no muestra servicios, precios ni
// profesionales — si los mostrara, la clave no serviría de nada. Sólo la marca del
// tenant, para que quien la recibe sepa que llegó a donde quería.
//
// SERVER COMPONENT PURO, sin una línea de JavaScript propio: es un <form> que
// postea a un server action. Una puerta de entrada tiene que abrir aunque el
// bundle del cliente no cargue; la primera versión de esta pantalla era un client
// component y, cuando no hidrataba, el botón "Entrar" no hacía absolutamente nada.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  // Que no la indexe ningún buscador: es una puerta, no una página del sitio.
  robots: { index: false, follow: false },
};

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Con el portón apagado esta pantalla no tiene razón de existir.
  if (!siteGateEnabled()) redirect("/");

  const { next, error } = await searchParams;
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const fallo = error === "1";

  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const brand = await getTenantBrand();
  const nombre = sheet?.name ?? brand.name;
  const { accent } = resolveAccent(brand.preset, "light");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
        background: "var(--surface)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <p
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.75rem",
            color: accent,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {nombre}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.375rem",
            fontWeight: 480,
            margin: "22px 0 10px",
            color: "var(--text-strong)",
          }}
        >
          Sitio en preparación
        </h1>
        <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.65, color: "var(--text-muted)" }}>
          Todavía no está abierto al público. Si tenés la clave de acceso, entrá con ella.
        </p>

        <form action={entrarAlSitio} style={{ marginTop: 28 }}>
          <input type="hidden" name="next" value={destino} />
          <label
            htmlFor="clave"
            style={{ display: "block", fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}
          >
            Clave de acceso
          </label>
          <input
            id="clave"
            name="clave"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={fallo || undefined}
            aria-describedby={fallo ? "clave-error" : undefined}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--surface-sunken)",
              border: `1px solid ${fallo ? "var(--danger)" : "var(--line-strong)"}`,
              padding: "12px 14px",
              borderRadius: 0,
              // 16px o más: por debajo de eso, Safari en iPhone hace zoom al enfocar
              // el campo y la pantalla queda descuadrada.
              fontSize: 16,
              minHeight: 48,
              fontFamily: "var(--font-body), system-ui, sans-serif",
              color: "var(--text-strong)",
            }}
          />
          {fallo && (
            <p
              id="clave-error"
              role="alert"
              style={{ margin: "8px 0 0", fontSize: 13, color: "var(--danger)" }}
            >
              La clave no es correcta.
            </p>
          )}
          <button
            type="submit"
            style={{
              marginTop: 18,
              width: "100%",
              minHeight: 48,
              background: "var(--text-strong)",
              color: "var(--surface)",
              border: 0,
              borderRadius: 0,
              fontSize: 15,
              fontFamily: "var(--font-body), system-ui, sans-serif",
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
