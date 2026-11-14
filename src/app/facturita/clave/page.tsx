// FACTOQUE · Elegir la contraseña (/facturita/clave?t=…), en la dirección del negocio recién creado.
// El enlace sale de confirmar el alta (src/lib/factoque/alta-web.server.ts) y sirve una sola vez:
// va atado al hash de contraseña vigente, que cambia apenas se guarda la nueva. Pública a propósito
// (el proxy sólo cierra /facturita/app): todavía no hay sesión, por definición.

import type { Metadata } from "next";
import VidrieraMarco from "../VidrieraMarco";
import { BOTON_PRINCIPAL, FOCO } from "../estilos";
import { authSecret } from "@/lib/auth";
import { operatorPrisma } from "@/lib/operator-db";
import { getCurrentTenantId } from "@/lib/tenant";
import { enlaceDeClaveVigente } from "@/lib/factoque/alta-web.server";
import ClaveForm from "./ClaveForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Elegí tu contraseña — Factoque",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  generator: "Gestión Studio Grow",
};

export default async function ElegirClavePage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const sp = await searchParams;
  const sello = typeof sp.t === "string" ? sp.t : "";
  const negocio = await getCurrentTenantId().catch(() => null);
  const vigente = sello && negocio ? await enlaceDeClaveVigente({ prisma: operatorPrisma, secreto: authSecret(), ahora: Date.now }, sello, negocio) : null;

  return (
    <VidrieraMarco botonAlta={false}>
      <div className="fx-caja fx-caja--alta" style={{ paddingBlock: "clamp(32px, 2rem + 3vw, 96px) clamp(48px, 3rem + 4vw, 120px)" }}>
        <h1 className="fx-h1">Elegí tu contraseña</h1>
        {vigente ? (
          <>
            <p className="fx-lead">
              Tu cuenta de <strong className="text-strong">{vigente.negocio}</strong> ya está creada. Vas a entrar con{" "}
              <strong className="text-strong">{vigente.email}</strong> y la contraseña que elijas acá.
            </p>
            <ClaveForm sello={sello} email={vigente.email} />
          </>
        ) : (
          <>
            <p role="alert" className="fx-lead" data-qa="aviso-clave-vencida">
              Este enlace ya se usó o venció. Si ya elegiste tu contraseña, entrá con ella. Si no, abrí de nuevo el enlace
              del mail de confirmación (sirve durante 24 horas).
            </p>
            <p className="mt-8">
              <a href="/admin/login" className={`${BOTON_PRINCIPAL} ${FOCO}`}>
                Entrar
              </a>
            </p>
          </>
        )}
      </div>
    </VidrieraMarco>
  );
}
