// MIA-50 T05: lo común de Comprobantes, Órdenes de pago, IVA crédito y Vinculadas (todas cuelgan de Proveedores).
import Link from "next/link";
import { cn } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { puede, type Actor } from "@/lib/proyectos/gestion.server";
import { tarjeta } from "../_vista";

const SECCIONES = [
  { href: "/admin/proyectos/proveedores", label: "Proveedores" },
  { href: "/admin/proyectos/proveedores/comprobantes", label: "Comprobantes" },
  { href: "/admin/proyectos/proveedores/ordenes", label: "Órdenes de pago" },
  { href: "/admin/proyectos/proveedores/iva", label: "IVA crédito" },
  { href: "/admin/proyectos/proveedores/vinculadas", label: "Sociedades vinculadas" },
] as const;

export function NavCompras({ actual }: { actual: (typeof SECCIONES)[number]["href"] }) {
  return (
    <nav aria-label="Compras a proveedores" className="flex flex-wrap gap-1 print:hidden">
      {SECCIONES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={s.href === actual ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border border-line px-3 text-sm", s.href === actual ? "bg-accent text-on-accent" : "text-strong hover:bg-surface")}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** Centavos (Int o BigInt) → «$ 1.210,00». */
export const plata = (centavos: number | bigint): string => pesos(Number(centavos) / 100);

/** Qué puede en Compras quien ya pasó `exigirVer("proveedores")` (la página lo pide a la vista, para la matriz A1): ver la plata
 *  del negocio; cargar = editar Proveedores o Pagos; pagar = editar Pagos. */
export function permisosDeCompras(a: Actor): { a: Actor; vePlata: boolean; carga: boolean; paga: boolean } {
  const vePlata = veLaPlata(a.user);
  return { a, vePlata, carga: vePlata && (puede(a, "proveedores", "editar") || puede(a, "pagos", "editar")), paga: vePlata && puede(a, "pagos", "editar") };
}

export function SinPlata() {
  return <p className={cn(tarjeta, "text-sm text-muted")}>Tu usuario no ve la plata del negocio: los comprobantes y las órdenes de pago los maneja Administración.</p>;
}

export function SinM1() {
  return <p className={cn(tarjeta, "text-sm text-muted")}>Los comprobantes de proveedor necesitan una actualización de la base que todavía no está aplicada. Lo demás funciona igual.</p>;
}
