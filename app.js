const STORAGE_KEY = "monthlyData";
const POSITIONS = ["Junior", "Middle", "Senior", "Lead", "Architect", "BO"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const YEARS = [2025, 2026, 2027];

const state = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  view: "projects",
  monthlyData: {},
  sort: { projects: { key: "", dir: "asc" }, employees: { key: "", dir: "asc" } },
  filters: { projects: {}, employees: {} }
};

const el = {
  sidebar: document.getElementById("sidebar"),
  toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
  openSidebarBtn: document.getElementById("openSidebarBtn"),
  monthSelect: document.getElementById("monthSelect"),
  yearSelect: document.getElementById("yearSelect"),
  projectsTabBtn: document.getElementById("projectsTabBtn"),
  employeesTabBtn: document.getElementById("employeesTabBtn"),
  addProjectBtn: document.getElementById("addProjectBtn"),
  addEmployeeBtn: document.getElementById("addEmployeeBtn"),
  tableContainer: document.getElementById("tableContainer"),
  viewTitle: document.getElementById("viewTitle"),
  overlayRoot: document.getElementById("overlayRoot"),
  filterChips: document.getElementById("filterChips"),
  seedDataBtn: document.getElementById("seedDataBtn")
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const periodKey = () => `${state.currentYear}-${state.currentMonth}`;
const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const asNum = (v, d = 0) => Number(Number(v).toFixed(d));

/** Clicks on button label text use TextNode as target — Text has no .closest(). */
function clickTargetElement(e) {
  const t = e.target;
  if (t instanceof Element) return t;
  if (t && t.nodeType === Node.TEXT_NODE && t.parentElement) return t.parentElement;
  return null;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.monthlyData));
}
function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.monthlyData = seedInitialData();
    save();
    return;
  }
  try {
    state.monthlyData = JSON.parse(raw);
  } catch {
    state.monthlyData = seedInitialData();
    save();
  }
}
function ensurePeriodData() {
  const key = periodKey();
  if (!state.monthlyData[key]) state.monthlyData[key] = { employees: [], projects: [] };
}

function seedInitialData() {
  const key = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const p1 = { id: uid(), projectName: "Core CRM", companyName: "Orion Ltd", budget: 55000, employeeCapacity: 4 };
  const p2 = { id: uid(), projectName: "Web Portal", companyName: "Nova Corp", budget: 32000, employeeCapacity: 3 };
  const e1 = { id: uid(), name: "Anna", surname: "Smith", dob: "1992-04-12", position: "Senior", salary: 5200, vacationDays: [7, 8], assignments: [{ projectId: p1.id, capacity: 1.0, fit: 0.9 }] };
  const e2 = { id: uid(), name: "Mark", surname: "Johnson", dob: "1988-10-02", position: "Lead", salary: 6800, vacationDays: [], assignments: [{ projectId: p1.id, capacity: 0.6, fit: 1.0 }, { projectId: p2.id, capacity: 0.4, fit: 0.8 }] };
  const e3 = { id: uid(), name: "Sophia", surname: "Brown", dob: "1996-07-17", position: "Middle", salary: 4100, vacationDays: [15], assignments: [{ projectId: p2.id, capacity: 0.9, fit: 0.7 }] };
  return { [key]: { employees: [e1, e2, e3], projects: [p1, p2] } };
}

function getCurrent() {
  ensurePeriodData();
  return state.monthlyData[periodKey()];
}
function ageFromDob(dob) {
  const b = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
function monthWorkingDays(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const wd = new Date(year, month, d).getDay();
    if (wd !== 0 && wd !== 6) total++;
  }
  return total;
}
function vacationCoefficient(emp) {
  const totalWorking = monthWorkingDays(state.currentYear, state.currentMonth);
  const vacWorking = (emp.vacationDays || []).filter((d) => {
    const wd = new Date(state.currentYear, state.currentMonth, d).getDay();
    return wd !== 0 && wd !== 6;
  }).length;
  return totalWorking ? (totalWorking - vacWorking) / totalWorking : 1;
}
function employeeUsedCapacity(emp) {
  return asNum((emp.assignments || []).reduce((a, x) => a + Number(x.capacity || 0), 0), 2);
}
function projectEffectiveCapacity(project, employees) {
  return asNum(employees.reduce((acc, emp) => {
    const a = (emp.assignments || []).find((x) => x.projectId === project.id);
    if (!a) return acc;
    return acc + a.capacity * a.fit * vacationCoefficient(emp);
  }, 0), 3);
}
function projectFinance(project, employees) {
  const assigned = employees.filter((emp) => (emp.assignments || []).some((a) => a.projectId === project.id));
  const usedEff = projectEffectiveCapacity(project, employees);
  const capForRev = Math.max(project.employeeCapacity, usedEff || 0);
  const revPerEff = capForRev ? project.budget / capForRev : 0;
  let revenue = 0;
  let cost = 0;
  assigned.forEach((emp) => {
    const a = emp.assignments.find((x) => x.projectId === project.id);
    const eff = a.capacity * a.fit * vacationCoefficient(emp);
    revenue += eff * revPerEff;
    cost += emp.salary * Math.max(0.5, a.capacity);
  });
  return { revenue, cost, profit: revenue - cost, usedEff };
}
function employeeAssignmentRows(emp, projects, employees) {
  return (emp.assignments || []).map((a) => {
    const p = projects.find((x) => x.id === a.projectId);
    if (!p) return null;
    const pf = projectFinance(p, employees);
    const capForRev = Math.max(p.employeeCapacity, pf.usedEff || 0);
    const revPerEff = capForRev ? p.budget / capForRev : 0;
    const eff = a.capacity * a.fit * vacationCoefficient(emp);
    const revenue = eff * revPerEff;
    const cost = emp.salary * Math.max(0.5, a.capacity);
    return { project: p, assignment: a, eff, revenue, cost, profit: revenue - cost };
  }).filter(Boolean);
}

