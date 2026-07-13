# 👁️ Log de veredictos — Verificador Visual (render real)

> Validador: **`verificador-visual`**. Append-only. La entrada más nueva va **arriba**.
> Formato por corrida:

```
### [FECHA] · <rama/commit> · <superficie/vista>
- **Render:** ✅ rendió / ❌ NO se pudo renderizar → (regla dura: no poder rendir = veredicto ❌, no "pasó igual")
- **Vistas cubiertas:** rol(es) [·] · mobile/desktop [·] · light/dark [·] · tenant/branding [·]
- **Veredicto:** ✅ se ve bien / ⚠️ con observaciones / ❌ no pasa
- **Chequeos:** carga completa [·] · sin overflow [·] · contraste AA [·] · touch targets [·] · CTA visible [·] · dato real por-entidad (DX-6) [·] · sin colapso `--spacing`↔`max-w` (DX-8) [·]
- **Evidencia:** ruta(s) de screenshot
- **Si se escapó un defecto (falso ✅):** qué era + qué vista/estado no se miró → aprendizaje para la próxima
```

---

<!-- Nuevas entradas acá arriba. Ejemplo de arranque (borrar cuando entre la primera real): -->

### [2026-07-12] · agentes/calibracion · Bootstrap del log
- **Nota:** log vacío y listo. Este rol nace de MP-16 (login roto en prod con las vallas verdes). La primera
  corrida real de render escribe arriba. Recordatorio embebido: **mirar el screenshot, no el log de éxito**.
