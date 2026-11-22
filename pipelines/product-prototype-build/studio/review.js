const el = id => document.getElementById(id);
const overlay = el("overlay");
const app = el("app");
const controls = document.querySelector(".review-controls");
const main = document.querySelector("main");
const comment = el("comment");
const send = el("send");
const status = el("status");
const revision = new URLSearchParams(location.search).get("revision");
const notes = [];
let line, start, end, drawing, batchId;

if (revision) {
  el("revision").textContent = "Версия " + revision;
  el("revision").hidden = false;
}

function showStatus(message, tone = "neutral") {
  status.dataset.tone = tone;
  status.textContent = message;
}

function updateControls() {
  const hasDraft = start || comment.value.trim();
  el("add").disabled = !hasDraft || drawing;
  send.disabled = !(notes.length || hasDraft) || drawing;
}

function clearLine() {
  line?.remove();
  line = start = end = drawing = null;
  updateControls();
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
  updateControls();
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
overlay.onpointerup = () => {
  drawing = false;
  updateControls();
};
overlay.onpointercancel = clearLine;
app.addEventListener("load", clearLine);
async function add() {
  const text = comment.value.trim();
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
  comment.value = "";
  clearLine();
  showStatus("В списке: " + notes.length);
}
async function locked(action) {
  if (controls.inert) return;
  const focused = document.activeElement;
  controls.inert = true;
  main.inert = true;
  try { await action(); }
  catch { showStatus("Ошибка сохранения. Повторите.", "error"); }
  finally {
    controls.inert = false;
    main.inert = false;
    updateControls();
    if (controls.contains(focused) && document.activeElement === document.body) {
      (focused.disabled ? comment : focused).focus();
    }
  }
}
el("compose").onsubmit = event => {
  event.preventDefault();
  if (!el("add").disabled) locked(add);
};
send.onclick = () => locked(async () => {
  await add();
  if (!notes.length) return;
  batchId ||= crypto.randomUUID();
  try {
    const response = await fetch("/__feedback", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:batchId, revision, notes})});
    if (!response.ok) throw Error();
    notes.length = 0;
    batchId = null;
    showStatus("Отправлено агенту", "success");
  } catch {
    showStatus("Ошибка отправки. Повторите.", "error");
  }
});

el("approve").onclick = () => locked(async () => {
  if (notes.length || start || comment.value.trim()) {
    showStatus("Сначала отправьте замечания.", "error");
    return;
  }
  const response = await fetch("/__feedback", {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:crypto.randomUUID(), revision, kind:"approval", notes:[]})});
  if (!response.ok) throw Error();
  showStatus("Версия утверждена", "success");
});
comment.oninput = updateControls;
