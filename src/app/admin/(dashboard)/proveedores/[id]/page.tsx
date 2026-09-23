import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getFichaProveedor } from "@/lib/suppliers/supplier-repo";
import { fmtShortDate } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import { EmptyState, PageHeader, Badge, buttonClasses, fmtCuit, fmtMoneyARS } from "@/components/ui";
import { EstadoProveedorForm, ProveedorForm } from "../ProveedorForm";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { COMPRA: "Compra", REPOSICION: "Reposición" };

// LA FICHA DEL PROVEEDOR: sus datos (editables), lo que se le compró, lo que se le debe y lo
// que se le devolvió. Todo del negocio del request: un id de otro negocio no encuentra nada y
// se ve "no existe".
export default async function FichaProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ alta?: string }>;
}) {
  await requireApp("proveedores");
  const [{ id }, sp, tenantId] = await Promise.all([params, searchParams, getCurrentTenantId()]);
  const ficha = await getFichaProveedor(tenantId, id);

  if (!ficha) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <EmptyState
          title="Ese proveedor no existe"
          description="Puede que el enlace sea de otro negocio o esté mal copiado."
          action={
            <Link href="/admin/proveedores" className={buttonClasses("solid", "md")}>
              Ver los proveedores
            </Link>
          }
        />
      </main>
    );
  }

  const { proveedor: p, compras, totalDeCompras, deuda, devoluciones, totalDeDevoluciones, devuelto, codigoDeCompra } = ficha;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <PageHeader
        title={p.name}
        badge={!p.active ? <Badge tone="neutral">Dado de baja</Badge> : undefined}
        description={`${p.taxId ? `CUIT ${fmtCuit(p.taxId)}` : "Sin CUIT"}${p.phone ? ` · ${p.phone}` : ""}${p.email ? ` · ${p.email}` : ""}`}
        actions={
          <Link href="/admin/proveedores" className={buttonClasses("outline", "md")}>
            Todos los proveedores
          </Link>
        }
      />
      {sp.alta === "1" && (
        <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-strong">
          Proveedor dado de alta. Ya lo podés elegir en{" "}
          <Link href="/admin/compras" className="font-medium underline underline-offset-2">
            Recibir mercadería
          </Link>
          .
        </p>
      )}

      <section aria-labelledby="deuda-titulo" className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line p-4">
          <p id="deuda-titulo" className="text-sm text-muted">Le debés</p>
          {deuda.ok ? (
            <p className="text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(deuda.saldo)}</p>
          ) : (
            <p className="text-sm text-muted">— {deuda.motivo}</p>
          )}
          {deuda.ok && deuda.abiertas.length > 0 && (
            <Link href="/admin/cuentas-a-pagar" className="mt-1 inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline">
              {deuda.abiertas.length === 1 ? "1 cuenta abierta" : `${deuda.abiertas.length} cuentas abiertas`}
            </Link>
          )}
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Compras</p>
          <p className="text-2xl font-semibold tabular-nums text-strong">{totalDeCompras}</p>
          {totalDeCompras > compras.length && <p className="text-xs text-muted">abajo, las últimas {compras.length}</p>}
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Devuelto</p>
          <p className="text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(devuelto)}</p>
          <p className="text-xs text-muted">a costo de la compra, en total</p>
        </div>
      </section>

      <section aria-labelledby="compras-titulo">
        <h2 id="compras-titulo" className="mb-3 text-lg font-semibold text-strong">
          Compras
        </h2>
        {compras.length === 0 ? (
          <EmptyState
            title="Todavía no hay compras de este proveedor"
            description="Cuando recibas mercadería, elegilo en la lista y la compra aparece acá."
            action={
              <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
                Recibir mercadería
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {compras.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-strong">
                    {KIND[c.kind] ?? c.kind} #{c.code}
                  </span>{" "}
                  <span className="text-muted">
                    · {fmtShortDate(c.createdAt)} · {c._count.items === 1 ? "1 producto" : `${c._count.items} productos`}
                  </span>
                </span>
                <span className="tabular-nums font-medium text-body">{c.totalCost > 0 ? fmtMoneyARS(c.totalCost) : "sin costo"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="devoluciones-titulo">
        <h2 id="devoluciones-titulo" className="mb-3 text-lg font-semibold text-strong">
          Devoluciones
          {totalDeDevoluciones > devoluciones.length && (
            <span className="ml-2 text-sm font-normal text-muted">(las últimas {devoluciones.length} de {totalDeDevoluciones})</span>
          )}
        </h2>
        {devoluciones.length === 0 ? (
          <p className="text-sm text-muted">No se le devolvió nada.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {devoluciones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span>
                  <span className="text-strong">{m.product?.name ?? "Producto borrado"}</span>{" "}
                  <span className="text-muted">
                    · {fmtShortDate(m.createdAt)}
                    {m.purchaseId && codigoDeCompra.has(m.purchaseId) && ` · de la compra #${codigoDeCompra.get(m.purchaseId)}`}
                    {m.reason && ` · ${m.reason}`}
                  </span>
                </span>
                <span className="tabular-nums text-body">
                  {formatearCantidad(Math.abs(m.qty))} {m.product?.unit ?? ""}
                  {m.unitCost ? ` · ${fmtMoneyARS(Math.abs(m.qty) * m.unitCost)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="datos-titulo" className="rounded-lg border border-line p-4">
        <h2 id="datos-titulo" className="mb-3 text-base font-semibold text-strong">
          Datos del proveedor
        </h2>
        <ProveedorForm modo="edicion" datos={p} />
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-sm text-muted">
            {p.active
              ? "Si ya no le comprás, dalo de baja: deja de aparecer para elegir y su historial queda acá."
              : "Está dado de baja: no aparece para elegir al recibir mercadería."}
          </p>
          <EstadoProveedorForm id={p.id} activo={p.active} />
        </div>
      </section>
    </main>
  );
}
