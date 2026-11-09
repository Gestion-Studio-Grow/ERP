// Definir (o cambiar) el PIN de desbloqueo: se ofrece justo después de entrar con la contraseña (destinoTrasIngreso) y
// del cambio obligatorio de contraseña. Vive FUERA de (dashboard), como /admin/cambiar-password: el proxy exige sesión
// activa, sin el layout del panel. Se puede saltear: sin PIN, la sesión bloqueada pide la contraseña.

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionCookieName, INACTIVIDAD_BLOQUEO_MS } from "@/lib/auth";
import { requireUser } from "@/lib/authz";
import { puedeDefinirPin } from "@/lib/sesion-pin";
import { destinoDeRenovar } from "@/lib/sesion-legado";
import HojaSimple from "../login/HojaSimple";
import { FormularioPinNuevo } from "./_formulario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu PIN", robots: { index: false, follow: false }, generator: "Gestión Studio Grow" };

export default async function DefinirPin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const next = destinoDeRenovar((await searchParams).next);
  const habilitado = (await puedeDefinirPin((await cookies()).get(getSessionCookieName())?.value)) === user.id;
  const minutos = Math.round(INACTIVIDAD_BLOQUEO_MS / 60_000);

  return (
    <HojaSimple titulo="Elegí tu PIN">
      <p className="text-sm text-muted">
        Tu ingreso no vence. Si pasan {minutos} minutos sin uso tapamos la pantalla, y con este PIN seguís sin escribir la
        contraseña. Es tuyo: no lo compartas.
      </p>
      {habilitado ? (
        <FormularioPinNuevo next={next} />
      ) : (
        <div className="grid gap-3">
          <p role="status" className="rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-sm text-strong">
            Por seguridad, el PIN se elige justo después de entrar con tu contraseña.
          </p>
          <Link href={`/admin/login?next=${encodeURIComponent(next)}`} className="flex min-h-11 items-center justify-center text-sm text-muted underline">
            Entrar con la contraseña
          </Link>
          <Link href={next} className="flex min-h-11 items-center justify-center text-sm text-muted underline">
            Ahora no
          </Link>
        </div>
      )}
    </HojaSimple>
  );
}