function render() {
  ensurePeriodData();
  renderPeriodSelectors();
  renderFilters();
  if (state.view === "projects") renderProjectsTable();
  else renderEmployeesTable();
  el.projectsTabBtn.classList.toggle("active", state.view === "projects");
  el.employeesTabBtn.classList.toggle("active", state.view === "employees");
  el.viewTitle.textContent = state.view === "projects" ? "Projects" : "Employees";
}

function renderPeriodSelectors() {
  el.monthSelect.innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i === state.currentMonth ? "selected" : ""}>${m}</option>`).join("");
  el.yearSelect.innerHTML = YEARS.map((y) => `<option value="${y}" ${y === state.currentYear ? "selected" : ""}>${y}</option>`).join("");
}

function applySorting(rows, table) {
  const cfg = state.sort[table];
  if (!cfg.key) return rows;
  const mult = cfg.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[cfg.key]; const bv = b[cfg.key];
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mult;
    return (Number(av) - Number(bv)) * mult;
  });
}
function applyFilters(rows, table) {
  const f = state.filters[table];
  return rows.filter((r) => Object.entries(f).every(([k, v]) => String(r[k] ?? "").toLowerCase().includes(String(v).toLowerCase())));
}
function sortIcon(table, key) {
  const cfg = state.sort[table];
  if (cfg.key !== key) return "⇅";
  return cfg.dir === "asc" ? "↑" : "↓";
}

function renderProjectsTable() {
  const { projects, employees } = getCurrent();
  let rows = projects.map((p) => {
    const f = projectFinance(p, employees);
    return {
      id: p.id, companyName: p.companyName, projectName: p.projectName, budget: p.budget,
      employeeCapacity: p.employeeCapacity, used: f.usedEff, estimatedIncome: f.profit, _raw: p
    };
  });
  rows = applyFilters(rows, "projects");
  rows = applySorting(rows, "projects");
  const totalIncomeProjects = rows.reduce((a, r) => a + r.estimatedIncome, 0);
  const bench = employees.filter((e) => !e.assignments.length).reduce((a, e) => a + e.salary * 0.5, 0);
  const totalEstimated = totalIncomeProjects - bench;
  el.tableContainer.innerHTML = `
    <table>
      <thead><tr>
        ${th("projects", "companyName", "Company Name", true)}
        ${th("projects", "projectName", "Project Name", true)}
        ${th("projects", "budget", "Budget", false)}
        ${th("projects", "employeeCapacity", "Employee Capacity", false)}
        <th>Employees</th>
        ${th("projects", "estimatedIncome", "Estimated Income", false)}
        <th>Actions</th>
      </tr></thead>
      <tbody>
      ${rows.map((r) => {
        const count = employees.filter((e) => e.assignments.some((a) => a.projectId === r.id)).length;
        const over = r.used > r.employeeCapacity;
        return `<tr>
          <td>${r.companyName}</td>
          <td>${r.projectName}</td>
          <td class="money">${money(r.budget)}</td>
          <td class="${over ? "warn" : ""}">${r.used.toFixed(1)}/${r.employeeCapacity}</td>
          <td><button class="btn" data-action="showProjectEmployees" data-id="${r.id}">Show Employees (${count})</button></td>
          <td class="${r.estimatedIncome >= 0 ? "ok" : "bad"} money">${money(r.estimatedIncome)}</td>
          <td><button class="btn" data-action="deleteProject" data-id="${r.id}">Delete</button></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    <div style="margin-top:12px;font-weight:700">Total Estimated Income: <span class="${totalEstimated >= 0 ? "ok" : "bad"}">${money(totalEstimated)}</span></div>
  `;
}

function renderEmployeesTable() {
  const { employees, projects } = getCurrent();
  let rows = employees.map((e) => {
    const assignmentRows = employeeAssignmentRows(e, projects, employees);
    const estimatedPayment = assignmentRows.length
      ? assignmentRows.reduce((a, x) => a + e.salary * Math.max(0.5, x.assignment.capacity), 0)
      : e.salary * 0.5;
    const projectedIncome = assignmentRows.reduce((a, x) => a + x.profit, 0);
    return {
      id: e.id, name: e.name, surname: e.surname, age: ageFromDob(e.dob), position: e.position,
      salary: e.salary, estimatedPayment, projectedIncome, assignmentCount: e.assignments.length,
      capacityUsage: employeeUsedCapacity(e), project: assignmentRows.map((x) => x.project.projectName).join(", "), _raw: e
    };
  });
  rows = applyFilters(rows, "employees");
  rows = applySorting(rows, "employees");
  el.tableContainer.innerHTML = `
    <table>
      <thead><tr>
        ${th("employees", "name", "Name", true)}
        ${th("employees", "surname", "Surname", true)}
        ${th("employees", "age", "Age", false)}
        ${th("employees", "position", "Position", true)}
        ${th("employees", "salary", "Salary", false)}
        ${th("employees", "estimatedPayment", "Estimated Payment", false)}
        ${th("employees", "project", "Project", true)}
        ${th("employees", "projectedIncome", "Projected Income", false)}
        <th>Actions</th>
      </tr></thead>
      <tbody>
      ${rows.map((r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.surname}</td>
          <td>${r.age}</td>
          <td>
            <button class="btn inline-position-display" data-action="editPositionInline" data-id="${r.id}">${r.position}</button>
            <select class="inline-control hidden-inline" data-action="setPosition" data-id="${r.id}">
              ${POSITIONS.map((p) => `<option value="${p}" ${p === r.position ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </td>
          <td>
            <button class="btn money inline-salary-display" data-action="editSalaryInline" data-id="${r.id}">${money(r.salary)}</button>
            <input class="inline-control inline-salary money hidden-inline" data-action="setSalary" data-id="${r.id}" type="number" step="0.01" min="0.01" value="${asNum(r.salary, 2)}" />
          </td>
          <td class="money">${money(r.estimatedPayment)}</td>
          <td><button class="btn" data-action="showAssignments" data-id="${r.id}">Show Assignments (${r.assignmentCount}) ${r.capacityUsage.toFixed(1)}/1.5</button></td>
          <td class="${r.projectedIncome >= 0 ? "ok" : "bad"} money">${money(r.projectedIncome)}</td>
          <td>
            <button class="btn" data-action="availability" data-id="${r.id}">Availability</button>
            <button class="btn" data-action="assign" data-id="${r.id}" ${r.capacityUsage >= 1.5 ? "disabled" : ""}>Assign</button>
            <button class="btn" data-action="deleteEmployee" data-id="${r.id}">Delete</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>
  `;
}

function th(table, key, label, filterable) {
  const active = state.sort[table].key === key ? "active-sort" : "";
  return `<th class="${active}"><div class="th-row">${label}
    <button class="icon" data-action="sort" data-table="${table}" data-key="${key}">${sortIcon(table, key)}</button>
    ${filterable ? `<button class="icon" data-action="filter" data-table="${table}" data-key="${key}">⌕</button>` : ""}
  </div></th>`;
}

function renderFilters() {
  const f = state.filters[state.view];
  const entries = Object.entries(f);
  if (!entries.length) {
    el.filterChips.innerHTML = "";
    return;
  }
  const chips = entries.map(([k, v]) => `<span class="chip">${k}: ${v}<button data-action="removeFilter" data-key="${k}">×</button></span>`);
  if (entries.length >= 2) chips.push(`<span class="chip">Clear Filters <button data-action="clearFilters">×</button></span>`);
  el.filterChips.innerHTML = chips.join("");
}

function closeOverlayMenus() {
  el.overlayRoot.querySelectorAll(".floating-menu, .filter-popup").forEach((x) => x.remove());
}

function showModal(contentHtml, onMount, { showClose = true } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal">${showClose ? `<button class="close-btn" data-action="closeModal">×</button>` : ""}${contentHtml}</div>`;
  const close = () => wrap.remove();
  wrap._close = close;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector(".modal")?.addEventListener("click", (e) => e.stopPropagation());
  wrap.querySelector(".close-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  el.overlayRoot.appendChild(wrap);
  if (onMount) onMount(wrap);
  return wrap;
}

function showAnchoredModal(contentHtml, anchorEl, onMount) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal anchored-modal"><button class="close-btn" data-action="closeModal">×</button>${contentHtml}</div>`;
  const modal = wrap.querySelector(".modal");
  const place = () => {
    if (!anchorEl?.isConnected) return;
    const a = anchorEl.getBoundingClientRect();
    const m = modal.getBoundingClientRect();
    let top = a.bottom + 8;
    let left = a.left;
    if (left + m.width > window.innerWidth - 8) left = window.innerWidth - m.width - 8;
    if (left < 8) left = 8;
    if (top + m.height > window.innerHeight - 8) top = a.top - m.height - 8;
    if (top < 8) top = 8;
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  };
  const onViewChange = () => place();
  const close = () => {
    window.removeEventListener("scroll", onViewChange, true);
    window.removeEventListener("resize", onViewChange);
    wrap.remove();
  };
  wrap._close = close;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  modal.addEventListener("click", (e) => e.stopPropagation());
  wrap.querySelector(".close-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  el.overlayRoot.appendChild(wrap);
  place();
  window.addEventListener("scroll", onViewChange, true);
  window.addEventListener("resize", onViewChange);
  if (onMount) onMount(wrap);
  return wrap;
}

function openFilterPopup(triggerBtn, table, key) {
  closeOverlayMenus();
  const current = state.filters[table][key] || "";
  const popup = document.createElement("div");
  popup.className = "filter-popup";
  const isPosition = table === "employees" && key === "position";
  popup.innerHTML = isPosition
    ? `<div class="form-grid"><label>Position
      <select id="fltValue">${POSITIONS.map((p) => `<option value="${p}" ${p === current ? "selected" : ""}>${p}</option>`).join("")}</select>
      </label><div class="filter-actions"><button class="btn" data-action="cancelFilterPopup">Cancel</button><button class="btn btn-primary" data-action="applyFilterPopup">Apply</button></div></div>`
    : `<div class="form-grid"><label>Filter value<input id="fltValue" value="${current}"></label>
      <div class="filter-actions"><button class="btn" data-action="cancelFilterPopup">Cancel</button><button class="btn btn-primary" data-action="applyFilterPopup">Apply</button></div></div>`;
  popup.dataset.table = table;
  popup.dataset.key = key;
  const b = triggerBtn.getBoundingClientRect();
  popup.style.top = `${Math.min(window.innerHeight - 130, b.bottom + 6)}px`;
  popup.style.left = `${Math.min(window.innerWidth - 260, Math.max(8, b.left - 120))}px`;
  el.overlayRoot.appendChild(popup);
  const input = popup.querySelector("#fltValue");
  if (input && !isPosition) {
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        popup.querySelector('[data-action="applyFilterPopup"]').click();
      }
    });
  }
  if (input && isPosition) {
    input.addEventListener("change", () => {
      popup.querySelector('[data-action="applyFilterPopup"]').click();
    });
  }
}

function openActionMenu(anchorEl, items) {
  closeOverlayMenus();
  const menu = document.createElement("div");
  menu.className = "floating-menu";
  menu.innerHTML = items.map((x) => `<button class="btn" data-action="${x.action}" data-eid="${x.eid || ""}" data-pid="${x.pid || ""}">${x.label}</button>`).join("");
  const b = anchorEl.getBoundingClientRect();
  menu.style.top = `${Math.min(window.innerHeight - 100, b.bottom + 6)}px`;
  menu.style.left = `${Math.min(window.innerWidth - 180, Math.max(8, b.left))}px`;
  el.overlayRoot.appendChild(menu);
}

function showSlidePanel(contentHtml, onMount) {
  const panel = document.createElement("div");
  panel.className = "slide-panel";
  panel.innerHTML = contentHtml;
  el.overlayRoot.appendChild(panel);
  if (onMount) onMount(panel);
  return panel;
}

function openAddProject() {
  const panel = showSlidePanel(`
    <h3>Add Project</h3>
    <div class="form-grid">
      <label>Project Name<input id="pName"></label><div id="ePName" class="error"></div>
      <label>Company Name<input id="cName"></label><div id="eCName" class="error"></div>
      <label>Budget<input id="budget" type="number" step="0.01"></label><div id="eBudget" class="error"></div>
      <label>Employee Capacity<input id="cap" type="number" min="1" step="1"></label><div id="eCap" class="error"></div>
      <button id="saveProject" class="btn btn-primary" disabled>Save</button>
      <button id="cancelProject" class="btn">Cancel</button>
    </div>
  `, (root) => {
    const validate = () => {
      const pName = root.querySelector("#pName").value.trim();
      const cName = root.querySelector("#cName").value.trim();
      const budget = Number(root.querySelector("#budget").value);
      const cap = Number(root.querySelector("#cap").value);
      const validName = /^[\w\s-]{3,}$/i.test(pName);
      const validCompany = /^[\w\s-]{2,}$/i.test(cName);
      const validBudget = budget > 0;
      const validCap = Number.isInteger(cap) && cap >= 1;
      root.querySelector("#ePName").textContent = validName ? "" : "Min 3 chars, alphanumeric.";
      root.querySelector("#eCName").textContent = validCompany ? "" : "Min 2 chars, alphanumeric.";
      root.querySelector("#eBudget").textContent = validBudget ? "" : "Budget must be positive.";
      root.querySelector("#eCap").textContent = validCap ? "" : "Capacity must be integer >= 1.";
      root.querySelector("#saveProject").disabled = !(validName && validCompany && validBudget && validCap);
    };
    root.querySelectorAll("input").forEach((i) => {
      i.addEventListener("input", validate);
      i.addEventListener("blur", validate);
    });
    root.querySelector("#cancelProject").onclick = () => panel.remove();
    root.querySelector("#saveProject").onclick = () => {
      const { projects } = getCurrent();
      projects.push({
        id: uid(),
        projectName: root.querySelector("#pName").value.trim(),
        companyName: root.querySelector("#cName").value.trim(),
        budget: asNum(root.querySelector("#budget").value, 2),
        employeeCapacity: Number(root.querySelector("#cap").value)
      });
      save(); panel.remove(); render();
    };
  });
}

function openAddEmployee() {
  const panel = showSlidePanel(`
    <h3>Add Employee</h3>
    <div class="form-grid">
      <label>Name<input id="eName"></label><div id="errName" class="error"></div>
      <label>Surname<input id="eSurname"></label><div id="errSurname" class="error"></div>
      <label>Date of Birth<input id="dob" type="date"></label><div id="errDob" class="error"></div>
      <label>Position<select id="pos">${POSITIONS.map((p) => `<option value="${p}">${p}</option>`).join("")}</select></label><div class="error"></div>
      <label>Salary<input id="salary" type="number" step="0.01"></label><div id="errSalary" class="error"></div>
      <button id="saveEmployee" class="btn btn-primary" disabled>Save</button>
      <button id="cancelEmployee" class="btn">Cancel</button>
    </div>
  `, (root) => {
    const validate = () => {
      const name = root.querySelector("#eName").value.trim();
      const surname = root.querySelector("#eSurname").value.trim();
      const dob = root.querySelector("#dob").value;
      const salary = Number(root.querySelector("#salary").value);
      const validName = /^[a-zA-Z]{3,}$/i.test(name);
      const validSurname = /^[a-zA-Z]{3,}$/i.test(surname);
      const age = dob ? ageFromDob(dob) : 0;
      const validDob = age >= 18;
      const validSalary = salary > 0;
      root.querySelector("#errName").textContent = validName ? "" : "Letters only, min 3.";
      root.querySelector("#errSurname").textContent = validSurname ? "" : "Letters only, min 3.";
      root.querySelector("#errDob").textContent = validDob ? "" : "Employee must be 18+.";
      root.querySelector("#errSalary").textContent = validSalary ? "" : "Salary must be positive.";
      root.querySelector("#saveEmployee").disabled = !(validName && validSurname && validDob && validSalary);
    };
    root.querySelectorAll("input,select").forEach((i) => {
      i.addEventListener("input", validate);
      i.addEventListener("blur", validate);
    });
    root.querySelector("#cancelEmployee").onclick = () => panel.remove();
    root.querySelector("#saveEmployee").onclick = () => {
      const { employees } = getCurrent();
      employees.push({
        id: uid(),
        name: root.querySelector("#eName").value.trim(),
        surname: root.querySelector("#eSurname").value.trim(),
        dob: root.querySelector("#dob").value,
        position: root.querySelector("#pos").value,
        salary: asNum(root.querySelector("#salary").value, 2),
        vacationDays: [],
        assignments: []
      });
      save(); panel.remove(); render();
    };
  });
}

function openAssignModal(employeeId, existingProjectId = null, triggerEl = null) {
  const { employees, projects } = getCurrent();
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return;
  const used = employeeUsedCapacity(emp);
  const available = asNum(1.5 - used, 2);
  const options = projects.map((p) => `<option value="${p.id}" ${existingProjectId === p.id ? "selected" : ""}>${p.projectName} (${projectEffectiveCapacity(p, employees).toFixed(2)}/${p.employeeCapacity})</option>`).join("");
  const content = `
    <h3>${existingProjectId ? "Edit Assignment" : "Assign Employee"}: ${emp.name} ${emp.surname}</h3>
    <div class="form-grid">
      <div>Current capacity: ${used.toFixed(2)}/1.5 | Available: ${available.toFixed(2)}</div>
      <label>Project<select id="projSelect">${options}</select></label>
      <label>Capacity <input id="capInput" type="range" min="0" max="1.5" step="0.1" value="0.5"></label>
      <div id="capView"></div>
      <label>Project fit <input id="fitInput" type="range" min="0" max="1" step="0.1" value="1"></label>
      <div id="fitView"></div>
      <div id="projectCapInfo"></div>
      <div id="projectCapacityWarning" class="warn"></div>
      <div id="validation" class="error"></div>
      <button id="saveAssign" class="btn btn-primary">Save</button>
      <button id="cancelAssign" class="btn">Cancel</button>
    </div>
  `;
  const onMount = (root) => {
    if (existingProjectId) {
      const existing = emp.assignments.find((a) => a.projectId === existingProjectId);
      if (existing) {
        root.querySelector("#capInput").value = existing.capacity;
        root.querySelector("#fitInput").value = existing.fit;
      }
    }
    const update = () => {
      const cap = Number(root.querySelector("#capInput").value);
      const fit = Number(root.querySelector("#fitInput").value);
      const projId = root.querySelector("#projSelect").value;
      const selectedProject = projects.find((p) => p.id === projId);
      const existingForEmployee = emp.assignments.find((a) => a.projectId === projId);
      const predicted = used - (existingForEmployee ? existingForEmployee.capacity : 0) + cap;
      const eff = cap * fit * vacationCoefficient(emp);
      const projectUsedNow = selectedProject ? projectEffectiveCapacity(selectedProject, employees) : 0;
      const oldEffForThisAssignment = existingForEmployee ? existingForEmployee.capacity * existingForEmployee.fit * vacationCoefficient(emp) : 0;
      const projectedProjectEff = projectUsedNow - oldEffForThisAssignment + eff;
      const overProject = selectedProject ? projectedProjectEff > selectedProject.employeeCapacity : false;
      root.querySelector("#capView").textContent = `Predicted capacity: ${predicted.toFixed(2)}/1.5`;
      root.querySelector("#fitView").textContent = `Effective capacity: ${eff.toFixed(3)} = ${cap.toFixed(2)} × ${fit.toFixed(2)} × vacCoef`;
      root.querySelector("#projectCapInfo").textContent = selectedProject
        ? `Project capacity after save: ${projectedProjectEff.toFixed(3)}/${selectedProject.employeeCapacity}`
        : "";
      root.querySelector("#projectCapacityWarning").textContent = overProject
        ? "Warning: project capacity will be exceeded (allowed)."
        : "";
      root.querySelector("#validation").textContent = predicted > 1.5 ? "Capacity exceeds 1.5 limit." : "";
      root.querySelector("#saveAssign").disabled = predicted > 1.5;
    };
    root.querySelectorAll("input,select").forEach((x) => x.addEventListener("input", update));
    update();
    root.querySelector("#cancelAssign").onclick = () => (m._close ? m._close() : m.remove());
    root.querySelector("#saveAssign").onclick = () => {
      const projectId = root.querySelector("#projSelect").value;
      const cap = Number(root.querySelector("#capInput").value);
      const fit = Number(root.querySelector("#fitInput").value);
      const idx = emp.assignments.findIndex((a) => a.projectId === projectId);
      if (idx >= 0) emp.assignments[idx] = { projectId, capacity: cap, fit };
      else emp.assignments.push({ projectId, capacity: cap, fit });
      save(); (m._close ? m._close() : m.remove()); render();
    };
  };
  const m = triggerEl ? showAnchoredModal(content, triggerEl, onMount) : showModal(content, onMount);
}

function openProjectEmployees(projectId) {
  const { projects, employees } = getCurrent();
  const p = projects.find((x) => x.id === projectId);
  const assigned = employees.filter((e) => e.assignments.some((a) => a.projectId === projectId))
    .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`));
  const pf = projectFinance(p, employees);
  const capForRev = Math.max(p.employeeCapacity, pf.usedEff || 0);
  const revPerEff = capForRev ? p.budget / capForRev : 0;
  const rows = assigned.map((emp) => {
    const a = emp.assignments.find((x) => x.projectId === projectId);
    const eff = a.capacity * a.fit * vacationCoefficient(emp);
    const rev = eff * revPerEff;
    const cost = emp.salary * Math.max(0.5, a.capacity);
    return `<tr>
      <td><button class="link-btn" data-local-action="openEmployeeMenu" data-eid="${emp.id}" data-pid="${projectId}">${emp.name} ${emp.surname}</button></td>
      <td>${a.capacity.toFixed(2)}</td>
      <td>${a.fit.toFixed(2)}</td>
      <td>${(emp.vacationDays || []).length}</td>
      <td>${eff.toFixed(3)}</td>
      <td class="money">${money(rev)}</td>
      <td class="money">${money(cost)}</td>
      <td class="${rev - cost >= 0 ? "ok" : "bad"} money">${money(rev - cost)}</td>
      <td><button class="btn" data-local-action="editAssignmentFromProject" data-eid="${emp.id}" data-pid="${projectId}">Edit</button>
      <button class="btn" data-local-action="unassignFromProjectDetails" data-eid="${emp.id}" data-pid="${projectId}" data-from-id="${projectId}">Unassign</button></td>
    </tr>`;
  }).join("");
  showModal(`
    <h3>${p.projectName} - Employees</h3>
    ${assigned.length ? `<table><thead><tr><th>Name</th><th>Cap</th><th>Fit</th><th>Vacation</th><th>Eff</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No employees assigned.</p>"}
  `, (root) => {
    root.querySelectorAll("[data-local-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.localAction;
        if (action === "openEmployeeMenu") {
          openActionMenu(btn, [
            { label: "See at Employees", action: "seeAtEmployee", eid: btn.dataset.eid },
            { label: "Unassign", action: "unassign", eid: btn.dataset.eid, pid: btn.dataset.pid }
          ]);
        }
        if (action === "editAssignmentFromProject") openAssignModal(btn.dataset.eid, btn.dataset.pid, btn);
        if (action === "unassignFromProjectDetails") unassign(btn.dataset.eid, btn.dataset.pid, { from: "projectDetails", id: btn.dataset.fromId });
      });
    });
  });
}

