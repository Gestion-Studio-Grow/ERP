// FACTOQUE · Botón de arrepentimiento (público, sin cuenta). Ver src/lib/factoque-tramites.ts.

import type { Metadata } from "next";
import PaginaTramite from "../PaginaTramite";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento — Factoque",
  description: "Botón de arrepentimiento de Factoque: sin cuenta, sin costo y con número de trámite.",
  generator: "Gestión Studio Grow",
};

export default function Page() {
  return <PaginaTramite tipo="arrepentimiento" />;
}
