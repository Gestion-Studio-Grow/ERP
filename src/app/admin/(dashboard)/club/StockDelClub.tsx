"use client";

// ============================================================================
// EL STOCK DEL CLUB — el inventario, lo que hay que reponer, el conteo y los precios con lo que deja cada uno.
// ============================================================================
//
// Arriba, lo que hay que reponer (con «Pedir lo que falta por WhatsApp») y cuántos productos falta contar. Después,
// «Inventario» o «Precios y rentabilidad», con el buscador (nombre, rubro o código):
//   · Inventario: cada producto con su stock, el mínimo y cómo está (la palabra, nunca sólo el color). Tocarlo abre su
//     ficha al lado (o arriba, en el celular): nombre, precio, costo, mínimo, códigos y el CONTEO («Stock actual»,
//     vacío = sin controlar), dar de baja. «+ Producto o plato» abre el alta; «Ingresar por remito», el remito.
//   · Precios y rentabilidad: el costo, el % sobre costo y el precio se tocan en la tabla (Enter o al salir del
//     campo) y se ve el margen, lo vendido, lo facturado y la ganancia de los últimos 7 días.
// Es del dueño (solapa `soloDuenos` + permiso `stock` del motor): si quien opera con su PIN es recepción, lo ve pero
// no lo cambia. Todo cambia con `almacen.ejecutar` (aviso abajo y «Deshacer»). Reglas: stock-core.ts.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { Campo, Opciones, etiquetaDelClub } from "./formulario-del-club";
import { operadorActual } from "./operador-del-club";
import { permisosProveedores } from "./proveedores-core";
import { RegistrarRemito } from "./remito-del-club";
import type { PropsDeSolapa } from "./solapas-club";
import {
  TEXTO_ESTADO,
  armarPrecios,
  armarProducto,
  armarStock,
  ejecutarStock,
  puedeTocarStock,
  textoStock,
  type AccionStock,
  type CampoDePrecio,
  type DesenlaceStock,
  type EstadoDelProducto,
  type FilaPrecio,
  type FilaStock,
  type VistaProducto,
} from "./stock-core";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

const tarjeta = "flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
// Los tonos de la estampa: palabra + color, con contraste AA medido (el «warning» y el «neutral» del Badge quedan bajo
// 4,5:1 en el tema del club, por eso el texto va en `text-strong` sobre el fondo suave).
const VERDE = "bg-success-soft text-success";
const AMARILLO = "bg-warning-soft text-strong";
const ROJO = "bg-danger-soft text-danger";
const TONO: Readonly<Record<EstadoDelProducto, string>> = {
  ok: VERDE,
  reponer: AMARILLO,
  "sin-stock": ROJO,
  "sin-controlar": "bg-surface-sunken text-strong",
  plato: "bg-info-soft text-info",
  alquiler: "bg-info-soft text-info",
};

