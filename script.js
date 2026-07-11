// ---------------------------------------------------------------------------
// Leads Tracker
// All lead data lives on a backend API at API_BASE. The `leads` array is a
// local cache: it's populated by GET /leads on startup and re-synced after
// every mutation (POST /leads to add, PUT /leads/:id to change status or
// append a comment), so the server is always the source of truth.
// Records are never deleted — status changes go through the Edit modal and
// are appended to each lead's comment history rather than overwriting it.
// ---------------------------------------------------------------------------

const API_BASE = "http://localhost:3000";
const STATUSES = ["New", "Contacted", "Qualified", "Won", "Hold", "Cancelled"];

let leads = [];
let editingLeadId = null;

// ---- API helpers -------------------------------------------------------

async function apiGetLeads() {
  const res = await fetch(`${API_BASE}/leads`);
  if (!res.ok) throw new Error(`GET /leads failed (${res.status})`);
  return res.json();
}

async function apiCreateLead(payload) {
  const res = await fetch(`${API_BASE}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /leads failed (${res.status})`);
  return res.json();
}

async function apiUpdateLead(id, payload) {
  const res = await fetch(`${API_BASE}/leads/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT /leads/${id} failed (${res.status})`);
  return res.json();
}

function normalizeLeads(data) {
  const list = Array.isArray(data) ? data : [];
  // Backfill commentsHistory for leads returned without this field.
  list.forEach((lead) => {
    if (!Array.isArray(lead.commentsHistory)) lead.commentsHistory = [];
  });
  return list;
}

async function refreshLeads() {
  try {
    const data = await apiGetLeads();
    leads = normalizeLeads(data);
    loadError.hidden = true;
    render();
  } catch (err) {
    console.error(err);
    leads = [];
    render();
    loadError.textContent = `Unable to reach the API at ${API_BASE}. Is the server running?`;
    loadError.hidden = false;
  }
}

// ---- DOM references ---------------------------------------------------------

const form = document.getElementById("lead-form");
const leadDetailsInput = document.getElementById("leadDetails");
const leadDetailsCount = document.getElementById("leadDetailsCount");
const notesInput = document.getElementById("notes");
const notesCount = document.getElementById("notesCount");
const tbody = document.getElementById("leads-tbody");
const emptyState = document.getElementById("empty-state");
const leadCountEl = document.getElementById("leadCount");

const filterSearch = document.getElementById("filterSearch");
const filterType = document.getElementById("filterType");
const filterStatus = document.getElementById("filterStatus");
const filterFrom = document.getElementById("filterFrom");
const filterTo = document.getElementById("filterTo");
const clearFiltersBtn = document.getElementById("clearFilters");

const editModal = document.getElementById("edit-modal");
const editClientName = document.getElementById("editClientName");
const editStatus = document.getElementById("editStatus");
const editComment = document.getElementById("editComment");
const editCommentCount = document.getElementById("editCommentCount");
const editError = document.getElementById("editError");
const editCancelBtn = document.getElementById("editCancelBtn");
const editSaveBtn = document.getElementById("editSaveBtn");

const loadError = document.getElementById("loadError");
const formError = document.getElementById("formError");
const formSubmitBtn = form.querySelector('button[type="submit"]');

// ---- Form handling ------------------------------------------------------

leadDetailsInput.addEventListener("input", () => {
  leadDetailsCount.textContent = leadDetailsInput.value.length;
});

notesInput.addEventListener("input", () => {
  notesCount.textContent = notesInput.value.length;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const newLead = {
    clientName: document.getElementById("clientName").value.trim(),
    type: document.getElementById("type").value,
    leadDate: new Date().toISOString(), // timestamp of creation
    leadDetails: leadDetailsInput.value.trim(),
    contactPerson: document.getElementById("contactPerson").value.trim(),
    contactEmail: document.getElementById("contactEmail").value.trim(),
    contactPhone: document.getElementById("contactPhone").value.trim(),
    dealValue: document.getElementById("dealValue").value,
    status: "New",
    eta: document.getElementById("eta").value,
    notes: notesInput.value.trim(),
    commentsHistory: [],
  };

  formSubmitBtn.disabled = true;
  formSubmitBtn.textContent = "Adding...";

  try {
    await apiCreateLead(newLead);
    await refreshLeads();
    form.reset();
    leadDetailsCount.textContent = "0";
    notesCount.textContent = "0";
  } catch (err) {
    console.error(err);
    formError.textContent = `Failed to add lead. Is the API running at ${API_BASE}?`;
    formError.hidden = false;
  } finally {
    formSubmitBtn.disabled = false;
    formSubmitBtn.textContent = "Add Lead";
  }
});

// ---- Filtering ------------------------------------------------------------

[filterSearch, filterType, filterStatus, filterFrom, filterTo].forEach((el) => {
  el.addEventListener("input", render);
});

