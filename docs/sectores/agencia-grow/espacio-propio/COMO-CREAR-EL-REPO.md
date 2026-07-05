# Cómo crear el repo `agencia-grow` (pendiente de permiso del GitHub App)

**Estado:** el dueño dio OK para crear el espacio (2026-07-05). El intento automático de crear
`Gestion-Studio-Grow/agencia-grow` **falló con `403 Resource not accessible by integration`**: el
GitHub App conectado a esta sesión **no tiene permiso de "crear repos" en la organización**.

## Opción A — habilitar el permiso y que la sesión lo cree (recomendado)
Un **admin de la organización** habilita el acceso del GitHub App de Claude:
- En GitHub → Organization → Settings → **GitHub Apps** (o desde la config de Claude en
  https://claude.ai/admin-settings ) → dar al App permiso de **Administration: Read & write** (crear
  repos) sobre `Gestion-Studio-Grow`.
- Con eso, una sesión puede crear el repo y **pushear esta semilla** (`espacio-propio/`) de una.

## Opción B — el dueño crea el repo vacío y la sesión lo siembra
1. En GitHub: **New repository** → owner `Gestion-Studio-Grow`, nombre **`agencia-grow`**, **Private**,
   *Add a README* (para que tenga rama `main`).
2. Pasale el nombre a una sesión de Claude: se agrega a la sesión (`add_repo`) y se **pushea esta semilla**
   (`espacio-propio/README.md`, `TABLERO-AGENCIA.md`, la estructura de `frentes/clientes/productos`).
3. Se **borra** `docs/sectores/agencia-grow/espacio-propio/` del ERP (ya no debe vivir acá — guardrail).

## Descripción sugerida del repo
> Agencia Grow — sector de servicios + productos que hace escalar el patrimonio de los dueños con
> negocios automatizados (online/físico). Repos/deploys separados del ERP (ADR-028/030).

## Qué se pushea (contenido inicial = esta carpeta)
Todo lo que hay en `espacio-propio/` pasa a ser la **raíz** del repo `agencia-grow`. La Consola Grow
(prototipo) puede copiarse a `productos/panel-del-dueno/` o quedar como referencia en el ERP.

> Los productos de **software** (arca standalone, Panel del Dueño) siguen su propia regla: plugin del
> Core **o** su repo (ej. `arca` ya existe). Este repo es para la **operación de servicios** del sector.
