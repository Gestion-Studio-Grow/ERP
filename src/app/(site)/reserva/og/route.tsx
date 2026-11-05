// Tarjeta para compartir del link para redes (docs/producto/link-servicio/PLAN.md §5). `opengraph-image.tsx` no recibe
// searchParams; por eso es una ruta. Resuelve con la misma lista del negocio del dominio que la página
// (`getProfessionalsWithServices`, con scope de tenant): un slug de otro negocio no aparece. Nunca 500: si algo falla,
// tarjeta genérica con el nombre del negocio. Nada binario: todo se dibuja con JSX.

import { ImageResponse } from "next/og";
import { getProfessionalsWithServices } from "@/lib/actions";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { leerQueryDelLink, metaDelLink, pesosDelLink, resolverPreeleccion, type MetaDelLink } from "@/lib/link-reserva";

export const dynamic = "force-dynamic";

const TAM = { width: 1200, height: 630 };
// Neutro sobrio si no hay marca: tinta casi negra sobre papel.
const NEUTRO = { accent: "#141311", onAccent: "#f3eee2" }; // design-lint-ignore: grafito/hueso §1.2; Satori (next/og) no lee variables CSS

function tarjeta(negocio: string, colores: { accent: string; onAccent: string }, meta: MetaDelLink | null) {
  const s = meta?.servicio;
  const p = meta?.profesional;
  const titulo = s ? s.name : p ? `Reservá con ${p.name}` : "Reservá tu turno online";
  const detalle = s ? `${s.durationMin} min · ${pesosDelLink(s.price)}` : null;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: colores.accent,
        color: colores.onAccent,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, letterSpacing: 4, textTransform: "uppercase", opacity: 0.85 }}>{negocio}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{titulo}</div>
        {s && p && <div style={{ display: "flex", fontSize: 42, marginTop: 20, opacity: 0.9 }}>{`con ${p.name}`}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 36 }}>
        <div style={{ display: "flex" }}>{detalle ?? ""}</div>
        <div style={{ display: "flex", padding: "14px 28px", border: `2px solid ${colores.onAccent}` }}>Reservás online en un minuto</div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  let negocio = "Reservá tu turno";
  let colores = NEUTRO;
  try {
    const marca = await getTenantBrand();
    negocio = marca.name || negocio;
    if (marca.propia) colores = resolveAccent(marca.preset, "light");
  } catch {
    // Branding cosmético: sigue neutro.
  }
  try {
    const q = leerQueryDelLink(Object.fromEntries(new URL(req.url).searchParams));
    const lista = await getProfessionalsWithServices();
    const meta = metaDelLink(lista, resolverPreeleccion(lista, q), negocio);
    return new ImageResponse(tarjeta(negocio, colores, meta), TAM);
  } catch {
    return new ImageResponse(tarjeta(negocio, colores, null), TAM);
  }
}
