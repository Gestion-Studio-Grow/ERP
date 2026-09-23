"use client";

// Productos del catálogo genérico (tenants no retail): lo que se vende por caja Y los
// insumos que consumen los servicios, en la misma tabla, porque son la misma entidad
// (`Product`). La diferencia la marca el PRECIO DE VENTA: con precio aparece en la caja
// (/admin/pedidos); sin precio queda como insumo.
//
// Antes esta sección no tenía precio ni control de stock: un producto cargado desde acá
// quedaba a $0 en la caja y sólo se podía vender después de un UPDATE por SQL, y vender no
// descontaba stock. Los campos ya existían en `Product` (saleUnit/price/pricePerKg/
// trackStock) y la action ya los parseaba; faltaba la UI. Cero schema nuevo.
//
// Copy neutral de rubro a propósito: el mismo form lo ven una estética, una tienda y una
// carnicería. "Por peso (kg)" sí, "pesalo" o "cortes" no.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createProduct, updateProduct, toggleProductActive, deleteProduct } from "@/lib/catalog-actions";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { salePriceOf, type SaleUnit } from "@/lib/stock/product-sale-fields";
// "Stock bajo" tiene UNA definición (la de Stock y la del número del Inicio): un producto que
// no controla stock nunca está "bajo". Pura y sin Prisma: se puede usar en el cliente.
import { esStockBajo } from "@/lib/inventory/valuation";
import {
  leerCantidad,
  leerImporte,
  cantidadParaFormulario,
  importeParaFormulario,
  formatearCantidad,
} from "@/lib/pos-peso";

type Product = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
  active: boolean;
  saleUnit: SaleUnit;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
};

// Etiqueta de la unidad de venta para mostrar junto al precio.
const perLabel = (saleUnit: SaleUnit) => (saleUnit === "WEIGHT" ? "/kg" : "/u");

// --- Volver al valor inicial cuando React resetea el formulario ---
//
// React 19 resetea el `<form action={fn}>` cuando termina la action: por eso el alta queda en
// blanco para el producto siguiente. Pero ese reset es el `form.reset()` NATIVO, y sólo
// devuelve a su valor a los campos NO controlados (`defaultValue`). Un campo con estado propio
// (`useState`) se queda con lo tipeado. MEDIDO antes de este hook, con estos componentes
// bundleados (React 19.2.4, Chromium 141, la Server Action reemplazada por una que guarda el
// FormData): después de dar de alta "Crema A" con stock 10 y precio 15.000, el alta de
// "Crema B", tipeando sólo el nombre, viajaba con stock=10 y price=15000: un segundo AJUSTE
// "Stock inicial" que nadie cargó y un precio ajeno. El test que lo corre está en
// src/lib/stock/alta-producto.test.ts.
//
// Este hook escucha el evento `reset` del form que contiene al elemento `id` (el reset nativo
// lo dispara antes de devolver los campos) y le pide al componente que vuelva a su inicial:
// el campo controlado se comporta ante el reset igual que uno con `defaultValue`.
export function useVolverAlResetear(id: string, volver: () => void) {
  // La función más reciente, sin re-suscribir en cada render (así usa las props vigentes,
  // como hace `defaultValue`).
  const volverRef = useRef(volver);
  useEffect(() => {
    volverRef.current = volver;
  });
  useEffect(() => {
    const form = document.getElementById(id)?.closest("form");
    if (!form) return;
    const alResetear = () => volverRef.current();
    form.addEventListener("reset", alResetear);
    return () => form.removeEventListener("reset", alResetear);
  }, [id]);
}

// Cómo se muestra un número guardado para editarlo: coma decimal, sin miles (así la misma
// regla lo relee igual: "12500" y "12500,5", nunca un "12.500" ambiguo). Un importe se
// muestra a centavos: un costo promedio guardado con más decimales no puede aparecer en rojo
// y trabar el guardado de un precio.
function textoParaEditar(tipo: "importe" | "cantidad", valor: number | null): string {
  if (valor == null) return "";
  return tipo === "importe" ? importeParaFormulario(valor).replace(".", ",") : formatearCantidad(valor);
}

