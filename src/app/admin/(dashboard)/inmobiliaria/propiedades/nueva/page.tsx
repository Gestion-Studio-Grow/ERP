import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { personas, veLaPlata } from "@/lib/inmobiliaria/datos.server";
import { BarraInmo, RAIZ, titulo } from "../../_vista";
import { Ficha } from "../_ficha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Cargar propiedad" };

export default async function NuevaPropiedad() {
  const user = await requireApp("inmobiliaria");
  const gente = await personas();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4">
        <Link href={`${RAIZ}/propiedades`} className="text-sm underline">
          ← Propiedades
        </Link>
        <h1 className={titulo}>Cargar propiedad</h1>
        <p className="text-sm text-muted">Empezá por lo básico: nace como borrador y las fotos se suben en el paso siguiente.</p>
      </header>
      <BarraInmo activa={`${RAIZ}/propiedades`} conPlata={veLaPlata(user)} esDuenio={roleHasCapability(user.role, "users:manage")} />
      <Ficha personas={gente} />
    </main>
  );
}
