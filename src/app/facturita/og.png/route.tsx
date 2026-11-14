// FACTOQUE · /facturita/og.png — la imagen para compartir (1200×630), generada en el build con
// next/og. Nada binario en Git: la marca F06-A sale de la fuente única (src/lib/factoque-icono.ts),
// en su versión horizontal «Factoque™ · Powered by Gestión Studio Grow», sobre el papel de la marca.

import { ImageResponse } from "next/og";
import { FACTOQUE_COBRE, FACTOQUE_GRIS, FACTOQUE_PAPEL, FACTOQUE_TINTA, dataUriSvg, logoFactoqueSvg } from "@/lib/factoque-icono";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 72px",
          background: FACTOQUE_PAPEL,
          color: FACTOQUE_TINTA,
          borderTop: `14px solid ${FACTOQUE_COBRE}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img> */}
        <img src={dataUriSvg(logoFactoqueSvg({ respaldo: true }))} width={612} height={170} alt="Factoque™ · Powered by Gestión Studio Grow" style={{ marginLeft: -40 }} />
        <div style={{ marginTop: 28, fontSize: 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2, maxWidth: 1000 }}>
          Facturá desde el celu, sin vueltas.
        </div>
        <div style={{ marginTop: 26, fontSize: 32, lineHeight: 1.3, color: FACTOQUE_GRIS }}>
          {`Facturas de ARCA · ${LIMITE_FACTURAS_FACTURITA} gratis por mes, sin tarjeta`}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