// --- Un número del catálogo: precio, costo, stock inicial, aviso de stock bajo ---
//
// Eran `<input type="number">`. MEDIDO en Chromium 141 (tabla en pos-peso.ts): tecleado,
// "12,5" entrega "125" y lo toma como válido. Con el `step="0.01"` que tenía el precio de
// este catálogo (el de CH), "12.500" también pasaba como válido y `Number("12.500")` lo leía
// 12,5; con el `step="1"` de los cortes, ese mismo "12.500" quedaba frenado por
// `stepMismatch`. Acá es un `type="text"` con `inputMode="decimal"` (teclado numérico en el
// celular) que se lee con la regla del POS: `leerImporte` para plata ("6.543" son miles) y
// `leerCantidad` para kilos y unidades (coma decimal, gramos). Lo que viaja es un hidden con
// la forma canónica (punto decimal, sin miles), que el server vuelve a leer igual.
//
// Lo ilegible se pinta de rojo y `setCustomValidity` hace que el navegador NO envíe el
// formulario (medido en Chromium 141 sobre un formulario HTML plano: con el mensaje puesto,
// el evento submit no sale; sin él, sí). Así "abc" nunca viaja como 0, y si igual llegara,
// la Server Action lo rechaza con mensaje.
//
// El texto vive en estado (hay que leerlo mientras se tipea), así que el reset del form no
// lo alcanza: `useVolverAlResetear` lo devuelve a `valorInicial` después de cada alta.
//
// Sin `className` usa el `Input` del design system (44px de alto); con `className` pinta un
// `<input>` con esas clases, para los formularios que tienen su propio estilo (cortes).
export function CampoDecimal({
  id,
  name,
  tipo,
  valorInicial,
  placeholder,
  required,
  className,
}: {
  id: string;
  name: string;
  tipo: "importe" | "cantidad";
  valorInicial: number | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = useState(() => textoParaEditar(tipo, valorInicial));
  useVolverAlResetear(id, () => setTexto(textoParaEditar(tipo, valorInicial)));
  const lectura = tipo === "importe" ? leerImporte(texto) : leerCantidad(texto);
  const invalida = lectura.estado === "invalida";
  const mensaje =
    tipo === "importe"
      ? "Eso no es un importe. Escribilo como 6.543 o 6.543,50."
      : "Eso no es una cantidad. Escribila con coma si tiene decimales (12,5).";

  useEffect(() => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.setCustomValidity(invalida ? mensaje : "");
  }, [id, invalida, mensaje]);

  const props = {
    id,
    type: "text",
    inputMode: "decimal" as const,
    autoComplete: "off",
    value: texto,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTexto(e.target.value),
    placeholder,
    required,
    "aria-invalid": invalida ? true : undefined,
    "aria-describedby": invalida ? `${id}-error` : undefined,
  };

  return (
    <>
      {className ? <input {...props} className={className} /> : <Input {...props} />}
      {invalida && (
        <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-danger">
          {mensaje}
        </span>
      )}
      <input
        type="hidden"
        name={name}
        value={
          lectura.estado !== "ok"
            ? ""
            : tipo === "importe"
              ? importeParaFormulario(lectura.valor)
              : cantidadParaFormulario(lectura.valor)
        }
      />
    </>
  );
}

// El stock en la edición: se MUESTRA, no se edita. Antes era un input con el número de
// cuando se abrió la pantalla, y guardar un precio lo reescribía encima de las ventas del
// medio. Corregirlo es un recuento con motivo, en /admin/ajustes, que queda en el ledger:
// "Recontar" lleva ahí con el producto y el motivo ya elegidos.
export function StockSoloLectura({
  productId,
  stock,
  unit,
}: {
  productId: string;
  stock: number;
  unit: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-body">
      <span>
        Stock: <span className="tabular-nums">{formatearCantidad(stock)}</span> {unit}
      </span>
      <span aria-hidden className="text-faint">·</span>
      <Link
        href={`/admin/ajustes?producto=${encodeURIComponent(productId)}&motivo=RECUENTO`}
        className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-2 hover:underline"
      >
        Recontar
      </Link>
    </p>
  );
}

