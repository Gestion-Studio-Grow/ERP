// FACTOQUE · Confirmar el alta (/facturita/alta/confirmar?t=…). El enlace llega por mail.
//
// Abrir la página NO crea nada (los lectores de enlaces de los correos abren todo): muestra los datos
// y un botón; el negocio se crea con el POST del botón (acciones.ts → confirmarAlta). Un enlace roto,
// tocado, vencido o ya usado dice lo mismo, sin contar por qué.

import type { Metadata } from "next";
import VidrieraMarco from "../../VidrieraMarco";
import { BOTON_PRINCIPAL, FOCO } from "../../estilos";
import { formatearCuit } from "@/lib/facturita-onboarding";
import { CONDICIONES_DEL_EMISOR } from "@/lib/fiscal/condicion-iva-emisor";
import { authSecret } from "@/lib/auth";
import { leerConfirmacion } from "@/lib/factoque/alta-web.server";
import { confirmarAltaFactoque } from "../acciones";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmá tu alta — Factoque",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  generator: "Gestión Studio Grow",
};

const AVISOS: Record<string, string> = {
  enlace: "Este enlace ya se usó o venció. Si ya elegiste tu contraseña, entrá desde la dirección de tu negocio; si no, pedí el alta de nuevo.",
  frenado: "Recibimos varios intentos seguidos desde acá. Esperá un rato y probá de nuevo.",
  error: "No pudimos crear tu cuenta en este momento. Probá de nuevo en unos minutos.",
};

export default async function ConfirmarAltaPage({ searchParams }: { searchParams: Promise<{ t?: string | string[]; estado?: string | string[] }> }) {
  const sp = await searchParams;
  const sello = typeof sp.t === "string" ? sp.t : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const alta = sello ? leerConfirmacion({ secreto: authSecret(), ahora: Date.now }, sello) : null;
  const aviso = AVISOS[estado] ?? (alta ? null : AVISOS.enlace);

  return (
    <VidrieraMarco botonAlta={false}>
      <div className="fx-caja fx-caja--alta" style={{ paddingBlock: "clamp(32px, 2rem + 3vw, 96px) clamp(48px, 3rem + 4vw, 120px)" }}>
        <h1 className="fx-h1">Confirmá tu alta</h1>
        {aviso || !alta ? (
          <>
            <p role="alert" className="fx-lead" data-qa="aviso-confirmar">
              {aviso}
            </p>
            <p className="mt-8">
              <a href="/facturita/alta" className={`${BOTON_PRINCIPAL} ${FOCO}`}>
                Pedir el alta
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="fx-lead">Revisá que esté todo bien. Al confirmar se crea tu cuenta y elegís tu contraseña.</p>
            <dl className="fx-resumen-alta mt-8">
              <div>
                <dt>Nombre</dt>
                <dd>{alta.nombre}</dd>
              </div>
              <div>
                <dt>CUIT</dt>
                <dd className="tabular-nums">{formatearCuit(alta.cuit)}</dd>
              </div>
              <div>
                <dt>Inscripción</dt>
                <dd>{CONDICIONES_DEL_EMISOR[alta.condicionIva]}</dd>
              </div>
              <div>
                <dt>Punto de venta</dt>
                <dd className="tabular-nums">{alta.puntoVenta}</dd>
              </div>
              <div>
                <dt>Mail</dt>
                <dd>{alta.email}</dd>
              </div>
            </dl>
            <form action={confirmarAltaFactoque} className="mt-8">
              <input type="hidden" name="t" value={sello} />
              <button type="submit" className={`${BOTON_PRINCIPAL} ${FOCO}`} style={{ width: "100%" }} data-qa="confirmar-alta">
                Confirmar y crear mi cuenta
              </button>
            </form>
            <p className="mt-4 text-base text-[var(--fx-tenue)]">¿Algún dato está mal? No confirmes: pedí el alta de nuevo con los datos correctos.</p>
          </>
        )}
      </div>
    </VidrieraMarco>
  );
}
