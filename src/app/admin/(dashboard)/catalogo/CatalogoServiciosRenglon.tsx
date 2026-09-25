"use client";

// ============================================================================
// CATÁLOGO DE UN NEGOCIO DE SERVICIOS (CH) — «Diseño nuevo» (Renglón).
// ============================================================================
//
// La idea viene de la lista de precios pegada en la recepción del salón: el nombre del servicio,
// una línea de puntos y el precio a la derecha. Un renglón por ítem, UNA tecla por renglón y el
// resto en «⋯» (Pausar, Eliminar con confirmación). El formulario se abre en el cajón (en la PC,
// al costado; en el celular sube como una hoja) y la lista queda a la vista.
//
// Cero lógica nueva: cada formulario manda los MISMOS campos a las MISMAS actions que el catálogo
// de siempre (src/lib/catalog-actions.ts y src/lib/coupon-actions.ts). La validación vive ahí.

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bloque, Cajon, Field, Input, Marca, MenuMas, Plata, Renglon, Seccion, Select, Textarea, buttonClasses } from "@/components/ui";
import {
  createBox,
  createBoxBlock,
  createResource,
  createService,
  deleteBox,
  deleteBoxBlock,
  deleteResource,
  deleteService,
  setServiceProducts,
  setServiceResources,
  toggleBoxActive,
  toggleServiceActive,
  updateBox,
  updateResource,
  updateService,
} from "@/lib/catalog-actions";
import { createCoupon, deleteCoupon, toggleCouponActive } from "@/lib/coupon-actions";
import { fmtShortDate } from "@/lib/datetime";
import { cuponAgotado } from "@/lib/venta-reglas";
import { useToast } from "../ToastProvider";

// --- Formas de los datos (las que ya devuelven getCatalog y getCoupons) ---------------------------

type Insumo = { id: string; name: string; unit: string; active: boolean };
type Categoria = { id: string; name: string; order: number };
type Equipo = { id: string; name: string; quantity: number; services: { serviceId: string }[] };
export type ServicioDelCatalogo = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  depositAmount: number | null;
  active: boolean;
  categoryId: string | null;
  category: Categoria | null;
  products: { productId: string; quantity: number }[];
  resources: { resourceId: string; units: number }[];
};
type Bloqueo = { id: string; startsAt: Date; endsAt: Date; reason: string };
type Box = { id: string; name: string; active: boolean; blocks: Bloqueo[] };
type Cupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
};

const plural = (n: number, uno: string, varios: string) => `${n}\u00a0${n === 1 ? uno : varios}`;
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

// --- El cajón vive en la dirección (?editar=… / ?agregar=1): se puede volver y recargar ----------

function useCajon() {
  const ruta = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const href = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
  const cerrar = () => router.replace(href({ editar: null, agregar: null }), { scroll: false });
  return { href, cerrar };
}

