const el = id => document.getElementById(id);
const overlay = el("overlay");
const app = el("app");
const notes = [];
let line, start, end, drawing, batchId;

function clearLine() {
  line?.remove();
  line = start = end = drawing = null;
}
function point(event) {
  const box = overlay.getBoundingClientRect();
  return [event.clientX - box.left, event.clientY - box.top];
}
el("pen").onclick = () => {
  const active = el("pen").getAttribute("aria-pressed") !== "true";
  el("pen").setAttribute("aria-pressed", String(active));
  overlay.toggleAttribute("hidden", !active);
};
overlay.onpointerdown = event => {
  clearLine();
  overlay.setPointerCapture(event.pointerId);
  drawing = true;
  start = end = point(event);
  const shape = el("shape").value;
  line = document.createElementNS("http://www.w3.org/2000/svg", shape);
  line.setAttribute("stroke", "#ce2455");
  line.setAttribute("stroke-width", "4");
  line.setAttribute("fill", "none");
  if (shape === "line") line.setAttribute("marker-end", "url(#tip)");
  overlay.append(line);
  updateShape();
};
function updateShape() {
  const [x, y] = start, [u, v] = end;
  const attrs = line.localName === "line" ? {x1:x, y1:y, x2:u, y2:v}
    : {cx:(x+u)/2, cy:(y+v)/2, rx:Math.abs(x-u)/2, ry:Math.abs(y-v)/2};
  for (const [key, value] of Object.entries(attrs)) line.setAttribute(key, value);
}
overlay.onpointermove = event => {
  if (!drawing) return;
  end = point(event);
  updateShape();
};
overlay.onpointerup = () => { drawing = false; el("send").disabled = false; };
app.addEventListener("load", clearLine);
async function add() {
  const text = el("comment").value.trim();
  if (!start && !text) return;
  const doc = app.contentDocument;
  const target = end && doc?.elementFromPoint(...end);
  const canvas = await html2canvas(doc.documentElement, {
    x:app.contentWindow.scrollX, y:app.contentWindow.scrollY, width:app.clientWidth,
    height:app.clientHeight, scale:Math.min(1, 1400 / app.clientWidth), logging:false
  });
  notes.push({shape:line?.localName, screenshot:canvas.toDataURL("image/jpeg", 0.65), text, start, end, url: app.contentWindow.location.href,
    viewport: [app.clientWidth, app.clientHeight], scroll: [app.contentWindow.scrollX, app.contentWindow.scrollY],
    target: target?.outerHTML.slice(0, 350), screen: doc?.body.innerText.slice(0, 2000)});
  el("comment").value = "";
  clearLine();
  el("send").disabled = false;
  el("status").textContent = "В списке: " + notes.length;
}
async function locked(action) {
  const header = document.querySelector("header");
  if (header.inert) return;
  header.inert = true;
  document.querySelector("main").inert = true;
  try { await action(); }
  catch { el("status").textContent = "Ошибка сохранения. Повторите."; }
  finally { header.inert = false; document.querySelector("main").inert = false; }
}
el("add").onclick = () => locked(add);
el("send").onclick = () => locked(async () => {
  await add();
  if (!notes.length) return;
  el("send").disabled = true;
  batchId ||= crypto.randomUUID();
  try {
    const response = await fetch("/__feedback", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:batchId, revision:new URLSearchParams(location.search).get("revision"), notes})});
    if (!response.ok) throw Error();
    notes.length = 0;
    batchId = null;
    el("status").textContent = "Отправлено агенту";
  } catch {
    el("status").textContent = "Ошибка отправки. Повторите.";
    el("send").disabled = false;
  }
});

el("approve").onclick = () => locked(async () => {
  if (notes.length || start || el("comment").value.trim()) {
    el("status").textContent = "Сначала отправьте замечания.";
    return;
  }
  const revision = new URLSearchParams(location.search).get("revision");
  const response = await fetch("/__feedback", {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:crypto.randomUUID(), revision, kind:"approval", notes:[]})});
  if (!response.ok) throw Error();
  el("status").textContent = "Версия утверждена";
});
el("comment").oninput = () => { el("send").disabled = !(notes.length || start || el("comment").value.trim()); };
