"use client";

// El formulario de un traslado: de dónde, adónde, qué y cuánto.
//
// Lo que se decide acá es sólo para ayudar a cargar (qué productos hay en el origen, si el
// destino lo tiene, si alcanza, si los dos lugares tienen el mismo CUIT); la misma regla la
// vuelve a aplicar el servidor adentro de la transacción (`validarUbicaciones` y
// `trasladarEnFases`, traslado-core.ts), que es lo que vale. Los productos llegan cruzados con la
// MISMA regla que usa la transacción (`cruzarPorClave`): un pausado en el destino entra igual, y
// dos productos con el mismo nombre se avisan acá en vez de sumarse y rebotar al enviar.
//
// La CLAVE del traslado la genera el servidor en cada carga de la página. Un doble clic manda la
// misma clave y se registra un solo traslado. Después de un traslado la página se vuelve a armar
// con una clave nueva y las líneas se vacían solas; si falló, lo cargado queda como estaba.
//
// Cantidades: campo de texto con teclado decimal y `leerCantidad` (coma o punto), como el
// mostrador. SIN imports de valor de servidor: la action (una referencia), tipos y funciones puras.

import { useActionState, useState } from "react";
import Link from "next/link";
import { trasladarAction, type EstadoTraslado } from "@/lib/multilocal/multilocal-actions";
import { textoCantidad, validarUbicaciones, type ProductoParaTraslado, type Ubicacion } from "@/lib/multilocal/traslado-core";
import { leerCantidad } from "@/lib/pos-peso";
import { AvisoError, BuscadorCombo, Button, Card, Field, Input, Select, buttonClasses } from "@/components/ui";

type Linea = { id: number; producto: string; cantidad: string };