// --- Campos de venta compartidos por alta y edición ---
// Manda `saleUnit` (dispara el parseo de precio en la action), el precio que corresponde a
// esa forma, el `unit` coherente (kg si es por peso) y `trackStock` con el patrón
// hidden "off" + checkbox "on" (un checkbox destildado no viaja en el FormData).
function SaleFields({
  idPrefix,
  saleUnit,
  price,
  pricePerKg,
  unit,
  trackStock,
}: {
  idPrefix: string;
  saleUnit: SaleUnit;
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  trackStock: boolean;
}) {
  const [modo, setModo] = useState<SaleUnit>(saleUnit);
  const isWeight = modo === "WEIGHT";
  const priceId = `${idPrefix}-precio`;
  const selectId = `${idPrefix}-saleUnit`;
  // El `<select>` vuelve solo a su `defaultValue` con el reset del alta; `modo` es estado y no.
  // Sin esto, después de dar de alta algo "por peso" el select decía "por unidad" pero el
  // form seguía mandando `unit=kg` y el precio como `pricePerKg`.
  useVolverAlResetear(selectId, () => setModo(saleUnit));

  return (
    <>
      <label className="text-sm">
        <span className="block text-xs text-muted mb-1">Forma de venta</span>
        <Select
          id={selectId}
          name="saleUnit"
          defaultValue={saleUnit}
          onChange={(e) => setModo(e.target.value === "WEIGHT" ? "WEIGHT" : "UNIT")}
        >
          <option value="UNIT">Por unidad</option>
          <option value="WEIGHT">Por peso (kg)</option>
        </Select>
      </label>

      {isWeight ? (
        <input type="hidden" name="unit" value="kg" />
      ) : (
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Unidad</span>
          <Input
            id={`${idPrefix}-unit`}
            name="unit"
            defaultValue={unit && unit !== "kg" ? unit : "unidades"}
            placeholder="unidades, ml, cajas…"
          />
        </label>
      )}

      <label className="text-sm">
        <span className="block text-xs text-muted mb-1">
          Precio de venta {isWeight ? "por kg" : "por unidad"}
        </span>
        <CampoDecimal
          id={priceId}
          key={isWeight ? "kg" : "u"}
          name={isWeight ? "pricePerKg" : "price"}
          tipo="importe"
          valorInicial={isWeight ? pricePerKg : price}
          placeholder="Vacío = no se vende"
        />
      </label>

      <label className="flex items-center gap-2 text-sm self-end min-h-11">
        <input type="hidden" name="trackStock" value="off" />
        <input
          id={`${idPrefix}-trackStock`}
          type="checkbox"
          name="trackStock"
          value="on"
          defaultChecked={trackStock}
          className="size-4"
        />
        <span className="text-body">Controlar stock al vender</span>
      </label>
    </>
  );
}

function PriceCell({ product }: { product: Product }) {
  const sale = salePriceOf(product);
  if (sale == null) {
    return <span className="text-faint">Sin precio (insumo)</span>;
  }
  return (
    <span className="tabular-nums text-body">
      {fmtMoneyARS(sale)}
      <span className="text-faint"> {perLabel(product.saleUnit)}</span>
    </span>
  );
}

