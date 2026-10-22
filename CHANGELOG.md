# Changelog

Todas las versiones del ERP de Gestión Studio Grow. Lo genera `npm run release:notas`
(scripts/release/notas.mjs) a partir de los commits convencionales; no se edita a mano.
Versionado semántico por tag (`vX.Y.Z`): `feat` sube la minor, `fix` y el resto la patch,
un cambio que rompe (`!` o `BREAKING CHANGE:`) la major (la minor mientras estemos en 0.x).

## 0.2.0 — 2026-10-22

### Novedades

- **health:** semáforo del motor ARCA en /api/ready y config de ARCA en /api/health, sin datos de negocios ([`2972d063`](https://github.com/Gestion-Studio-Grow/ERP/commit/2972d06308998b9b6825420629f0df6b6706e454))
- **flags:** flags por negocio de la suite de facturación — núcleo puro, default apagado, doble llave y sin comodín ([`80224e4e`](https://github.com/Gestion-Studio-Grow/ERP/commit/80224e4e74942c3c165fc10ed4d71064ee98ab5f))

### Plataforma y CI

- **release:** tren de releases — workflow release (núcleo, sello GSG, Gate en el PR, notas, smoke post-deploy) y scripts sin dependencias ([`a6732fad`](https://github.com/Gestion-Studio-Grow/ERP/commit/a6732fad0244add50bac7a9a9dee4a94aba2774e))

### Documentación

- **runbooks:** facturación — incidentes, soporte de primer nivel, rollback, monitoreo, flags; checklist de release y Gate del frente ([`3f0a490d`](https://github.com/Gestion-Studio-Grow/ERP/commit/3f0a490d331d894c0dcca2ddd494bcdc8be97932))

### Mantenimiento

- **brain:** regenerar el mapa derivado en la Fase 0 del frente de facturación automática ([`99402fea`](https://github.com/Gestion-Studio-Grow/ERP/commit/99402feac98c5455fb6dfe078fa6eab94d238c28))

