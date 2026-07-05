import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import { requireUser } from "@/lib/authz";
import { getTenantBrand, resolveAccent, invertTheme } from "@/lib/branding";
import type { CSSProperties } from "react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El portón grueso (¿hay sesión?) lo hace `proxy.ts`; acá resolvemos el
  // usuario para adaptar la navegación a su rol (ADR-017 §2.e — ocultar lo que
  // no puede es UX; la seguridad real son los guardas server-side por acción).
  const [user, brand] = await Promise.all([requireUser(), getTenantBrand()]);

  // REGLA front/back: el BACK (admin) va en el tema OPUESTO al front del tenant.
  // Seteamos `data-theme` (los tokens semánticos de globals.css flipan solos, y
  // como el admin ya es token-driven, todo el panel cambia de luminosidad) e
  // inyectamos el acento del tenant AFINADO a ese tema (--accent + on-accent con
  // contraste AA). hover/soft se derivan en globals.css.
  const backTheme = invertTheme(brand.frontTheme);
  const { accent, onAccent } = resolveAccent(brand.preset, backTheme);

  return (
    <div
      data-theme={backTheme}
      style={{ "--accent": accent, "--text-on-accent": onAccent } as CSSProperties}
      className="min-h-screen bg-surface text-body"
    >
      <GlobalLoadingProvider>
        <ToastProvider>
          <AdminShell role={user.role} userName={user.name} brandName={brand.name} monogram={brand.monogram}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
