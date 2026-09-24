"use client";

// Formulario de DEVOLUCIÓN a proveedor: se elige la compra, se carga cuánto se devuelve de cada
// producto y adónde va la plata. Si el servidor rechaza alguna línea, el error aparece AL LADO
// de esa línea y no se registra ninguna (todo o nada). Sin imports de servidor.

import { useMemo, useState } from "react";
import Link from "next/link";
import { AvisoError, EmptyState, Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { leerCantidad, formatearCantidad } from "@/lib/pos-peso";
import type { CompraDevolvible } from "@/lib/suppliers/devoluciones";
import { useEnvio } from "@/lib/inventario/envio";
import { registrarDevolucionAccion, type EstadoDevolucion } from "./actions";

type Destino = "deuda" | "caja" | "ninguno";

function Registrar({ disabled, enviando }: { disabled: boolean; enviando: boolean }) {
  return (
    <button type="submit" disabled={disabled || enviando} className={`${buttonClasses("solid", "md")} w-full sm:w-auto`}>
      {enviando ? "Registrando…" : "Registrar devolución"}
    </button>
  );
}

export function DevolucionForm({
  compras,
  hrefCompras = null,
}: {
  compras: CompraDevolvible[];
  /** Recibir mercadería, si quien devuelve la puede abrir: es la salida del vacío. */
  hrefCompras?: string | null;
}) {
  const [purchaseId, setPurchaseId] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<Destino | "">("");
  const [medio, setMedio] = useState<"EFECTIVO" | "MP">("EFECTIVO");
  const [motivo, setMotivo] = useState("");
  const compra = useMemo(() => compras.find((c) => c.id === purchaseId) ?? null, [compras, purchaseId]);

  // `useEnvio` y no `<form action>`: con action, React vaciaba el formulario también cuando
  // volvía con error, y el desplegable de la compra quedaba en blanco al lado de los errores.
  const { estado, enviar, enviando } = useEnvio<EstadoDevolucion>(async (prev, fd) => {
    const r = await registrarDevolucionAccion(prev, fd);
    if (r?.ok) {
      setPurchaseId("");
      setCantidades({});
      setDestino("");
      setMotivo("");
    }
    return r;
  }, null);
  const errorDe = new Map((estado && !estado.ok ? estado.errores ?? [] : []).map((e) => [e.productId, e.mensaje]));

  if (compras.length === 0) {
    return (
      <EmptyState
        title="No hay compras para devolver"
        description="Se devuelve mercadería de una compra a proveedor. Cuando registres compras en Recibir mercadería, van a aparecer acá."
        action={
          hrefCompras ? (
            <Link href={hrefCompras} className={buttonClasses("solid", "md")}>
              Recibir mercadería
            </Link>
          ) : undefined
        }
      />
    );
  }

  const lineas = (compra?.lineas ?? []).map((l) => {
    const txt = cantidades[l.productId] ?? "";
    const lectura = leerCantidad(txt);
    return { ...l, txt, lectura, valor: lectura.estado === "ok" ? lectura.valor * l.unitCost : 0 };
  });
  const hayAlguna = lineas.some((l) => l.lectura.estado === "ok" && l.lectura.valor > 0);
  const total = lineas.reduce((s, l) => s + l.valor, 0);
  const destinoListo = destino !== "" && (destino !== "deuda" || compra?.tieneDeuda);

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-lg border border-line p-4">
      {estado?.ok === false && <AvisoError titulo="No se registró la devolución" comoSeguir={estado.error} />}
      {estado?.ok && (
        <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-strong">
          {estado.mensaje}
        </p>
      )}
      <input type="hidden" name="purchaseId" value={purchaseId} />

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Compra de la que devolvés</span>
        <Select
          value={purchaseId}
          onChange={(e) => {
            setPurchaseId(e.target.value);
            setCantidades({});
            setDestino("");
          }}
        >
          <option value="">Elegí una compra…</option>
          {compras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.etiqueta}
            </option>
          ))}
        </Select>
      </label>

      {compra && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {lineas.map((l) => {
            const error = errorDe.get(l.productId) ?? (l.lectura.estado === "invalida" ? "Eso no es una cantidad. Escribila con coma (1,5)." : null);
            return (
              <li key={l.productId} className="grid grid-cols-[1fr_7rem] items-center gap-x-3 gap-y-1 px-3 py-3">
                <label htmlFor={`dev-${l.productId}`} className="min-w-0 text-sm">
                  <span className="block font-medium text-strong">{l.nombre}</span>
                  <span className="block text-xs text-muted">
                    quedan {formatearCantidad(l.queda)} {l.unidad} de esta compra · hay {formatearCantidad(Math.max(0, l.stock))} en stock
                  </span>
                </label>
                <Input
                  id={`dev-${l.productId}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={l.txt}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `dev-err-${l.productId}` : undefined}
                  onChange={(e) => setCantidades((m) => ({ ...m, [l.productId]: e.target.value }))}
                  className="h-11 text-right tabular-nums"
                />
                {/* Viajan todas las líneas de la compra (vacías = no se devuelven): así el
                    servidor valida exactamente lo que se ve. */}
                <input type="hidden" name="productId" value={l.productId} />
                <input type="hidden" name="qty" value={l.txt} />
                {error && (
                  <p id={`dev-err-${l.productId}`} role="alert" className="col-span-2 text-xs text-danger">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {compra && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm text-muted">¿Qué pasa con la plata? {total > 0 && <span className="font-medium text-strong">({fmtMoneyARS(total)} a costo de la compra)</span>}</legend>
          {compra.tieneDeuda && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="destino" value="deuda" checked={destino === "deuda"} onChange={() => setDestino("deuda")} className="size-5" />
              Se descuenta de lo que le debo por esta compra
            </label>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="destino" value="caja" checked={destino === "caja"} onChange={() => setDestino("caja")} className="size-5" />
            Me devuelve la plata
          </label>
          {destino === "caja" && (
            <label className="ml-8 block text-sm">
              <span className="mb-1 block text-muted">¿Cómo te la devuelve?</span>
              <Select name="medio" value={medio} onChange={(e) => setMedio(e.target.value as "EFECTIVO" | "MP")} className="sm:max-w-xs">
                <option value="EFECTIVO">Efectivo (entra a la caja)</option>
                <option value="MP">Transferencia / Mercado Pago</option>
              </Select>
            </label>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="destino" value="ninguno" checked={destino === "ninguno"} onChange={() => setDestino("ninguno")} className="size-5" />
            Sin reintegro por ahora (por ejemplo, repone la mercadería)
          </label>
        </fieldset>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Motivo</span>
        <Input name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: vacío pinchado, vencido, error de pedido" />
      </label>

      <div className="flex justify-end border-t border-line pt-4">
        <Registrar disabled={!compra || !hayAlguna || !destinoListo} enviando={enviando} />
      </div>
    </form>
  );
}
