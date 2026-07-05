import { operatorLogin } from "@/lib/operator-actions";
import { Input, Button } from "@/components/ui";

// Login del PLANO DE OPERADOR (control-plane, ADR-021) — separado del login de tenant
// (/admin/login). Credencial de operador por entorno (OPERATOR_PASSWORD); en dev, si
// no está seteada, la contraseña es "operador".
export default async function OperatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm text-faint mb-1">Plataforma · Consola de operador</p>
        <h1 className="text-2xl font-semibold mb-1">Control-plane de tenants</h1>
        <p className="text-sm text-muted mb-6">
          Acceso restringido a operadores de la plataforma. No es el panel de un negocio.
        </p>

        {error && (
          <p className="mb-4 rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            Contraseña de operador incorrecta.
          </p>
        )}

        <form action={operatorLogin} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/operador"} />
          <Input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Contraseña de operador"
          />
          <Button type="submit" className="w-full">
            Ingresar a la consola
          </Button>
        </form>
      </div>
    </main>
  );
}
