/* ============================================================
   FAMILY ARCHIVE — app logic
   No build step. No server. Everything runs in the browser.
   ============================================================ */

/* ---------- 1. PASSWORD GATE ----------
   This is NOT real security — anyone who views the page source
   or the repo's data can get in. It just keeps casual visitors
   and search engines out. See README.md to change the password. */
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
  initTree();
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

/* ---------- 2. LOAD DATA & BUILD TREE ---------- */
let familyData = null;

async function initTree() {
  const res = await fetch("data/family.json", { cache: "no-store" });
  familyData = await res.json();

  document.getElementById("familyName").textContent = familyData.familyName || "Our Family";
  document.getElementById("tagline").textContent = familyData.tagline || "";

  renderTree(familyData.people);
  window.addEventListener("resize", () => drawConnectors(familyData.people));
}

function renderTree(people) {
  const byId = new Map(people.map(p => [p.id, p]));

  // --- compute generation depth for each person ---
  const gen = {};
  function getGen(id, seen) {
    seen = seen || new Set();
    if (gen[id] !== undefined) return gen[id];
    if (seen.has(id)) { gen[id] = 0; return 0; }
    seen.add(id);
    const p = byId.get(id);
    const parents = (p.parents || []).filter(pid => byId.has(pid));
    if (parents.length === 0) { gen[id] = 0; return 0; }
    const maxParentGen = Math.max(...parents.map(pid => getGen(pid, seen)));
    gen[id] = maxParentGen + 1;
    return gen[id];
  }
  people.forEach(p => getGen(p.id));

  // --- group partners together (people who co-parent a child) ---
  const partnerOf = new Map(); // id -> id of partner
  people.forEach(p => {
    if (p.parents && p.parents.length === 2) {
      const [a, b] = p.parents;
      partnerOf.set(a, b);
      partnerOf.set(b, a);
    }
  });

  // --- bucket people by generation ---
  const generations = {};
  people.forEach(p => {
    const g = gen[p.id];
    (generations[g] = generations[g] || []).push(p);
  });

  const container = document.getElementById("treeContainer");
  container.innerHTML = "";

  const maxGen = Math.max(...Object.keys(generations).map(Number));
  for (let g = 0; g <= maxGen; g++) {
    const row = document.createElement("div");
    row.className = "generation-row";
    row.dataset.gen = g;

    const peopleInGen = generations[g] || [];
    const placed = new Set();

    peopleInGen.forEach(p => {
      if (placed.has(p.id)) return;
      const partnerId = partnerOf.get(p.id);
      const partner = partnerId && byId.get(partnerId) && gen[partnerId] === g ? byId.get(partnerId) : null;

      if (partner && !placed.has(partner.id)) {
        const group = document.createElement("div");
        group.className = "couple-group";
        group.appendChild(personCard(p));
        const link = document.createElement("div");
        link.className = "couple-link";
        group.appendChild(link);
        group.appendChild(personCard(partner));
        row.appendChild(group);
        placed.add(p.id);
        placed.add(partner.id);
      } else {
        row.appendChild(personCard(p));
        placed.add(p.id);
      }
    });

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
  card.tabIndex = 0;
  card.dataset.id = p.id;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details for ${p.name}`);

  const frame = document.createElement("div");
  frame.className = "photo-frame";
  if (p.photo) {
    const img = document.createElement("img");
    img.src = p.photo;
    img.alt = p.name;
    img.loading = "lazy";
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
  card.appendChild(frame);

  const name = document.createElement("div");
  name.className = "person-name";
  name.textContent = p.name;
  card.appendChild(name);

  const dates = document.createElement("div");
  dates.className = "person-dates";
  dates.textContent = [p.born, p.died].filter(Boolean).join(" – ");
  card.appendChild(dates);

  card.addEventListener("click", () => openModal(p));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(p); }
  });

  return card;
}

/* ---------- 3. CONNECTOR LINES (SVG, drawn from parents to children) ---------- */
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
    if (!p.parents || p.parents.length === 0) return;
    const parentCenters = p.parents.map(centerOf).filter(Boolean);
    if (parentCenters.length === 0) return;

    const parentX = parentCenters.reduce((sum, c) => sum + c.x, 0) / parentCenters.length;
    const parentY = Math.max(...parentCenters.map(c => c.bottomY));
    const child = centerOf(p.id);
    if (!child) return;

    const midY = (parentY + child.topY) / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = `M ${parentX} ${parentY} C ${parentX} ${midY}, ${child.x} ${midY}, ${child.x} ${child.topY}`;
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
}

/* ---------- 4. MODAL ---------- */
const modal = document.getElementById("modal");
const modalPhoto = document.getElementById("modalPhoto");
const modalName = document.getElementById("modalName");
const modalDates = document.getElementById("modalDates");
const modalBio = document.getElementById("modalBio");

function openModal(p) {
  modalPhoto.innerHTML = "";
  if (p.photo) {
    const img = document.createElement("img");
    img.src = p.photo;
    img.alt = p.name;
    modalPhoto.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "photo-initials";
    div.textContent = initials(p.name);
    modalPhoto.appendChild(div);
  }
  modalName.textContent = p.name;
  modalDates.textContent = [p.born, p.died].filter(Boolean).join(" – ");
  modalBio.textContent = p.bio || "";
  modal.hidden = false;
  document.getElementById("modalClose").focus();
}

document.getElementById("modalClose").addEventListener("click", () => modal.hidden = true);
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });
