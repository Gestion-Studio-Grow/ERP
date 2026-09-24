import Link from "next/link";
import { operatorLogin } from "@/lib/operator-actions";
import { Input, Button } from "@/components/ui";

// Login del PLANO DE OPERADOR (control-plane, ADR-021) — separado del login de tenant
// (/admin/login). Nombre y clave:
//   · el dueño de GSG: su clave de siempre (OPERATOR_PASSWORD); el nombre puede quedar vacío;
//   · otro operador: su nombre y la clave con la que armó su línea de OPERADORES (/operador/clave).
// Cada cosa que se hace en la consola queda firmada con ese nombre. La sesión vence a las 8 h.
// En dev, sin OPERATOR_PASSWORD, la clave del dueño es "operador".
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
        <h1 className="text-2xl font-semibold mb-1">Consola de GSG</h1>
        <p className="text-sm text-muted mb-6">
          Acceso restringido a operadores de la plataforma. No es el panel de un negocio.
        </p>

        {error === "throttled" ? (
          <p role="alert" className="mb-4 rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.
          </p>
        ) : error ? (
          <p role="alert" className="mb-4 rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            Nombre o clave incorrectos.
          </p>
        ) : null}

        <form action={operatorLogin} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/operador"} />
          <label className="block text-sm">
            <span className="text-muted">Tu nombre de operador</span>
            <Input
              type="text"
              name="nombre"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Vacío si sos el dueño"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Clave</span>
            <Input type="password" name="password" required autoComplete="current-password" />
          </label>
          <Button type="submit" className="w-full">
            Ingresar a la consola
          </Button>
        </form>
        <p className="mt-4 text-xs text-muted">
          ¿Te suman como operador?{" "}
          <Link href="/operador/clave" className="underline hover:text-strong">
            Armá tu línea de acceso
          </Link>{" "}
          y pasásela al dueño. Tu clave no sale de tu pantalla.
        </p>
      </div>
    </main>
  );
}
