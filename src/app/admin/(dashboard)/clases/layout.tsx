import { AvisoProvider } from "./_aviso";

// Sello GSG del backoffice (estándar de marca): metadata + crédito discreto al pie. El negocio
// conserva su nombre visible; esto es la firma de calidad detrás.
export const metadata = { generator: "Gestión Studio Grow" };

// Monta la barra del resultado + WhatsApp (ver _aviso.tsx). La guardia de cada pantalla sigue
// en su página (requireApp), nunca acá: los layouts no se re-renderizan al navegar.
export default function ClasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AvisoProvider>
      {children}
      <p className="pb-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
    </AvisoProvider>
  );
}
