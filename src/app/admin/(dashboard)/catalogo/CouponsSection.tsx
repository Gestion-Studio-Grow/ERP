"use client";

import { createCoupon, toggleCouponActive, deleteCoupon } from "@/lib/coupon-actions";
import { useToast } from "../ToastProvider";
import { fmtShortDate } from "@/lib/datetime";
import { EmptyState, Input, Select, buttonClasses } from "@/components/ui";

type Coupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
};

function CouponRow({ c }: { c: Coupon }) {
  const { showError, showSuccess } = useToast();
  const label = c.type === "PERCENT" ? `${c.value}%` : `$${c.value.toLocaleString("es-AR")}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border border-line px-4 py-2.5">
      <div>
        <span className="font-medium font-mono">{c.code}</span>
        <span className="ml-2 text-sm text-muted">
          {label} de descuento
          {c.maxUses != null && ` · ${c.usedCount}/${c.maxUses} usos`}
          {c.maxUses == null && c.usedCount > 0 && ` · usado ${c.usedCount} veces`}
          {c.expiresAt && ` · vence ${fmtShortDate(c.expiresAt)}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={toggleCouponActive}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="active" value={String(c.active)} />
          <button
            type="submit"
            className={`inline-flex items-center min-h-6 max-sm:min-h-11 rounded-full px-2.5 py-1 text-xs font-medium ${
              c.active ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
            }`}
          >
            {c.active ? "Activo" : "Inactivo"}
          </button>
        </form>
        <form
          action={async (fd) => {
            if (!confirm(`¿Eliminar el cupón "${c.code}"?`)) return;
            try {
              await deleteCoupon(fd);
              showSuccess(`Cupón "${c.code}" eliminado.`);
            } catch (err) {
              showError(err instanceof Error ? err.message : "No se pudo eliminar.");
            }
          }}
        >
          <input type="hidden" name="id" value={c.id} />
          <button type="submit" className="chip-btn max-sm:min-h-11! chip-btn-danger">
            Eliminar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CouponsSection({
  coupons,
  enPromociones = false,
}: {
  coupons: Coupon[];
  /**
   * En la app Promociones y cupones: la página ya explica dónde valen (Vender, la tienda y los
   * turnos), así que acá no se repite el texto de los turnos de la estética, y el vacío dice qué
   * hacer con un botón. En el Catálogo de CH, como siempre.
   */
  enPromociones?: boolean;
}) {
  const { showError } = useToast();

  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Cupones de descuento</h2>
      {!enPromociones && (
        <p className="text-sm text-muted mb-3">
          El cliente lo ingresa al reservar (web o modal). Se valida contra esta lista al confirmar
          el turno — nunca se confía en el descuento que calculó el navegador.
        </p>
      )}

      <div className="space-y-2 mb-4">
        {coupons.map((c) => (
          <CouponRow key={c.id} c={c} />
        ))}
        {coupons.length === 0 &&
          (enPromociones ? (
            <EmptyState
              title="Todavía no hay cupones"
              description="Creá el primero acá abajo: el código que se escribe, el descuento y, si querés, hasta cuándo vale y cuántas veces se puede usar."
              action={
                <button type="button" onClick={() => document.getElementById("cupon-codigo")?.focus()} className={buttonClasses("solid", "md")}>
                  Crear el primero
                </button>
              }
            />
          ) : (
            <p className="text-sm text-muted">No hay cupones cargados todavía.</p>
          ))}
      </div>

      <form
        action={async (fd) => {
          try {
            await createCoupon(fd);
          } catch (err) {
            showError(err instanceof Error ? err.message : "No se pudo crear el cupón.");
          }
        }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-line p-4"
      >
        <Input
          id="cupon-codigo"
          aria-label="Código del cupón"
          name="code"
          required
          placeholder="Código (Ej.: VERANO10)"
          className="col-span-2 uppercase placeholder:normal-case"
        />
        <Select name="type" defaultValue="PERCENT" aria-label="Tipo de descuento">
          <option value="PERCENT">% descuento</option>
          <option value="FIXED">$ fijo</option>
        </Select>
        <Input name="value" type="number" min={1} step="any" required placeholder="Valor" aria-label="Valor del descuento" />
        <Input name="expiresAt" type="date" aria-label="Vence (opcional)" />
        <Input name="maxUses" type="number" min={1} step={1} placeholder="Usos máx. (opcional)" aria-label="Usos máximos (opcional)" className="col-span-2 sm:col-span-1" />
        <button type="submit" className={buttonClasses("solid", "md", "col-span-2 sm:col-span-4")}>
          Crear cupón
        </button>
      </form>
    </section>
  );
}
