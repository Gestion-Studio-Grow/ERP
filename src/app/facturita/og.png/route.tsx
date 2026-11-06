// FACTOQUE · /facturita/og.png — la imagen para compartir (1200×630), generada en el build con
// next/og. Reemplaza al og.webp de Facturita: nada binario en Git y la marca sale de la fuente
// única (src/lib/factoque-icono.ts). Colores PROVISIONALES a confirmar por el dueño.

import { ImageResponse } from "next/og";
import { FACTOQUE_CREMA, FACTOQUE_TRAZO, FACTOQUE_VERDE, dataUriFactoque } from "@/lib/factoque-icono";
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
          alignItems: "center",
          gap: 64,
          padding: "0 88px",
          background: FACTOQUE_CREMA,
          color: FACTOQUE_TRAZO,
          borderTop: `18px solid ${FACTOQUE_VERDE}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img> */}
        <img src={dataUriFactoque()} width={340} height={340} alt="" style={{ borderRadius: 72 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: FACTOQUE_VERDE }}>Factoque</div>
          <div style={{ marginTop: 18, fontSize: 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>
            Facturá desde el celu, sin vueltas.
          </div>
          <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.3 }}>
            {`Facturas de ARCA · ${LIMITE_FACTURAS_FACTURITA} gratis por mes, sin tarjeta`}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
