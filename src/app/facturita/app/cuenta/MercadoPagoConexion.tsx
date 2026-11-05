// FACTOQUE · Mi cuenta → Mercado Pago: conectar (OAuth), ver el estado y desconectar.
// Server component: lee el estado (sin abrir secretos) y, si el token vence pronto, lo renueva.

import { Badge, ButtonLink } from "@/components/ui";
import { conexionMPDisponible, estadoMPDelNegocio, renovarMPSiHaceFalta } from "@/lib/facturita-mp.server";
import { avisoDe } from "@/lib/facturita-mp-flujo";
import DesconectarMP from "./DesconectarMP";

const IR_A_CONECTAR = "/facturita/app/cuenta/mercadopago/conectar";

function fecha(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

export default async function MercadoPagoConexion({ tenantId, aviso }: { tenantId: string; aviso?: string }) {
  const disponible = conexionMPDisponible() !== null;
  if (disponible) await renovarMPSiHaceFalta(tenantId);
  const estado = await estadoMPDelNegocio(tenantId);
  const mensaje = avisoDe(aviso);

  return (
    <section
      aria-labelledby="titulo-mp"
      id="mercadopago"
      className="mb-6 scroll-mt-20 rounded-xl border border-line bg-surface-raised px-[22px] py-5 shadow-card"
      data-qa="mp-conexion"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-mp" className="text-base font-semibold text-strong">
          Mercado Pago
        </h2>
        {estado.conectado ? (
          estado.problema === "ninguno" ? (
            <Badge tone="success" dot>Conectado</Badge>
          ) : (
            <Badge tone="warning" dot>Hay que volver a conectarlo</Badge>
          )
        ) : (
          <Badge tone="neutral">Sin conectar</Badge>
        )}
      </div>

      {mensaje && (
        <p
          role={mensaje.tono === "error" ? "alert" : "status"}
          className={`mt-3 text-sm font-medium ${mensaje.tono === "ok" ? "text-success" : mensaje.tono === "error" ? "text-danger" : "text-strong"}`}
          data-qa="mp-aviso"
        >
          {mensaje.texto}
        </p>
      )}

      {estado.conectado ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Cuenta <strong className="font-semibold tabular-nums text-strong">{estado.cuenta}</strong>, conectada desde el{" "}
            {fecha(estado.desde)}. Tus cobros quedan listos para facturarse: todavía no facturamos nada solo, vos decidís.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {estado.problema !== "ninguno" && disponible && (
              <ButtonLink href={IR_A_CONECTAR}>Volver a conectar</ButtonLink>
            )}
            <DesconectarMP />
          </div>
        </>
      ) : disponible ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Conectalo y tus cobros de Mercado Pago quedan listos para facturarse. Te mandamos a Mercado Pago, das el
            permiso y volvés acá. No nos das tu clave, y lo podés sacar cuando quieras.
          </p>
          <div className="mt-4">
            <ButtonLink href={IR_A_CONECTAR} data-qa="mp-conectar">
              Conectar con Mercado Pago
            </ButtonLink>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted" data-qa="mp-no-disponible">
          Conectar Mercado Pago todavía no está disponible. Te avisamos por WhatsApp apenas lo habilitemos.
        </p>
      )}
    </section>
  );
}
