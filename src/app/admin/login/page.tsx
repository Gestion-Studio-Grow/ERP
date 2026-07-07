import type { Metadata } from "next";
import { login } from "@/lib/auth-actions";
import { Input, buttonClasses } from "@/components/ui";
import { getTenantBrand, resolveAccent, invertTheme } from "@/lib/branding";
import type { CSSProperties } from "react";

// Título neutro + sin indexar, igual que el resto de /admin — esta pantalla vive
// FUERA de (dashboard) (proxy.ts la deja pasar sin sesión) así que no hereda su
// metadata y, sin esto, caía en el default de layout.tsx raíz ("CH Estética…"),
// filtrando la marca de CH a la pestaña del login de CUALQUIER tenant (J-2).
export const metadata: Metadata = {
  title: "Ingresar al panel",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const brand = await getTenantBrand();
  const backTheme = invertTheme(brand.frontTheme);
  const { accent, onAccent } = resolveAccent(brand.preset, backTheme);

  return (
    <main
      data-theme={backTheme}
      style={{ "--accent": accent, "--text-on-accent": onAccent } as CSSProperties}
      className="min-h-screen flex items-center justify-center bg-surface px-6"
    >
      <div className="w-full max-w-sm">
        <p className="text-sm text-faint mb-1">{brand.name}</p>
        <h1 className="text-2xl font-semibold mb-6">Ingresar al panel</h1>

        {error === "throttled" ? (
          <p className="mb-4 rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.
          </p>
        ) : error ? (
          <p className="mb-4 rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            Email o contraseña incorrectos. Probá de nuevo.
          </p>
        ) : null}

        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <Input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="Email"
          />
          <Input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Contraseña"
          />
          <button
            type="submit"
            className={buttonClasses("solid", "md", "w-full")}
          >
            Ingresar
          </button>
        </form>
      </div>
    </main>
  );
}
