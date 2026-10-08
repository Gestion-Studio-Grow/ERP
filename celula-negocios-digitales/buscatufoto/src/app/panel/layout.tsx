import type { Metadata } from "next";
import { MarcoPanel } from "@/components/panel/MarcoPanel";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel · buscatufoto" },
  robots: { index: false, follow: false },
};

/** Marco propio del panel del fotógrafo (no usa el del sitio público). */
export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return <MarcoPanel>{children}</MarcoPanel>;
}