export function TrasladoForm({
  clave,
  ubicaciones,
  productos,
  productoInicial,
}: {
  clave: string;
  ubicaciones: Ubicacion[];
  productos: ProductoParaTraslado[];
  productoInicial: string | null;
}) {
  const [estado, trasladar, pendiente] = useActionState<EstadoTraslado, FormData>(trasladarAction, null);
  const casa = ubicaciones.find((u) => u.esCasa) ?? ubicaciones[0];
  // Origen sugerido: la casa (el obrador). Si se llegó desde Stock por local con un producto que la
  // casa no tiene, el primer lugar que sí lo tiene.
  const conInicial = productos.find((p) => p.clave === productoInicial);
  const origenInicial =
    conInicial && typeof conInicial.sale[casa.id] !== "number"
      ? (ubicaciones.find((u) => typeof conInicial.sale[u.id] === "number")?.id ?? casa.id)
      : casa.id;
  const [origen, setOrigen] = useState(origenInicial);
  // Destino sugerido: el primer lugar con el mismo CUIT que el origen (el caso de todos los días).
  const [destino, setDestino] = useState(
    () => ubicaciones.find((u) => u.id !== origenInicial && validarUbicaciones(ubicaciones, origenInicial, u.id).ok)?.id ?? "",
  );
  const inicial = (): Linea[] => [
    { id: 1, producto: productoInicial && productos.some((p) => p.clave === productoInicial) ? productoInicial : "", cantidad: "" },
  ];
  // Las líneas valen para ESTA clave: cuando la página vuelve con una clave nueva (el traslado se
  // registró), arrancan vacías sin que nadie las borre a mano.
  const [cargadas, setCargadas] = useState<{ clave: string; lineas: Linea[] }>(() => ({ clave, lineas: inicial() }));
  const lineas = cargadas.clave === clave ? cargadas.lineas : inicial();
  const setLineas = (f: (l: Linea[]) => Linea[]) => setCargadas({ clave, lineas: f(lineas) });

  const lugar = (id: string) => ubicaciones.find((u) => u.id === id);
  const par = origen && destino ? validarUbicaciones(ubicaciones, origen, destino) : null;
  const nombreOrigen = lugar(origen)?.nombre ?? "";
  const nombreDestino = lugar(destino)?.nombre ?? "el destino";

  const cuanto = (n: number, p: ProductoParaTraslado) => textoCantidad(Math.max(n, 0), p.saleUnit, p.unidad);
  const enDestino = (p: ProductoParaTraslado): string => {
    const e = p.entra[destino];
    if (e === undefined) return "no lo tiene";
    if (e === "repetido") return "tiene dos con este nombre";
    return e.pausado ? `${cuanto(e.stock, p)} (pausado)` : cuanto(e.stock, p);
  };
  const opciones = productos
    .filter((p) => p.sale[origen] !== undefined)
    .map((p) => {
      const sale = p.sale[origen];
      return {
        id: p.clave,
        etiqueta: `${p.nombre} (${p.saleUnit === "WEIGHT" ? "por kilo" : "por unidad"})`,
        detalle:
          (sale === "repetido" ? `${nombreOrigen} tiene dos con este nombre` : `Hay ${cuanto(sale, p)} en ${nombreOrigen}`) +
          (destino ? ` · ${nombreDestino}: ${enDestino(p)}` : ""),
      };
    });

  const problemaDe = (l: Linea): string | null => {
    const p = productos.find((x) => x.clave === l.producto);
    if (!p) return null;
    const sale = p.sale[origen];
    if (sale === undefined) return `${nombreOrigen} no tiene este producto activo: elegí otro.`;
    if (sale === "repetido") return `En ${nombreOrigen} hay dos productos «${p.nombre}»: renombrá uno desde su catálogo y volvé a trasladar.`;
    const entra = destino ? p.entra[destino] : undefined;
    if (destino && entra === undefined) {
      return `${nombreDestino} no lo tiene en su catálogo: mandale la lista desde «Catálogo y precios de la marca» antes de trasladarlo.`;
    }
    if (entra === "repetido") return `En ${nombreDestino} hay dos productos «${p.nombre}»: renombrá uno desde su catálogo y volvé a trasladar.`;
    const c = leerCantidad(l.cantidad);
    if (c.estado === "invalida") return "La cantidad no se entiende. Escribila como 10 o 2,5.";
    if (c.estado === "ok" && p.saleUnit === "UNIT" && !Number.isInteger(c.valor)) return "Va por unidad: la cantidad tiene que ser entera.";
    if (c.estado === "ok" && c.valor > sale + 0.0005) return `En ${nombreOrigen} hay ${cuanto(sale, p)}: no alcanza.`;
    return null;
  };
  // Un pausado en el destino no frena: entra igual, y se avisa para que allá lo reactiven.
  const avisoDe = (l: Linea): string | null => {
    const p = productos.find((x) => x.clave === l.producto);
    const e = p && destino ? p.entra[destino] : undefined;
    return p && e !== undefined && e !== "repetido" && e.pausado
      ? `En ${nombreDestino} «${p.nombre}» está pausado: entra igual, y allá lo tienen que reactivar para venderlo.`
      : null;
  };
  const completas = lineas.filter((l) => l.producto && leerCantidad(l.cantidad).estado === "ok");
  const puedeEnviar = !!par?.ok && completas.length > 0 && lineas.every((l) => problemaDe(l) === null) && !pendiente;

  return (
    <form action={trasladar} className="space-y-4">
      <input type="hidden" name="clave" value={clave} />

      {estado?.ok && (
        <Card className="border-success/30 bg-success-soft" role="status">
          <p className="font-semibold text-strong">{estado.texto}</p>
          <Link href={`/admin/locales/traslados/${estado.clave}`} className={buttonClasses("outline", "md", "mt-2")}>
            Ver e imprimir el remito {estado.codigo}
          </Link>
        </Card>
      )}
      {estado && !estado.ok && <AvisoError titulo="No se hizo el traslado" comoSeguir={estado.error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Sale de" htmlFor="traslado-origen">
          <Select
            id="traslado-origen"
            name="origen"
            value={origen}
            onChange={(e) => {
              setOrigen(e.target.value);
              if (e.target.value === destino) setDestino("");
            }}
          >
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {u.esCasa ? " (la casa)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Va a" htmlFor="traslado-destino">
          <Select id="traslado-destino" name="destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Elegí el local</option>
            {ubicaciones
              .filter((u) => u.id !== origen)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                  {u.esCasa ? " (la casa)" : ""}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      {par && !par.ok && <AvisoError titulo="Así no se puede trasladar" comoSeguir={par.error} />}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-strong">Qué se manda</legend>
        {opciones.length === 0 && (
          <p className="text-sm text-muted">{nombreOrigen} no tiene productos activos para mandar.</p>
        )}
        {lineas.map((l, i) => {
          const p = productos.find((x) => x.clave === l.producto);
          const problema = problemaDe(l);
          const aviso = problema ? null : avisoDe(l);
          return (
            <div key={l.id} className="rounded-lg border border-line p-3">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
                <Field label={`Producto ${lineas.length > 1 ? i + 1 : ""}`.trim()} htmlFor={`traslado-producto-${l.id}`}>
                  <BuscadorCombo
                    id={`traslado-producto-${l.id}`}
                    opciones={opciones}
                    valor={l.producto}
                    placeholder="Buscá el producto"
                    onElegir={(id) => setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, producto: id } : x)))}
                  />
                  <input type="hidden" name="producto" value={l.producto} />
                </Field>
                <Field label={p?.saleUnit === "UNIT" ? "Unidades" : "Kilos"} htmlFor={`traslado-cantidad-${l.id}`}>
                  <Input
                    id={`traslado-cantidad-${l.id}`}
                    name="cantidad"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={p?.saleUnit === "UNIT" ? "Ej: 12" : "Ej: 10,5"}
                    value={l.cantidad}
                    aria-invalid={leerCantidad(l.cantidad).estado === "invalida" || undefined}
                    onChange={(e) => setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, cantidad: e.target.value } : x)))}
                  />
                </Field>
                {lineas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                    aria-label={`Quitar la línea ${i + 1}`}
                  >
                    Quitar
                  </Button>
                )}
              </div>
              {problema && (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {problema}
                </p>
              )}
              {aviso && (
                <p className="mt-2 text-sm text-warning" role="status">
                  {aviso}
                </p>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          onClick={() => setLineas((ls) => [...ls, { id: Math.max(0, ...ls.map((x) => x.id)) + 1, producto: "", cantidad: "" }])}
          disabled={lineas.length >= 20}
          className="w-full sm:w-auto"
        >
          Agregar otro producto
        </Button>
      </fieldset>

      <Field label="Nota (opcional)" htmlFor="traslado-nota" hint="Sale en el remito: quién lo lleva, para cuándo.">
        {/* `key`: con la clave nueva de un traslado ya registrado, la nota arranca vacía. */}
        <Input key={clave} id="traslado-nota" name="nota" maxLength={200} autoComplete="off" />
      </Field>

      <Button type="submit" disabled={!puedeEnviar} className="w-full sm:w-auto">
        {pendiente ? "Trasladando…" : "Trasladar"}
      </Button>
    </form>
  );
}
