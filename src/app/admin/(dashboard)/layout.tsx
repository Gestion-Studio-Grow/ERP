import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import { requireUser } from "@/lib/authz";
import { getTenantAccent } from "@/lib/branding";
import type { CSSProperties } from "react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El portón grueso (¿hay sesión?) lo hace `proxy.ts`; acá resolvemos el
  // usuario para adaptar la navegación a su rol (ADR-017 §2.e — ocultar lo que
  // no puede es UX; la seguridad real son los guardas server-side por acción).
  const [user, accent] = await Promise.all([requireUser(), getTenantAccent()]);
  // Acento de marca del tenant → CSS var `--accent`. Cascada sobre todo el admin:
  // los primitivos (Button, foco, chips) consumen `--accent`, así que el panel
  // entero toma el color del tenant sin tocar componentes (look base B, marca por
  // tenant). hover/soft se derivan en globals.css con color-mix.
  return (
    <div style={{ "--accent": accent } as CSSProperties} className="min-h-full">
      <GlobalLoadingProvider>
        <ToastProvider>
          <AdminShell role={user.role} userName={user.name}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
