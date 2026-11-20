// RELOJ FIJO DEL SERVIDOR E2E (MIA-194 · punto 7). Se precarga con `node --import` y SÓLO lo pone `ambiente-e2e.mjs --start`:
// con `E2E_RELOJ` (una fecha ISO), el reloj del proceso arranca en esa hora y sigue corriendo desde ahí (como `page.clock` en el
// navegador del recorrido), así los vencimientos, los «hace N días» y los avisos del servidor coinciden con las capturas. Las
// fechas explícitas (`new Date(x)`, `Date.UTC`, `Date.parse`) no cambian. Sin la variable, no toca nada. Nunca en producción.
// MIA-196 · guarda propia: en Vercel o con NODE_ENV=production la precarga no arranca, aunque haya E2E_RELOJ. Se mira al cargar,
// antes de que `next start` fije NODE_ENV en su proceso (no lanza hijos de node), así el ambiente E2E local sigue andando.
if (process.env.VERCEL || process.env.NODE_ENV === "production")
  throw new Error("reloj-fijo: no corre en Vercel ni con NODE_ENV=production (sólo el ambiente E2E local, ambiente-e2e.mjs --start)");
const iso = process.env.E2E_RELOJ;
if (iso) {
  const base = Date.parse(iso);
  if (!Number.isFinite(base)) throw new Error(`E2E_RELOJ no es una fecha: «${iso}»`);
  const Real = Date;
  const desfase = base - Real.now();
  const ahora = () => Real.now() + desfase;
  globalThis.Date = new Proxy(Real, {
    construct: (t, args, nuevo) => Reflect.construct(t, args.length ? args : [ahora()], nuevo),
    apply: () => new Real(ahora()).toString(),
    get: (t, p, r) => (p === "now" ? ahora : Reflect.get(t, p, r)),
  });
}
