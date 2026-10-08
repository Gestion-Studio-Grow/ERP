import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import IngresoForm from "./IngresoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Ingresar auto" };

export default async function IngresoPage({ searchParams }: { searchParams: Promise<{ patente?: string }> }) {
  await requireApp("taller");
  const { patente } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-5">
      <Link href="/admin/taller" className="text-sm underline">← Volver al taller</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold text-strong">Ingresar auto</h1>
      <IngresoForm patenteInicial={patente ?? ""} />
    </main>
  );
}
