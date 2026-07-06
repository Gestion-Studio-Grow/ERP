import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/operator-session";
import { operatorLogout } from "@/lib/operator-actions";
import { Button } from "@/components/ui";

// Control-plane: título propio (no "CH Estética…" heredado) y sin indexar.
export const metadata: Metadata = {
  title: "Consola · Control-plane",
  robots: { index: false, follow: false },
};

// Shell del plano de operador. Guard duro (requireOperator) además del portón del
// proxy. Look deliberadamente distinto al backoffice del tenant: esto es "nosotros
// operando la plataforma", no un negocio (ADR-021: dos superficies, dos audiencias).
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();

  return (
    <div className="min-h-screen bg-surface text-strong" data-theme="dark">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/operador" className="font-semibold tracking-tight">
              ◆ Control-plane
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/operador" className="hover:text-strong">Tenants</Link>
              <Link href="/operador/alta" className="hover:text-strong">Alta de tenant</Link>
            </nav>
          </div>
          <form action={operatorLogout}>
            <Button type="submit" variant="ghost" size="sm">Salir</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
