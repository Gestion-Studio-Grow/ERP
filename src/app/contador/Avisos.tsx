// Las dos regiones vivas fijas de un control del panel del contador: una `role="status"` (lo que
// salió bien, se anuncia sin interrumpir) y otra `role="alert"` (lo que falló). Están SIEMPRE en
// el DOM y sólo cambia su texto: un lector de pantalla no anuncia de forma confiable una región que
// aparece o que cambia de rol (hallazgo M5 de la Auditoría GSG).

export default function Avisos({ ok, error, className }: { ok?: React.ReactNode; error?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p role="status" className="text-sm text-muted">
        {ok ?? ""}
      </p>
      <div role="alert" className="text-sm text-danger">
        {error ?? ""}
      </div>
    </div>
  );
}
