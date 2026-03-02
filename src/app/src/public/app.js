// Navigation
const navLinks = document.querySelectorAll(".nav-links a");
const pages = document.querySelectorAll(".page");

navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    navLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    pages.forEach((p) => p.classList.remove("active"));
    document.getElementById(`page-${page}`).classList.add("active");

    if (page === "dashboard") loadDashboard();
    if (page === "guardduty") loadGuardDutyFindings();
    if (page === "health") loadHealthEvents();
  });
});

// Modal
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");

document.getElementById("btn-modal-close").addEventListener("click", () => {
  modalOverlay.style.display = "none";
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = "none";
});

function showModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modalOverlay.style.display = "flex";
}

// Severity helpers
function getSeverityLevel(sev) {
  if (sev >= 7) return "critical";
  if (sev >= 4) return "high";
  if (sev >= 2) return "medium";
  return "low";
}

function severityBadge(sev) {
  const level = getSeverityLevel(sev);
  return `<span class="badge badge-${level}">${level} (${sev.toFixed(1)})</span>`;
}

function statusBadge(status) {
  const normalized = (status || "unknown").toLowerCase();
  return `<span class="badge badge-${normalized}">${status}</span>`;
}

function determinationBadge(value) {
  if (!value) return '<span class="badge badge-unreviewed">未対応</span>';
  const classMap = {
    "未対応": "unreviewed",
    "調査中": "investigating",
    "問題有り": "problematic",
    "問題無し": "no-issue",
  };
  const cls = classMap[value] || "unreviewed";
  return `<span class="badge badge-${cls}">${value}</span>`;
}

function healthSeverityBadge(severity) {
  if (!severity) return "-";
  const s = severity.toLowerCase();
  const classMap = { critical: "critical", high: "high", medium: "medium", low: "low", informational: "low" };
  const cls = classMap[s] || "medium";
  return `<span class="badge badge-${cls}">${severity}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("ja-JP");
}

// Archived detection (fallback for items stored before archived field was added)
function isArchivedFromService(item) {
  try {
    const svc = JSON.parse(item.service || "{}");
    return svc.Archived === true;
  } catch {
    return false;
  }
}

// ── Page State ──
const pageState = {
  guardduty: { size: 50, current: 1 },
  health:    { size: 50, current: 1 },
};

// ── Sort State ──
const sortState = {
  guardduty: { field: "createdAt", dir: "desc" },
  health:    { field: "startTime", dir: "desc" },
};

const HEALTH_SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

function getSortValue(item, field, table) {
  const val = item[field];

  // GuardDuty severity is numeric
  if (table === "guardduty" && field === "severity") return val || 0;

  // Health severity is a string → convert to number for ordering
  if (table === "health" && field === "severity") {
    return HEALTH_SEVERITY_ORDER[(val || "").toLowerCase()] ?? -1;
  }

  // GuardDuty archived status: boolean → 0/1
  if (table === "guardduty" && field === "archived") {
    return (item.archived === true || isArchivedFromService(item)) ? 1 : 0;
  }

  // Date fields
  if (["createdAt", "updatedAt", "startTime", "lastUpdatedTime"].includes(field)) {
    return val ? new Date(val).getTime() : 0;
  }

  // Default: string compare (lowercase)
  return (val || "").toString().toLowerCase();
}

function sortItems(items, field, dir, table) {
  return items.slice().sort((a, b) => {
    const va = getSortValue(a, field, table);
    const vb = getSortValue(b, field, table);
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = va < vb ? -1 : va > vb ? 1 : 0;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function updateSortIndicators(table) {
  const state = sortState[table];
  document.querySelectorAll(`th[data-table="${table}"] .sort-indicator`).forEach((el) => {
    const th = el.parentElement;
    if (th.dataset.sort === state.field) {
      el.textContent = state.dir === "asc" ? " ▲" : " ▼";
      th.classList.add("sorted");
    } else {
      el.textContent = "";
      th.classList.remove("sorted");
    }
  });
}

// Header click handler
document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const table = th.dataset.table;
    const field = th.dataset.sort;
    const state = sortState[table];

    if (state.field === field) {
      state.dir = state.dir === "asc" ? "desc" : "asc";
    } else {
      state.field = field;
      state.dir = "asc";
    }

    pageState[table].current = 1;
    if (table === "guardduty") renderGuardDutyTable();
    if (table === "health") renderHealthTable();
  });
});

// ── Account name mapping ──
let accountMap = {};

async function loadAccountMap() {
  try {
    const res = await fetch("/api/accounts");
    if (res.ok) accountMap = await res.json();
  } catch (err) {
    console.error("Failed to load account map:", err);
  }
}

function formatAccount(accountId) {
  if (!accountId) return "-";
  const name = accountMap[accountId];
  if (name) {
    return `<div>${accountId}</div><div class="account-name">${name}</div>`;
  }
  return accountId;
}

// ── Data arrays ──
let guarddutyItems = [];
let healthItems = [];

// ── Severity filter ──
document.getElementById("filter-severity").addEventListener("change", () => {
  pageState.guardduty.current = 1;
  renderGuardDutyTable();
});

function filterBySeverity(items) {
  const filter = document.getElementById("filter-severity").value;
  if (!filter) return items;
  return items.filter((item) => getSeverityLevel(item.severity || 0) === filter);
}

// ── Date range filter ──
function filterByDateRange(items, dateField, fromId, toId) {
  const fromVal = document.getElementById(fromId).value;
  const toVal = document.getElementById(toId).value;
  if (!fromVal && !toVal) return items;

  const fromTime = fromVal ? new Date(fromVal).getTime() : -Infinity;
  // To date is inclusive: set to end of day
  const toTime = toVal ? new Date(toVal).getTime() + 86400000 - 1 : Infinity;

  return items.filter((item) => {
    const t = item[dateField] ? new Date(item[dateField]).getTime() : 0;
    return t >= fromTime && t <= toTime;
  });
}

// ── Pagination helpers ──
function paginateItems(items, table) {
  const state = pageState[table];
  const totalPages = Math.max(1, Math.ceil(items.length / state.size));
  if (state.current > totalPages) state.current = totalPages;
  const start = (state.current - 1) * state.size;
  const end = start + state.size;
  return { paged: items.slice(start, end), totalPages, totalItems: items.length };
}

function updatePaginationUI(table, totalPages) {
  const state = pageState[table];
  document.getElementById(`${table}-page-info`).textContent = `Page ${state.current} / ${totalPages}`;
  document.getElementById(`btn-${table}-prev`).disabled = state.current <= 1;
  document.getElementById(`btn-${table}-next`).disabled = state.current >= totalPages;
}

// ── GuardDuty render ──
function renderGuardDutyTable() {
  const tbody = document.getElementById("guardduty-tbody");
  let items = filterBySeverity(guarddutyItems);
  items = filterByDateRange(items, "createdAt", "filter-guardduty-from", "filter-guardduty-to");

  if (sortState.guardduty.field) {
    items = sortItems(items, sortState.guardduty.field, sortState.guardduty.dir, "guardduty");
  }
  updateSortIndicators("guardduty");

  const { paged, totalPages } = paginateItems(items, "guardduty");
  updatePaginationUI("guardduty", totalPages);

  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999">No findings</td></tr>';
    return;
  }

  for (const item of paged) {
    const sev = item.severity || 0;
    const isArchived = item.archived === true || isArchivedFromService(item);
    const tr = document.createElement("tr");
    if (isArchived) tr.classList.add("row-archived");
    const statusHtml = isArchived
      ? '<span class="badge badge-archived">Archived</span>'
      : '<span class="badge badge-active">Active</span>';
    tr.innerHTML = `
      <td>${statusHtml}</td>
      <td>${determinationBadge(item.determination)}</td>
      <td>${severityBadge(sev)}</td>
      <td>${item.type || "-"}</td>
      <td>${item.title || "-"}</td>
      <td>${formatAccount(item.accountId)}</td>
      <td>${item.region || "-"}</td>
      <td>${formatDate(item.createdAt)}</td>
    `;
    tr.addEventListener("click", () => showFindingDetail(item));
    tbody.appendChild(tr);
  }
}

// ── Health render ──
function renderHealthTable() {
  const tbody = document.getElementById("health-tbody");
  let items = filterByDateRange(healthItems, "startTime", "filter-health-from", "filter-health-to");

  if (sortState.health.field) {
    items = sortItems(items, sortState.health.field, sortState.health.dir, "health");
  }
  updateSortIndicators("health");

  const { paged, totalPages } = paginateItems(items, "health");
  updatePaginationUI("health", totalPages);

  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999">No events</td></tr>';
    return;
  }

  for (const item of paged) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${statusBadge(item.statusCode || "unknown")}</td>
      <td>${determinationBadge(item.determination)}</td>
      <td>${formatAccount(item.accountId)}</td>
      <td>${item.service || "-"}</td>
      <td>${item.eventTypeCode || "-"}</td>
      <td>${healthSeverityBadge(item.severity)}</td>
      <td>${item.region || "-"}</td>
      <td>${formatDate(item.startTime)}</td>
      <td>${formatDate(item.lastUpdatedTime)}</td>
    `;
    tr.addEventListener("click", () => showHealthDetail(item));
    tbody.appendChild(tr);
  }
}

// Dashboard
async function loadDashboard() {
  const container = document.getElementById("summary-cards");
  container.innerHTML = '<div class="card loading">Loading...</div>';

  try {
    const res = await fetch("/api/dashboard/summary");
    const data = await res.json();

    container.innerHTML = `
      <div class="card">
        <h3>GuardDuty Total</h3>
        <div class="value">${data.guardduty.total}</div>
      </div>
      <div class="card">
        <h3>Critical</h3>
        <div class="value severity-critical">${data.guardduty.severity.critical}</div>
      </div>
      <div class="card">
        <h3>High</h3>
        <div class="value severity-high">${data.guardduty.severity.high}</div>
      </div>
      <div class="card">
        <h3>Medium</h3>
        <div class="value severity-medium">${data.guardduty.severity.medium}</div>
      </div>
      <div class="card">
        <h3>Low</h3>
        <div class="value severity-low">${data.guardduty.severity.low}</div>
      </div>
      <div class="card">
        <h3>Health Events (Open)</h3>
        <div class="value severity-high">${data.health.open}</div>
      </div>
      <div class="card">
        <h3>Health Events (Upcoming)</h3>
        <div class="value severity-medium">${data.health.upcoming}</div>
      </div>
      <div class="card">
        <h3>Health Events (Closed)</h3>
        <div class="value severity-low">${data.health.closed}</div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="card loading">Failed to load summary</div>';
    console.error(err);
  }
}

// GuardDuty
let guarddutyNextToken = null;

async function loadGuardDutyFindings(append = false) {
  const tbody = document.getElementById("guardduty-tbody");
  if (!append) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Loading...</td></tr>';
    guarddutyNextToken = null;
    guarddutyItems = [];
  }

  try {
    const params = new URLSearchParams({ limit: "50" });
    if (guarddutyNextToken) params.set("nextToken", guarddutyNextToken);

    const res = await fetch(`/api/guardduty/findings?${params}`);
    const data = await res.json();

    if (data.items.length === 0 && !append) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999">No findings</td></tr>';
      return;
    }

    guarddutyItems = guarddutyItems.concat(data.items);
    renderGuardDutyTable();

    guarddutyNextToken = data.nextToken;
    document.getElementById("btn-guardduty-more").style.display = data.nextToken
      ? "inline-block"
      : "none";
  } catch (err) {
    if (!append) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red">Failed to load</td></tr>';
    }
    console.error(err);
  }
}

function showFindingDetail(item) {
  let resourceHtml = "";
  try {
    const resource = JSON.parse(item.resource || "{}");
    resourceHtml = `<pre class="json-block">${JSON.stringify(resource, null, 2)}</pre>`;
  } catch {
    resourceHtml = "<p>-</p>";
  }

  let serviceHtml = "";
  let actorHtml = "";
  try {
    const service = JSON.parse(item.service || "{}");
    const action = service.Action || {};
    const actor = service.Action?.NetworkConnectionAction?.RemoteIpDetails ||
                  service.Action?.AwsApiCallAction?.RemoteIpDetails ||
                  {};

    if (actor.IpAddressV4 || actor.Organization) {
      actorHtml = `
        <div class="detail-label">Actor IP</div>
        <div class="detail-value">${actor.IpAddressV4 || "-"}</div>
        <div class="detail-label">Actor Org</div>
        <div class="detail-value">${actor.Organization?.AsnOrg || actor.Organization?.Org || "-"}</div>
        <div class="detail-label">Actor Country</div>
        <div class="detail-value">${actor.Country?.CountryName || "-"}</div>
        <div class="detail-label">Actor City</div>
        <div class="detail-value">${actor.City?.CityName || "-"}</div>
      `;
    }

    serviceHtml = `<pre class="json-block">${JSON.stringify(service, null, 2)}</pre>`;
  } catch {
    serviceHtml = "<p>-</p>";
  }

  const escapedComment = (item.comment || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  showModal(item.title || "Finding Detail", `
    <div class="detail-grid">
      <div class="detail-label">Finding ID</div>
      <div class="detail-value">${item.findingId || "-"}</div>
      <div class="detail-label">Severity</div>
      <div class="detail-value">${severityBadge(item.severity || 0)}</div>
      <div class="detail-label">Type</div>
      <div class="detail-value">${item.type || "-"}</div>
      <div class="detail-label">Account</div>
      <div class="detail-value">${formatAccount(item.accountId)}</div>
      <div class="detail-label">Region</div>
      <div class="detail-value">${item.region || "-"}</div>
      <div class="detail-label">Created</div>
      <div class="detail-value">${formatDate(item.createdAt)}</div>
      <div class="detail-label">Updated</div>
      <div class="detail-value">${formatDate(item.updatedAt)}</div>
      ${actorHtml}
    </div>
    <h3 style="margin-top:16px;margin-bottom:8px">Description</h3>
    <p style="font-size:14px;line-height:1.6">${item.description || "-"}</p>
    <h3 style="margin-top:16px;margin-bottom:8px">Resource</h3>
    ${resourceHtml}
    <h3 style="margin-top:16px;margin-bottom:8px">Service (Actor / Action)</h3>
    ${serviceHtml}
    <div class="determination-form">
      <h3>Determination / Comment</h3>
      <div class="form-group">
        <label for="modal-determination">Determination</label>
        <select id="modal-determination">
          <option value=""${!item.determination ? ' selected' : ''}>-- 未選択 --</option>
          <option value="未対応"${item.determination === '未対応' ? ' selected' : ''}>未対応</option>
          <option value="調査中"${item.determination === '調査中' ? ' selected' : ''}>調査中</option>
          <option value="問題有り"${item.determination === '問題有り' ? ' selected' : ''}>問題有り</option>
          <option value="問題無し"${item.determination === '問題無し' ? ' selected' : ''}>問題無し</option>
        </select>
      </div>
      <div class="form-group">
        <label for="modal-comment">Comment</label>
        <textarea id="modal-comment" rows="3" placeholder="コメントを入力...">${escapedComment}</textarea>
      </div>
      <button class="btn btn-primary" id="btn-save-meta">保存</button>
      <span id="save-meta-status" class="save-status"></span>
    </div>
  `);

  document.getElementById("btn-save-meta").addEventListener("click", async () => {
    const determination = document.getElementById("modal-determination").value;
    const comment = document.getElementById("modal-comment").value;
    const statusEl = document.getElementById("save-meta-status");
    const btn = document.getElementById("btn-save-meta");
    btn.disabled = true;
    statusEl.textContent = "保存中...";
    try {
      const res = await fetch(`/api/guardduty/findings/${encodeURIComponent(item.accountId)}/${encodeURIComponent(item.findingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment, determination }),
      });
      if (!res.ok) throw new Error("Failed");
      item.comment = comment;
      item.determination = determination;
      renderGuardDutyTable();
      statusEl.textContent = "保存しました";
      statusEl.className = "save-status save-success";
    } catch (err) {
      statusEl.textContent = "保存に失敗しました";
      statusEl.className = "save-status save-error";
      console.error(err);
    }
    btn.disabled = false;
  });
}

document.getElementById("btn-guardduty-more").addEventListener("click", () => {
  loadGuardDutyFindings(true);
});

document.getElementById("btn-sync-guardduty").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sync-guardduty");
  btn.disabled = true;
  btn.textContent = "Syncing...";
  try {
    await fetch("/api/guardduty/sync", { method: "POST" });
    await loadGuardDutyFindings();
  } catch (err) {
    console.error(err);
  }
  btn.disabled = false;
  btn.textContent = "Sync Now";
});

// Health
let healthNextToken = null;

async function loadHealthEvents(append = false) {
  const tbody = document.getElementById("health-tbody");
  if (!append) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Loading...</td></tr>';
    healthNextToken = null;
    healthItems = [];
  }

  try {
    const params = new URLSearchParams({ limit: "50" });
    if (healthNextToken) params.set("nextToken", healthNextToken);

    const res = await fetch(`/api/health/events?${params}`);
    const data = await res.json();

    if (data.items.length === 0 && !append) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999">No events</td></tr>';
      return;
    }

    healthItems = healthItems.concat(data.items);
    renderHealthTable();

    healthNextToken = data.nextToken;
    document.getElementById("btn-health-more").style.display = data.nextToken
      ? "inline-block"
      : "none";
  } catch (err) {
    if (!append) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red">Failed to load</td></tr>';
    }
    console.error(err);
  }
}

function showHealthDetail(item) {
  const escapedComment = (item.comment || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  showModal(item.eventTypeCode || "Event Detail", `
    <div class="detail-grid">
      <div class="detail-label">Finding ID</div>
      <div class="detail-value">${item.findingId || "-"}</div>
      <div class="detail-label">Account</div>
      <div class="detail-value">${formatAccount(item.accountId)}</div>
      <div class="detail-label">Status</div>
      <div class="detail-value">${statusBadge(item.statusCode || "unknown")}</div>
      <div class="detail-label">Severity</div>
      <div class="detail-value">${healthSeverityBadge(item.severity)}</div>
      <div class="detail-label">Workflow</div>
      <div class="detail-value">${statusBadge(item.workflowStatus || "-")}</div>
      <div class="detail-label">Service</div>
      <div class="detail-value">${item.service || "-"}</div>
      <div class="detail-label">Event Type</div>
      <div class="detail-value">${item.eventTypeCode || "-"}</div>
      <div class="detail-label">Region</div>
      <div class="detail-value">${item.region || "-"}</div>
      <div class="detail-label">Start</div>
      <div class="detail-value">${formatDate(item.startTime)}</div>
      <div class="detail-label">Last Updated</div>
      <div class="detail-value">${formatDate(item.lastUpdatedTime)}</div>
    </div>
    <h3 style="margin-top:16px;margin-bottom:8px">Description</h3>
    <p style="font-size:14px;line-height:1.6">${item.description || "-"}</p>
    <div class="determination-form">
      <h3>Determination / Comment</h3>
      <div class="form-group">
        <label for="modal-determination">Determination</label>
        <select id="modal-determination">
          <option value=""${!item.determination ? ' selected' : ''}>-- 未選択 --</option>
          <option value="未対応"${item.determination === '未対応' ? ' selected' : ''}>未対応</option>
          <option value="調査中"${item.determination === '調査中' ? ' selected' : ''}>調査中</option>
          <option value="問題有り"${item.determination === '問題有り' ? ' selected' : ''}>問題有り</option>
          <option value="問題無し"${item.determination === '問題無し' ? ' selected' : ''}>問題無し</option>
        </select>
      </div>
      <div class="form-group">
        <label for="modal-comment">Comment</label>
        <textarea id="modal-comment" rows="3" placeholder="コメントを入力...">${escapedComment}</textarea>
      </div>
      <button class="btn btn-primary" id="btn-save-meta">保存</button>
      <span id="save-meta-status" class="save-status"></span>
    </div>
  `);

  document.getElementById("btn-save-meta").addEventListener("click", async () => {
    const determination = document.getElementById("modal-determination").value;
    const comment = document.getElementById("modal-comment").value;
    const statusEl = document.getElementById("save-meta-status");
    const btn = document.getElementById("btn-save-meta");
    btn.disabled = true;
    statusEl.textContent = "保存中...";
    try {
      const res = await fetch(`/api/health/events/${encodeURIComponent(item.accountId)}/${encodeURIComponent(item.findingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment, determination }),
      });
      if (!res.ok) throw new Error("Failed");
      item.comment = comment;
      item.determination = determination;
      renderHealthTable();
      statusEl.textContent = "保存しました";
      statusEl.className = "save-status save-success";
    } catch (err) {
      statusEl.textContent = "保存に失敗しました";
      statusEl.className = "save-status save-error";
      console.error(err);
    }
    btn.disabled = false;
  });
}

document.getElementById("btn-health-more").addEventListener("click", () => {
  loadHealthEvents(true);
});

document.getElementById("btn-sync-health").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sync-health");
  btn.disabled = true;
  btn.textContent = "Syncing...";
  try {
    await fetch("/api/health/sync", { method: "POST" });
    await loadHealthEvents();
  } catch (err) {
    console.error(err);
  }
  btn.disabled = false;
  btn.textContent = "Sync Now";
});

// ── Pagination & date filter event listeners ──
["guardduty", "health"].forEach((table) => {
  // Page size change
  document.getElementById(`${table}-page-size`).addEventListener("change", (e) => {
    pageState[table].size = parseInt(e.target.value, 10);
    pageState[table].current = 1;
    if (table === "guardduty") renderGuardDutyTable();
    else renderHealthTable();
  });

  // Prev / Next
  document.getElementById(`btn-${table}-prev`).addEventListener("click", () => {
    if (pageState[table].current > 1) {
      pageState[table].current--;
      if (table === "guardduty") renderGuardDutyTable();
      else renderHealthTable();
    }
  });

  document.getElementById(`btn-${table}-next`).addEventListener("click", () => {
    pageState[table].current++;
    if (table === "guardduty") renderGuardDutyTable();
    else renderHealthTable();
  });

  // Date filters
  document.getElementById(`filter-${table}-from`).addEventListener("change", () => {
    pageState[table].current = 1;
    if (table === "guardduty") renderGuardDutyTable();
    else renderHealthTable();
  });

  document.getElementById(`filter-${table}-to`).addEventListener("change", () => {
    pageState[table].current = 1;
    if (table === "guardduty") renderGuardDutyTable();
    else renderHealthTable();
  });
});

// Initial load
loadAccountMap();
loadDashboard();