function ProductRow({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const lowStock = esStockBajo(product);

  if (editing) {
    return (
      <tr className="block sm:table-row border-b bg-surface-sunken">
        <td colSpan={5} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              await updateProduct(fd);
              setEditing(false);
            }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3"
          >
            <input type="hidden" name="id" value={product.id} />
            <label className="text-sm col-span-2">
              <span className="block text-xs text-muted mb-1">Nombre</span>
              <Input name="name" defaultValue={product.name} required />
            </label>
            <div className="text-sm">
              <span className="block text-xs text-muted mb-1">Stock</span>
              <StockSoloLectura productId={product.id} stock={product.stock} unit={product.unit} />
            </div>
            <label className="text-sm">
              <span className="block text-xs text-muted mb-1">Aviso stock bajo</span>
              <CampoDecimal
                id={`edit-${product.id}-low`}
                name="lowStockAt"
                tipo="cantidad"
                valorInicial={product.lowStockAt}
                required
              />
            </label>
            <SaleFields
              idPrefix={`edit-${product.id}`}
              saleUnit={product.saleUnit}
              price={product.price}
              pricePerKg={product.pricePerKg}
              unit={product.unit}
              trackStock={product.trackStock}
            />
            <div className="col-span-2 sm:col-span-4 flex gap-4 sm:gap-3 justify-start sm:justify-end whitespace-nowrap">
              <button type="submit" className="min-h-11 px-2 text-sm font-medium">Guardar</button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-2 text-sm text-muted">
                Cancelar
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
      <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${product.active ? "" : "text-faint line-through"}`}>
        {product.name}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Venta:</span>
        <PriceCell product={product} />
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
        <span className={lowStock ? "text-danger font-medium" : "text-body"}>
          {formatearCantidad(product.stock)} {product.unit}
        </span>
        {lowStock && (
          <span className="ml-2 inline-block rounded-full bg-danger-soft text-danger px-2 py-0.5 text-xs">
            Stock bajo
          </span>
        )}
        {product.trackStock && (
          <span
            className="ml-2 inline-block rounded-full bg-surface-sunken text-muted px-2 py-0.5 text-xs"
            title="Cada venta descuenta stock y no se vende más de lo que hay"
          >
            Descuenta al vender
          </span>
        )}
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5">
        <form action={toggleProductActive}>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="active" value={String(product.active)} />
          <button
            type="submit"
            className={`inline-flex items-center min-h-6 rounded-full px-2.5 py-1 text-xs font-medium ${
              product.active ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
            }`}
          >
            {product.active ? "Activo" : "Inactivo"}
          </button>
        </form>
      </td>
      <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button onClick={() => setEditing(true)} className="chip-btn">
            Editar
          </button>
          <form
            action={async (fd) => {
              if (!confirm(`¿Eliminar "${product.name}"?`)) return;
              await deleteProduct(fd);
            }}
          >
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className="chip-btn chip-btn-danger">
              Eliminar
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default function ProductsSection({ products }: { products: Product[] }) {
  const lowStockCount = products.filter((p) => p.active && esStockBajo(p)).length;
  const sellableCount = products.filter((p) => p.active && salePriceOf(p) != null).length;

  return (
    <section id="productos" aria-labelledby="productos-heading">
      <h2 id="productos-heading" className="text-lg font-medium mb-1">Productos</h2>
      <p className="text-sm text-muted mb-3">
        Lo que vendés por caja y los insumos que consumen los servicios. Un producto con precio de
        venta aparece en la caja; sin precio, queda como insumo. Con «controlar stock» activo, cada
        venta descuenta existencias y no se vende más de lo que hay — revisá que el stock cargado sea
        real antes de activarlo. El consumo por servicio se descuenta al completar el turno.
        {sellableCount === 0 && products.length > 0 && (
          <span className="ml-2 text-warning font-medium">
            Ningún producto tiene precio de venta: la caja no puede vender nada todavía.
          </span>
        )}
        {lowStockCount > 0 && (
          <span className="ml-2 text-danger font-medium">
            {lowStockCount} producto{lowStockCount !== 1 ? "s" : ""} con stock bajo.
          </span>
        )}
      </p>

      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line mb-4">
        <table className="block sm:table w-full text-left">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Precio de venta</th>
              <th className="px-4 py-2 font-medium">Stock</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
            {products.length === 0 && (
              <tr className="block sm:table-row">
                <td colSpan={5} className="block sm:table-cell px-0 sm:px-4 py-4 text-sm text-muted">
                  No hay productos cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alta: el control de stock arranca ACTIVO porque el stock inicial se carga acá mismo
          (es real). Los productos ya existentes conservan su valor hasta que alguien lo edite:
          prenderlo en masa sobre stock inventado bloquearía ventas por "falta de stock". */}
      <form action={createProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-sm col-span-2">
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <Input id="new-product-name" name="name" required placeholder="Nombre del producto" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Stock inicial</span>
          {/* Entra por el ledger como AJUSTE "Stock inicial" (alta-producto.ts). Vacío = 0. */}
          <CampoDecimal id="new-product-stock" name="stock" tipo="cantidad" valorInicial={null} placeholder="0" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Aviso stock bajo</span>
          <CampoDecimal id="new-product-low" name="lowStockAt" tipo="cantidad" valorInicial={5} />
        </label>
        <SaleFields
          idPrefix="new-product"
          saleUnit="UNIT"
          price={null}
          pricePerKg={null}
          unit="unidades"
          trackStock={true}
        />
        <button type="submit" className={buttonClasses("solid", "md", "col-span-2 sm:col-span-4")}>
          Agregar producto
        </button>
      </form>
    </section>
  );
}