/** Manda una action con FormData armado a mano y avisa si falla (Pausar, Eliminar). */
function useAccion() {
  const [pendiente, startTransition] = useTransition();
  const { showError, showSuccess } = useToast();
  const correr = (accion: (fd: FormData) => Promise<unknown>, campos: Record<string, string>, ok?: string) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    startTransition(async () => {
      try {
        await accion(fd);
        if (ok) showSuccess(ok);
      } catch (err) {
        showError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  };
  return { correr, pendiente };
}

/** Un formulario del cajón: guarda, avisa y cierra. El error lo dice la action, tal cual. */
function useGuardar(alTerminar: () => void, ok: string) {
  const { showError, showSuccess } = useToast();
  return async (accion: (fd: FormData) => Promise<unknown>, fd: FormData) => {
    try {
      await accion(fd);
      showSuccess(ok);
      alTerminar();
    } catch (err) {
      showError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  };
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-line py-3 text-sm text-muted">{children}</p>;
}

/** El nombre con la línea de puntos hasta el precio, como en la lista de la recepción. */
function ConPuntos({ children, apagado }: { children: React.ReactNode; apagado?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={apagado ? "text-muted" : undefined}>{children}</span>
      <span aria-hidden className="mb-1 hidden min-w-8 flex-1 border-b border-dotted border-line-strong sm:block" />
    </span>
  );
}

// ================================================================================================
// SERVICIOS
// ================================================================================================

export function ServiciosRenglon({
  servicios,
  categorias,
  insumos,
  equipos,
  quienesLaHacen,
  editar,
  agregar,
}: {
  servicios: ServicioDelCatalogo[];
  categorias: Categoria[];
  insumos: Insumo[];
  equipos: Equipo[];
  /** Cuántos profesionales activos hacen cada servicio (por id de servicio). */
  quienesLaHacen: Record<string, number>;
  editar: string | null;
  agregar: boolean;
}) {
  const { href, cerrar } = useCajon();
  const { correr, pendiente } = useAccion();
  const editando = editar ? (servicios.find((s) => s.id === editar) ?? null) : null;

  const grupos = [...categorias]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, titulo: c.name, items: servicios.filter((s) => s.categoryId === c.id) }))
    .filter((g) => g.items.length > 0);
  const sinCategoria = servicios.filter((s) => !s.categoryId);
  if (sinCategoria.length > 0) grupos.push({ id: "sin-categoria", titulo: "Sin categoría", items: sinCategoria });

  const eliminar = (s: ServicioDelCatalogo) => {
    if (!confirm(`¿Eliminar «${s.name}»? Deja de aparecer en la agenda y en la web. Si ya tiene turnos no se puede: pausalo.`)) return;
    correr(deleteService, { id: s.id }, `«${s.name}» eliminado.`);
  };

  return (
    <div aria-busy={pendiente || undefined}>
      {grupos.length === 0 && <Vacio>Todavía no hay servicios. Agregá el primero con el botón de arriba.</Vacio>}
      {grupos.map((g) => (
        <Bloque
          key={g.id}
          id={`cat-${g.id}`}
          titulo={g.titulo}
          cuenta={g.items.length}
          nota={g.id === "sin-categoria" ? <Marca tipo="atencion">Asignales una categoría</Marca> : undefined}
        >
          <ul>
            {g.items.map((s) => {
              const quienes = quienesLaHacen[s.id] ?? 0;
              const detalle = [
                s.residentPrice != null ? `vecino ${pesos(s.residentPrice)}` : null,
                s.depositAmount != null ? `seña ${pesos(s.depositAmount)}` : null,
                s.products.length > 0 ? plural(s.products.length, "insumo", "insumos") : null,
              ].filter(Boolean);
              return (
                <Renglon
                  key={s.id}
                  as="li"
                  folio={<span className="tabular-nums">{s.durationMin}&nbsp;min</span>}
                  titulo={<ConPuntos apagado={!s.active}>{s.name}</ConPuntos>}
                  detalle={
                    <>
                      {detalle.map((d) => `${d} · `)}
                      {quienes === 0 ? (
                        <Marca tipo="atencion">nadie lo hace</Marca>
                      ) : (
                        plural(quienes, "profesional", "profesionales")
                      )}
                      {!s.active && (
                        <>
                          {" · "}
                          <Marca tipo="anulado">pausado</Marca>
                        </>
                      )}
                    </>
                  }
                  plata={<Plata valor={s.price} sinCentavos />}
                  tecla={
                    <span className="flex items-center gap-1">
                      <Link href={href({ editar: s.id, agregar: null })} scroll={false} className={buttonClasses("outline", "sm")}>
                        Editar
                      </Link>
                      <MenuMas etiqueta={`Más acciones de ${s.name}`}>
                        <button type="button" onClick={() => correr(toggleServiceActive, { id: s.id, active: String(s.active) })}>
                          {s.active ? "Pausar (no se ofrece)" : "Volver a ofrecer"}
                        </button>
                        <button type="button" data-peligro onClick={() => eliminar(s)}>
                          Eliminar
                        </button>
                      </MenuMas>
                    </span>
                  }
                />
              );
            })}
          </ul>
        </Bloque>
      ))}

      <Cajon abierto={editando !== null} onCerrar={cerrar} titulo={editando?.name ?? ""} descripcion={editando ? `${editando.durationMin} min · ${pesos(editando.price)}` : undefined}>
        {editando && (
          <div key={editando.id} className="flex flex-col gap-8">
            <FormularioServicio servicio={editando} categorias={categorias} alTerminar={cerrar} />
            <InsumosDelServicio servicio={editando} insumos={insumos} />
            <EquiposDelServicio servicio={editando} equipos={equipos} />
          </div>
        )}
      </Cajon>
      <Cajon abierto={agregar && editando === null} onCerrar={cerrar} titulo="Agregar un servicio">
        {agregar && <FormularioServicio servicio={null} categorias={categorias} alTerminar={cerrar} />}
      </Cajon>
    </div>
  );
}