function openEmployeeAssignments(employeeId) {
  const { employees, projects } = getCurrent();
  const emp = employees.find((e) => e.id === employeeId);
  const rows = employeeAssignmentRows(emp, projects, employees).map((x) => `<tr>
    <td><button class="link-btn" data-local-action="openProjectMenu" data-pid="${x.project.id}" data-eid="${emp.id}">${x.project.projectName}</button></td>
    <td>${x.assignment.capacity.toFixed(2)}</td>
    <td>${x.assignment.fit.toFixed(2)}</td>
    <td>${(emp.vacationDays || []).length}</td>
    <td>${x.eff.toFixed(3)}</td>
    <td class="money">${money(x.revenue)}</td>
    <td class="money">${money(x.cost)}</td>
    <td class="${x.profit >= 0 ? "ok" : "bad"} money">${money(x.profit)}</td>
    <td><button class="btn" data-local-action="editAssignmentFromEmployee" data-eid="${emp.id}" data-pid="${x.project.id}">Edit</button>
    <button class="btn" data-local-action="unassignFromEmployeeDetails" data-eid="${emp.id}" data-pid="${x.project.id}" data-from-id="${emp.id}">Unassign</button></td>
  </tr>`).join("");
  showModal(`
    <h3>${emp.name} ${emp.surname} - Assignments</h3>
    ${emp.assignments.length ? `<table><thead><tr><th>Project</th><th>Cap</th><th>Fit</th><th>Vacation</th><th>Eff</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No assignments.</p>"}
  `, (root) => {
    root.querySelectorAll("[data-local-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.localAction;
        if (action === "openProjectMenu") {
          openActionMenu(btn, [
            { label: "See at Projects", action: "seeAtProject", pid: btn.dataset.pid },
            { label: "Unassign", action: "unassign", eid: btn.dataset.eid, pid: btn.dataset.pid }
          ]);
        }
        if (action === "editAssignmentFromEmployee") openAssignModal(btn.dataset.eid, btn.dataset.pid, btn);
        if (action === "unassignFromEmployeeDetails") unassign(btn.dataset.eid, btn.dataset.pid, { from: "employeeDetails", id: btn.dataset.fromId });
      });
    });
  });
}

function openVacationCalendar(employeeId) {
  const { employees } = getCurrent();
  const emp = employees.find((e) => e.id === employeeId);
  const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
  const selected = new Set(emp.vacationDays || []);
  const totalWorking = monthWorkingDays(state.currentYear, state.currentMonth);
  const m = showModal(`<h3>Availability - ${emp.name} ${emp.surname}</h3><div id="calendarRoot"></div>`, (root) => {
    const calRoot = root.querySelector("#calendarRoot");
    const renderCal = () => {
      const start = new Date(state.currentYear, state.currentMonth, 1).getDay();
      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === state.currentYear && now.getMonth() === state.currentMonth;
      let html = `<div>${MONTHS[state.currentMonth]} ${state.currentYear}</div><div class="calendar-grid">${dayLabels.map((d) => `<strong>${d}</strong>`).join("")}`;
      for (let i = 0; i < start; i++) html += `<div></div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const w = new Date(state.currentYear, state.currentMonth, d).getDay();
        const weekend = w === 0 || w === 6;
        const today = isCurrentMonth && now.getDate() === d;
        html += `<button class="day ${weekend ? "weekend" : ""} ${selected.has(d) ? "selected" : ""} ${today ? "today" : ""}" data-day="${d}">${d}</button>`;
      }
      const vacWorking = [...selected].filter((d) => {
        const w = new Date(state.currentYear, state.currentMonth, d).getDay();
        return w !== 0 && w !== 6;
      }).length;
      const actual = totalWorking - vacWorking;
      html += `</div><p>Working Days: ${actual}/${totalWorking} days</p><p>Vacation: ${formatVacationRanges([...selected], state.currentMonth)}</p>
      <button id="saveVac" class="btn btn-primary">Set Vacation</button>`;
      calRoot.innerHTML = html;
      calRoot.querySelectorAll(".day").forEach((b) => b.onclick = () => {
        const day = Number(b.dataset.day);
        if (selected.has(day)) selected.delete(day); else selected.add(day);
        renderCal();
      });
      calRoot.querySelector("#saveVac").onclick = () => {
        emp.vacationDays = [...selected].sort((a, b) => a - b);
        save(); m.remove(); render();
      };
    };
    renderCal();
  });
}

