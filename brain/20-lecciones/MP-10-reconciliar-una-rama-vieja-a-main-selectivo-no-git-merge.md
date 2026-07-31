---
id: MP-10
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-10] Reconciliar una rama vieja a main = selectivo, no `git merge`

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> reconciliar rama vieja → main **por pathspec/delta, no `git merge`**; para cada archivo tocado por ambas, comparar contra `main` y traer **solo** lo nuevo. Colisión de nº de ADR → **renumerar el de la rama** al siguiente libre + arreglar el INDEX.

**Lección:** ante ramas muy divergentes, **diff primero, integrá el delta** — asumí que la rama vieja borra mejoras nuevas y verificá cada archivo compartido antes de traerlo.

## Detalle

- **Síntoma:** `gsg-lab` (base 63f54ca, solo ADRs 001-028) estaba **135 commits detrás** de `main` y 82 adelante; un `git merge` habría **regresionado** cosas que `main` sumó después (sello GSG del layout, nav Cockpit, scripts `gates`/`load-test`, `.env.vercel.template`) porque la rama vieja las **borra** en su versión de esos archivos.
- **Causa raíz:** una rama larga y divergente tiene versiones **viejas** de archivos compartidos (config, layout, .gitignore, package.json); traerla entera pisa el trabajo nuevo de `main`.
- **Fix:** reconciliación **selectiva y aditiva** — `git checkout <rama> -- <rutas nuevas>` para lo que no existe en main (carpeta célula, rutas del panel), y **merge quirúrgico archivo por archivo** (Read+diff, agregar solo el delta) en cada archivo compartido; **nunca overwrite** del archivo entero de la rama vieja. Vallas (tsc+test+build) + Gate antes de mergear a main (commit 405a066).
- **Lección:** ante ramas muy divergentes, **diff primero, integrá el delta** — asumí que la rama vieja borra mejoras nuevas y verificá cada archivo compartido antes de traerlo.
- **Guardarraíl:** reconciliar rama vieja → main **por pathspec/delta, no `git merge`**; para cada archivo tocado por ambas, comparar contra `main` y traer **solo** lo nuevo. Colisión de nº de ADR → **renumerar el de la rama** al siguiente libre + arreglar el INDEX.
- **Gotcha de infra:** `robocopy` desde Git Bash **necesita `MSYS_NO_PATHCONV=1`** — sin eso, MSYS convierte `/E` en `E:/` y el copiado falla en silencio (exit 0, 0 archivos). Materializar `node_modules` real (no junction) para el build de Turbopack sigue vigente (MP-6).
- **Refs:** ADR-039, ADR-049; ADR-056 (renumerado desde ADR-028 de la rama); memoria worktree/robocopy.

## Decisiones relacionadas

- [ADR-028](../30-decisiones/ADR-028.md)
- [ADR-039](../30-decisiones/ADR-039.md)
- [ADR-049](../30-decisiones/ADR-049.md)
- [ADR-056](../30-decisiones/ADR-056.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
