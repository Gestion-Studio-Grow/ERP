// PROFETURNOS · Botón de arrepentimiento (público, sin cuenta). Ver src/lib/profeturnos/tramites-actions.ts.

import type { Metadata } from "next";
import PaginaTramite from "../PaginaTramite";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento — ProfeTurnos",
  description: "Botón de arrepentimiento de ProfeTurnos: sin entrar a tu cuenta, sin costo y con número de trámite.",
  generator: "Gestión Studio Grow",
};

export default function Page() {
  return <PaginaTramite tipo="arrepentimiento" />;
}
