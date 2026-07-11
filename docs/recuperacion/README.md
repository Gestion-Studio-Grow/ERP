# 🛟 Recuperación GSG — datos de tenants reconstruidos + guía (2026-07-10)

> **Qué es:** respaldo de contenido rescatado del bundle `_recuperacion_inbox_20260710`, **reconstruido desde
> las apps en vivo** (`gsg-erp-{magra,estetica,velas,padel}.vercel.app`) cuando se temió pérdida del repo.
> **Todo es DEMO / dato ficticio de QA** (así lo declara cada `_meta`), NO datos productivos.

## Contenido
- **`tenants-reconstruidos/tenant-{magra,estetica,padel,velas}.json`** — catálogo + textos + config de cada
  tienda, reconstruidos del HTML público. Sirven como **semilla/backup de contenido** para re-sembrar o QA.
  **No** son los `.tsx` originales; preservan el contenido editable. Marcados DEMO en su `_meta`.
- **`00-GUIA-RECUPERACION.md`** — las 5 vías de recuperación de repo (Vercel deployments → reflog → GitHub
  branches/PRs/forks → otra copia local → GitHub Support 90 días). Útil ante cualquier susto futuro.
- **`manifiesto-assets.md`** — URLs de los bundles JS/CSS construidos servidos por cada app (re-descargables
  mientras el deploy siga vivo).

## Relación con el resto
- **La política para que no vuelva a pasar** (proteger `main`, mirror/backup, `--force-with-lease`) está en
  **[`docs/PRACTICA-DE-GUARDADO.md`](../PRACTICA-DE-GUARDADO.md)** §5–6.
- **Diagnóstico de qué se perdió/salvó:** la fundación completa está a salvo en `origin` (ramas `rf6x0m` /
  `fundacion/consolidacion-diseno`); nada fundacional quedó huérfano (ver ESTADO-ACTUAL).

— Elaborado por GSG (PMO)
