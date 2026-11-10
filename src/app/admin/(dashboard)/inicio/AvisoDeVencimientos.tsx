import Link from "next/link";
import { todayInBusinessTz } from "@/lib/datetime";
import { getCurrentTenantId } from "@/lib/tenant";
import { lotesYDespieceListos } from "@/lib/carniceria/schema-probe";
import { listarLotes } from "@/lib/carniceria/lotes-loader";
import {
  DIAS_POR_VENCER,
  resumenDeAlertas,
  textoDelAvisoDeVencimientos,
} from "@/lib/carniceria/lotes";
import { logger } from "@/lib/logger";
import { puedeAbrirApp } from "../vender/puede-abrir";

// AVISO DE VENCIMIENTOS en el Inicio del mostrador (Magra T3). Una línea de estado, no una
// pantalla: lotes vencidos, que vencen hoy y que vencen en DIAS_POR_VENCER días o menos, con el
// link a Lotes. Degrada SIEMPRE a nada: sin la migración cárnica o en un negocio que no vende
// perecederos (CH, Shine) no consulta lotes (`lotesYDespieceListos` corta antes); si quien mira
// no puede abrir Lotes, o la lectura falla, no se muestra (el Inicio no se cae por un aviso).
async function leerAviso(): Promise<string | null> {
  try {
    if (!(await lotesYDespieceListos())) return null;
    if (!(await puedeAbrirApp("lotes-y-vencimientos"))) return null;
    const lotes = await listarLotes(await getCurrentTenantId(), false);
    return textoDelAvisoDeVencimientos(
      resumenDeAlertas(lotes, todayInBusinessTz(), DIAS_POR_VENCER),
    );
  } catch (err) {
    logger.error("lotes", "no se pudo leer el aviso de vencimientos", err);
    return null;
  }
}

export default async function AvisoDeVencimientos() {
  const texto = await leerAviso();
  if (!texto) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-2.5 rounded-lg bg-warning-soft border border-warning/25 px-4 py-2.5 text-sm text-warning"
    >
      <svg
        aria-hidden="true"
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span className="flex-1">
        <span className="font-semibold">Vencimientos: </span>
        {texto}
      </span>
      <Link
        href="/admin/lotes"
        className="font-semibold whitespace-nowrap hover:underline"
      >
        Ver lotes →
      </Link>
    </div>
  );
}
