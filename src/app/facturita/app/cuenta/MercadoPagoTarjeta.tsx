// FACTOQUE · Mi cuenta → la tarjeta de Mercado Pago (sólo presentación, sin base ni acciones).

import type { ReactNode } from "react";
import { Badge, ButtonLink } from "@/components/ui";
import type { EstadoMP } from "@/lib/facturita-mp.server";

const IR_A_CONECTAR = "/facturita/app/cuenta/mercadopago/conectar";

function fecha(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

export default function MercadoPagoTarjeta({
  estado,
  disponible,
  aviso: mensaje,
  desconectar,
}: {
  estado: EstadoMP;
  disponible: boolean;
  aviso: { tono: "ok" | "error" | "info"; texto: string } | null;
  /** El botón de desconectar (llama a una server action: lo pone el server component). */
  desconectar: ReactNode;
}) {
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
            {desconectar}
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
