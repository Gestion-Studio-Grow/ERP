"use client";

import { useState } from "react";
import {
  createService,
  toggleServiceActive,
  updateService,
  deleteService,
  setServiceProducts,
  setServiceResources,
} from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";

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
};

function InsumosEditor({ service, products }: { service: Service; products: Product[] }) {
  return (
    <tr className="block sm:table-row border-b bg-neutral-50">
      <td colSpan={6} className="block sm:table-cell px-4 py-3">
        <form
          action={setServiceProducts}
          className="space-y-2"
        >
          <input type="hidden" name="serviceId" value={service.id} />
          <p className="text-sm font-medium mb-1">Insumos consumidos por turno</p>
          {products.filter((p) => p.active).length === 0 && (
            <p className="text-sm text-neutral-500">Cargá productos en la sección de abajo primero.</p>
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
                      className="w-20 rounded-md border px-2 py-1 text-sm disabled:bg-neutral-100"
                    />
                    <span className="text-neutral-500">{p.unit} por turno</span>
                  </label>
                );
              })}
          </div>
          <button type="submit" className="text-sm font-medium mt-1">
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
    <tr className="block sm:table-row border-b bg-neutral-50">
      <td colSpan={6} className="block sm:table-cell px-4 py-3">
        <form action={setServiceResources} className="space-y-2">
          <input type="hidden" name="serviceId" value={service.id} />
          <p className="text-sm font-medium mb-1">Recursos que ocupa este servicio</p>
          {resources.length === 0 && (
            <p className="text-sm text-neutral-500">
              Cargá recursos en la sección "Recursos" primero.
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
                    onChange={(e) => {
                      const unitsInput = e.currentTarget.parentElement?.querySelector<HTMLInputElement>(
                        'input[name="units"]'
                      );
                      if (unitsInput) unitsInput.disabled = !e.currentTarget.checked;
                    }}
                  />
                  <span className="w-44">
                    {res.name}{" "}
                    <span className="text-xs text-neutral-400">({res.quantity} disp.)</span>
                  </span>
                  <input
                    type="number"
                    name="units"
                    min={1}
                    step={1}
                    defaultValue={existing?.units ?? 1}
                    disabled={!existing}
                    className="w-20 rounded-md border px-2 py-1 text-sm disabled:bg-neutral-100"
                  />
                  <span className="text-neutral-500">unidad(es) por turno</span>
                </label>
              );
            })}
          </div>
          <button type="submit" className="text-sm font-medium mt-1">
            Guardar recursos
          </button>
        </form>
      </td>
    </tr>
  );
}

