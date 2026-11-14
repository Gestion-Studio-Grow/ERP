// PROFETURNOS · Darme de baja (público, sin cuenta). Ver src/lib/profeturnos/tramites-actions.ts.

import type { Metadata } from "next";
import PaginaTramite from "../PaginaTramite";

export const metadata: Metadata = {
  title: "Darme de baja — ProfeTurnos",
  description: "Darme de baja de ProfeTurnos: sin entrar a tu cuenta, sin costo y con número de trámite.",
  generator: "Gestión Studio Grow",
};

export default function Page() {
  return <PaginaTramite tipo="baja" />;
}
