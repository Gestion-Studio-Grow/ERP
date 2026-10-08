/** Script en línea para el <head>: aplica el tema guardado antes del primer pintado (sin parpadeo). */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("btf:tema");if(t==="claro"||t==="oscuro")document.documentElement.setAttribute("data-tema",t)}catch(e){}})()`;
