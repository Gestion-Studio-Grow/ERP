"use client";

// Un pedido sugerido para UN proveedor: qué pedir, cuánto, y el botón para mandarlo por
// WhatsApp (1 a 1, con el texto armado) o copiarlo. Al mandar o copiar queda la constancia en
// la auditoría del negocio. El texto y el enlace los arma el servidor: acá no hay cuentas.

import { useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { dejarConstanciaDelPedido } from "./actions";

export type LineaDelPedido = {
  productId: string;
  nombre: string;
  /** "hay 5 kg" */
  hay: string;
  /** "se venden ~2 kg por día", o null si no se vendió en 28 días */
  venta: string | null;
  /** "17 kg" */
  pedir: string;
  cantidad: number;
};

export default function PedidoProveedor({
  proveedorId,
  titulo,
  subtitulo,
  lineas,
  texto,
  waHref,
  sinTelefono,
}: {
  proveedorId: string | null;
  titulo: string;
  subtitulo: string | null;
  lineas: LineaDelPedido[];
  texto: string;
  /** Enlace de WhatsApp al proveedor, o null si no tiene un teléfono que sirva. */
  waHref: string | null;
  /** Qué hacer si no hay teléfono (con el enlace a la ficha, si la persona la puede abrir). */
  sinTelefono: { texto: string; href: string | null } | null;
}) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const constancia = (via: "whatsapp" | "copiado") =>
    void dejarConstanciaDelPedido(
      proveedorId,
      via,
      lineas.map((l) => ({ productId: l.productId, cantidad: l.cantidad })),
    );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado("si");
      constancia("copiado");
    } catch {
      // Sin permiso de portapapeles (navegador viejo, página sin foco): se dice, y el texto
      // queda a la vista para copiarlo a mano.
      setCopiado("no");
    }
  }

  return (
    <section className="rounded-lg border border-line p-4" aria-label={`Pedido para ${titulo}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-strong">{titulo}</h2>
        {subtitulo && <span className="text-xs text-muted">{subtitulo}</span>}
      </div>

      <ul className="divide-y divide-line">
        {lineas.map((l) => (
          <li key={l.productId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-strong">{l.nombre}</span>
              <span className="block text-xs text-muted">
                {l.hay}
                {l.venta ? ` · ${l.venta}` : " · sin ventas en 28 días"}
              </span>
            </span>
            <span className="tabular-nums font-semibold text-strong">pedir {l.pedir}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => constancia("whatsapp")}
            className={`${buttonClasses("solid", "md")} min-h-11`}
          >
            Mandar por WhatsApp
          </a>
        )}
        <button type="button" onClick={copiar} className={`${buttonClasses(waHref ? "outline" : "solid", "md")} min-h-11`}>
          Copiar el pedido
        </button>
        {copiado === "si" && (
          <span role="status" className="text-xs text-success">
            Copiado. Pegalo en el chat del proveedor.
          </span>
        )}
      </div>
      {copiado === "no" && (
        <div role="alert" className="mt-2 text-xs text-danger">
          No se pudo copiar solo. Seleccioná el texto y copialo a mano:
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface-sunken p-2 text-body">{texto}</pre>
        </div>
      )}
      {!waHref && sinTelefono && (
        <p className="mt-2 text-xs text-muted">
          {sinTelefono.texto}{" "}
          {sinTelefono.href && (
            <Link href={sinTelefono.href} className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
              Cargar el teléfono
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