function formatVacationRanges(days, month) {
  if (!days.length) return "None";
  const s = [...days].sort((a, b) => a - b);
  const out = [];
  let start = s[0], prev = s[0];
  for (let i = 1; i < s.length; i++) {
    const current = s[i];
    const onlyWeekendBetween = (() => {
      for (let d = prev + 1; d < current; d++) {
        const w = new Date(state.currentYear, month, d).getDay();
        if (w !== 0 && w !== 6) return false;
      }
      return true;
    })();
    if (current === prev + 1 || onlyWeekendBetween) prev = current;
    else {
      out.push(start === prev ? `${String(start).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}` : `${String(start).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}-${String(prev).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}`);
      start = prev = current;
    }
  }
  out.push(start === prev ? `${String(start).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}` : `${String(start).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}-${String(prev).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}`);
  return out.join(", ");
}

function openSeedDataModal() {
  const cur = periodKey();
  const periods = Object.keys(state.monthlyData).filter((k) => k !== cur);
  const rows = periods.map((k) => {
    const d = state.monthlyData[k];
    const [y, m] = k.split("-").map(Number);
    const inc = d.projects.reduce((a, p) => a + projectFinance(p, d.employees).profit, 0);
    return `<tr>
      <td>${MONTHS[m]} ${y}</td>
      <td>${d.projects.length}</td>
      <td>${d.employees.length}</td>
      <td class="${inc >= 0 ? "ok" : "bad"}">${money(inc)}</td>
      <td><button class="btn" data-action="seedFrom" data-key="${k}">Seed</button></td>
    </tr>`;
  }).join("");
  showModal(`<h3>Seed Data</h3>${periods.length ? `<table><thead><tr><th>Period</th><th>Projects</th><th>Employees</th><th>Est. Income</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No other months with data.</p>"}`);
}

function deleteEmployee(employeeId) {
  const cur = getCurrent();
  const emp = cur.employees.find((e) => e.id === employeeId);
  if (!emp) return;
  if (!confirm(`Delete employee ${emp.name} ${emp.surname}?`)) return;
  cur.employees = cur.employees.filter((e) => e.id !== employeeId);
  save(); render();
}
function deleteProject(projectId) {
  const cur = getCurrent();
  const p = cur.projects.find((x) => x.id === projectId);
  if (!p) return;
  if (!confirm(`Delete project ${p.projectName}?`)) return;
  cur.projects = cur.projects.filter((x) => x.id !== projectId);
  cur.employees.forEach((e) => { e.assignments = e.assignments.filter((a) => a.projectId !== projectId); });
  save(); render();
}
function unassign(employeeId, projectId, sourceContext = null) {
  const { employees, projects } = getCurrent();
  const emp = employees.find((e) => e.id === employeeId);
  const p = projects.find((x) => x.id === projectId);
  if (!emp || !p) return;
  const a = emp.assignments.find((x) => x.projectId === projectId);
  if (!a) return;
  const pfBefore = projectFinance(p, employees);
  const capForRev = Math.max(p.employeeCapacity, pfBefore.usedEff || 0);
  const revPerEff = capForRev ? p.budget / capForRev : 0;
  const eff = a.capacity * a.fit * vacationCoefficient(emp);
  const salaryShareRaw = emp.salary * a.capacity;
  const cost = emp.salary * Math.max(0.5, a.capacity);
  const revenueShare = revPerEff * eff;
  const assignmentIncome = revenueShare - cost;
  const before = pfBefore.profit;
  const beforeCap = pfBefore.usedEff;
  const tmp = [...emp.assignments];
  emp.assignments = emp.assignments.filter((x) => x.projectId !== projectId);
  const pfAfter = projectFinance(p, employees);
  const after = pfAfter.profit;
  const afterCap = pfAfter.usedEff;
  emp.assignments = tmp;
  const m = showModal(`
    <h3>Confirm Unassign</h3>
    <div class="form-grid">
      <div><strong>Employee:</strong> ${emp.name} ${emp.surname}</div>
      <div><strong>Project:</strong> ${p.projectName}</div>
      <div><strong>Capacity:</strong> ${a.capacity.toFixed(2)}</div>
      <div><strong>Salary share (salary × capacity):</strong> ${money(salaryShareRaw)}</div>
      <div><strong>Cost used in model:</strong> ${money(cost)}</div>
      <div><strong>Budget share:</strong> ${money(revenueShare)}</div>
      <div><strong>Employee estimated income (assignment):</strong> <span class="${assignmentIncome >= 0 ? "ok" : "bad"}">${money(assignmentIncome)}</span></div>
      <div><strong>Project capacity:</strong> ${beforeCap.toFixed(3)}/${p.employeeCapacity} -> ${afterCap.toFixed(3)}/${p.employeeCapacity}</div>
      <div><strong>Project income:</strong> <span class="${before >= 0 ? "ok" : "bad"}">${money(before)}</span> -> <span class="${after >= 0 ? "ok" : "bad"}">${money(after)}</span></div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="cancelUnassign">Cancel</button>
        <button class="btn btn-primary" id="confirmUnassign">Confirm</button>
      </div>
    </div>
  `, (root) => {
    root.querySelector("#cancelUnassign").onclick = () => m.remove();
    root.querySelector("#confirmUnassign").onclick = () => {
      emp.assignments = emp.assignments.filter((x) => x.projectId !== projectId);
      save();
      m.remove();
      render();
      if (sourceContext?.from === "projectDetails") openProjectEmployees(sourceContext.id);
      if (sourceContext?.from === "employeeDetails") openEmployeeAssignments(sourceContext.id);
    };
  });
}

function wireEvents() {
  el.toggleSidebarBtn.onclick = () => {
    el.sidebar.classList.add("collapsed");
    el.openSidebarBtn.classList.remove("hidden");
  };
  el.openSidebarBtn.onclick = () => {
    el.sidebar.classList.remove("collapsed");
    el.openSidebarBtn.classList.add("hidden");
  };
  el.projectsTabBtn.onclick = () => { state.view = "projects"; render(); };
  el.employeesTabBtn.onclick = () => { state.view = "employees"; render(); };
  el.addProjectBtn.onclick = openAddProject;
  el.addEmployeeBtn.onclick = openAddEmployee;
  el.monthSelect.onchange = () => { state.currentMonth = Number(el.monthSelect.value); ensurePeriodData(); save(); render(); };
  el.yearSelect.onchange = () => { state.currentYear = Number(el.yearSelect.value); ensurePeriodData(); save(); render(); };
  el.seedDataBtn.onclick = openSeedDataModal;

  document.body.addEventListener("click", (e) => {
    const from = clickTargetElement(e);
    if (!from) return;
    const btn = from.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    const id = btn.dataset.id;
    if (a === "deleteEmployee") deleteEmployee(id);
    if (a === "deleteProject") deleteProject(id);
    if (a === "showProjectEmployees") openProjectEmployees(id);
    if (a === "showAssignments") openEmployeeAssignments(id);
    if (a === "availability") openVacationCalendar(id);
    if (a === "assign") openAssignModal(id, null, btn);
    if (a === "editAssignmentFromProject") openAssignModal(btn.dataset.eid, btn.dataset.pid, btn);
    if (a === "editAssignmentFromEmployee") openAssignModal(btn.dataset.eid, btn.dataset.pid, btn);
    if (a === "unassign") {
      const ctx = btn.dataset.from ? { from: btn.dataset.from, id: btn.dataset.fromId } : null;
      unassign(btn.dataset.eid, btn.dataset.pid, ctx);
    }
    if (a === "sort") {
      const { table, key } = btn.dataset;
      const cfg = state.sort[table];
      if (cfg.key !== key) cfg.dir = "asc";
      else cfg.dir = cfg.dir === "asc" ? "desc" : "asc";
      cfg.key = key;
      render();
    }
    if (a === "filter") {
      const { table, key } = btn.dataset;
      openFilterPopup(btn, table, key);
    }
    if (a === "editSalaryInline") {
      const cell = btn.closest("td");
      if (!cell) return;
      const input = cell.querySelector('[data-action="setSalary"]');
      if (!input) return;
      btn.classList.add("hidden-inline");
      input.classList.remove("hidden-inline");
      input.focus();
      input.select();
    }
    if (a === "editPositionInline") {
      const cell = btn.closest("td");
      if (!cell) return;
      const select = cell.querySelector('[data-action="setPosition"]');
      if (!select) return;
      btn.classList.add("hidden-inline");
      select.classList.remove("hidden-inline");
      select.focus();
    }
    if (a === "openEmployeeMenu") {
      openActionMenu(btn, [
        { label: "See at Employees", action: "seeAtEmployee", eid: btn.dataset.eid },
        { label: "Unassign", action: "unassign", eid: btn.dataset.eid, pid: btn.dataset.pid }
      ]);
    }
    if (a === "openProjectMenu") {
      openActionMenu(btn, [
        { label: "See at Projects", action: "seeAtProject", pid: btn.dataset.pid },
        { label: "Unassign", action: "unassign", eid: btn.dataset.eid, pid: btn.dataset.pid }
      ]);
    }
    if (a === "applyFilterPopup") {
      const popup = btn.closest(".filter-popup");
      if (!popup) return;
      const { table, key } = popup.dataset;
      const v = popup.querySelector("#fltValue").value.trim();
      if (!v) delete state.filters[table][key];
      else state.filters[table][key] = v;
      popup.remove();
      render();
    }
    if (a === "cancelFilterPopup") btn.closest(".filter-popup")?.remove();
    if (a === "seeAtProject") {
      const { projects } = getCurrent();
      const p = projects.find((x) => x.id === btn.dataset.pid);
      if (!p) return;
      state.view = "projects";
      state.filters.projects = { projectName: p.projectName };
      render();
      el.overlayRoot.innerHTML = "";
    }
    if (a === "seeAtEmployee") {
      const { employees } = getCurrent();
      const emp = employees.find((x) => x.id === btn.dataset.eid);
      if (!emp) return;
      state.view = "employees";
      state.filters.employees = { name: emp.name, surname: emp.surname };
      render();
      el.overlayRoot.innerHTML = "";
    }
    if (a === "removeFilter") {
      delete state.filters[state.view][btn.dataset.key];
      render();
    }
    if (a === "clearFilters") {
      state.filters[state.view] = {};
      render();
    }
    if (a === "seedFrom") {
      const sourceKey = btn.dataset.key;
      const targetKey = periodKey();
      if (!confirm(`Seed data from ${sourceKey} to ${targetKey}?`)) return;
      const source = JSON.parse(JSON.stringify(state.monthlyData[sourceKey]));
      source.employees.forEach((e) => { e.vacationDays = []; });
      state.monthlyData[targetKey] = source;
      save();
      const modal = btn.closest(".modal-backdrop");
      if (modal) modal.remove();
      render();
    }
    if (a === "closeModal") {
      const backdrop = btn.closest(".modal-backdrop");
      if (!backdrop) return;
      if (backdrop._close) backdrop._close();
      else backdrop.remove();
    }
  });

  document.body.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "setPosition") {
      const { employees } = getCurrent();
      const emp = employees.find((x) => x.id === target.dataset.id);
      if (!emp) return;
      emp.position = target.value;
      save();
      render();
    }
  });
  document.body.addEventListener("focusout", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== "setPosition") return;
    const { employees } = getCurrent();
    const emp = employees.find((x) => x.id === target.dataset.id);
    if (!emp) return;
    emp.position = target.value;
    save();
    render();
  });
  document.body.addEventListener("focusin", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "setSalary") target.dataset.prev = target.value;
  });
  document.body.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== "setSalary") return;
    if (e.key === "Enter") target.blur();
    if (e.key === "Escape") {
      target.value = target.dataset.prev || target.value;
      target.blur();
    }
  });
  document.body.addEventListener("focusout", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== "setSalary") return;
    const val = Number(target.value);
    const prev = Number(target.dataset.prev || "0");
    const safe = val > 0 ? asNum(val, 2) : asNum(prev, 2);
    const { employees } = getCurrent();
    const emp = employees.find((x) => x.id === target.dataset.id);
    if (!emp) return;
    emp.salary = safe;
    save();
    render();
  });
  document.body.addEventListener("click", (e) => {
    const from = clickTargetElement(e);
    if (!from) return;
    const inPopup = from.closest(".filter-popup");
    const isFilterButton = from.closest('[data-action="filter"]');
    if (!inPopup && !isFilterButton) closeOverlayMenus();
  });
}

function init() {
  if (!YEARS.includes(state.currentYear)) state.currentYear = 2026;
  load();
  ensurePeriodData();
  wireEvents();
  render();
}

init();