function Estampa({ tono, children }: { tono: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-medium whitespace-nowrap tabular-nums", tono)}>{children}</span>;
}

function useHacer(almacen: Almacen) {
  // Todo lo del stock se puede deshacer en los 6 s del aviso (nada pide PIN).
  return useCallback((a: AccionStock): DesenlaceStock => almacen.ejecutar((e, ahora, auth) => ejecutarStock(e, a, ahora, auth), { deshacible: true }), [almacen]);
}

function EstadoDelProductoBadge({ estado }: { estado: EstadoDelProducto }) {
  return (
    <Estampa tono={TONO[estado]}>
      {estado === "reponer" || estado === "sin-stock" ? "⚠ " : ""}
      {TEXTO_ESTADO[estado]}
    </Estampa>
  );
}

function DatosDeLaFila({ p }: { p: FilaStock }) {
  return (
    <>
      <span className="min-w-0">
        <span className="block font-semibold text-strong">{p.nombre}</span>
        <span className="block text-xs text-body">
          {p.categoria}
          {p.codigos ? ` · ${p.codigos}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 tabular-nums sm:justify-end">
        <EstadoDelProductoBadge estado={p.estado} />
        <span className="text-body">{p.estado === "plato" ? "Se mide por venta" : `Stock ${textoStock(p)}${p.stock != null && p.enUso == null ? ` · mín. ${p.minimo}` : ""}`}</span>
        <span className="text-strong">{pesos(p.precio)}</span>
      </span>
    </>
  );
}

const fila = "flex min-h-11 w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3";

function FilaDelProducto({ p, elegido, onAbrir }: { p: FilaStock; elegido: boolean; onAbrir: ((id: string) => void) | null }) {
  if (!onAbrir)
    return (
      <li className={cn(fila, "border-line bg-surface-raised")}>
        <DatosDeLaFila p={p} />
      </li>
    );
  return (
    <li>
      <button
        type="button"
        id={`producto-${p.id}`}
        aria-current={elegido || undefined}
        onClick={() => onAbrir(p.id)}
        className={cn(
          fila,
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          elegido ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
        )}
      >
        <DatosDeLaFila p={p} />
      </button>
    </li>
  );
}

/** El titular de un panel: recibe el foco al abrirse (Escape cierra, lo maneja la sección). */
function useTituloConFoco() {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return titulo;
}

function FormularioDelProducto({ f, hacer }: { f: VistaProducto; hacer: (a: AccionStock) => DesenlaceStock }) {
  const [d, setD] = useState({ nombre: f.nombre, precio: String(f.precio), costo: String(f.costo), minimo: String(f.minimo), codigo: f.codigo, codigoExterno: f.codigoExterno });
  // El conteo muestra el stock de AHORA (si se vende algo con la ficha abierta, se ve) hasta que se tipea; sólo lo
  // tipeado se guarda como conteo.
  const [conteo, setConteo] = useState<string | null>(null);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (hacer({ tipo: "editar", productoId: f.id, ...d, conteo }).ok) setConteo(null);
      }}
    >
      <Campo label="Nombre" value={d.nombre} onChange={set("nombre")} />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Precio de venta" inputMode="numeric" importe value={d.precio} onChange={set("precio")} />
        <Campo label="Costo" inputMode="numeric" importe value={d.costo} onChange={set("costo")} />
      </div>
      {!f.plato && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Campo
            label="Stock actual (conteo)"
            ayuda="Lo que hay hoy. Vacío = sin controlar: se vende sin tope y no avisa reposición."
            inputMode="numeric"
            placeholder="Sin controlar"
            value={conteo ?? (f.stock == null ? "" : String(f.stock))}
            onChange={(e) => setConteo(e.target.value)}
          />
          <Campo label="Mínimo de stock" ayuda="Con esto o menos, avisa que hay que reponer." inputMode="numeric" value={d.minimo} onChange={set("minimo")} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Campo label="Código interno" placeholder="Ej.: BP-020" value={d.codigo} onChange={set("codigo")} />
        <Campo label="Código de fábrica (lector)" inputMode="numeric" value={d.codigoExterno} onChange={set("codigoExterno")} />
      </div>
      <Button type="submit" variant="solid" size="md">
        Guardar
      </Button>
    </form>
  );
}

function FichaDelProducto({ almacen, productoId, onCerrar, onSeFue }: { almacen: Almacen; productoId: string; onCerrar: () => void; onSeFue: () => void }) {
  const seleccionar = useCallback((e: EstadoClub) => armarProducto(e, productoId), [productoId]);
  const f = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacer(almacen);
  const titulo = useTituloConFoco();
  useEffect(() => {
    if (!f) onSeFue();
  }, [f, onSeFue]);
  if (!f) return null;
  const detalle = [f.categoria, f.plato ? "plato de cocina (no lleva stock)" : f.alquiler ? `alquiler · ${f.enUso} en uso` : "", f.tienda ? "se ve en la tienda" : "no está en la tienda"].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={`ficha-producto-${f.id}`} className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`ficha-producto-${f.id}`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {f.nombre}
          </h2>
          <p className="text-sm text-body">{detalle}</p>
          <p className="mt-1">
            <EstadoDelProductoBadge estado={f.estado} />
          </p>
        </div>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Cerrar
        </Button>
      </header>
      {/* `key`: si cambian los datos guardados (o se deshace), el formulario arranca de lo guardado. El stock no va en la
          clave: una venta con la ficha abierta no borra lo que se está tipeando. */}
      <FormularioDelProducto key={`${f.nombre}|${f.precio}|${f.costo}|${f.minimo}|${f.codigo}|${f.codigoExterno}`} f={f} hacer={hacer} />
      <p className="text-sm text-body">El rubro y si se ve en la tienda se cargan al darlo de alta; por ahora no se cambian desde acá.</p>
      {f.activo ? (
        <Button variant="danger" size="md" onClick={() => hacer({ tipo: "baja", productoId: f.id, activo: false })}>
          Dar de baja {f.nombre}
        </Button>
      ) : (
        <Button variant="outline" size="md" onClick={() => hacer({ tipo: "baja", productoId: f.id, activo: true })}>
          Volver a activar {f.nombre}
        </Button>
      )}
    </section>
  );
}

function AltaDeProducto({ almacen, onListo, onCerrar }: { almacen: Almacen; onListo: (id: string) => void; onCerrar: () => void }) {
  const hacer = useHacer(almacen);
  const [d, setD] = useState({ nombre: "", categoria: "", precio: "", costo: "", minimo: "0", stock: "0", codigo: "", codigoExterno: "", plato: false });
  const set = (k: Exclude<keyof typeof d, "plato">) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const titulo = useTituloConFoco();
  return (
    <section aria-labelledby="club-alta-producto" className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <h2 id="club-alta-producto" ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Nuevo producto o plato
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const r = hacer({ tipo: "alta", ...d });
          if (r.ok && r.productoId) onListo(r.productoId);
        }}
      >
        <Campo label="Nombre" value={d.nombre} onChange={set("nombre")} />
        <Campo label="Rubro (ej.: Bebidas, Cocina, Shop)" value={d.categoria} onChange={set("categoria")} />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Precio de venta" inputMode="numeric" importe value={d.precio} onChange={set("precio")} />
          <Campo label="Costo" inputMode="numeric" importe value={d.costo} onChange={set("costo")} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={d.plato} onChange={(e) => setD({ ...d, plato: e.target.checked })} />
          Es un plato de cocina (no lleva stock: se mide por venta)
        </label>
        {!d.plato && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Stock inicial" inputMode="numeric" value={d.stock} onChange={set("stock")} />
            <Campo label="Mínimo de stock" inputMode="numeric" value={d.minimo} onChange={set("minimo")} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Campo label="Código interno" placeholder="Ej.: BP-020" value={d.codigo} onChange={set("codigo")} />
          <Campo label="Código de fábrica (lector)" inputMode="numeric" value={d.codigoExterno} onChange={set("codigoExterno")} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="solid" size="md">
            Dar de alta
          </Button>
          <Button variant="outline" size="md" onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}

const fmt = (v: number | null) => (v == null ? "" : String(v));

/** Una celda editable de «Precios y rentabilidad»: se guarda con Enter o al salir; si el motor dice que no, vuelve. */
function CeldaDePrecio({ p, campo, valor, etiqueta, hacer }: { p: FilaPrecio; campo: CampoDePrecio; valor: number | null; etiqueta: string; hacer: (a: AccionStock) => DesenlaceStock }) {
  const id = useId();
  const [texto, setTexto] = useState(fmt(valor));
  const [visto, setVisto] = useState(valor);
  if (visto !== valor) {
    // Cambió lo guardado (otra celda recalculó el precio, o se deshizo): se muestra lo nuevo sin perder el foco.
    setVisto(valor);
    setTexto(fmt(valor));
  }
  const guardar = () => {
    if (texto.trim() === fmt(valor)) return;
    if (!hacer({ tipo: "precio", productoId: p.id, campo, valor: texto }).ok) setTexto(fmt(valor));
  };
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {etiqueta} de {p.nombre}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        importe
        autoComplete="off"
        className="w-28"
        value={texto}
        placeholder={campo === "markup" ? "—" : undefined}
        disabled={campo === "markup" && p.costo <= 0}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            guardar();
          }
        }}
      />
    </>
  );
}

const TONO_MARGEN: Readonly<Record<FilaPrecio["tono"], string>> = { bien: VERDE, justo: AMARILLO, bajo: ROJO };

function TablaDePrecios({ almacen, busca, puedeTocar }: { almacen: Almacen; busca: string; puedeTocar: boolean }) {
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarPrecios(e, busca, a), [busca]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacer(almacen);
  const th = "py-2 pr-3 text-right font-medium whitespace-nowrap";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-body">
        {puedeTocar ? "Tocá el costo, el % sobre costo o el precio y apretá Enter: el precio nuevo vale para lo que se cargue de acá en más. " : ""}
        Lo vendido es de los últimos 7 días ({v.periodo}).
      </p>
      {/* La tabla es ancha: se corre de costado adentro de su caja (con el teclado también), no la página. `relative`:
          las etiquetas `sr-only` de las celdas son absolutas y, sin esto, corrían la página 27 px a 390 px. */}
      <div role="region" aria-label="Precios y rentabilidad (se desplaza de costado)" tabIndex={0} className="relative overflow-x-auto rounded-md border border-line focus-visible:outline-2 focus-visible:outline-focus">
        <table className="w-full min-w-[56rem] text-sm tabular-nums">
          <caption className="sr-only">Precios y rentabilidad por producto, últimos 7 días</caption>
          <thead>
            <tr className="border-b border-line text-xs text-body">
              <th scope="col" className="py-2 pr-3 pl-3 text-left font-medium">
                Producto
              </th>
              <th scope="col" className={th}>
                Costo
              </th>
              <th scope="col" className={th}>
                % sobre costo
              </th>
              <th scope="col" className={th}>
                Precio
              </th>
              <th scope="col" className={th}>
                Margen
              </th>
              <th scope="col" className={th}>
                Vendidos
              </th>
              <th scope="col" className={th}>
                Facturado
              </th>
              <th scope="col" className={cn(th, "pr-3")}>
                Ganancia
              </th>
            </tr>
          </thead>
          <tbody>
            {v.filas.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-3 text-body">
                  No hay productos con eso.
                </td>
              </tr>
            ) : (
              v.filas.map((p) => (
                <tr key={p.id} className="border-b border-line align-middle last:border-b-0">
                  <th scope="row" className="py-1.5 pr-3 pl-3 text-left font-normal">
                    <span className="block font-semibold text-strong">{p.nombre}</span>
                    {p.codigos && <span className="block text-xs text-body">{p.codigos}</span>}
                  </th>
                  {puedeTocar ? (
                    <>
                      <td className="py-1.5 pr-3 text-right">
                        <CeldaDePrecio p={p} campo="costo" valor={p.costo} etiqueta="Costo" hacer={hacer} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <CeldaDePrecio p={p} campo="markup" valor={p.markup} etiqueta="Porcentaje sobre el costo" hacer={hacer} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <CeldaDePrecio p={p} campo="precio" valor={p.precio} etiqueta="Precio" hacer={hacer} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{pesos(p.costo)}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{p.markup == null ? "—" : `${p.markup} %`}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{pesos(p.precio)}</td>
                    </>
                  )}
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                    <span className="mr-2 text-strong">{pesos(p.margen)}</span>
                    <Estampa tono={TONO_MARGEN[p.tono]}>
                      {p.tono === "bajo" ? "⚠ " : ""}
                      {p.margenPct} %{p.tono === "bien" ? "" : ` ${p.tono}`}
                    </Estampa>
                  </td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{p.unidades}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{pesos(p.facturado)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-strong">{pesos(p.ganancia)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold text-strong">
              <th scope="row" colSpan={5} className="py-2 pr-3 pl-3 text-left">
                Total 7 días · margen {v.margenPct} %
              </th>
              <td className="py-2 pr-3" />
              <td className="py-2 pr-3 text-right whitespace-nowrap">{pesos(v.facturado)}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">{pesos(v.ganancia)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type Panel = { tipo: "ficha"; id: string } | { tipo: "alta" } | { tipo: "remito" } | null;
type Modo = "inventario" | "precios";
const MODOS = [
  { valor: "inventario", etiqueta: "Inventario" },
  { valor: "precios", etiqueta: "Precios y rentabilidad" },
] as const;

export default function StockDelClub({ almacen }: PropsDeSolapa) {
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<Modo>("inventario");
  const seleccionar = useCallback((e: EstadoClub) => armarStock(e, busca), [busca]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const operador = operadorActual(almacen);
  const puedeTocar = puedeTocarStock(almacen.estado(), operador.usuario?.id);
  const puedeRemito = permisosProveedores(almacen.estado(), operador.usuario?.id).remito;
  const [panel, setPanel] = useState<Panel>(null);
  const buscaId = useId();
  const abierto = panel?.tipo === "ficha" ? panel.id : null;

  // El foco vuelve a quien abrió el panel (si ya no está en la lista, al buscador).
  const soltar = useCallback(() => {
    const volver = panel?.tipo === "ficha" ? `producto-${panel.id}` : panel?.tipo === "remito" ? "club-stock-remito" : "club-alta-producto-boton";
    setPanel(null);
    requestAnimationFrame(() => (document.getElementById(volver) ?? document.getElementById(buscaId))?.focus());
  }, [panel, buscaId]);
  // Cerrar a mano: lo hecho queda, ya no se deshace.
  const cerrar = useCallback(() => {
    almacen.olvidarDeshacer();
    soltar();
  }, [almacen, soltar]);
  const abrir = useCallback((id: string) => setPanel({ tipo: "ficha", id }), []);

  return (
    <div className="flex flex-col gap-4">
      {!puedeTocar && (
        <p className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-strong">
          El stock y los precios son del dueño: con tu usuario los podés mirar, pero contar, cambiar precios o dar de alta no.
        </p>
      )}

      {(v.faltantes.length > 0 || v.sinControlar > 0) && (
        <section aria-labelledby="club-reponer" className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-4">
          <h2 id="club-reponer" className="font-semibold text-strong">
            {v.faltantes.length > 0 ? `⚠ Para reponer (${v.faltantes.length})` : "Falta contar el stock"}
          </h2>
          {v.faltantes.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm text-strong tabular-nums">
              {v.faltantes.map((f) => (
                <li key={f.id}>
                  {f.nombre}: hay {f.stock}, el mínimo es {f.minimo} → pedir {f.pedir}
                </li>
              ))}
            </ul>
          )}
          {v.sinControlar > 0 && (
            <p className="text-sm text-strong">
              {v.sinControlar === 1 ? "1 producto todavía no tiene" : `${v.sinControlar} productos todavía no tienen`} el stock contado: se vende sin tope y no avisa
              reposición. Se carga en cada uno, en «Stock actual».
            </p>
          )}
          {v.pedirPorWhatsApp && (
            <a href={v.pedirPorWhatsApp} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md", "self-start")}>
              Pedir lo que falta por WhatsApp
            </a>
          )}
        </section>
      )}

      <div className={cn("grid grid-cols-1 gap-4", modo === "inventario" && "lg:grid-cols-[minmax(0,1fr)_28rem]")}>
        <section aria-labelledby="club-stock" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 data-pantalla id="club-stock" className="text-lg font-semibold text-strong">
              Stock y productos ({v.filas.length === v.total ? v.total : `${v.filas.length} de ${v.total}`})
            </h2>
            <div className="flex flex-wrap gap-2">
              {puedeRemito && (
                <Button id="club-stock-remito" variant="outline" size="md" onClick={() => setPanel({ tipo: "remito" })}>
                  Ingresar por remito
                </Button>
              )}
              {puedeTocar && (
                <Button id="club-alta-producto-boton" variant="solid" size="md" onClick={() => setPanel({ tipo: "alta" })}>
                  + Producto o plato
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex max-w-sm min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={buscaId} className={etiquetaDelClub}>
                Buscar por nombre, rubro o código
              </label>
              <Input id={buscaId} type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Opciones leyenda="Qué ver" leyendaVisible={false} opciones={MODOS} valor={modo} onElegir={setModo} />
          </div>

          {modo === "precios" ? (
            <TablaDePrecios almacen={almacen} busca={busca} puedeTocar={puedeTocar} />
          ) : v.filas.length === 0 ? (
            <p className="text-sm text-body">No hay productos con eso.{puedeTocar ? " Si es nuevo, dalo de alta." : ""}</p>
          ) : (
            <ul aria-label="Productos del club" className="flex flex-col gap-2">
              {v.filas.map((p) => (
                <FilaDelProducto key={p.id} p={p} elegido={p.id === abierto} onAbrir={puedeTocar ? abrir : null} />
              ))}
            </ul>
          )}

          {v.dadosDeBaja.length > 0 && (
            <details className="rounded-lg border border-line p-3 text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">
                Dados de baja ({v.dadosDeBaja.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {v.dadosDeBaja.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-strong">{p.nombre}</span>
                    {puedeTocar && (
                      <Button variant="outline" size="md" onClick={() => almacen.ejecutar((e, a, auth) => ejecutarStock(e, { tipo: "baja", productoId: p.id, activo: true }, a, auth), { deshacible: true })}>
                        Volver a activar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* En el celular lo abierto va ARRIBA de la lista; en la PC, al lado. En «Precios» la tabla usa todo el ancho y
            lo abierto va arriba. */}
        {panel ? (
          <div className={cn("order-first", modo === "inventario" && "lg:order-none lg:sticky lg:top-4 lg:self-start")}>
            {panel.tipo === "ficha" ? (
              <FichaDelProducto key={panel.id} almacen={almacen} productoId={panel.id} onCerrar={cerrar} onSeFue={soltar} />
            ) : panel.tipo === "alta" ? (
              <AltaDeProducto almacen={almacen} onListo={abrir} onCerrar={cerrar} />
            ) : (
              <RegistrarRemito almacen={almacen} onListo={soltar} onCerrar={cerrar} />
            )}
          </div>
        ) : (
          modo === "inventario" && (
            <p className="hidden rounded-lg border border-dashed border-line-strong p-4 text-sm text-body lg:block lg:self-start">
              {puedeTocar ? "Tocá un producto para editarlo: precio, costo, el conteo del stock y el mínimo." : "Para editar un producto tiene que entrar un dueño con su PIN."}
            </p>
          )
        )}
      </div>
    </div>
  );
}
