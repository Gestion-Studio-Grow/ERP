// El segundo paso con PIN por mail (COMERCIAL/PRODUCCION de una productora sin app de códigos). Se llega sólo con el pase
// que deja la clave o Google: todavía no hay sesión. El código ya salió al pasar la clave; acá se escribe o se pide otro.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import { FUENTES_PANEL } from "@/design/fuentes-panel";
import { getTenantBrand, marcaDelNegocio, resolveAccent } from "@/lib/branding";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { claseDeFuentes } from "@/lib/estetica-backoffice-fuentes";
import { prisma } from "@/lib/prisma";
import { exigeSegundoPaso, leerPaseActual } from "@/lib/proyectos/segundo-factor.server";
import { MENSAJE_RECIEN } from "@/lib/rendiciones/pin-core";
import { exigePin } from "@/lib/rendiciones/pin.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { FormularioPin } from "./_formulario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Código de ingreso", robots: { index: false, follow: false } };

export default async function IngresoConPin({ searchParams }: { searchParams: Promise<{ next?: string; recien?: string }> }) {
  const userId = await leerPaseActual();
  if (!userId) redirect("/admin/login");
  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  if (!user) redirect("/admin/login");
  const { next, recien } = await searchParams;
  const destino = encodeURIComponent(next ?? "/admin");
  // Quien ve plata o ya tiene la app sigue con TOTP: el PIN nunca es un atajo para esquivarlo.
  if (await exigeSegundoPaso(user)) redirect(`/admin/login/segundo-paso?next=${destino}`);
  if (!(await exigePin(user))) redirect("/admin/login");

  const [brand, slug] = await Promise.all([getTenantBrand(), getCurrentTenantSlug()]);
  const { nombre } = marcaDelNegocio(brand, null);
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
          <h1 className="text-xl font-semibold tracking-tight text-strong">Código de ingreso</h1>
          {recien === "1" ? (
            <p role="status" className="text-sm font-medium text-strong">{MENSAJE_RECIEN}</p>
          ) : (
            <p className="text-sm text-muted">Si tu usuario existe, te mandamos un código de 6 dígitos a tu mail. Vence en 5 minutos y sirve una sola vez.</p>
          )}
          <FormularioPin next={next ?? "/admin"} />
          <Link href="/admin/login" className="flex min-h-11 items-center justify-center text-sm text-muted underline">Volver al ingreso</Link>
        </section>
      </div>
    </main>
  );
}
