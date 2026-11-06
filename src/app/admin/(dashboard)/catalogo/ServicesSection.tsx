"use client";

import { useState } from "react";
import {
  crearServicioConAviso,
  guardarServicioConAviso,
  toggleServiceActive,
  deleteService,
  setServiceProducts,
  setServiceResources,
} from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";
import { Field, Input, Seccion, Select, Textarea, buttonClasses } from "@/components/ui";
import { CamposDeLaFicha, FotosDelServicio } from "./FichaServicioCampos";
import { MODALIDAD_ETIQUETA, TIPO_ETIQUETA, precioADefinir, type FichaDelServicio } from "@/lib/servicios/ficha";

type Product = { id: string; name: string; unit: string; active: boolean };
type ServiceProductLink = { productId: string; quantity: number; product: Product };
type Category = { id: string; name: string; order: number };
type Resource = { id: string; name: string; quantity: number };
type ServiceResourceLink = { resourceId: string; units: number };
type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  depositAmount: number | null;
  active: boolean;
  categoryId: string | null;
  category: Category | null;
  products: ServiceProductLink[];
  resources: ServiceResourceLink[];
  ficha?: FichaDelServicio;
  fotos?: string[];
};

const pesosAR = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** Precio, seña y lo nuevo de la ficha, en chips. «A definir» si el precio se fija al cobrar. */
function ResumenDelPrecio({ service }: { service: Service }) {
  const f = service.ficha;
  return (
    <>
      {precioADefinir(service.price) ? "A definir" : pesosAR(service.price)}
      {service.residentPrice != null && (
        <span className="ml-1.5 rounded-full bg-accent-soft text-accent px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          Vecino {pesosAR(service.residentPrice)}
        </span>
      )}
      {service.depositAmount != null && (
        <span className="ml-1.5 rounded-full bg-warning-soft text-warning px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          Seña {f?.depositPercent != null ? `${f.depositPercent}\u00a0%` : pesosAR(service.depositAmount)}
        </span>
      )}
      {f && f.modality !== "PRESENCIAL" && (
        <span className="ml-1.5 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-body whitespace-nowrap">{MODALIDAD_ETIQUETA[f.modality]}</span>
      )}
      {f && f.kind !== "REGULAR" && (
        <span className="ml-1.5 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-body whitespace-nowrap">{TIPO_ETIQUETA[f.kind]}</span>
      )}
    </>
  );
}

function InsumosEditor({ service, products }: { service: Service; products: Product[] }) {
  return (
    <tr className="block sm:table-row border-b border-line bg-surface-sunken">
      <td colSpan={6} className="block sm:table-cell px-4 py-3">
        <form
          action={setServiceProducts}
          className="space-y-2"
        >
          <input type="hidden" name="serviceId" value={service.id} />
          <p className="text-sm font-medium mb-1 text-strong">Insumos consumidos por turno</p>
          {products.filter((p) => p.active).length === 0 && (
            <p className="text-sm text-muted">Cargá productos en la sección de abajo primero.</p>
          )}
          <div className="space-y-1.5">
            {products
              .filter((p) => p.active)
              .map((p) => {
                const existing = service.products.find((sp) => sp.productId === p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="productId"
                      value={p.id}
                      defaultChecked={!!existing}
                      className="accent-accent"
                      onChange={(e) => {
                        const qtyInput = e.currentTarget.parentElement?.querySelector<HTMLInputElement>(
                          'input[name="quantity"]'
                        );
                        if (qtyInput) qtyInput.disabled = !e.currentTarget.checked;
                      }}
                    />
                    <span className="w-40">{p.name}</span>
                    <input
                      type="number"
                      name="quantity"
                      step="0.1"
                      min="0.1"
                      defaultValue={existing?.quantity ?? 1}
                      disabled={!existing}
                      className="w-20 rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent disabled:bg-surface-sunken"
                    />
                    <span className="text-muted">{p.unit} por turno</span>
                  </label>
                );
              })}
          </div>
          <button type="submit" className="text-sm font-medium mt-1 max-sm:min-h-11 max-sm:min-w-11">
            Guardar insumos
          </button>
        </form>
      </td>
    </tr>
  );
}

