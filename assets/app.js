/* ============================================================
   FAMILY ARCHIVE — app logic
   Cards are laid out on a computed coordinate grid, then drawn
   on a pan/zoom canvas. Every card is the same square size, so
   spacing stays even no matter how lopsided the family gets.
   ============================================================ */

const SUPABASE_URL = "https://dawznfhpekxkmavhhysp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhd3puZmhwZWt4a21hdmhoeXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODUxMzgsImV4cCI6MjA5OTU2MTEzOH0.zri14vTDwzXWflIWPu_zPCSj10BFoQ0TpAoTI8EiipA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- LAYOUT CONSTANTS ---------- */
const CARD = 150;      // cards are square: same width and height
const GAP_X = 30;      // space between two cards side by side
const GAP_Y = 90;      // vertical space between generations
const ROW = CARD + GAP_Y;
const STEP = CARD + GAP_X;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 2.5;

/* ---------- 1. PASSWORD GATE ---------- */
const PASSWORD_HASH = "7dce034e548b1e319664a6f0d28c30d61f3c5fb9765b76aa8c73bd5e391302fc"; // default: family2026

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const lockScreen = document.getElementById("lockScreen");
const app = document.getElementById("app");
const lockForm = document.getElementById("lockForm");
const passwordInput = document.getElementById("passwordInput");
const lockError = document.getElementById("lockError");

function unlock() {
  sessionStorage.setItem("familyArchiveUnlocked", "1");
  lockScreen.hidden = true;
  app.hidden = false;
  loadTree();
}

if (sessionStorage.getItem("familyArchiveUnlocked") === "1") {
  unlock();
} else {
  lockForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256(passwordInput.value.trim());
    if (hash === PASSWORD_HASH) {
      unlock();
    } else {
      lockError.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
    }
  });
}

/* ---------- 2. STATE ---------- */
let peopleCache = [];
let forest = { roots: [], nodes: new Map() };
const collapsed = new Set();          // ids whose descendants are hidden
let showPhotos = localStorage.getItem("familyShowPhotos") === "1";
let view = { x: 0, y: 0, k: 1 };      // canvas pan/zoom

const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const cardsLayer = document.getElementById("cards");
const connectors = document.getElementById("connectors");
const emptyState = document.getElementById("emptyState");

async function loadTree({ keepView = false } = {}) {
  const { data, error } = await sb.from("people").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  peopleCache = data || [];
  render({ keepView });
}

