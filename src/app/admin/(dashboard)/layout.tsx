import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import { requireUser } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El portón grueso (¿hay sesión?) lo hace `proxy.ts`; acá resolvemos el
  // usuario para adaptar la navegación a su rol (ADR-017 §2.e — ocultar lo que
  // no puede es UX; la seguridad real son los guardas server-side por acción).
  const user = await requireUser();
  return (
    <GlobalLoadingProvider>
      <ToastProvider>
        <AdminShell role={user.role} userName={user.name}>
          {children}
        </AdminShell>
      </ToastProvider>
    </GlobalLoadingProvider>
  );
}
