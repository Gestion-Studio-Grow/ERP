"use client";

// CRM COMERCIAL · el resultado de una acción, al lado del botón: el motivo del servidor tal cual, o el «listo».

export function Resultado({ motivo, hecho }: { motivo: string | null; hecho?: string | null }) {
  if (motivo) {
    return (
      <p role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-strong">
        {motivo}
      </p>
    );
  }
  if (hecho) {
    return (
      <p role="status" className="mt-2 text-sm text-success">
        {hecho}
      </p>
    );
  }
  return null;
}

export const ROTULO = "mb-1 block text-sm font-medium text-strong";
