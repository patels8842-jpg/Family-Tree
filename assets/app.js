/* ============================================================
   FAMILY ARCHIVE — app logic (Supabase-powered)
   ============================================================ */

/* ---------- 0. SUPABASE SETUP ---------- */
const SUPABASE_URL = "https://dawznfhpekxkmavhhysp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhd3puZmhwZWt4a21hdmhoeXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODUxMzgsImV4cCI6MjA5OTU2MTEzOH0.zri14vTDwzXWflIWPu_zPCSj10BFoQ0TpAoTI8EiipA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

/* ---------- 2. LOAD & RENDER TREE ---------- */
let peopleCache = [];

async function loadTree() {
  const { data, error } = await sb.from("people").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  peopleCache = data || [];
  renderTree(peopleCache);
}

function renderTree(people) {
  const byId = new Map(people.map(p => [p.id, p]));

  const gen = {};
  function getGen(id, seen) {
    seen = seen || new Set();
    if (gen[id] !== undefined) return gen[id];
    if (seen.has(id)) { gen[id] = 0; return 0; }
    seen.add(id);
    const p = byId.get(id);
    if (!p.parent_id || !byId.has(p.parent_id)) { gen[id] = 0; return 0; }
    gen[id] = getGen(p.parent_id, seen) + 1;
    return gen[id];
  }
  people.forEach(p => getGen(p.id));

  const generations = {};
  people.forEach(p => {
    const g = gen[p.id];
    (generations[g] = generations[g] || []).push(p);
  });

  const container = document.getElementById("treeContainer");
  container.innerHTML = "";

  if (people.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--ink-soft);">No one in the tree yet — tap "+ Add a person" above to start.</p>`;
    return;
  }

  const maxGen = Math.max(...Object.keys(generations).map(Number));
  for (let g = 0; g <= maxGen; g++) {
    const row = document.createElement("div");
    row.className = "generation-row";
    (generations[g] || []).forEach(p => row.appendChild(personCard(p)));
    container.appendChild(row);
  }

  requestAnimationFrame(() => drawConnectors(people));
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function personCard(p) {
  const card = document.createElement("div");
  card.className = "person-card";
  card.dataset.id = p.id;

  const frame = document.createElement("div");
  frame.className = "photo-frame";
  if (p.photo_url) {
    const img = document.createElement("img");
    img.src = p.photo_url;
    img.alt = p.name;
    frame.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "photo-initials";
    div.textContent = initials(p.name);
    frame.appendChild(div);
  }
  ["tl", "tr", "bl", "br"].forEach(c => {
    const corner = document.createElement("div");
    corner.className = `corner ${c}`;
    frame.appendChild(corner);
  });

  // camera / upload button
  const camBtn = document.createElement("button");
  camBtn.className = "camera-btn";
  camBtn.type = "button";
  camBtn.title = "Upload photo";
  camBtn.textContent = "📷";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => uploadPhoto(p.id, fileInput.files[0]));
  camBtn.addEventListener("click", () => fileInput.click());
  frame.appendChild(camBtn);
  frame.appendChild(fileInput);

  card.appendChild(frame);

  const name = document.createElement("div");
  name.className = "person-name";
  name.textContent = p.name;
  card.appendChild(name);

  if (p.spouse_name) {
    const spouse = document.createElement("div");
    spouse.className = "spouse-name";
    spouse.textContent = `(${p.spouse_name})`;
    card.appendChild(spouse);
  }

  const plusBtn = document.createElement("button");
  plusBtn.className = "plus-btn";
  plusBtn.type = "button";
  plusBtn.title = "Add sibling or child";
  plusBtn.textContent = "+";
  plusBtn.addEventListener("click", () => openAddModal(p));
  card.appendChild(plusBtn);

  return card;
}

/* ---------- 3. CONNECTOR LINES ---------- */
function drawConnectors(people) {
  const svg = document.getElementById("connectors");
  const wrap = document.getElementById("treeWrap");
  svg.innerHTML = "";
  const wrapRect = wrap.getBoundingClientRect();

  function centerOf(id) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - wrapRect.left,
      topY: r.top - wrapRect.top,
      bottomY: r.bottom - wrapRect.top
    };
  }

  people.forEach(p => {
    if (!p.parent_id) return;
    const parent = centerOf(p.parent_id);
    const child = centerOf(p.id);
    if (!parent || !child) return;
    const midY = (parent.bottomY + child.topY) / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = `M ${parent.x} ${parent.bottomY} C ${parent.x} ${midY}, ${child.x} ${midY}, ${child.x} ${child.topY}`;
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
}

/* ---------- 4. ADD PERSON MODAL ---------- */
const addModal = document.getElementById("addModal");
const addForm = document.getElementById("addForm");
const addNameInput = document.getElementById("addNameInput");
const addSpouseInput = document.getElementById("addSpouseInput");
let addContext = { parentId: null }; // parentId to assign on submit

function openAddModal(contextPerson) {
  // remove any previous relation radios
  const existingRadios = document.getElementById("relationRadios");
  if (existingRadios) existingRadios.remove();

  if (contextPerson) {
    const radiosDiv = document.createElement("div");
    radiosDiv.id = "relationRadios";
    radiosDiv.className = "relation-radios";
    radiosDiv.innerHTML = `
      <label><input type="radio" name="relation" value="child" checked /> Son / Daughter of ${contextPerson.name}</label>
      <label><input type="radio" name="relation" value="sibling" /> Brother / Sister of ${contextPerson.name}</label>
    `;
    addForm.insertBefore(radiosDiv, addForm.firstChild);
    addContext = { contextPerson };
  } else {
    addContext = { contextPerson: null };
  }

  addNameInput.value = "";
  addSpouseInput.value = "";
  addModal.hidden = false;
  addNameInput.focus();
}

document.getElementById("addPersonBtn").addEventListener("click", () => openAddModal(null));
document.getElementById("addModalClose").addEventListener("click", () => addModal.hidden = true);
addModal.addEventListener("click", (e) => { if (e.target === addModal) addModal.hidden = true; });

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addNameInput.value.trim();
  const spouse = addSpouseInput.value.trim();
  if (!name) return;

  let parent_id = null;
  if (addContext.contextPerson) {
    const relation = addForm.querySelector('input[name="relation"]:checked').value;
    parent_id = relation === "child" ? addContext.contextPerson.id : addContext.contextPerson.parent_id;
  }

  const { error } = await sb.from("people").insert({ name, spouse_name: spouse || null, parent_id });
  if (error) { console.error(error); alert("Could not add person — check console."); return; }

  addModal.hidden = true;
  loadTree();
});

/* ---------- 5. PHOTO UPLOAD ---------- */
async function uploadPhoto(personId, file) {
  if (!file) return;
  const ext = file.name.split(".").pop();
  const path = `person_${personId}_${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from("photos").upload(path, file, { upsert: true });
  if (uploadError) { console.error(uploadError); alert("Upload failed — check console."); return; }

  const { data: urlData } = sb.storage.from("photos").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: updateError } = await sb.from("people").update({ photo_url: publicUrl }).eq("id", personId);
  if (updateError) { console.error(updateError); alert("Could not save photo link — check console."); return; }

  loadTree();
}
