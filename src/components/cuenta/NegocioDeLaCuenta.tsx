// De qué negocio es la cuenta que define su contraseña o su PIN (GSG-MIA-076).
export function NegocioDeLaCuenta({ nombre }: { nombre: string | null }) {
  if (!nombre) return null;
  return (
    <p className="text-sm text-muted" data-negocio-de-la-cuenta>
      Cuenta de <span className="font-medium text-strong">{nombre}</span>
    </p>
  );
}
