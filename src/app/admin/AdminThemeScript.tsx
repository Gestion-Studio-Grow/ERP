// Script inline mínimo ANTI-FLASH del tema del backoffice (skin Fable).
//
// Cómo funciona: se renderiza como PRIMER hijo del contenedor `[data-skin="fable"]`
// (el layout del admin y el login lo montan ahí). Al ser un <script> clásico
// parseado en línea, corre SINCRÓNICO durante el parseo del HTML — antes del
// primer paint — y corrige el `data-theme` del contenedor (que el server manda
// en "light" como fallback sin-JS). Resultado: cero flash claro→oscuro.
//
// Prioridad del tema: localStorage (`gsg-admin-theme`, lo escribe ThemeToggle)
// → prefers-color-scheme del sistema → claro. `document.currentScript.parentElement`
// apunta al contenedor sin depender de ids (funciona aunque haya más de una
// superficie con el skin). Todo dentro de try/catch: si algo falla (storage
// bloqueado, matchMedia viejo), queda el claro del server y listo.
//
// El desajuste SSR/cliente que esto genera en el atributo lo absorbe
// `suppressHydrationWarning` en el contenedor.

const BOOT = `(function(){try{var e=document.currentScript.parentElement,t=localStorage.getItem("gsg-admin-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}e.setAttribute("data-theme",t)}catch(_){}})()`;

export default function AdminThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