function FormularioServicio({
  servicio: s,
  categorias,
  alTerminar,
}: {
  servicio: ServicioDelCatalogo | null;
  categorias: Categoria[];
  alTerminar: () => void;
}) {
  const guardar = useGuardar(alTerminar, s ? "Servicio guardado." : "Servicio agregado.");
  const p = s ? `srv-${s.id}` : "srv-nuevo";
  return (
    <form action={(fd) => guardar(s ? updateService : createService, fd)} className="flex flex-col gap-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Nombre" htmlFor={`${p}-nombre`} required>
        <Input id={`${p}-nombre`} name="name" defaultValue={s?.name ?? ""} required placeholder="Ej.: Limpieza facial profunda" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duración (min)" htmlFor={`${p}-duracion`} required>
          <Input id={`${p}-duracion`} name="durationMin" type="number" inputMode="numeric" min={5} step={5} defaultValue={s?.durationMin ?? 60} required />
        </Field>
        <Field label="Precio ($)" htmlFor={`${p}-precio`} required>
          <Input id={`${p}-precio`} name="price" type="number" inputMode="numeric" min={0} step={1} defaultValue={s?.price ?? ""} required />
        </Field>
        <Field label="Precio vecino ($)" htmlFor={`${p}-vecino`} hint="Vacío si no tiene">
          <Input id={`${p}-vecino`} name="residentPrice" type="number" inputMode="numeric" min={0} step={1} defaultValue={s?.residentPrice ?? ""} />
        </Field>
        <Field label="Seña ($)" htmlFor={`${p}-sena`} hint="Vacío si no pide">
          <Input id={`${p}-sena`} name="depositAmount" type="number" inputMode="numeric" min={0} step={1} defaultValue={s?.depositAmount ?? ""} />
        </Field>
      </div>
      <Field label="Categoría" htmlFor={`${p}-categoria`}>
        <Select id={`${p}-categoria`} name="categoryId" defaultValue={s?.categoryId ?? ""}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Qué incluye (se ve en la web)" htmlFor={`${p}-descripcion`}>
        <Textarea id={`${p}-descripcion`} name="description" rows={3} defaultValue={s?.description ?? ""} />
      </Field>
      <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
        {s ? "Guardar cambios" : "Agregar servicio"}
      </button>
    </form>
  );
}

/**
 * Una lista de tildes con cantidad: lo que gasta u ocupa el servicio en cada turno. La cantidad
 * de lo que no está tildado va deshabilitada, así no viaja y los dos arreglos (ids y cantidades)
 * quedan alineados, igual que en el formulario de siempre.
 */
