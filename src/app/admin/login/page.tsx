import { login } from "@/lib/auth-actions";
import { Input, buttonClasses } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm text-faint mb-1">Beauty &amp; Spa</p>
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
