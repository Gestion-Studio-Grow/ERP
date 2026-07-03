import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalLoadingProvider>
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </GlobalLoadingProvider>
  );
}
