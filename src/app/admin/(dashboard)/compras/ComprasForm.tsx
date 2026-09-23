"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createStockPurchase } from "@/lib/stock-actions";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import {
  leerCantidad,
  leerImporte,
  cantidadParaFormulario,
  importeParaFormulario,
} from "@/lib/pos-peso";

// Producto reponible que llega del loader (getStockData): con stock/unidad actuales.
type ReplenishableProduct = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
};

// Una línea de la entrada en construcción. Se guarda el TEXTO tipeado de la cantidad (en la
// unidad del producto) y del costo unitario (opcional en reposición), no un número.
//
// Antes eran `<input type="number">` leídos con `Number()`. MEDIDO en Chromium (tabla en
// pos-peso.ts): tecleando "12,5" kg el campo entrega "125", así que la línea del remito
// entraba diez veces al stock y el egreso del libro salía diez veces más grande; y un costo
// "12.500" pasaba como 12,5. Ahora los dos campos son texto: la cantidad se lee con
// `leerCantidad` (coma decimal, gramos) y el costo con `leerImporte` ("6.543" son seis mil
// quinientos cuarenta y tres pesos). El server vuelve a leer con las mismas funciones.
type Line = { key: number; productId: string; qtyText: string; costText: string };

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

// `formal` (perfil Empresa): muestra la cabecera de ORDEN FORMAL a proveedor —
// razón social + CUIT + N° de orden de compra (J45/18J). Default false = cabecera
// simple de Comercio (proveedor libre + nota), idéntica a hoy.
// Mismo blindaje que el POS: sin esto, un doble clic registraba DOS compras (medidas a
// 52 ms de diferencia) y el stock subía el doble. Reponer mercadería que no llegó es
// tan caro como cobrar dos veces.
function RegistrarSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${buttonClasses("solid", "lg")} disabled:opacity-50`}
    >
      {pending ? "Registrando…" : label}
    </button>
  );
}

export default function ComprasForm({ products, formal = false }: { products: ReplenishableProduct[]; formal?: boolean }) {
  const [kind, setKind] = useState<"COMPRA" | "REPOSICION">("COMPRA");
  // Cómo se pagó la compra. Arranca VACÍO a propósito: el sistema venía asumiendo efectivo
  // porque el formulario no preguntaba, y `StockPurchase` no tiene ninguna columna de la que
  // derivarlo. Asumirlo mal descuadra el arqueo por el importe completo (falta en una columna
  // y sobra en la otra) y además apaga el aviso de duplicado del libro, que compara por medio.
  const [pago, setPago] = useState<"" | "EFECTIVO" | "MP" | "TARJETA">("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qtyText: "", costText: "" }]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido: al elegir producto saltamos a la cantidad; con Enter, al próximo
  // producto (mismo flujo sin-mouse que el POS de venta). Guardamos el id pendiente
  // en un ref (no en state) para poder enfocarlo tras el render sin setState-en-effect.
  const focusRef = useRef<string | null>(null);
  const focus = (id: string) => {
    focusRef.current = id;
  };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const isCompra = kind === "COMPRA";

  // Tras cada render, si hay un foco pendiente lo aplicamos y limpiamos el ref
  // (mutar un ref no dispara re-render, así que no hay cascada).
  useEffect(() => {
    if (!focusRef.current) return;
    document.getElementById(focusRef.current)?.focus();
    focusRef.current = null;
  });

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId: "", qtyText: "", costText: "" }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Lectura de cada línea. `qty`/`unitCost` valen 0 mientras no haya algo legible; las
  // marcas `qtyMal`/`costMal` separan "todavía no escribió" de "escribió algo que no es".
  const leidas = lines.map((l) => {
    const p = byId.get(l.productId);
    const q = leerCantidad(l.qtyText);
    const c = leerImporte(l.costText);
    return {
      ...l,
      p,
      qty: q.estado === "ok" ? q.valor : 0,
      unitCost: c.estado === "ok" ? c.valor : 0,
      qtyMal: !!p && q.estado === "invalida",
      costMal: !!p && c.estado === "invalida",
    };
  });

  const totalCost = leidas.reduce((s, l) => {
    if (!l.p || !(l.qty > 0) || !(l.unitCost > 0)) return s;
    return s + l.qty * l.unitCost;
  }, 0);
  const hasValidLine = leidas.some((l) => l.p && l.qty > 0);
  // Una línea con algo ilegible frena el registro entero: si viajaran las otras, el remito
  // quedaría cargado a medias y el egreso por menos, sin que nadie lo note.
  const hayIlegible = leidas.some((l) => l.qtyMal || l.costMal);

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos cargados todavía. Cargá los productos en el catálogo para poder
        registrar compras y reponer su stock.
      </div>
    );
  }

  return (
    <form action={createStockPurchase} className="rounded-lg border border-line p-4 space-y-4">
      {/* El hidden refleja el toggle de tipo. */}
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setKind("COMPRA")}
          className={`chip-btn text-sm ${isCompra ? "bg-accent text-on-accent" : ""}`}
        >
          Compra a proveedor
        </button>
        <button
          type="button"
          onClick={() => setKind("REPOSICION")}
          className={`chip-btn text-sm ${!isCompra ? "bg-accent text-on-accent" : ""}`}
        >
          Reposición / ajuste
        </button>
        <span className="text-xs text-faint">
          {isCompra
            ? "Ingreso de mercadería con costo. Suma stock y registra el costo de compra."
            : "Reposición interna (recuento, devolución). Suma stock; el costo es opcional."}
        </span>
      </div>

      {/* Cabecera del documento — orden FORMAL (Empresa) o simple (Comercio). */}
      {formal ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-muted mb-1">Razón social del proveedor {isCompra ? "" : "(opcional)"}</span>
              <Input name="supplier" placeholder="Ej.: Distribuidora Norte S.A." />
            </label>
            <label className="text-sm">
              <span className="block text-muted mb-1">CUIT</span>
              <Input name="cuit" placeholder="30-71234567-9" inputMode="numeric" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-muted mb-1">N° de orden de compra</span>
              <Input name="orderNumber" placeholder="Ej.: A-0042" />
            </label>
            <label className="text-sm">
              <span className="block text-muted mb-1">Nota</span>
              <Input name="notes" placeholder="Ej.: entrega parcial" />
            </label>
          </div>
          <p className="text-xs text-faint">
            Orden formal a proveedor (edición Empresa): la razón social, el CUIT y el N° de orden
            quedan registrados con la entrada.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-muted mb-1">Proveedor {isCompra ? "" : "(opcional)"}</span>
            <Input name="supplier" placeholder="Nombre del proveedor o remito" />
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Nota</span>
            <Input name="notes" placeholder="Ej.: remito 0001-00042, entrega parcial" />
          </label>
        </div>
      )}

      {/* Cómo se pagó. Sólo para COMPRA: una reposición interna no mueve plata, así que no
          tiene medio que informar. Sin este dato el egreso se asentaba siempre en EFECTIVO. */}
      {isCompra && (
        <label className="text-sm">
          <span className="block text-muted mb-1">Cómo se pagó</span>
          <Select name="pago" value={pago} onChange={(e) => setPago(e.target.value as typeof pago)}>
            <option value="">Elegí un medio…</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="MP">Transferencia / Mercado Pago</option>
            <option value="TARJETA">Tarjeta</option>
          </Select>
          <span className="mt-1 block text-xs text-faint">
            Con esto sale del libro de caja por la columna correcta. Si se elige mal, el arqueo del
            día cierra con faltante en una columna y sobrante en la otra por el mismo importe.
          </span>
        </label>
      )}

      {/* Líneas de la entrada */}
      <div className="space-y-2 border-t border-line pt-4">
        {leidas.map((l) => {
          const { p } = l;
          const lineTotal = p && l.qty > 0 && l.unitCost > 0 ? l.qty * l.unitCost : 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_110px_130px_auto]">
              <Select
                className="col-span-3 sm:col-span-1"
                id={`prod-${l.key}`}
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value });
                  if (e.target.value) focus(`qty-${l.key}`);
                }}
              >
                <option value="">Elegí un producto…</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} — hay {qtyFmt.format(prod.stock)} {prod.unit}
                  </option>
                ))}
              </Select>
              <div className="relative">
                <Input
                  id={`qty-${l.key}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={l.qtyText}
                  aria-label="Cantidad"
                  aria-invalid={l.qtyMal ? true : undefined}
                  placeholder={p ? "Cantidad" : "—"}
                  onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focus(`cost-${l.key}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? p.unit.slice(0, 3) : ""}
                </span>
              </div>
              <div className="relative">
                <Input
                  id={`cost-${l.key}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={l.costText}
                  aria-label="Costo unitario"
                  aria-invalid={l.costMal ? true : undefined}
                  placeholder={isCompra ? "Costo u." : "Costo (opcional)"}
                  onChange={(e) => setLine(l.key, { costText: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (l.qty > 0) focus(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-6 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  $
                </span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="w-24 text-right text-sm tabular-nums text-body">
                  {lineTotal > 0 ? fmtMoneyARS(lineTotal) : "—"}
                </span>
                {/* Medía 17×18px: la mitad del piso de 24px que exige el propio gate
                    visual del repo (`scripts/qa/visual-audit.mjs:195`, AA_MIN = 24) y el
                    control más chico de todo el panel. Borrar una línea de una compra no
                    tiene deshacer, y con ese tamaño en el teléfono se le acierta al de al
                    lado. El gemelo del POS ya estaba resuelto (`PosForm.tsx:247`,
                    min-h-6/min-w-6); acá se va al objetivo táctil real de 44px. */}
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  aria-label="Quitar línea"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-lg leading-none text-muted hover:text-danger sm:min-h-9 sm:min-w-9"
                >
                  ×
                </button>
              </div>
              {(l.qtyMal || l.costMal) && (
                <p role="alert" className="col-span-3 sm:col-span-4 text-xs text-danger">
                  {l.qtyMal
                    ? "Eso no es una cantidad. Escribila con coma si tiene decimales (12,5)."
                    : "Eso no es un costo. Escribilo como 6.543 o 6.543,50."}
                </p>
              )}
              {/* Inputs que viajan a la server action (patrón getAll del Core). La
                  cantidad SIEMPRE viaja si hay producto y cantidad; el costo viaja
                  en paralelo para no desalinear los arrays (vacío → 0 en la acción).
                  Viaja la forma CANÓNICA (punto decimal, sin miles), no lo tipeado: el
                  server la vuelve a leer con las mismas funciones. */}
              {p && l.qty > 0 && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                  <input
                    type="hidden"
                    name="unitCost"
                    value={l.unitCost > 0 ? importeParaFormulario(l.unitCost) : ""}
                  />
                </>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => focus(`prod-${addLine()}`)}
          className="chip-btn text-sm"
        >
          + Agregar producto
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="text-sm text-muted">
          Costo total{" "}
          <span className="ml-1 text-2xl font-semibold tabular-nums text-strong">
            {fmtMoneyARS(totalCost)}
          </span>
        </div>
        <RegistrarSubmit
          disabled={!hasValidLine || hayIlegible || (isCompra && pago === "")}
          label={`Registrar ${isCompra ? "compra" : "reposición"}`}
        />
      </div>
    </form>
  );
}
