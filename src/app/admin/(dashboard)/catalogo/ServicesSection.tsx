"use client";

import { useState } from "react";
import {
  createService,
  toggleServiceActive,
  updateService,
  deleteService,
  setServiceProducts,
} from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";

type Product = { id: string; name: string; unit: string; active: boolean };
type ServiceProductLink = { productId: string; quantity: number; product: Product };
type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  active: boolean;
  products: ServiceProductLink[];
};

function InsumosEditor({ service, products }: { service: Service; products: Product[] }) {
  return (
    <tr className="border-b bg-neutral-50">
      <td colSpan={5} className="px-4 py-3">
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

function ServiceRow({ service, products }: { service: Service; products: Product[] }) {
  const [editing, setEditing] = useState(false);
  const [editingInsumos, setEditingInsumos] = useState(false);
  const { showError, showSuccess } = useToast();

  if (editing) {
    return (
      <tr className="border-b bg-neutral-50">
        <td colSpan={5} className="p-0">
          <form
            action={async (fd) => {
              await updateService(fd);
              setEditing(false);
            }}
            className="grid grid-cols-[1fr_110px_110px_auto] items-start gap-2 px-4 py-2.5"
          >
            <input type="hidden" name="id" value={service.id} />
            <div className="col-span-4 grid grid-cols-[1fr_110px_110px_auto] gap-2">
              <input
                name="name"
                defaultValue={service.name}
                required
                className="rounded-md border px-2 py-1 text-sm"
              />
              <input
                name="durationMin"
                type="number"
                min={5}
                step={5}
                defaultValue={service.durationMin}
                required
                className="rounded-md border px-2 py-1 text-sm"
              />
              <input
                name="price"
                type="number"
                min={0}
                step={100}
                defaultValue={service.price}
                required
                className="rounded-md border px-2 py-1 text-sm"
              />
              <div className="flex gap-3 justify-end whitespace-nowrap">
                <button type="submit" className="text-sm font-medium">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
                  Cancelar
                </button>
              </div>
            </div>
            <textarea
              name="description"
              defaultValue={service.description ?? ""}
              placeholder="Descripción para la web: qué incluye, beneficios, para quién es..."
              rows={3}
              className="col-span-4 rounded-md border px-2 py-1.5 text-sm"
            />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b last:border-b-0">
        <td className={`px-4 py-2.5 text-sm ${service.active ? "" : "text-neutral-400 line-through"}`}>
          {service.name}
          {service.products.length > 0 && (
            <span className="ml-2 text-xs text-neutral-400">
              ({service.products.length} insumo{service.products.length !== 1 ? "s" : ""})
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-neutral-600">{service.durationMin} min</td>
        <td className="px-4 py-2.5 text-sm text-neutral-600">${service.price.toLocaleString("es-AR")}</td>
        <td className="px-4 py-2.5">
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
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          <button
            onClick={() => setEditingInsumos((v) => !v)}
            className="text-sm text-neutral-500 hover:underline mr-3"
          >
            Insumos
          </button>
          <button onClick={() => setEditing(true)} className="text-sm text-neutral-500 hover:underline mr-3">
            Editar
          </button>
          <form
            className="inline"
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
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Eliminar
            </button>
          </form>
        </td>
      </tr>
      {editingInsumos && <InsumosEditor service={service} products={products} />}
    </>
  );
}

export default function ServicesSection({
  services,
  products,
}: {
  services: Service[];
  products: Product[];
}) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Servicios</h2>
      <p className="text-sm text-neutral-500 mb-3">
        Duración y precio determinan los horarios disponibles y el monto a cobrar. "Insumos" define
        qué productos de stock consume cada vez que se realiza.
      </p>

      <div className="overflow-x-auto rounded-lg border mb-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Duración</th>
              <th className="px-4 py-2 font-medium">Precio</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <ServiceRow key={s.id} service={s} products={products} />
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-neutral-500">
                  No hay servicios cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={createService} className="grid grid-cols-4 gap-2">
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
        <textarea
          name="description"
          placeholder="Descripción para la web (opcional): qué incluye, beneficios, para quién es..."
          rows={2}
          className="col-span-4 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="col-span-4 rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
        >
          Agregar servicio
        </button>
      </form>
    </section>
  );
}
