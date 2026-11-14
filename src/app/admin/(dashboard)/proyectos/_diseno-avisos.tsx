// Lo que le falta a una función para andar se dice con todas las letras, y qué se puede hacer mientras tanto.

export function FaltaConectar({ titulo, detalle, mientras }: { titulo: string; detalle: string; mientras?: string }) {
  return (
    <div role="status" className="rounded-xl border border-line bg-surface p-3 text-sm">
      <p className="font-semibold text-strong">{titulo}</p>
      <p className="mt-1 text-muted">{detalle}</p>
      {mientras && <p className="mt-1 text-muted">{mientras}</p>}
    </div>
  );
}

export function FaltaIA({ mientras }: { mientras?: string }) {
  return <FaltaConectar titulo="Falta conectar la IA" detalle="Todavía no está activada para tu negocio. Avisale a quien administra el sistema para que la conecte." mientras={mientras} />;
}

export function FaltanImagenes({ mientras }: { mientras?: string }) {
  return <FaltaConectar titulo="Falta conectar las imágenes" detalle="Todavía no están activadas para tu negocio. Avisale a quien administra el sistema para que las conecte." mientras={mientras} />;
}
