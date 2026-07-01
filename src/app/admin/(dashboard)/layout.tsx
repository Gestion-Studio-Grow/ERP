import Sidebar from "./Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-white text-neutral-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b px-6 py-4 flex items-center justify-between gap-4">
          <span className="font-medium text-neutral-400 whitespace-nowrap">[Tu negocio]</span>
          <span className="text-sm text-neutral-500 whitespace-nowrap">Panel de administración</span>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
