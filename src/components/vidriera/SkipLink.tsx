// «Saltar al contenido» (ronda 2, piso de accesibilidad §4.5): primer foco de cada front. Invisible hasta que recibe el
// foco con el teclado. La marca pone el color con `--skip-fondo` / `--skip-tinta`.
export const CSS_SKIP_LINK = `.gsg-skip{position:absolute;left:12px;top:12px;z-index:100;padding:12px 18px;min-height:48px;display:inline-flex;align-items:center;border-radius:10px;background:var(--skip-fondo,#111);color:var(--skip-tinta,#fff);font-weight:600;text-decoration:none;transform:translateY(-200%);transition:transform .12s}
.gsg-skip:focus,.gsg-skip:focus-visible{transform:none;outline:3px solid var(--skip-foco,currentColor);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.gsg-skip{transition:none}}`;

export default function SkipLink({ destino, children }: { destino: string; children: React.ReactNode }) {
  return (
    <a className="gsg-skip" href={`#${destino}`}>
      {children}
    </a>
  );
}
