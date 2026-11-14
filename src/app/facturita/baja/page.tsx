// FACTOQUE · Darme de baja (público, sin cuenta). Ver src/lib/factoque-tramites.ts.

import type { Metadata } from "next";
import PaginaTramite from "../PaginaTramite";

export const metadata: Metadata = {
  title: "Darme de baja — Factoque",
  description: "Darme de baja de Factoque: sin cuenta, sin costo y con número de trámite.",
  generator: "Gestión Studio Grow",
};

export default function Page() {
  return <PaginaTramite tipo="baja" />;
}
