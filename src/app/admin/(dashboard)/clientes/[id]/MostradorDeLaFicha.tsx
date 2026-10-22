// ============================================================================
// LA FICHA, DEL LADO DEL MOSTRADOR (Magra, tanda 2 · 2D; magra-DISENO.md E14 · E17 · MG-058).
// ============================================================================
//
// Sólo con el mostrador boutique (lo decide page.tsx). Arriba de la ficha, lo que el mostrador
// necesita para atender al cliente que tiene enfrente o en el teléfono:
//   · lo que debe, UNO solo: la cuenta corriente (el fiado, `AccountReceivable`) más los pedidos
//     entregados sin cobrar que no están en la cuenta, con «desde el sábado» (la deuda más vieja);
//   · «Recordarle» por WhatsApp con el texto único del recordatorio (`recordatorioDePago`,
//     fiado.ts), si debe algo, tiene celular y no pidió que no le escriban;
//   · «Venderle»: Vender con el cliente ya elegido; y «Repetir» sus últimos 3 pedidos (lo por kilo
//     se vuelve a pesar). Sólo si quien mira puede abrir Vender.
// Servidor: lee con la sesión (fiado.server.ts) y no escribe nada.

import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { dateStrInBusinessTz, fmtShortDate, todayInBusinessTz } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { nombreDelNegocio } from "@/lib/crm/cargas.server";
import { cargarMostradorDeLaFicha } from "@/lib/clientes/fiado.server";
import { desdeCuando, hrefRepetir, hrefVenderle, recordatorioDePago } from "@/lib/clientes/fiado";
import { puedeAbrirApp } from "../../vender/puede-abrir";
import { claseBotonWhatsApp } from "../boton-whatsapp";

export default async function MostradorDeLaFicha({
  clientId,
  nombre,
  telefono,
  noQuiere,
  verPlata,
}: {
  clientId: string;
  nombre: string;
  telefono: string | null;
  /** Pidió no recibir mensajes: no se ofrece «Recordarle». */
  noQuiere: boolean;
  /** Con reports:read se ven los totales de los pedidos (como en la lista de pedidos de la ficha). */
  verPlata: boolean;
}) {
  const [datos, negocio, puedeVender] = await Promise.all([
    cargarMostradorDeLaFicha(clientId),
    nombreDelNegocio(),
    puedeAbrirApp("vender"),
  ]);
  if (!datos) return null;
  const { deuda, ultimos } = datos;
  const debe = deuda.total > 0;
  const desde = deuda.desde ? desdeCuando(dateStrInBusinessTz(deuda.desde), todayInBusinessTz()) : null;
  // Un solo pedido y nada en la cuenta: el recordatorio nombra el pedido (el mismo texto que la bandeja).
  const unPedido = deuda.cuenta === 0 && deuda.pedidos.length === 1 ? deuda.pedidos[0] : null;
  const recordarle =
    debe && !noQuiere
      ? waLinkClienta(
          telefono,
          recordatorioDePago({
            cliente: nombre,
            negocio,
            monto: textoPlata(deuda.total),
            pedido: unPedido?.code ?? null,
            desde,
          }),
        )
      : null;
  const partes = [
    deuda.cuenta > 0 ? `en su cuenta ${textoPlata(deuda.cuenta)}` : null,
    ...deuda.pedidos.map((p) => `pedido #${p.code} entregado sin cobrar ${textoPlata(p.monto)}`),
  ].filter(Boolean);

  return (
    <section aria-labelledby="ficha-mostrador" className="mb-6 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id="ficha-mostrador" className="sr-only">
        Para el mostrador
      </h2>
      {debe ? (
        <p className="text-base text-strong">
          <strong className="text-danger">Debe {textoPlata(deuda.total)}</strong>
          {desde ? ` ${desde}` : ""}
          {partes.length > 1 && <span className="block text-sm text-muted">{partes.join(" · ")}</span>}
        </p>
      ) : (
        <p className="text-base text-strong">No debe nada.</p>
      )}
      {debe && noQuiere && <p className="mt-1 text-sm text-muted">Pidió no recibir mensajes: el recordatorio, en persona.</p>}

      {(puedeVender || recordarle) && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          {puedeVender && (
            <Link href={hrefVenderle(clientId)} className={`${buttonClasses("solid", "md")} min-h-11`}>
              Venderle
            </Link>
          )}
          {recordarle && (
            <a
              href={recordarle}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Recordarle por WhatsApp a ${nombre} que debe ${textoPlata(deuda.total)}`}
              className={claseBotonWhatsApp("outline")}
            >
              Recordarle
            </a>
          )}
        </div>
      )}

      {puedeVender && ultimos.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-strong">Repetir un pedido</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {ultimos.map((p) => (
              <li key={p.code}>
                <Link
                  href={hrefRepetir(clientId, p.code)}
                  className={`${buttonClasses("outline", "sm")} min-h-11`}
                  aria-label={`Repetir el pedido #${p.code} del ${fmtShortDate(p.fecha)}: carga sus renglones en Vender, lo que va por kilo se vuelve a pesar`}
                >
                  #{p.code} · {fmtShortDate(p.fecha)}
                  {verPlata ? ` · ${textoPlata(p.total)}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