function ServiceRow({
  service,
  products,
  categories,
  resources,
}: {
  service: Service;
  products: Product[];
  categories: Category[];
  resources: Resource[];
}) {
  const [editing, setEditing] = useState(false);
  const [editingInsumos, setEditingInsumos] = useState(false);
  const [editingRecursos, setEditingRecursos] = useState(false);
  const { showError, showSuccess } = useToast();

  if (editing) {
    return (
      <tr className="block sm:table-row border-b bg-neutral-50">
        <td colSpan={6} className="block sm:table-cell p-0">
          <form
            action={async (fd) => {
              try {
                await updateService(fd);
                setEditing(false);
              } catch (err) {
                showError(err instanceof Error ? err.message : "No se pudo guardar el servicio.");
              }
            }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_110px_110px_auto] items-start gap-2 px-4 py-2.5"
          >
            <input type="hidden" name="id" value={service.id} />
            <div className="grid grid-cols-1 sm:col-span-4 sm:grid-cols-[1fr_110px_110px_auto] gap-2">
              <input
                name="name"
                defaultValue={service.name}
                required
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                name="durationMin"
                type="number"
                min={5}
                step={5}
                defaultValue={service.durationMin}
                required
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                name="price"
                type="number"
                min={0}
                step={100}
                defaultValue={service.price}
                required
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <div className="flex gap-4 sm:gap-3 justify-start sm:justify-end whitespace-nowrap py-1 sm:py-0">
                <button type="submit" className="text-sm font-medium">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
                  Cancelar
                </button>
              </div>
            </div>
            <label className="sm:col-span-4 flex items-center gap-2 text-xs text-neutral-500">
              Precio vecino/a de La Alameda (opcional — dejalo vacío si este servicio no tiene diferencial):
              <input
                name="residentPrice"
                type="number"
                min={0}
                step={100}
                defaultValue={service.residentPrice ?? ""}
                placeholder="Sin diferencial"
                className="w-32 rounded-md border px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <label className="sm:col-span-4 flex items-center gap-2 text-xs text-neutral-500">
              Seña obligatoria (opcional — dejalo vacío si no exige seña):
              <input
                name="depositAmount"
                type="number"
                min={0}
                step={100}
                defaultValue={service.depositAmount ?? ""}
                placeholder="Sin seña"
                className="w-32 rounded-md border px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <select
              name="categoryId"
              defaultValue={service.categoryId ?? ""}
              className="sm:col-span-4 rounded-md border px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <textarea
              name="description"
              defaultValue={service.description ?? ""}
              placeholder="Descripción para la web: qué incluye, beneficios, para quién es..."
              rows={3}
              className="sm:col-span-4 rounded-md border px-2 py-1.5 text-sm"
            />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
        <td className={`block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm ${service.active ? "" : "text-neutral-400 line-through"}`}>
          {service.name}
          {service.products.length > 0 && (
            <span className="ml-2 text-xs text-neutral-400">
              ({service.products.length} insumo{service.products.length !== 1 ? "s" : ""})
            </span>
          )}
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
          <span className="sm:hidden text-xs uppercase tracking-wide text-neutral-400 mr-1.5">Categoría:</span>
          {service.category ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {service.category.name}
            </span>
          ) : (
            <span className="text-xs text-amber-600">Sin categoría</span>
          )}
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-neutral-600">
          {service.durationMin} min · ${service.price.toLocaleString("es-AR")}
          {service.residentPrice != null && (
            <span className="ml-1.5 rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              Vecino ${service.residentPrice.toLocaleString("es-AR")}
            </span>
          )}
          {service.depositAmount != null && (
            <span className="ml-1.5 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              Seña ${service.depositAmount.toLocaleString("es-AR")}
            </span>
          )}
        </td>
        <td className="hidden sm:table-cell px-4 py-2.5 text-sm text-neutral-600">
          ${service.price.toLocaleString("es-AR")}
          {service.residentPrice != null && (
            <span className="ml-1.5 rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              Vecino ${service.residentPrice.toLocaleString("es-AR")}
            </span>
          )}
          {service.depositAmount != null && (
            <span className="ml-1.5 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              Seña ${service.depositAmount.toLocaleString("es-AR")}
            </span>
          )}
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5">
          <form action={toggleServiceActive}>
            <input type="hidden" name="id" value={service.id} />
            <input type="hidden" name="active" value={String(service.active)} />
            <button
              type="submit"
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                service.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"
              }`}
            >
              {service.active ? "Activo" : "Inactivo"}
            </button>
          </form>
        </td>
        <td className="block sm:table-cell px-0 sm:px-4 py-2 sm:py-2.5 sm:text-right whitespace-nowrap">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button onClick={() => setEditingInsumos((v) => !v)} className="chip-btn">
              Insumos
            </button>
            <button onClick={() => setEditingRecursos((v) => !v)} className="chip-btn">
              Recursos
            </button>
            <button onClick={() => setEditing(true)} className="chip-btn">
              Editar
            </button>
            <form
              action={async (fd) => {
                if (!confirm(`¿Eliminar "${service.name}"? Esta acción no se puede deshacer.`)) return;
                try {
                  await deleteService(fd);
                  showSuccess(`"${service.name}" eliminado.`);
                } catch (err) {
                  showError(err instanceof Error ? err.message : "No se pudo eliminar.");
                }
              }}
            >
              <input type="hidden" name="id" value={service.id} />
              <button type="submit" className="chip-btn chip-btn-danger">
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
      className="group rounded-lg border overflow-hidden mb-2 sm:mb-3 last:mb-0"
    >
      <summary
        className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none ${
          warn ? "bg-amber-50" : "bg-neutral-50"
        }`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
          {title}
          {warn && <span className="text-amber-600 text-xs font-normal">(revisar)</span>}
        </span>
        <span className="text-xs text-neutral-500 rounded-full bg-white border px-2 py-0.5">
          {count}
        </span>
      </summary>
      <table className="block sm:table w-full text-left">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-t bg-neutral-50/60 text-xs uppercase tracking-wide text-neutral-500">
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
}: {
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
      <h2 className="text-lg font-medium mb-1">Servicios</h2>
      <p className="text-sm text-neutral-500 mb-3">
        Duración y precio determinan los horarios disponibles y el monto a cobrar. "Insumos" define
        qué productos de stock consume cada vez que se realiza. La categoría agrupa el servicio en la
        web pública. El precio vecino/a es opcional: se lo ves solo a los servicios donde lo cargues,
        y se muestra siempre en la web como beneficio, nunca como recargo al resto.
      </p>
      <p className="text-xs text-neutral-400 mb-3">
        Tip: tocá el nombre de una categoría para desplegar sus servicios — no hace falta scrollear
        todo el listado para encontrar uno.
      </p>
      {sinCategoria.length > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
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
              />
            ))}
          </CategoryGroup>
        )}
        {services.length === 0 && (
          <p className="text-sm text-neutral-500 border rounded-lg px-4 py-4">
            No hay servicios cargados todavía.
          </p>
        )}
      </div>

      <form
        action={async (fd) => {
          try {
            await createService(fd);
          } catch (err) {
            showError(err instanceof Error ? err.message : "No se pudo crear el servicio.");
          }
        }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        <input
          name="name"
          required
          placeholder="Nombre del servicio"
          className="col-span-2 rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="durationMin"
          type="number"
          min={5}
          step={5}
          required
          placeholder="Minutos"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="price"
          type="number"
          min={0}
          step={100}
          required
          placeholder="Precio $"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="residentPrice"
          type="number"
          min={0}
          step={100}
          placeholder="Precio vecino/a (opcional)"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="depositAmount"
          type="number"
          min={0}
          step={100}
          placeholder="Seña obligatoria (opcional)"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <select
          name="categoryId"
          defaultValue=""
          className="col-span-2 sm:col-span-4 rounded-md border px-3 py-2 text-sm bg-white"
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <textarea
          name="description"
          placeholder="Descripción para la web (opcional): qué incluye, beneficios, para quién es..."
          rows={2}
          className="col-span-2 sm:col-span-4 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="col-span-2 sm:col-span-4 rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
        >
          Agregar servicio
        </button>
      </form>
    </section>
  );
}