function ListaConCantidad({
  opciones,
  campoId,
  campoCantidad,
  paso,
  unidad,
}: {
  opciones: { id: string; nombre: string; aparte?: string; elegido: boolean; cantidad: number }[];
  campoId: string;
  campoCantidad: string;
  paso: number;
  unidad: (id: string) => string;
}) {
  const [tildados, setTildados] = useState(() => new Set(opciones.filter((o) => o.elegido).map((o) => o.id)));
  return (
    <ul>
      {opciones.map((o) => {
        const tildado = tildados.has(o.id);
        return (
          <li key={o.id} className="flex items-center gap-3 border-b border-line py-1">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm text-strong">
              <input
                type="checkbox"
                name={campoId}
                value={o.id}
                checked={tildado}
                onChange={(e) => {
                  const n = new Set(tildados);
                  if (e.currentTarget.checked) n.add(o.id);
                  else n.delete(o.id);
                  setTildados(n);
                }}
                className="size-5 accent-accent"
              />
              <span className="min-w-0">
                {o.nombre}
                {o.aparte && <span className="block text-[13px] text-muted">{o.aparte}</span>}
              </span>
            </label>
            <Input
              aria-label={`Cantidad de ${o.nombre} por turno`}
              name={campoCantidad}
              type="number"
              inputMode="decimal"
              min={paso}
              step={paso}
              defaultValue={o.cantidad}
              disabled={!tildado}
              className="w-20 text-right tabular-nums"
            />
            <span className="w-16 text-[13px] text-muted">{unidad(o.id)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function InsumosDelServicio({ servicio: s, insumos }: { servicio: ServicioDelCatalogo; insumos: Insumo[] }) {
  const guardar = useGuardar(() => {}, "Insumos guardados.");
  const activos = insumos.filter((p) => p.active);
  const unidades = new Map(activos.map((p) => [p.id, p.unit]));
  return (
    <Seccion titulo="Lo que gasta por turno" nivel="h3">
      {activos.length === 0 ? (
        <Vacio>No hay productos cargados. Se cargan en la pestaña Productos.</Vacio>
      ) : (
        <form action={(fd) => guardar(setServiceProducts, fd)} className="flex flex-col gap-3">
          <input type="hidden" name="serviceId" value={s.id} />
          <ListaConCantidad
            opciones={activos.map((p) => {
              const ya = s.products.find((sp) => sp.productId === p.id);
              return { id: p.id, nombre: p.name, elegido: !!ya, cantidad: ya?.quantity ?? 1 };
            })}
            campoId="productId"
            campoCantidad="quantity"
            paso={0.1}
            unidad={(id) => unidades.get(id) ?? ""}
          />
          <button type="submit" className={buttonClasses("outline", "md", "self-start")}>
            Guardar lo que gasta
          </button>
        </form>
      )}
    </Seccion>
  );
}

function EquiposDelServicio({ servicio: s, equipos }: { servicio: ServicioDelCatalogo; equipos: Equipo[] }) {
  const guardar = useGuardar(() => {}, "Equipos guardados.");
  return (
    <Seccion titulo="Equipos que ocupa" nivel="h3">
      {equipos.length === 0 ? (
        <Vacio>No hay equipos cargados. Se cargan en la pestaña Equipos.</Vacio>
      ) : (
        <form action={(fd) => guardar(setServiceResources, fd)} className="flex flex-col gap-3">
          <input type="hidden" name="serviceId" value={s.id} />
          <ListaConCantidad
            opciones={equipos.map((r) => {
              const ya = s.resources.find((sr) => sr.resourceId === r.id);
              return { id: r.id, nombre: r.name, aparte: `${r.quantity} en el local`, elegido: !!ya, cantidad: ya?.units ?? 1 };
            })}
            campoId="resourceId"
            campoCantidad="units"
            paso={1}
            unidad={() => "u."}
          />
          <button type="submit" className={buttonClasses("outline", "md", "self-start")}>
            Guardar equipos
          </button>
        </form>
      )}
    </Seccion>
  );
}

// ================================================================================================
// BOXES
// ================================================================================================

export function BoxesRenglon({
  boxes,
  profesionalesPorBox,
  editar,
  agregar,
}: {
  boxes: Box[];
  /** Nombres de los profesionales activos que atienden en cada box (por id de box). */
  profesionalesPorBox: Record<string, string[]>;
  editar: string | null;
  agregar: boolean;
}) {
  const { href, cerrar } = useCajon();
  const { correr, pendiente } = useAccion();
  const editando = editar ? (boxes.find((b) => b.id === editar) ?? null) : null;
  const eliminar = (b: Box) => {
    if (!confirm(`¿Eliminar «${b.name}»? Si ya tiene turnos no se puede: pausalo.`)) return;
    correr(deleteBox, { id: b.id }, `«${b.name}» eliminado.`);
  };

  return (
    <div aria-busy={pendiente || undefined}>
      <Bloque titulo="Boxes" cuenta={boxes.filter((b) => b.active).length}>
        {boxes.length === 0 && <Vacio>Todavía no hay boxes.</Vacio>}
        <ul data-sin-folio>
          {boxes.map((b) => {
            const quienes = profesionalesPorBox[b.id] ?? [];
            const bloqueo = b.blocks[0];
            return (
              <Renglon
                key={b.id}
                as="li"
                titulo={<span className={b.active ? undefined : "text-muted"}>{b.name}</span>}
                detalle={
                  <>
                    {quienes.length > 0 ? quienes.join(", ") : "Sin profesional fijo"}
                    {bloqueo && (
                      <>
                        {" · "}
                        <Marca tipo="atencion">
                          bloqueado {fmtShortDate(bloqueo.startsAt)} al {fmtShortDate(bloqueo.endsAt)}
                          {b.blocks.length > 1 ? ` y ${plural(b.blocks.length - 1, "bloqueo más", "bloqueos más")}` : ""}
                        </Marca>
                      </>
                    )}
                    {!b.active && (
                      <>
                        {" · "}
                        <Marca tipo="anulado">pausado</Marca>
                      </>
                    )}
                  </>
                }
                tecla={
                  <span className="flex items-center gap-1">
                    <Link href={href({ editar: b.id, agregar: null })} scroll={false} className={buttonClasses("outline", "sm")}>
                      Bloquear fechas
                    </Link>
                    <MenuMas etiqueta={`Más acciones de ${b.name}`}>
                      <Link href={href({ editar: b.id, agregar: null })} scroll={false}>
                        Cambiar el nombre
                      </Link>
                      <button type="button" onClick={() => correr(toggleBoxActive, { id: b.id, active: String(b.active) })}>
                        {b.active ? "Pausar (no se usa)" : "Volver a usar"}
                      </button>
                      <button type="button" data-peligro onClick={() => eliminar(b)}>
                        Eliminar
                      </button>
                    </MenuMas>
                  </span>
                }
              />
            );
          })}
        </ul>
      </Bloque>

      <Cajon abierto={editando !== null} onCerrar={cerrar} titulo={editando?.name ?? ""}>
        {editando && <FichaDelBox key={editando.id} box={editando} />}
      </Cajon>
      <Cajon abierto={agregar && editando === null} onCerrar={cerrar} titulo="Agregar un box">
        {agregar && <FormularioNombre accion={createBox} ok="Box agregado." boton="Agregar box" alTerminar={cerrar} placeholder="Ej.: Box 4" />}
      </Cajon>
    </div>
  );
}

function FormularioNombre({
  accion,
  id,
  nombre,
  ok,
  boton,
  alTerminar,
  placeholder,
}: {
  accion: (fd: FormData) => Promise<unknown>;
  id?: string;
  nombre?: string;
  ok: string;
  boton: string;
  alTerminar: () => void;
  placeholder?: string;
}) {
  const guardar = useGuardar(alTerminar, ok);
  const campo = `nombre-${id ?? "nuevo"}`;
  return (
    <form action={(fd) => guardar(accion, fd)} className="flex flex-col gap-4">
      {id && <input type="hidden" name="id" value={id} />}
      <Field label="Nombre" htmlFor={campo} required>
        <Input id={campo} name="name" defaultValue={nombre ?? ""} required placeholder={placeholder} />
      </Field>
      <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
        {boton}
      </button>
    </form>
  );
}

function FichaDelBox({ box: b }: { box: Box }) {
  const { correr } = useAccion();
  const guardarBloqueo = useGuardar(() => {}, "Box bloqueado para esas fechas.");
  return (
    <div className="flex flex-col gap-8">
      <Seccion titulo="Bloquear fechas" nivel="h3">
        <form action={(fd) => guardarBloqueo(createBoxBlock, fd)} className="flex flex-col gap-4">
          <input type="hidden" name="boxId" value={b.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" htmlFor={`bl-desde-${b.id}`} required>
              <Input id={`bl-desde-${b.id}`} name="startDate" type="date" required />
            </Field>
            <Field label="Hasta" htmlFor={`bl-hasta-${b.id}`} required>
              <Input id={`bl-hasta-${b.id}`} name="endDate" type="date" required />
            </Field>
          </div>
          <Field label="Motivo" htmlFor={`bl-motivo-${b.id}`} required>
            <Input id={`bl-motivo-${b.id}`} name="reason" required placeholder="Ej.: reservado para depilación láser" />
          </Field>
          <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
            Bloquear el box
          </button>
        </form>
      </Seccion>
      {b.blocks.length > 0 && (
        <Seccion titulo="Bloqueos que vienen" nivel="h3">
          <ul data-sin-folio>
            {b.blocks.map((bl) => (
              <Renglon
                key={bl.id}
                as="li"
                titulo={`${fmtShortDate(bl.startsAt)} al ${fmtShortDate(bl.endsAt)}`}
                detalle={bl.reason}
                tecla={
                  <button
                    type="button"
                    className={buttonClasses("ghost", "sm")}
                    onClick={() => {
                      if (!confirm("¿Quitar este bloqueo? El box vuelve a quedar libre esos días.")) return;
                      correr(deleteBoxBlock, { id: bl.id }, "Bloqueo quitado.");
                    }}
                  >
                    Quitar
                  </button>
                }
              />
            ))}
          </ul>
        </Seccion>
      )}
      <Seccion titulo="Nombre" nivel="h3">
        <FormularioNombre accion={updateBox} id={b.id} nombre={b.name} ok="Nombre guardado." boton="Guardar el nombre" alTerminar={() => {}} />
      </Seccion>
    </div>
  );
}

// ================================================================================================
// EQUIPOS (máquinas y gabinetes: Resource)
// ================================================================================================

export function EquiposRenglon({
  equipos,
  nombresDeServicios,
  editar,
  agregar,
}: {
  equipos: Equipo[];
  nombresDeServicios: Record<string, string>;
  editar: string | null;
  agregar: boolean;
}) {
  const { href, cerrar } = useCajon();
  const { correr, pendiente } = useAccion();
  const editando = editar ? (equipos.find((r) => r.id === editar) ?? null) : null;
  const eliminar = (r: Equipo) => {
    if (!confirm(`¿Eliminar «${r.name}»? Los servicios que lo usan dejan de reservarlo.`)) return;
    correr(deleteResource, { id: r.id }, `«${r.name}» eliminado.`);
  };
  return (
    <div aria-busy={pendiente || undefined}>
      <Bloque titulo="Equipos y gabinetes" cuenta={equipos.length}>
        {equipos.length === 0 && <Vacio>Todavía no hay equipos. Cargá los que se comparten entre servicios (una radiofrecuencia, un gabinete).</Vacio>}
        <ul>
          {equipos.map((r) => {
            const usan = r.services.map((x) => nombresDeServicios[x.serviceId]).filter(Boolean);
            return (
              <Renglon
                key={r.id}
                as="li"
                folio={<span className="tabular-nums">{r.quantity} u.</span>}
                titulo={r.name}
                detalle={usan.length > 0 ? `Lo usan: ${usan.join(", ")}` : "Ningún servicio lo usa"}
                tecla={
                  <span className="flex items-center gap-1">
                    <Link href={href({ editar: r.id, agregar: null })} scroll={false} className={buttonClasses("outline", "sm")}>
                      Editar
                    </Link>
                    <MenuMas etiqueta={`Más acciones de ${r.name}`}>
                      <button type="button" data-peligro onClick={() => eliminar(r)}>
                        Eliminar
                      </button>
                    </MenuMas>
                  </span>
                }
              />
            );
          })}
        </ul>
      </Bloque>
      <Cajon abierto={editando !== null} onCerrar={cerrar} titulo={editando?.name ?? ""}>
        {editando && <FormularioEquipo key={editando.id} equipo={editando} alTerminar={cerrar} />}
      </Cajon>
      <Cajon abierto={agregar && editando === null} onCerrar={cerrar} titulo="Agregar un equipo">
        {agregar && <FormularioEquipo equipo={null} alTerminar={cerrar} />}
      </Cajon>
    </div>
  );
}

function FormularioEquipo({ equipo: r, alTerminar }: { equipo: Equipo | null; alTerminar: () => void }) {
  const guardar = useGuardar(alTerminar, r ? "Equipo guardado." : "Equipo agregado.");
  const p = r ? `eq-${r.id}` : "eq-nuevo";
  return (
    <form action={(fd) => guardar(r ? updateResource : createResource, fd)} className="flex flex-col gap-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="Nombre" htmlFor={`${p}-nombre`} required>
        <Input id={`${p}-nombre`} name="name" defaultValue={r?.name ?? ""} required placeholder="Ej.: Radiofrecuencia" />
      </Field>
      <Field label="Cuántos hay en el local" htmlFor={`${p}-cantidad`} required>
        <Input id={`${p}-cantidad`} name="quantity" type="number" inputMode="numeric" min={1} step={1} defaultValue={r?.quantity ?? 1} required className="w-28" />
      </Field>
      <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
        {r ? "Guardar cambios" : "Agregar equipo"}
      </button>
    </form>
  );
}

// ================================================================================================
// CUPONES
// ================================================================================================

export function CuponesRenglon({
  cupones,
  agregar,
  vacio = "Todavía no hay cupones. La clienta lo escribe al reservar y el sistema lo valida al confirmar.",
}: {
  cupones: Cupon[];
  agregar: boolean;
  /** El texto sin cupones: en Promociones valen también en Vender y en la tienda. */
  vacio?: React.ReactNode;
}) {
  const { cerrar } = useCajon();
  const { correr, pendiente } = useAccion();
  const eliminar = (c: Cupon) => {
    if (!confirm(`¿Eliminar el cupón «${c.code}»? Quien lo tenga ya no lo puede usar.`)) return;
    correr(deleteCoupon, { id: c.id }, `Cupón «${c.code}» eliminado.`);
  };
  return (
    <div aria-busy={pendiente || undefined}>
      <Bloque titulo="Cupones" cuenta={cupones.filter((c) => c.active).length}>
        {cupones.length === 0 && <Vacio>{vacio}</Vacio>}
        <ul data-sin-folio>
          {cupones.map((c) => {
            const descuento = c.type === "PERCENT" ? `${c.value} % de descuento` : `${pesos(c.value)} de descuento`;
            const usos = c.maxUses != null ? `${c.usedCount} de ${c.maxUses} usos` : plural(c.usedCount, "uso", "usos");
            return (
              <Renglon
                key={c.id}
                as="li"
                titulo={<span className={`font-mono ${c.active ? "" : "text-muted"}`}>{c.code}</span>}
                detalle={
                  <>
                    {descuento} · {usos}
                    {c.expiresAt && ` · vence ${fmtShortDate(c.expiresAt)}`}
                    {!c.active && (
                      <>
                        {" · "}
                        <Marca tipo="anulado">pausado</Marca>
                      </>
                    )}
                    {c.active && cuponAgotado(c) && (
                      <>
                        {" · "}
                        <Marca tipo="atencion">llegó al máximo de usos</Marca>
                      </>
                    )}
                  </>
                }
                tecla={
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className={buttonClasses("outline", "sm")}
                      onClick={() => correr(toggleCouponActive, { id: c.id, active: String(c.active) })}
                    >
                      {c.active ? "Pausar" : "Activar"}
                    </button>
                    <MenuMas etiqueta={`Más acciones del cupón ${c.code}`}>
                      <button type="button" data-peligro onClick={() => eliminar(c)}>
                        Eliminar
                      </button>
                    </MenuMas>
                  </span>
                }
              />
            );
          })}
        </ul>
      </Bloque>
      <Cajon abierto={agregar} onCerrar={cerrar} titulo="Crear un cupón">
        {agregar && <FormularioCupon alTerminar={cerrar} />}
      </Cajon>
    </div>
  );
}

function FormularioCupon({ alTerminar }: { alTerminar: () => void }) {
  const guardar = useGuardar(alTerminar, "Cupón creado.");
  return (
    <form action={(fd) => guardar(createCoupon, fd)} className="flex flex-col gap-4">
      <Field label="Código" htmlFor="cupon-codigo-nuevo" required>
        <Input id="cupon-codigo-nuevo" name="code" required placeholder="Ej.: VERANO10" className="uppercase placeholder:normal-case" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" htmlFor="cupon-tipo">
          <Select id="cupon-tipo" name="type" defaultValue="PERCENT">
            <option value="PERCENT">% de descuento</option>
            <option value="FIXED">$ fijos</option>
          </Select>
        </Field>
        <Field label="Cuánto" htmlFor="cupon-valor" required>
          <Input id="cupon-valor" name="value" type="number" inputMode="decimal" min={1} step="any" required />
        </Field>
        <Field label="Vence" htmlFor="cupon-vence" hint="Opcional">
          <Input id="cupon-vence" name="expiresAt" type="date" />
        </Field>
        <Field label="Usos como máximo" htmlFor="cupon-usos" hint="Opcional">
          <Input id="cupon-usos" name="maxUses" type="number" inputMode="numeric" min={1} step={1} />
        </Field>
      </div>
      <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
        Crear cupón
      </button>
    </form>
  );
}