// Recursos (máquinas/gabinetes) que consume el servicio (G17).
function RecursosEditor({ service, resources }: { service: Service; resources: Resource[] }) {
  return (
    <tr className="block sm:table-row border-b border-line bg-surface-sunken">
      <td colSpan={6} className="block sm:table-cell px-4 py-3">
        <form action={setServiceResources} className="space-y-2">
          <input type="hidden" name="serviceId" value={service.id} />
          <p className="text-sm font-medium mb-1 text-strong">Recursos que ocupa este servicio</p>
          {resources.length === 0 && (
            <p className="text-sm text-muted">
              Cargá recursos en la sección “Recursos” primero.
            </p>
          )}
          <div className="space-y-1.5">
            {resources.map((res) => {
              const existing = service.resources.find((sr) => sr.resourceId === res.id);
              return (
                <label key={res.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="resourceId"
                    value={res.id}
                    defaultChecked={!!existing}
                    className="accent-accent"
                    onChange={(e) => {
                      const unitsInput = e.currentTarget.parentElement?.querySelector<HTMLInputElement>(
                        'input[name="units"]'
                      );
                      if (unitsInput) unitsInput.disabled = !e.currentTarget.checked;
                    }}
                  />
                  <span className="w-44">
                    {res.name}{" "}
                    <span className="text-xs text-faint">({res.quantity} disp.)</span>
                  </span>
                  <input
                    type="number"
                    name="units"
                    min={1}
                    step={1}
                    defaultValue={existing?.units ?? 1}
                    disabled={!existing}
                    className="w-20 rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent disabled:bg-surface-sunken"
                  />
                  <span className="text-muted">unidad(es) por turno</span>
                </label>
              );
            })}
          </div>
          <button type="submit" className="text-sm font-medium mt-1 max-sm:min-h-11 max-sm:min-w-11">
            Guardar recursos
          </button>
        </form>
      </td>
    </tr>
  );
}

/** Qué es · Precio y seña · Tiempo · Cómo se presta · Recordatorio · Imágenes (sin los botones). */
function FormularioDeServicio({
  prefijo: p,
  service,
  categories,
  fichaDisponible,
}: {
  prefijo: string;
  service: Service | null;
  categories: Category[];
  fichaDisponible: boolean;
}) {
  return (
    <>
      <Seccion titulo="Qué es">
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Nombre" htmlFor={`${p}-nombre`} required>
            <Input id={`${p}-nombre`} name="name" defaultValue={service?.name ?? ""} required placeholder="Ej.: Limpieza facial profunda" />
          </Field>
          <Field label="Categoría" htmlFor={`${p}-categoria`}>
            <Select id={`${p}-categoria`} name="categoryId" defaultValue={service?.categoryId ?? ""}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción para la web" htmlFor={`${p}-descripcion`}>
            <Textarea
              id={`${p}-descripcion`}
              name="description"
              rows={3}
              defaultValue={service?.description ?? ""}
              placeholder="Qué incluye, beneficios, para quién es…"
            />
          </Field>
        </div>
      </Seccion>
      <CamposDeLaFicha prefijo={p} servicio={service} disponible={fichaDisponible} />
      <FotosDelServicio servicio={service} disponible={fichaDisponible} />
    </>
  );
}

function ServiceRow({
  service,
  products,
  categories,
  resources,
  fichaDisponible,
}: {
  service: Service;
  products: Product[];
  categories: Category[];
  resources: Resource[];
  fichaDisponible: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editingInsumos, setEditingInsumos] = useState(false);
  const [editingRecursos, setEditingRecursos] = useState(false);
  const { showError, showSuccess } = useToast();

  if (editing) {
    const p = `srv-viejo-${service.id}`;
    return (
      <tr className="block sm:table-row border-b border-line bg-surface-sunken">
        <td colSpan={6} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              const r = await guardarServicioConAviso(fd);
              if (!r.ok) return showError(r.error);
              setEditing(false);
            }}
            className="flex max-w-2xl flex-col gap-6 px-4 py-4"
          >
            <input type="hidden" name="id" value={service.id} />
            <FormularioDeServicio prefijo={p} service={service} categories={categories} fichaDisponible={fichaDisponible} />
            <div className="flex gap-3">
              <button type="submit" className={buttonClasses("solid", "md")}>
                Guardar
              </button>
              <button type="button" onClick={() => setEditing(false)} className={buttonClasses("ghost", "md")}>
                Cancelar
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
        <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${service.active ? "" : "text-faint line-through"}`}>
          {service.name}
          {service.products.length > 0 && (
            <span className="ml-2 text-xs text-faint">
              ({service.products.length} insumo{service.products.length !== 1 ? "s" : ""})
            </span>
          )}
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
          <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Categoría:</span>
          {service.category ? (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-body">
              {service.category.name}
            </span>
          ) : (
            <span className="text-xs text-warning">Sin categoría</span>
          )}
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-body">
          {service.durationMin} min
          {service.ficha?.calendarMin != null && <span className="text-muted"> (agenda {service.ficha.calendarMin})</span>}
          <span className="sm:hidden">
            {" · "}
            <ResumenDelPrecio service={service} />
          </span>
        </td>
        <td className="hidden sm:table-cell px-4 py-2.5 text-sm text-body">
          <ResumenDelPrecio service={service} />
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5">
          <form action={toggleServiceActive}>
            <input type="hidden" name="id" value={service.id} />
            <input type="hidden" name="active" value={String(service.active)} />
            <button
              type="submit"
              className={`inline-flex items-center min-h-6 max-sm:min-h-11 rounded-full px-2.5 py-1 text-xs font-medium ${
                service.active ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
              }`}
            >
              {service.active ? "Activo" : "Inactivo"}
            </button>
          </form>
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button onClick={() => setEditingInsumos((v) => !v)} className="chip-btn max-sm:min-h-11!">
              Insumos
            </button>
            <button onClick={() => setEditingRecursos((v) => !v)} className="chip-btn max-sm:min-h-11!">
              Recursos
            </button>
            <button onClick={() => setEditing(true)} className="chip-btn max-sm:min-h-11!">
              Editar
            </button>
            <form
              action={async (fd) => {
                if (!confirm(`¿Eliminar "${service.name}"? Esta acción no se puede deshacer.`)) return;
                try {
                  await deleteService(fd);
                  showSuccess(`“${service.name}” eliminado.`);
                } catch (err) {
                  showError(err instanceof Error ? err.message : "No se pudo eliminar.");
                }
              }}
            >
              <input type="hidden" name="id" value={service.id} />
              <button type="submit" className="chip-btn max-sm:min-h-11! chip-btn-danger">
                Eliminar
              </button>
            </form>
          </div>
        </td>
      </tr>
      {editingInsumos && <InsumosEditor service={service} products={products} />}
      {editingRecursos && <RecursosEditor service={service} resources={resources} />}
    </>
  );
}

// Un grupo colapsable por categoría — abre/cierra con <details>, sin JS
// extra. En mobile esto reemplaza el scroll infinito de la tabla plana por
// un árbol: tocás la categoría que te interesa y solo esa se despliega.
function CategoryGroup({
  title,
  count,
  defaultOpen,
  warn,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-line overflow-hidden mb-2 sm:mb-3 last:mb-0"
    >
      <summary
        className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none ${
          warn ? "bg-warning-soft" : "bg-surface-sunken"
        }`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="text-faint transition-transform group-open:rotate-90">›</span>
          {title}
          {warn && <span className="text-warning text-xs font-normal">(revisar)</span>}
        </span>
        <span className="text-xs text-muted rounded-full bg-surface-raised border border-line px-2 py-0.5">
          {count}
        </span>
      </summary>
      <table className="block sm:table w-full text-left">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-t border-line bg-surface-sunken/60 text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Categoría</th>
            <th className="px-4 py-2 font-medium">Duración</th>
            <th className="px-4 py-2 font-medium">Precio</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="block sm:table-row-group divide-y sm:divide-y-0">{children}</tbody>
      </table>
    </details>
  );
}

