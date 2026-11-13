// ============================================================================
// PEDÍ LOCAL · «MI CUENTA» — /tienda/mi-cuenta. Sin login: lo que se pidió desde ESTE dispositivo.
// ============================================================================
//
// Historial (con el link al seguimiento), direcciones guardadas y «Repetir pedido». Todo vive en el
// navegador (src/lib/delivery-local/mi-cuenta.ts); el servidor no guarda nada nuevo. Sólo existe para
// los negocios con «Pedí Local» (si no, 404). Sin indexar: es de cada persona.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { configDeliveryLocal } from "@/lib/delivery-local/config";
import { pielDelLocal } from "@/lib/delivery-local/marca";
import BarraDelLocal from "../local/BarraDelLocal";
import MiCuenta from "../local/MiCuenta";
import PieLocal from "../local/PieLocal";
import { atributosDeRaiz } from "../local/raiz";
import s from "../local/local.module.css";

export const metadata: Metadata = {
  title: "Mi cuenta",
  generator: "Gestión Studio Grow",
  robots: { index: false, follow: false },
};

export default async function MiCuentaPage() {
  const identity = await getTenantIdentity();
  const cfg = configDeliveryLocal(identity.slug);
  if (!cfg || !identity.slug) notFound();
  const piel = pielDelLocal(cfg.marca);
  return (
    <div {...atributosDeRaiz(piel, `${s.raiz} ${s.raizSinBarra}`)}>
      <BarraDelLocal cfg={cfg} logoUrl={piel.logoUrl} enCuenta />
      <main className={`${s.ancho} ${s.cuenta}`}>
        <h1 className={s.cuentaTitulo}>Mi cuenta</h1>
        <p className={s.cuentaBajada}>
          Tus pedidos a {cfg.nombre} desde este teléfono. No hace falta registrarse: queda guardado sólo acá, en tu navegador.
        </p>
        <MiCuenta slug={identity.slug} />
      </main>
      <PieLocal cfg={cfg} />
    </div>
  );
}
