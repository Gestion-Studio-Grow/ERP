// MORPH — actualiza el DOM cambiando sólo lo distinto, en vez de reemplazar todo con innerHTML.
// Por qué: con innerHTML cada clic borra y vuelve a crear la pantalla → se pierde el foco, el scroll y
// lo que se estaba escribiendo, y se ve un parpadeo. Con morph la pantalla "se queda quieta" y sólo
// cambian los números, chips y bloques que cambiaron (y las transiciones CSS pueden animarse).
//
// Claves de emparejamiento: `id` o `data-k` (si están); si no, el orden. Los <canvas> no se tocan por dentro
// (las cámaras siguen dibujando). Un input con foco no pierde lo que el usuario está escribiendo.

const claveDe = (n) => (n.nodeType === 1 ? n.id || n.getAttribute("data-k") || "" : "");
const mismo = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && claveDe(a) === claveDe(b);

// Un <details> que el usuario abrió (o cerró) queda como lo dejó: refrescar la pantalla no se lo cambia.
const delUsuario = (a, name) => name === "open" && a.tagName === "DETAILS";
function atributos(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !delUsuario(a, name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value && !delUsuario(a, name)) a.setAttribute(name, value);
}

function nodo(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  atributos(a, b);
  const tag = a.tagName;
  if (tag === "CANVAS") return;
  if (tag === "INPUT") {
    const enFoco = a === document.activeElement;
    if (a.type === "checkbox" || a.type === "radio") { if (a.checked !== b.hasAttribute("checked")) a.checked = b.hasAttribute("checked"); }
    else if (!enFoco && a.value !== (b.getAttribute("value") ?? "")) a.value = b.getAttribute("value") ?? "";
    return;
  }
  if (tag === "TEXTAREA") {
    if (a !== document.activeElement && a.value !== b.textContent) a.value = b.textContent;
    return;
  }
  hijos(a, b);
  if (tag === "SELECT") {
    const elegido = b.querySelector("option[selected]") ?? b.querySelector("option");
    if (elegido && a.value !== elegido.value) a.value = elegido.value;
  }
}

function hijos(padre, nuevo) {
  let actual = padre.firstChild;
  for (const n of [...nuevo.childNodes]) {
    if (actual && mismo(actual, n)) { nodo(actual, n); actual = actual.nextSibling; continue; }
    // ¿Está más adelante (mismo id/clave)? Se mueve en lugar de recrearse.
    let match = null;
    const k = claveDe(n);
    if (k) for (let x = actual; x; x = x.nextSibling) if (mismo(x, n)) { match = x; break; }
    if (match) { padre.insertBefore(match, actual); nodo(match, n); continue; }
    padre.insertBefore(n, actual);
  }
  while (actual) { const sig = actual.nextSibling; padre.removeChild(actual); actual = sig; }
}

/** Lleva `elemento` a tener exactamente el HTML `html`, tocando lo mínimo. */
export function morph(elemento, html) {
  const molde = document.createElement("template");
  molde.innerHTML = html;
  hijos(elemento, molde.content);
}
