import type { Metadata } from "next";
import { login } from "@/lib/auth-actions";
import { Field, Input, buttonClasses } from "@/components/ui";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import AdminThemeScript from "../AdminThemeScript";
import type { CSSProperties } from "react";

// Título neutro + sin indexar, igual que el resto de /admin — esta pantalla vive
// FUERA de (dashboard) (proxy.ts la deja pasar sin sesión) así que no hereda su
// metadata y, sin esto, caía en el default de layout.tsx raíz ("CH Estética…"),
// filtrando la marca de CH a la pestaña del login de CUALQUIER tenant (J-2).
// Sello GSG: el login es la primera impresión del producto — GSG firma como
// generador (discreto, en metadata + pie), el tenant conserva SU marca visible.
export const metadata: Metadata = {
  title: "Ingresá a tu panel",
  robots: { index: false, follow: false },
  generator: "Gestión Studio Grow",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const brand = await getTenantBrand();
  // IDENTIDAD POR PRODUCTO (frente identidad-por-producto): el login debe CORRESPONDER
  // al producto, no caer en el "Mi negocio" genérico. Para Comerciante/Contador/Facturita
  // la marca, el copy y el acento salen de la identidad del producto; para el ERP vertical
  // (chestetica/magra) `identidad` es null → todo cae a la marca del tenant, byte-idéntico
  // a lo de antes.
  const { identidad } = await getProductoContexto();
  // Skin Fable (mismo criterio que el layout del admin): el tema lo decide el
  // usuario/sistema, no la regla front/back. Se inyectan los DOS tonos del acento
  // del tenant (nunca `--accent` inline: le ganaría al CSS y el tema no fliparía).
  // El color del equipo elegido en /admin/apariencia SIEMPRE gana; si no, el del
  // producto; si tampoco (vertical), el del branding del tenant.
  const preset = (await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");

  // Marca + copy de la pantalla: del producto si lo hay; del tenant (legado) si no.
  const marcaNombre = identidad?.nombre ?? brand.name;
  const marcaMonograma = identidad?.monograma ?? brand.monogram;
  const tituloLogin = identidad?.login.titulo ?? "Ingresá a tu panel";
  const subtituloLogin = identidad?.login.subtitulo ?? "Con el email y la contraseña de tu cuenta.";

  return (
    <main
      data-skin="fable"
      data-theme="light"
      suppressHydrationWarning
      style={
        {
          "--tenant-accent-light": accentLight.accent,
          "--tenant-on-accent-light": accentLight.onAccent,
          "--tenant-accent-dark": accentDark.accent,
          "--tenant-on-accent-dark": accentDark.onAccent,
        } as CSSProperties
      }
      className="min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6"
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript />

      <div className="w-full max-w-sm">
        {/* Marca del producto (o del tenant, en verticales): monograma sobre su acento,
            con un halo suave del acento detrás — primera impresión a la altura del producto,
            sin ruido. Eyebrow + tagline solo cuando hay identidad de producto. */}
        <div className="mb-6 flex flex-col items-center text-center">
          {identidad && (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-accent">
              {identidad.login.eyebrow}
            </p>
          )}
          <span className="relative grid h-12 w-12 place-items-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl bg-accent opacity-20 blur-lg"
            />
            <span
              aria-hidden
              className="relative grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-on-accent shadow-sm"
            >
              {marcaMonograma}
            </span>
          </span>
          <p className="mt-3 text-sm font-medium text-muted">{marcaNombre}</p>
        </div>

        {/* Card del login: superficie elevada sobre el canvas, borde --line,
            radios del mockup (12px), sombra en reposo. */}
        <section
          aria-labelledby="login-titulo"
          className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8"
        >
          <h1 id="login-titulo" className="text-xl font-semibold tracking-tight text-strong">
            {tituloLogin}
          </h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            {subtituloLogin}
          </p>

          {error === "throttled" ? (
            <p
              role="alert"
              className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.
            </p>
          ) : error ? (
            <p
              role="alert"
              className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              Email o contraseña incorrectos. Probá de nuevo.
            </p>
          ) : null}

          <form action={login} className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/admin"} />
            <Field label="Email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
                placeholder="tu@email.com"
              />
            </Field>
            <Field label="Contraseña" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>
            <button type="submit" className={buttonClasses("solid", "lg", "w-full mt-1")}>
              Ingresar
            </button>
          </form>
        </section>

        {/* Tagline del producto — cierra la primera impresión. Solo con identidad. */}
        {identidad && (
          <p className="mt-5 text-center text-sm text-muted">{identidad.tagline}</p>
        )}

        {/* Sello GSG, discreto: el tenant conserva su marca; GSG firma detrás. */}
        <p className="mt-6 text-center text-xs text-faint">
          Con tecnología de Gestión Studio Grow
        </p>
      </div>
    </main>
  );
}
