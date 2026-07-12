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
const TOKEN_KEY = "leadsTrackerToken";

let leads = [];
let editingLeadId = null;

// ---- Auth / token helpers -----------------------------------------------

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return !!payload && !!payload.exp && payload.exp * 1000 > Date.now();
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleSessionExpired() {
  clearToken();
  currentUserRole = null;
  showLogin();
  loginError.textContent = "Your session has expired. Please log in again.";
  loginError.hidden = false;
}

// ---- API helpers -------------------------------------------------------

async function apiGetLeads() {
  const res = await fetch(`${API_BASE}/leads`, { headers: { ...authHeaders() } });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`GET /leads failed (${res.status})`);
  return res.json();
}

async function apiCreateLead(payload) {
  const res = await fetch(`${API_BASE}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`POST /leads failed (${res.status})`);
  return res.json();
}

async function apiUpdateLead(id, payload) {
  const res = await fetch(`${API_BASE}/leads/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`PUT /leads/${id} failed (${res.status})`);
  return res.json();
}

async function apiGetUsers() {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: { ...authHeaders() } });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`GET /admin/users failed (${res.status})`);
  return res.json();
}

async function apiCreateUser(payload) {
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Failed to create user (${res.status})`);
  return data;
}

async function apiUpdateUser(id, payload) {
  const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Failed to update user (${res.status})`);
  return data;
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

const loginScreen = document.getElementById("login-screen");
const appContent = document.getElementById("app-content");
const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("loginError");
const loginSubmitBtn = loginForm.querySelector('button[type="submit"]');

const adminPanel = document.getElementById("admin-panel");
const createUserForm = document.getElementById("create-user-form");
const newUserEmail = document.getElementById("newUserEmail");
const newUserPassword = document.getElementById("newUserPassword");
const newUserRole = document.getElementById("newUserRole");
const createUserSuccess = document.getElementById("createUserSuccess");
const createUserError = document.getElementById("createUserError");
const createUserSubmitBtn = createUserForm.querySelector('button[type="submit"]');
const usersTbody = document.getElementById("users-tbody");
const usersLoadError = document.getElementById("usersLoadError");

const editUserModal = document.getElementById("edit-user-modal");
const editUserEmail = document.getElementById("editUserEmail");
const editUserRole = document.getElementById("editUserRole");
const editUserPassword = document.getElementById("editUserPassword");
const editUserError = document.getElementById("editUserError");
const editUserCancelBtn = document.getElementById("editUserCancelBtn");
const editUserSaveBtn = document.getElementById("editUserSaveBtn");

let currentUserRole = null;
let editingUserId = null;

// ---- Login / logout -------------------------------------------------------

function showLogin() {
  loginScreen.hidden = false;
  appContent.hidden = true;
  logoutBtn.hidden = true;
  adminPanel.hidden = true;
}

function showApp() {
  loginScreen.hidden = true;
  appContent.hidden = false;
  logoutBtn.hidden = false;
}

function activateSession(token) {
  const payload = decodeJwtPayload(token);
  currentUserRole = payload ? payload.role : null;
  showApp();

  const isAdmin = currentUserRole === "admin";
  adminPanel.hidden = !isAdmin;
  if (isAdmin) refreshUsers();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Logging in...";

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      loginError.textContent = data.error || "Login failed. Check your email and password.";
      loginError.hidden = false;
      return;
    }

    setToken(data.token);
    loginForm.reset();
    activateSession(data.token);
    await refreshLeads();
  } catch (err) {
    console.error(err);
    loginError.textContent = `Unable to reach the API at ${API_BASE}. Is the server running?`;
    loginError.hidden = false;
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "Log In";
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  currentUserRole = null;
  showLogin();
});

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

// ---- Admin panel ------------------------------------------------------------

async function refreshUsers() {
  try {
    const users = await apiGetUsers();
    renderUsers(users);
    usersLoadError.hidden = true;
  } catch (err) {
    console.error(err);
    usersLoadError.textContent = "Unable to load users.";
    usersLoadError.hidden = false;
  }
}

function renderUsers(users) {
  usersTbody.innerHTML = "";

  users.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.id}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td></td>
    `;

    const actionsTd = tr.children[3];
    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditUserModal(user));
    actionsTd.appendChild(editBtn);

    usersTbody.appendChild(tr);
  });
}

createUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createUserError.hidden = true;
  createUserSuccess.hidden = true;

  const payload = {
    email: newUserEmail.value.trim(),
    password: newUserPassword.value,
    role: newUserRole.value,
  };

  createUserSubmitBtn.disabled = true;
  createUserSubmitBtn.textContent = "Creating...";

  try {
    await apiCreateUser(payload);
    createUserSuccess.textContent = `User "${payload.email}" created.`;
    createUserSuccess.hidden = false;
    createUserForm.reset();
    newUserRole.value = "basic";
    await refreshUsers();
  } catch (err) {
    console.error(err);
    createUserError.textContent = err.message;
    createUserError.hidden = false;
  } finally {
    createUserSubmitBtn.disabled = false;
    createUserSubmitBtn.textContent = "Create User";
  }
});

function openEditUserModal(user) {
  editingUserId = user.id;
  editUserEmail.value = user.email;
  editUserRole.value = user.role;
  editUserPassword.value = "";
  editUserError.hidden = true;
  editUserModal.hidden = false;
  editUserEmail.focus();
}

function closeEditUserModal() {
  editingUserId = null;
  editUserModal.hidden = true;
}

editUserCancelBtn.addEventListener("click", closeEditUserModal);

editUserModal.addEventListener("click", (e) => {
  if (e.target === editUserModal) closeEditUserModal();
});

editUserSaveBtn.addEventListener("click", async () => {
  const email = editUserEmail.value.trim();
  const role = editUserRole.value;
  const password = editUserPassword.value;

  if (!email) {
    editUserError.textContent = "Email is required.";
    editUserError.hidden = false;
    return;
  }

  const payload = { email, role };
  if (password) payload.password = password;

  editUserSaveBtn.disabled = true;
  editUserSaveBtn.textContent = "Saving...";
  editUserError.hidden = true;

  try {
    await apiUpdateUser(editingUserId, payload);
    await refreshUsers();
    closeEditUserModal();
  } catch (err) {
    console.error(err);
    editUserError.textContent = err.message;
    editUserError.hidden = false;
  } finally {
    editUserSaveBtn.disabled = false;
    editUserSaveBtn.textContent = "Save";
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

if (isTokenValid(getToken())) {
  activateSession(getToken());
  refreshLeads();
} else {
  clearToken();
  showLogin();
}
