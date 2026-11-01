// El segundo paso del ingreso. Se llega sólo con el pase que deja la clave o Google: todavía no hay sesión.

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import { FUENTES_PANEL } from "@/design/fuentes-panel";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { destinoTrasIngreso } from "@/lib/ingreso.server";
import { getTenantBrand, marcaDelNegocio, resolveAccent } from "@/lib/branding";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { claseDeFuentes } from "@/lib/estetica-backoffice-fuentes";
import { prisma } from "@/lib/prisma";
import { aBase32 } from "@/lib/proyectos/segundo-factor-core";
import { datosDeActivacion, leerPaseActual } from "@/lib/proyectos/segundo-factor.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { FormularioSegundoPaso } from "./_formulario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificación en dos pasos", robots: { index: false, follow: false } };

export default async function SegundoPaso({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const userId = await leerPaseActual();
  if (!userId) redirect("/admin/login");
  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  if (!user) redirect("/admin/login");

  const { next } = await searchParams;
  const [brand, slug, factor] = await Promise.all([
    getTenantBrand(),
    getCurrentTenantSlug(),
    prisma.proyectoSegundoFactor.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { activadoEl: true } }),
  ]);
  const { nombre } = marcaDelNegocio(brand, null);
  // Ya pasó: la sesión está abierta y esta pantalla se volvió a pedir mientras muestra los códigos de respaldo.
  const yaEntro = (await readSessionToken((await cookies()).get(getSessionCookieName())?.value)) === userId && !!factor?.activadoEl;
  const destinoListo = yaEntro ? await destinoTrasIngreso(user, next ?? "/admin") : null;
  const activando = !factor?.activadoEl;
  const activacion = activando ? await datosDeActivacion(user, nombre) : null;
  const estetica = esteticaBackoffice(slug) ?? undefined;
  const claro = resolveAccent(brand.preset, "light");
  const oscuro = resolveAccent(brand.preset, "dark");

  return (
    <main
      data-skin="fable"
      data-escala="nivel-5"
      data-theme="light"
      data-estetica={estetica}
      suppressHydrationWarning
      style={{ "--tenant-accent-light": claro.accent, "--tenant-on-accent-light": claro.onAccent, "--tenant-accent-dark": oscuro.accent, "--tenant-on-accent-dark": oscuro.onAccent } as CSSProperties}
      className={`min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6 ${FUENTES_PANEL}${estetica ? ` ${claseDeFuentes(estetica)}` : ""}`}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {estetica && <LogoDelNegocio estetica={estetica} nombre={nombre} />}
          <p className="mt-3 text-sm font-medium text-muted">{nombre}</p>
        </div>
        <section className="grid gap-4 rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-strong">{yaEntro ? "Verificación activa" : activando ? "Activá la verificación en dos pasos" : "Verificación en dos pasos"}</h1>
          {yaEntro ? null : activacion ? (
            <>
              <p className="text-sm text-muted">Tu cuenta ve información de plata, así que además de la clave pide un código. Escaneá esto con una app de autenticación (Google Authenticator, Microsoft Authenticator o similar) y escribí el código que muestra.</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- el QR es un data: generado en el servidor */}
              <img src={activacion.qr} alt="Código QR para la app de autenticación" width={220} height={220} className="mx-auto rounded-md bg-white" />
              <details className="text-sm text-muted">
                <summary className="flex min-h-11 cursor-pointer items-center underline">No puedo escanear</summary>
                <p className="break-all font-mono text-strong" data-secreto>{aBase32(activacion.secreto)}</p>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted">Escribí el código que muestra tu app de autenticación. Si perdiste el teléfono, usá un código de respaldo.</p>
          )}
          <FormularioSegundoPaso next={next ?? "/admin"} activando={activando} destinoListo={destinoListo} />
          {!yaEntro && <Link href="/admin/login" className="text-center text-sm text-muted underline">Volver al ingreso</Link>}
        </section>
      </div>
    </main>
  );
}
