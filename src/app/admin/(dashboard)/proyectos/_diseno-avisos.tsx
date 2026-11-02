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
  return <FaltaConectar titulo="Falta conectar la IA" detalle="Hay que cargar la cuenta de Cloudflare (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_AI_TOKEN) o la clave de Anthropic (ANTHROPIC_API_KEY) en la configuración del servidor." mientras={mientras} />;
}

export function FaltanImagenes({ mientras }: { mientras?: string }) {
  return <FaltaConectar titulo="Falta conectar las imágenes" detalle="Hay que cargar la cuenta de Cloudflare (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_AI_TOKEN) o un servicio propio (IMAGENES_API_URL e IMAGENES_API_KEY) en la configuración del servidor." mientras={mientras} />;
}