/* ---------- 3. BUILD THE TREE FROM FLAT ROWS ---------- */
function buildForest(people) {
  const nodes = new Map();
  people.forEach(p => nodes.set(p.id, { person: p, children: [], parent: null, x: 0, y: 0, depth: 0 }));

  const roots = [];
  people.forEach(p => {
    const node = nodes.get(p.id);
    const parent = p.parent_id != null ? nodes.get(p.parent_id) : null;
    // A person whose parent is missing, is themselves, or would close a
    // loop is treated as the head of their own branch.
    if (parent && parent !== node && !wouldLoop(node, parent)) {
      node.parent = parent;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return { roots, nodes };
}

function wouldLoop(node, parent) {
  for (let a = parent; a; a = a.parent) if (a === node) return true;
  return false;
}

function visibleChildren(node) {
  return collapsed.has(node.person.id) ? [] : node.children;
}

/* Assign x/y to every node.

   Leaves are handed the next free column left to right; a parent is then
   centred over its own children. Because each node's x always lands inside
   the span of columns its own descendants occupy, and those spans never
   overlap, two cards in the same row can never be closer than one STEP.
   That is what keeps sibling spacing even across the whole page. */
function layout(roots) {
  let cursor = 0;

  function walk(node, depth) {
    node.depth = depth;
    node.y = depth * ROW;
    const kids = visibleChildren(node);
    if (!kids.length) {
      node.x = cursor;
      cursor += STEP;
    } else {
      kids.forEach(k => walk(k, depth + 1));
      node.x = (kids[0].x + kids[kids.length - 1].x) / 2;
    }
  }

  roots.forEach((r, i) => {
    if (i > 0) cursor += STEP; // breathing room between separate branches
    walk(r, 0);
  });
}

function eachNode(fn) {
  forest.nodes.forEach(fn);
}

function visibleNodes() {
  const out = [];
  const walk = (n) => { out.push(n); visibleChildren(n).forEach(walk); };
  forest.roots.forEach(walk);
  return out;
}

function countDescendants(node) {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

/* ---------- 4. RENDER ---------- */
function render({ keepView = false } = {}) {
  emptyState.hidden = peopleCache.length > 0;
  canvas.hidden = peopleCache.length === 0;
  if (!peopleCache.length) return;

  forest = buildForest(peopleCache);
  layout(forest.roots);

  const nodes = visibleNodes();
  cardsLayer.innerHTML = "";
  nodes.forEach(n => cardsLayer.appendChild(personCard(n)));
  drawConnectors(nodes);

  if (keepView) applyView(); else fitToScreen();
}

function initials(name) {
  return (name || "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function avatar(url, label) {
  const el = document.createElement("div");
  el.className = "avatar";
  if (showPhotos && url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = label;
    img.loading = "lazy";
    el.appendChild(img);
  } else {
    el.textContent = initials(label);
    el.classList.add("avatar-initials");
  }
  return el;
}

function personCard(node) {
  const p = node.person;
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = p.id;
  card.style.left = node.x + "px";
  card.style.top = node.y + "px";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open ${p.name}`);

  const avatars = document.createElement("div");
  avatars.className = "avatars";
  avatars.appendChild(avatar(p.photo_url, p.name));
  if (p.spouse_name) avatars.appendChild(avatar(p.spouse_photo_url, p.spouse_name));
  card.appendChild(avatars);

  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = p.name;
  card.appendChild(name);

  if (p.spouse_name) {
    const spouse = document.createElement("div");
    spouse.className = "card-spouse";
    spouse.textContent = p.spouse_name;
    card.appendChild(spouse);
  }

  const plus = document.createElement("button");
  plus.className = "card-add";
  plus.type = "button";
  plus.title = `Add a child of ${p.name}`;
  plus.textContent = "+";
  plus.addEventListener("click", (e) => { e.stopPropagation(); openForm({ mode: "add", relation: "child", context: p }); });
  card.appendChild(plus);

  if (node.children.length) {
    const isCollapsed = collapsed.has(p.id);
    const toggle = document.createElement("button");
    toggle.className = "card-toggle" + (isCollapsed ? " is-collapsed" : "");
    toggle.type = "button";
    toggle.title = isCollapsed ? "Show this branch" : "Hide this branch";
    toggle.textContent = isCollapsed ? String(countDescendants(node)) : "−";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isCollapsed) collapsed.delete(p.id); else collapsed.add(p.id);
      render({ keepView: true });
    });
    card.appendChild(toggle);
  }

  card.addEventListener("click", () => openPerson(p));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPerson(p); }
  });
  return card;
}

/* Orthogonal elbows: a trunk down from the parent, a bar across the
   children, and a drop into the top of each child. */
function drawConnectors(nodes) {
  const parts = [];
  nodes.forEach(node => {
    const kids = visibleChildren(node);
    if (!kids.length) return;

    const cx = node.x + CARD / 2;
    const top = node.y + CARD;
    const midY = top + GAP_Y / 2;

    parts.push(`M ${cx} ${top} V ${midY}`);
    if (kids.length > 1) {
      parts.push(`M ${kids[0].x + CARD / 2} ${midY} H ${kids[kids.length - 1].x + CARD / 2}`);
    }
    kids.forEach(k => parts.push(`M ${k.x + CARD / 2} ${midY} V ${k.y}`));
  });

  const box = bounds();
  connectors.setAttribute("width", box.w);
  connectors.setAttribute("height", box.h);
  connectors.innerHTML = parts.length
    ? `<path d="${parts.join(" ")}" />`
    : "";
}

function bounds() {
  const nodes = visibleNodes();
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + CARD - x, h: Math.max(...ys) + CARD - y };
}

/* ---------- 5. PAN & ZOOM ---------- */
function applyView() {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fitToScreen() {
  const box = bounds();
  if (!box.w) return;
  const pad = 40;
  const w = viewport.clientWidth - pad * 2;
  const h = viewport.clientHeight - pad * 2;
  const k = clamp(Math.min(w / box.w, h / box.h, 1), MIN_ZOOM, MAX_ZOOM);
  view.k = k;
  view.x = (viewport.clientWidth - box.w * k) / 2 - box.x * k;
  view.y = (viewport.clientHeight - box.h * k) / 2 - box.y * k;
  applyView();
}

function zoomAt(px, py, factor) {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
  const f = k / view.k;
  view.x = px - (px - view.x) * f;
  view.y = py - (py - view.y) * f;
  view.k = k;
  applyView();
}

function zoomCentre(factor) {
  zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, factor);
}

/* Put a person in the middle of the screen at a readable zoom. */
function focusPerson(id, k = 1) {
  for (let n = forest.nodes.get(id); n; n = n.parent) {
    if (n.parent) collapsed.delete(n.parent.person.id);
  }
  render({ keepView: true });

  const node = forest.nodes.get(id);
  if (!node) return;
  view.k = clamp(k, MIN_ZOOM, MAX_ZOOM);
  view.x = viewport.clientWidth / 2 - (node.x + CARD / 2) * view.k;
  view.y = viewport.clientHeight / 2 - (node.y + CARD / 2) * view.k;
  applyView();

  const card = cardsLayer.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add("is-found");
    setTimeout(() => card.classList.remove("is-found"), 1600);
  }
}

viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

const pointers = new Map();
let panStart = null;
let pinchStart = null;
let moved = false;

viewport.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = false;

  if (pointers.size === 1) {
    panStart = { x: e.clientX - view.x, y: e.clientY - view.y };
    viewport.classList.add("is-panning");
  } else if (pointers.size === 2) {
    panStart = null;
    pinchStart = pinchState();
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1 && panStart) {
    const nx = e.clientX - panStart.x;
    const ny = e.clientY - panStart.y;
    if (Math.abs(nx - view.x) > 3 || Math.abs(ny - view.y) > 3) moved = true;
    view.x = nx;
    view.y = ny;
    applyView();
  } else if (pointers.size === 2 && pinchStart) {
    const now = pinchState();
    const r = viewport.getBoundingClientRect();
    const k = clamp(pinchStart.k * (now.dist / pinchStart.dist), MIN_ZOOM, MAX_ZOOM);
    const f = k / view.k;
    const px = now.cx - r.left, py = now.cy - r.top;
    view.x = px - (px - view.x) * f;
    view.y = py - (py - view.y) * f;
    view.k = k;
    moved = true;
    applyView();
  }
});

function pinchState() {
  const [a, b] = [...pointers.values()];
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    k: view.k
  };
}

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) {
    panStart = null;
    viewport.classList.remove("is-panning");
  }
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);

// A drag that ends on a card shouldn't also open that card.
cardsLayer.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); moved = false; } }, true);

document.getElementById("zoomInBtn").addEventListener("click", () => zoomCentre(1.25));
document.getElementById("zoomOutBtn").addEventListener("click", () => zoomCentre(1 / 1.25));
document.getElementById("fitBtn").addEventListener("click", fitToScreen);
document.getElementById("expandAllBtn").addEventListener("click", () => {
  collapsed.clear();
  render();
});

/* ---------- 6. PHOTOS TOGGLE ---------- */
const photosToggle = document.getElementById("photosToggle");
photosToggle.checked = showPhotos;
photosToggle.addEventListener("change", () => {
  showPhotos = photosToggle.checked;
  localStorage.setItem("familyShowPhotos", showPhotos ? "1" : "0");
  render({ keepView: true });
});

/* ---------- 7. SEARCH ---------- */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults.hidden = true; return; }

  const hits = peopleCache.filter(p =>
    (p.name || "").toLowerCase().includes(q) ||
    (p.spouse_name || "").toLowerCase().includes(q)
  ).slice(0, 8);

  searchResults.innerHTML = "";
  if (!hits.length) {
    const none = document.createElement("div");
    none.className = "search-none";
    none.textContent = "No one by that name";
    searchResults.appendChild(none);
  } else {
    hits.forEach(p => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-item";
      item.textContent = p.spouse_name ? `${p.name} & ${p.spouse_name}` : p.name;
      item.addEventListener("click", () => {
        focusPerson(p.id);
        searchResults.hidden = true;
        searchInput.value = "";
      });
      searchResults.appendChild(item);
    });
  }
  searchResults.hidden = false;
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-group")) searchResults.hidden = true;
});

/* ---------- 8. PERSON DETAIL MODAL ---------- */
const personModal = document.getElementById("personModal");
const uploadStatus = document.getElementById("uploadStatus");
let currentPerson = null;

function fillViewPhoto(container, url, label) {
  container.innerHTML = "";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = label;
    container.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "photo-initials";
    div.textContent = initials(label);
    container.appendChild(div);
  }
}

function openPerson(p) {
  currentPerson = p;
  uploadStatus.hidden = true;

  fillViewPhoto(document.getElementById("viewMainPhoto"), p.photo_url, p.name);
  document.getElementById("viewName").textContent = p.name;
  document.getElementById("uploadMainBtn").textContent = p.photo_url ? "Change photo" : "Upload photo";

  const spouseWrap = document.getElementById("viewSpouseWrap");
  if (p.spouse_name) {
    spouseWrap.hidden = false;
    fillViewPhoto(document.getElementById("viewSpousePhoto"), p.spouse_photo_url, p.spouse_name);
    document.getElementById("viewSpouseName").textContent = p.spouse_name;
    document.getElementById("uploadSpouseBtn").textContent = p.spouse_photo_url ? "Change photo" : "Upload photo";
  } else {
    spouseWrap.hidden = true;
  }

  const node = forest.nodes.get(p.id);
  const parent = node && node.parent ? node.parent.person : null;
  const kids = node ? node.children.length : 0;
  const bits = [];
  if (parent) bits.push(`Child of ${parent.name}`);
  if (kids) bits.push(`${kids} ${kids === 1 ? "child" : "children"}`);
  document.getElementById("viewRelation").textContent = bits.join(" · ");

  document.getElementById("addSiblingBtn").hidden = !parent;
  personModal.hidden = false;
}

document.getElementById("personModalClose").addEventListener("click", () => personModal.hidden = true);
personModal.addEventListener("click", (e) => { if (e.target === personModal) personModal.hidden = true; });

document.getElementById("addChildBtn").addEventListener("click", () => {
  personModal.hidden = true;
  openForm({ mode: "add", relation: "child", context: currentPerson });
});
document.getElementById("addSiblingBtn").addEventListener("click", () => {
  personModal.hidden = true;
  openForm({ mode: "add", relation: "sibling", context: currentPerson });
});
document.getElementById("editBtn").addEventListener("click", () => {
  personModal.hidden = true;
  openForm({ mode: "edit", context: currentPerson });
});

document.getElementById("deleteBtn").addEventListener("click", async () => {
  const node = forest.nodes.get(currentPerson.id);
  if (node && node.children.length) {
    alert(`${currentPerson.name} still has ${node.children.length} child(ren) in the tree.\n\nRemove or re-attach them first, so nobody gets orphaned.`);
    return;
  }
  if (!confirm(`Remove ${currentPerson.name} from the tree? This cannot be undone.`)) return;

  const { error } = await sb.from("people").delete().eq("id", currentPerson.id);
  if (error) { console.error(error); alert("Could not remove — check the console."); return; }
  personModal.hidden = true;
  loadTree({ keepView: true });
});

/* ---------- 9. ADD / EDIT FORM ---------- */
const formModal = document.getElementById("formModal");
const personForm = document.getElementById("personForm");
const nameInput = document.getElementById("nameInput");
const spouseInput = document.getElementById("spouseInput");
let formState = { mode: "add", relation: "child", context: null };

function openForm({ mode, relation = "child", context }) {
  formState = { mode, relation, context };

  const title = document.getElementById("formTitle");
  const ctxLine = document.getElementById("formContext");
  const submit = document.getElementById("formSubmit");

  if (mode === "edit") {
    title.textContent = "Edit names";
    ctxLine.textContent = "";
    submit.textContent = "Save";
    nameInput.value = context.name || "";
    spouseInput.value = context.spouse_name || "";
  } else {
    title.textContent = "Add a person";
    ctxLine.textContent = !context ? ""
      : relation === "child" ? `Son or daughter of ${context.name}`
      : `Brother or sister of ${context.name}`;
    submit.textContent = "Add";
    nameInput.value = "";
    spouseInput.value = "";
  }

  formModal.hidden = false;
  nameInput.focus();
}

document.getElementById("formModalClose").addEventListener("click", () => formModal.hidden = true);
formModal.addEventListener("click", (e) => { if (e.target === formModal) formModal.hidden = true; });
document.getElementById("addFirstBtn").addEventListener("click", () => openForm({ mode: "add", context: null }));

personForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const spouse = spouseInput.value.trim() || null;
  if (!name) return;

  const { mode, relation, context } = formState;
  let error;

  if (mode === "edit") {
    ({ error } = await sb.from("people").update({ name, spouse_name: spouse }).eq("id", context.id));
  } else {
    let parent_id = null;
    if (context) parent_id = relation === "child" ? context.id : context.parent_id;
    ({ error } = await sb.from("people").insert({ name, spouse_name: spouse, parent_id }));
  }

  if (error) { console.error(error); alert("Could not save — check the console."); return; }
  formModal.hidden = true;
  loadTree({ keepView: true });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { personModal.hidden = true; formModal.hidden = true; }
});

/* ---------- 10. PHOTO UPLOAD ---------- */
async function uploadPhoto(personId, column, file) {
  if (!file) return;

  uploadStatus.hidden = false;
  uploadStatus.textContent = "Uploading…";

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `person_${personId}_${column}_${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from("photos").upload(path, file, { upsert: true });
  if (uploadError) { console.error(uploadError); uploadStatus.textContent = "Upload failed — check the console."; return; }

  const { data: urlData } = sb.storage.from("photos").getPublicUrl(path);
  const { error: updateError } = await sb.from("people").update({ [column]: urlData.publicUrl }).eq("id", personId);
  if (updateError) { console.error(updateError); uploadStatus.textContent = "Could not save the photo — check the console."; return; }

  uploadStatus.textContent = "Saved.";
  currentPerson = { ...currentPerson, [column]: urlData.publicUrl };
  fillViewPhoto(
    document.getElementById(column === "photo_url" ? "viewMainPhoto" : "viewSpousePhoto"),
    urlData.publicUrl,
    column === "photo_url" ? currentPerson.name : currentPerson.spouse_name
  );
  await loadTree({ keepView: true });
}

function wireUpload(btnId, inputId, column) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    uploadPhoto(currentPerson.id, column, input.files[0]);
    input.value = "";
  });
}
wireUpload("uploadMainBtn", "uploadMainInput", "photo_url");
wireUpload("uploadSpouseBtn", "uploadSpouseInput", "spouse_photo_url");

window.addEventListener("resize", () => { if (peopleCache.length) applyView(); });
