import { login } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm text-neutral-400 mb-1">[Tu marca]</p>
        <h1 className="text-2xl font-semibold mb-6">Ingresar al panel</h1>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">
            Contraseña incorrecta. Probá de nuevo.
          </p>
        )}

        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Contraseña"
            className="w-full rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-black text-white py-2.5 font-medium"
          >
            Ingresar
          </button>
        </form>
      </div>
    </main>
  );
}