clearFiltersBtn.addEventListener("click", () => {
  filterSearch.value = "";
  filterType.value = "";
  filterStatus.value = "";
  filterFrom.value = "";
  filterTo.value = "";
  render();
});

function getFilteredLeads() {
  const search = filterSearch.value.trim().toLowerCase();
  const type = filterType.value;
  const status = filterStatus.value;
  const from = filterFrom.value ? new Date(filterFrom.value + "T00:00:00") : null;
  const to = filterTo.value ? new Date(filterTo.value + "T23:59:59") : null;

  return leads.filter((lead) => {
    if (type && lead.type !== type) return false;
    if (status && lead.status !== status) return false;

    const leadDate = new Date(lead.leadDate);
    if (from && leadDate < from) return false;
    if (to && leadDate > to) return false;

    if (search) {
      const haystack = [
        lead.clientName,
        lead.contactPerson,
        lead.contactEmail,
        lead.contactPhone,
        lead.leadDetails,
        lead.notes,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

// ---- Edit modal -------------------------------------------------------------

function openEditModal(lead) {
  editingLeadId = lead.id;
  editClientName.textContent = lead.clientName;
  editStatus.value = lead.status;
  editComment.value = "";
  editCommentCount.textContent = "0";
  editError.hidden = true;
  editModal.hidden = false;
  editStatus.focus();
}

function closeEditModal() {
  editingLeadId = null;
  editModal.hidden = true;
}

editComment.addEventListener("input", () => {
  editCommentCount.textContent = editComment.value.length;
});

editCancelBtn.addEventListener("click", closeEditModal);

editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});

editSaveBtn.addEventListener("click", async () => {
  const lead = leads.find((l) => l.id === editingLeadId);
  if (!lead) return;

  const newStatus = editStatus.value;
  const comment = editComment.value.trim();
  const statusChanged = newStatus !== lead.status;

  if (statusChanged && comment === "") {
    editError.textContent = "A comment is required when changing status.";
    editError.hidden = false;
    return;
  }

  const updatedHistory = lead.commentsHistory.slice();
  if (comment !== "") {
    updatedHistory.push({
      timestamp: new Date().toISOString(),
      status: newStatus,
      statusChanged: statusChanged,
      comment: comment,
    });
  }

  editSaveBtn.disabled = true;
  editSaveBtn.textContent = "Saving...";
  editError.hidden = true;

  try {
    await apiUpdateLead(lead.id, { status: newStatus, commentsHistory: updatedHistory });
    await refreshLeads();
    closeEditModal();
  } catch (err) {
    console.error(err);
    editError.textContent = `Failed to save changes. Is the API running at ${API_BASE}?`;
    editError.hidden = false;
  } finally {
    editSaveBtn.disabled = false;
    editSaveBtn.textContent = "Save";
  }
});

// ---- Rendering --------------------------------------------------------------

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return "";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function renderCommentsCell(lead) {
  if (!lead.commentsHistory || lead.commentsHistory.length === 0) {
    return '<span class="no-comments">No comments yet</span>';
  }

  return lead.commentsHistory
    .slice()
    .reverse()
    .map((entry) => {
      const label = entry.statusChanged
        ? `Status &rarr; ${escapeHtml(entry.status)}`
        : "Comment";
      return `<p class="comment-entry"><span class="comment-meta">${formatTimestamp(entry.timestamp)} &middot; ${label}</span>${escapeHtml(entry.comment)}</p>`;
    })
    .join("");
}

function render() {
  const filtered = getFilteredLeads()
    .slice()
    .sort((a, b) => new Date(b.leadDate) - new Date(a.leadDate));

  tbody.innerHTML = "";

  filtered.forEach((lead) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(lead.clientName)}</td>
      <td>${escapeHtml(lead.type)}</td>
      <td>${formatTimestamp(lead.leadDate)}</td>
      <td class="details-cell">${escapeHtml(lead.leadDetails)}</td>
      <td>${escapeHtml(lead.contactPerson)}</td>
      <td>${escapeHtml(lead.contactEmail)}</td>
      <td>${escapeHtml(lead.contactPhone)}</td>
      <td>${formatMoney(lead.dealValue)}</td>
      <td><span class="status-select status-${lead.status}">${escapeHtml(lead.status)}</span></td>
      <td>${escapeHtml(lead.eta)}</td>
      <td class="notes-cell">${escapeHtml(lead.notes)}</td>
      <td class="comments-cell">${renderCommentsCell(lead)}</td>
      <td></td>
    `;

    // Edit button
    const actionsTd = tr.children[12];
    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditModal(lead));
    actionsTd.appendChild(editBtn);

    tbody.appendChild(tr);
  });

  leadCountEl.textContent = filtered.length;
  emptyState.hidden = filtered.length !== 0;
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---- Init -------------------------------------------------------------------

refreshLeads();
