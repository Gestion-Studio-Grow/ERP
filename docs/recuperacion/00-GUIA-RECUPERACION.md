> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), reconstruido desde las apps en vivo. Incorporado sin alterar.

---

# GSG ERP · Guía de recuperación del repositorio

**Situación:** se perdió contenido del repo de GitHub de Gestión Studio Grow (ERP).
**Buena noticia primero:** las 4 apps **siguen desplegadas y en vivo** en Vercel
(gsg-erp-magra / estetica / velas / padel `.vercel.app`). Eso significa que **el código construido no está perdido** — está corriendo. Hay varias vías para recuperarlo, ordenadas de más fácil a más profunda.

> Importante: yo (el asistente) **no tengo acceso a tu repo privado de GitHub** ni puedo iniciar sesión en tu cuenta. Las acciones de abajo las tenés que hacer vos; te dejo el paso a paso exacto. Lo que **sí** guardé está en esta carpeta `recuperacion-gsg/` (contenido y datos de las 4 tiendas reconstruidos).

---

## Vía 1 — Vercel guarda cada deployment y su código fuente *(la más rápida)*
Vercel conserva **todos** los deployments con su fuente y el commit de Git asociado.
1. Entrá a https://vercel.com → tu proyecto (ej. `gsg-erp-magra`).
2. Pestaña **Deployments** → abrí cualquier deployment reciente que funcione.
3. Ahí vas a ver el **commit SHA** y el branch de Git de ese build. Anotá el SHA.
4. Con ese SHA podés recuperar el código: `git fetch origin && git checkout <SHA>`.
5. Si el repo local también se perdió: en el deployment, botón **⋯ → "Download source"** (o "Redeploy") para bajar el snapshot exacto de la fuente de ese build.

Esto normalmente resuelve todo, porque el estado que ves en vivo es reconstruible al 100%.

## Vía 2 — `git reflog` (si "se perdió" localmente, no en el remoto)
Los commits que parecen borrados siguen vivos ~90 días como *dangling commits*.
```bash
git reflog                 # lista TODO lo que estuvo en HEAD, incluso lo "perdido"
git checkout <hash>        # volvés a ese punto
git branch recuperado <hash>   # lo salvás en un branch nuevo
# ver commits colgados que reflog no muestre:
git fsck --lost-found --no-reflogs | grep commit
```

## Vía 3 — GitHub: branches, PRs, forks y red
1. En el repo, revisá **todos los branches** (menú de branches → "View all branches").
2. **Pull Requests → Closed**: el código puede vivir en una PR cerrada/mergeada.
3. Pestaña **Insights → Network / Forks**: si alguien forkeó, el código está en el fork.
4. **Activity** del repo: muestra pushes/force-pushes con sus SHAs (podés recuperar de ahí).

## Vía 4 — Otra copia local
El código suele estar en el clon local de cualquiera que haya trabajado el proyecto
(tu máquina, otro dev, la notebook vieja, el entorno de Vercel CLI). Buscá `.git` en esas máquinas: `git bundle create backup.bundle --all` para empaquetar todo.

## Vía 5 — Repo borrado en GitHub
Si el **repositorio entero** se eliminó: GitHub Support puede restaurarlo dentro de los **90 días** posteriores al borrado. Abrí ticket en https://support.github.com/ con el nombre exacto del repo. (Requiere que lo pida un owner/admin de la organización.)

---

## Qué guardé en esta carpeta (`recuperacion-gsg/`)
Aunque no llego a tu repo, rescaté desde las apps en vivo todo el **contenido público** — sirve como respaldo del contenido/datos y para re-sembrar un repo nuevo si hiciera falta:

| Archivo | Contenido |
|---|---|
| `tenant-magra.json` | Catálogo + textos + config de la tienda MAGRA (carnicería). |
| `tenant-velas.json` | Catálogo + textos de la tienda Velas. |
| `tenant-padel.json` | Catálogo + textos de la tienda Pádel. |
| `tenant-estetica.json` | Servicios + equipo + textos del sitio Estética (usa el molde landing + `/admin`). |
| `manifiesto-assets.md` | URLs de todos los assets construidos (JS/CSS) para re-descargar mientras el deploy siga vivo. |
| `README.md` | Índice de esta carpeta. |

**Nota técnica:** las apps son **Next.js (App Router, Turbopack)**. El HTML servido ya trae el contenido embebido; el `/admin` está detrás de login (no accesible sin credenciales). Los archivos `tenant-*.json` reconstruyen los datos visibles de forma limpia y editable — no son los `.tsx` originales, pero preservan el contenido para no perderlo y para poder repoblarlo.

## Recomendación para que no vuelva a pasar
1. **Protegé `main`** en GitHub (Settings → Branches → Branch protection: prohibir force-push y borrado).
2. Activá **backups**: un mirror automático (`git clone --mirror` a un segundo remoto) o una GitHub Action que espeje el repo.
3. Nunca uses `git push --force` sobre `main`; usá `--force-with-lease` y sólo en tu propio branch.
