import type { Metadata } from "next";

// CRM COMERCIAL · Sello GSG en todas sus pantallas (Gate de Excelencia 2): el negocio conserva su marca visible
// y GSG firma como generador. El pie «Con tecnología de Gestión Studio Grow» lo pone `Marco` (comun.tsx).
export const metadata: Metadata = { generator: "Gestión Studio Grow" };

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