export default function ServicesSection({
  services,
  products,
  categories,
  resources,
  fichaDisponible = false,
}: {
  fichaDisponible?: boolean;
  services: Service[];
  products: Product[];
  categories: Category[];
  resources: Resource[];
}) {
  const { showError } = useToast();
  const sinCategoria = services.filter((s) => !s.categoryId);
  const byCategory = [...categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ category: c, items: services.filter((s) => s.categoryId === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <section>
      <h2 className="text-lg font-medium mb-1 text-strong">Servicios</h2>
      <p className="text-sm text-muted mb-3">
        Duración y precio determinan los horarios disponibles y el monto a cobrar. “Insumos” define
        qué productos de stock consume cada vez que se realiza. La categoría agrupa el servicio en la
        web pública. El precio vecino/a es opcional: se lo ves solo a los servicios donde lo cargues,
        y se muestra siempre en la web como beneficio, nunca como recargo al resto.
      </p>
      <p className="text-xs text-faint mb-3">
        Tip: tocá el nombre de una categoría para desplegar sus servicios — no hace falta scrollear
        todo el listado para encontrar uno.
      </p>
      {sinCategoria.length > 0 && (
        <p className="text-sm text-warning bg-warning-soft border border-warning/40 rounded-md px-3 py-2 mb-3">
          {sinCategoria.length} servicio{sinCategoria.length !== 1 ? "s" : ""} sin categoría. Editá
          cada uno y asignale su categoría (Faciales, Masajes, Spa, etc.) para que se agrupe bien en
          la web.
        </p>
      )}

      <div className="mb-4">
        {byCategory.map(({ category, items }) => (
          <CategoryGroup key={category.id} title={category.name} count={items.length}>
            {items.map((s) => (
              <ServiceRow
                key={s.id}
                service={s}
                products={products}
                categories={categories}
                resources={resources}
                fichaDisponible={fichaDisponible}
              />
            ))}
          </CategoryGroup>
        ))}
        {sinCategoria.length > 0 && (
          <CategoryGroup title="Sin categoría" count={sinCategoria.length} defaultOpen warn>
            {sinCategoria.map((s) => (
              <ServiceRow
                key={s.id}
                service={s}
                products={products}
                categories={categories}
                resources={resources}
                fichaDisponible={fichaDisponible}
              />
            ))}
          </CategoryGroup>
        )}
        {services.length === 0 && (
          <p className="text-sm text-muted border border-line rounded-lg px-4 py-4">
            No hay servicios cargados todavía.
          </p>
        )}
      </div>

      <form
        action={async (fd) => {
          const r = await crearServicioConAviso(fd);
          if (!r.ok) showError(r.error);
        }}
        className="flex max-w-2xl flex-col gap-6 rounded-lg border border-line p-4"
      >
        <h3 className="text-base font-medium text-strong">Agregar un servicio</h3>
        <FormularioDeServicio prefijo="srv-viejo-nuevo" service={null} categories={categories} fichaDisponible={fichaDisponible} />
        <button type="submit" className={buttonClasses("solid", "md", "self-start")}>
          Agregar servicio
        </button>
        <p className="text-xs text-muted">
          Después asignale quién lo hace, en «Asignación de servicios», más abajo. Sin eso no aparece en «Dar turno».
        </p>
      </form>
    </section>
  );
}
