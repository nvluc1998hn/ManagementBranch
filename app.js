// ============================================================
// EduBranch (managementBranch) — router, page renderers, handlers
// 2 vai trò: admin (quản lý chi nhánh/GV/lương/lịch) và teacher
// (xem lịch của mình, vào ca / xong ca, sửa hồ sơ).
// ============================================================

let currentPage = "dashboard";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

// ---- DATE FIELD (hiển thị dd/mm/yyyy, lưu ISO yyyy-mm-dd) ----
// Native <input type="date"> hiển thị theo locale trình duyệt (thường mm/dd/yyyy).
// Widget này hiện dd/mm/yyyy cho đồng nhất tiếng Việt, vẫn giữ input date ẩn
// để dùng lịch (calendar picker) và trả .value dạng ISO như cũ.
function isoToDMY(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  if (p.length !== 3) return "";
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function dmyToISO(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || "").trim());
  if (!m) return "";
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d)
    return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
// id: input ISO ẩn mang id này -> mọi chỗ đọc .value không đổi
function dmyDateField(id, iso = "") {
  const disp = isoToDMY(iso);
  return `<div class="date-field">
    <input type="text" class="form-control date-dmy" placeholder="dd/mm/yyyy"
      inputmode="numeric" maxlength="10" autocomplete="off" value="${disp}"
      oninput="dmyInput(this)" onchange="dmyCommit(this)">
    <input type="date" class="date-iso" id="${id}" value="${iso || ""}"
      tabindex="-1" aria-hidden="true" onchange="dateIsoChange(this)">
    <button type="button" class="date-cal" tabindex="-1" onclick="dateOpenPicker(this)"><i class="ti ti-calendar-event"></i></button>
  </div>`;
}
function dmyInput(el) {
  const digits = el.value.replace(/\D/g, "").slice(0, 8);
  let out = digits;
  if (digits.length > 4)
    out = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
  else if (digits.length > 2) out = digits.slice(0, 2) + "/" + digits.slice(2);
  if (out !== el.value) {
    // Đếm số CHỮ SỐ bên trái con trỏ để khôi phục đúng vị trí sau khi chèn dấu "/".
    const caret = el.selectionStart ?? out.length;
    const digitsLeft = el.value.slice(0, caret).replace(/\D/g, "").length;
    el.value = out;
    let pos = 0, seen = 0;
    while (pos < out.length && seen < digitsLeft) {
      if (out[pos] !== "/") seen++;
      pos++;
    }
    if (out[pos] === "/") pos++;
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }
  const iso = dmyToISO(out);
  if (iso) el.parentNode.querySelector(".date-iso").value = iso;
}
function dmyCommit(el) {
  const isoEl = el.parentNode.querySelector(".date-iso");
  const raw = el.value.trim();
  if (!raw) {
    isoEl.value = "";
    return;
  }
  const iso = dmyToISO(raw);
  if (iso) {
    el.value = isoToDMY(iso); // chuẩn hoá (thêm số 0)
    isoEl.value = iso;
  } else {
    el.value = isoToDMY(isoEl.value); // không hợp lệ -> trả về giá trị đang lưu
  }
}
function dateIsoChange(isoEl) {
  const dmyEl = isoEl.parentNode.querySelector(".date-dmy");
  dmyEl.value = isoToDMY(isoEl.value);
}
function dateOpenPicker(btn) {
  const isoEl = btn.parentNode.querySelector(".date-iso");
  try {
    isoEl.showPicker();
  } catch (e) {
    isoEl.focus();
    isoEl.click();
  }
}

// ---- PHONE FIELD (bắt buộc đúng 10 chữ số nếu có nhập) ----
function phoneInputAttrs() {
  return `inputmode="numeric" maxlength="10" placeholder="0909123456" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"`;
}
// Trả về chuỗi SĐT hợp lệ, null nếu bỏ trống, hoặc ném lỗi nếu sai định dạng
function readPhoneField(id) {
  const v = document.getElementById(id).value.trim();
  if (!v) return null;
  if (!/^\d{10}$/.test(v)) throw new Error("Số điện thoại phải gồm đúng 10 chữ số");
  return v;
}

// ============================================================
// STARTUP
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  bindNav();
  bindBottomNav();
  bindTopbar();
  setTopbarDate();

  if (!sbConfigured()) {
    showLoginPage();
    return;
  }
  showLoading(true);
  try {
    const user = await restoreSession();
    if (user) {
      await loadAppData();
    } else {
      showLoginPage();
    }
  } catch (e) {
    console.error(e);
    showToast("Lỗi khởi động: " + (e.message || e), "error");
    showLoginPage();
  } finally {
    showLoading(false);
  }
});

async function loadAppData() {
  await initDB();
  document.body.classList.remove("logged-out");
  applyRoleUI();
  // Giáo viên vào thẳng thời khóa biểu; admin vào tổng quan
  renderPage(isAdmin() ? "dashboard" : "schedule");
}

function applyRoleUI() {
  // Ẩn menu admin với giáo viên (CSS: body.role-teacher .nav-admin { display:none })
  document.body.classList.toggle("role-teacher", !isAdmin());
}

function setTopbarDate() {
  const el = document.getElementById("topbarDate");
  if (el)
    el.textContent = new Date().toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
}

function bindTopbar() {
  document.getElementById("menuBtn")?.addEventListener("click", openSidebar);
  document.getElementById("sidebarOverlay")?.addEventListener("click", closeSidebar);
  document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

function showLoading(show) {
  let el = document.getElementById("loadingOverlay");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.id = "loadingOverlay";
      el.className = "loading-overlay";
      el.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">Đang tải dữ liệu...</div>`;
      document.body.appendChild(el);
    }
  } else {
    el?.remove();
  }
}

// ============================================================
// NAV
// ============================================================

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay")?.classList.add("show");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay")?.classList.remove("show");
}

function bindNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (!getCurrentUser()) {
        showLoginPage();
        return;
      }
      renderPage(item.dataset.page);
      closeSidebar();
    });
  });
}

function bindBottomNav() {
  const drawer = document.getElementById("moreDrawer");
  const overlay = document.getElementById("moreDrawerOverlay");

  function closeDrawer() {
    drawer?.classList.remove("open");
    overlay?.classList.remove("show");
  }

  document.querySelectorAll(".bottom-nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (!getCurrentUser()) {
        showLoginPage();
        return;
      }
      const page = item.dataset.page;
      if (page === "more") {
        drawer?.classList.toggle("open");
        overlay?.classList.toggle("show");
        return;
      }
      closeDrawer();
      renderPage(page);
    });
  });

  overlay?.addEventListener("click", closeDrawer);

  document.querySelectorAll(".more-drawer-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (!getCurrentUser()) {
        showLoginPage();
        return;
      }
      closeDrawer();
      renderPage(item.dataset.page);
    });
  });
}

const PAGE_TITLES = {
  dashboard: "Tổng quan",
  branches: "Chi nhánh",
  teachers: "Giáo viên",
  schedule: "Thời khóa biểu",
  report: "Báo cáo",
  account: "Tài khoản",
};

const ADMIN_ONLY_PAGES = ["branches", "teachers"];

function renderPage(page) {
  if (!getCurrentUser()) {
    showLoginPage();
    return;
  }
  document.getElementById("moreDrawer")?.classList.remove("open");
  document.getElementById("moreDrawerOverlay")?.classList.remove("show");

  if (ADMIN_ONLY_PAGES.includes(page) && !isAdmin()) {
    showToast("Chỉ quản trị viên mới truy cập được trang này", "error");
    page = "dashboard";
  }
  currentPage = page;
  document.getElementById("topbarTitle").textContent = PAGE_TITLES[page] || page;

  // sync sidebar + bottom nav
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.page === page);
  });
  const morePages = ["branches", "teachers", "account"];
  document.querySelectorAll(".bottom-nav-item").forEach((n) => {
    n.classList.toggle(
      "active",
      n.dataset.page === page || (n.dataset.page === "more" && morePages.includes(page)),
    );
  });

  const el = document.getElementById("pageContent");
  el.innerHTML = "";
  const pages = { dashboard, branches, teachers, schedule, report, account };
  const fn = pages[page];
  el.innerHTML = fn ? fn() : `<div class="empty-state"><p>Không tìm thấy trang</p></div>`;
}

// ============================================================
// LOGIN / REGISTER
// ============================================================

function showLoginPage() {
  document.body.classList.add("logged-out");
  document.body.classList.remove("role-teacher");
  const configWarn = sbConfigured()
    ? ""
    : `<div class="login-config-warn">
         <i class="ti ti-alert-triangle"></i>
         Chưa cấu hình Supabase — điền <b>SUPABASE_URL</b> và <b>SUPABASE_KEY</b> trong <code>data.js</code>, chạy <code>supabase_schema.sql</code> rồi tải lại trang.
       </div>`;
  document.getElementById("pageContent").innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <span class="logo-icon"><i class="ti ti-building-community"></i></span>
          <div>
            <div class="login-title">EduBranch</div>
            <div class="login-subtitle">Quản lý chi nhánh, giáo viên & lịch dạy</div>
          </div>
        </div>
        ${configWarn}
        <div class="login-tabs">
          <button type="button" class="login-tab active" id="tab-login" onclick="showAuthTab('login')">Đăng nhập</button>
          <button type="button" class="login-tab" id="tab-register" onclick="showAuthTab('register')">Đăng ký quản trị</button>
        </div>

        <form id="loginForm" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" id="login-email" required autocomplete="username" placeholder="ban@gmail.com">
          </div>
          <div class="form-group">
            <label class="form-label">Mật khẩu</label>
            <input type="password" class="form-control" id="login-password" required autocomplete="current-password" placeholder="••••••••">
          </div>
          <button type="submit" class="btn btn-primary login-btn" id="login-submit">
            <i class="ti ti-login-2"></i> Đăng nhập
          </button>
          <p class="login-hint">Giáo viên dùng tài khoản do quản trị viên cấp.</p>
        </form>

        <form id="registerForm" style="display:none" onsubmit="handleRegister(event)">
          <div class="form-group">
            <label class="form-label">Họ tên</label>
            <input type="text" class="form-control" id="reg-name" required placeholder="Nguyễn Văn A">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" id="reg-email" required autocomplete="username" placeholder="ban@gmail.com">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Mật khẩu</label>
              <input type="password" class="form-control" id="reg-password" required minlength="6" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label class="form-label">Nhập lại mật khẩu</label>
              <input type="password" class="form-control" id="reg-password2" required minlength="6" autocomplete="new-password">
            </div>
          </div>
          <button type="submit" class="btn btn-primary login-btn" id="reg-submit">
            <i class="ti ti-user-plus"></i> Tạo tài khoản quản trị
          </button>
          <p class="login-hint">Tài khoản đăng ký ở đây là <b>quản trị viên</b> (chủ trung tâm) — có quyền tạo chi nhánh và cấp tài khoản giáo viên.</p>
        </form>
      </div>
    </div>`;
}

function showAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("loginForm").style.display = tab === "login" ? "" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "" : "none";
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById("login-submit");
  btn.disabled = true;
  try {
    await loginUser(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value,
    );
    showLoading(true);
    await loadAppData();
    showToast("Đăng nhập thành công");
  } catch (err) {
    console.error(err);
    const msg = /invalid login credentials/i.test(err.message || "")
      ? "Sai email hoặc mật khẩu"
      : err.message || "Đăng nhập thất bại";
    showToast("Lỗi: " + msg, "error");
  } finally {
    btn.disabled = false;
    showLoading(false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const p1 = document.getElementById("reg-password").value;
  const p2 = document.getElementById("reg-password2").value;
  if (p1 !== p2) {
    showToast("Mật khẩu nhập lại không khớp", "error");
    return;
  }
  const btn = document.getElementById("reg-submit");
  btn.disabled = true;
  try {
    await registerAdmin(
      document.getElementById("reg-email").value.trim(),
      p1,
      document.getElementById("reg-name").value.trim(),
    );
    showLoading(true);
    await loadAppData();
    showToast("Tạo tài khoản thành công");
  } catch (err) {
    console.error(err);
    const msg = /already registered/i.test(err.message || "")
      ? "Email này đã được đăng ký"
      : err.message || "Đăng ký thất bại";
    showToast("Lỗi: " + msg, "error");
  } finally {
    btn.disabled = false;
    showLoading(false);
  }
}

async function handleLogout() {
  await logoutUser();
  showToast("Đã đăng xuất");
  showLoginPage();
}

// ============================================================
// PAGE: DASHBOARD — Tổng quan
// ============================================================

function dashboard() {
  return isAdmin() ? dashboardAdmin() : dashboardTeacher();
}

function dashboardAdmin() {
  const today = todayStr();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const teachers = getTeachers();
  const todaySessions = getSchedulesOfDate(today);
  const monthSessions = getSchedulesInMonth(month, year);
  const doneMonth = monthSessions.filter((s) => s.status === "completed").length;
  const missedMonth = monthSessions.filter((s) => displayStatus(s) === "missed").length;
  const salaryTotal = teachers.reduce((sum, t) => {
    const r = calcTeacherSalary(t.id, month, year);
    return sum + (r.total || 0);
  }, 0);

  const rows = todaySessions
    .map((s) => {
      const st = SCHEDULE_STATUS[displayStatus(s)];
      return `<tr>
        <td><b>${formatTime(s.start_time)} - ${formatTime(s.end_time)}</b></td>
        <td>${escapeHtml(getProfile(s.teacher_id)?.full_name || "?")}</td>
        <td>${escapeHtml(getSubject(s.subject_id)?.name || "?")}</td>
        <td>${escapeHtml(getBranch(s.branch_id)?.name || "?")}</td>
        <td><span class="badge ${st.badge}">${st.label}</span></td>
      </tr>`;
    })
    .join("");

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-building-community"></i></div>
        <div><div class="stat-label">Chi nhánh</div><div class="stat-value">${DB.branches.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div><div class="stat-label">Giáo viên</div><div class="stat-value">${teachers.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-calendar-event"></i></div>
        <div><div class="stat-label">Ca dạy hôm nay</div><div class="stat-value">${todaySessions.length}</div>
        <div class="stat-sub">${todaySessions.filter((s) => s.status === "completed").length} đã hoàn thành</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Lương tháng ${month} (dự kiến)</div><div class="stat-value" style="font-size:20px">${formatMoney(salaryTotal)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Lịch dạy hôm nay</div>
          <div class="card-subtitle">${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="renderPage('schedule')"><i class="ti ti-calendar-time"></i> Xem thời khóa biểu</button>
      </div>
      ${
        todaySessions.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Giờ</th><th>Giáo viên</th><th>Môn học</th><th>Chi nhánh</th><th>Trạng thái</th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : `<div class="empty-state"><i class="ti ti-calendar-off"></i><p>Hôm nay không có ca dạy nào</p></div>`
      }
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Tháng ${month}/${year}</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tổng ca xếp</th><th>Đã dạy</th><th>Không dạy</th></tr></thead>
        <tbody><tr>
          <td><b>${monthSessions.length}</b></td>
          <td><span class="badge badge-green">${doneMonth}</span></td>
          <td><span class="badge badge-red">${missedMonth}</span></td>
        </tr></tbody>
      </table></div>
    </div>`;
}

function dashboardTeacher() {
  const me = getCurrentUser();
  const today = todayStr();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const todaySessions = getSchedulesOfDate(today, me.id);
  const calc = calcTeacherSalary(me.id, month, year);

  const rows = todaySessions.map((s) => teacherSessionCard(s)).join("");

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Xin chào, ${escapeHtml(me.full_name || "Giáo viên")} 👋</div>
          <div class="card-subtitle">${escapeHtml(getBranch(me.branch_id)?.name || "Chưa được gán chi nhánh")}</div>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-calendar-event"></i></div>
        <div><div class="stat-label">Ca hôm nay</div><div class="stat-value">${todaySessions.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-calendar-check"></i></div>
        <div><div class="stat-label">Đã dạy tháng ${month}</div><div class="stat-value">${calc.completed}/${calc.assigned}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Lương tháng ${month} (dự kiến)</div><div class="stat-value" style="font-size:20px">${calc.total == null ? "Chưa chốt lương" : formatMoney(calc.total)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Ca dạy hôm nay</div>
          <div class="card-subtitle">Nhớ bấm <b>Vào ca</b> khi bắt đầu và <b>Xong ca</b> khi kết thúc — không cập nhật thì ca được tính là <b>không dạy</b>.</div>
        </div>
      </div>
      ${
        todaySessions.length
          ? `<div class="today-sessions">${rows}</div>`
          : `<div class="empty-state"><i class="ti ti-beach"></i><p>Hôm nay bạn không có ca dạy nào</p></div>`
      }
    </div>`;
}

function teacherSessionCard(s) {
  const st = SCHEDULE_STATUS[displayStatus(s)];
  let actions = "";
  if (s.sched_date === todayStr() && s.status === "scheduled") {
    actions = `<button class="btn btn-primary btn-sm" onclick="checkIn('${s.id}')"><i class="ti ti-player-play"></i> Vào ca</button>`;
  } else if (s.status === "in_progress") {
    actions = `<button class="btn btn-primary btn-sm" onclick="completeSession('${s.id}')"><i class="ti ti-flag-check"></i> Xong ca</button>`;
  }
  return `
    <div class="session-row">
      <div class="session-time">${formatTime(s.start_time)}<br><span>${formatTime(s.end_time)}</span></div>
      <div class="session-info">
        <div class="session-subject">${escapeHtml(getSubject(s.subject_id)?.name || "?")}</div>
        <div class="session-sub">${escapeHtml(getBranch(s.branch_id)?.name || "")}${s.note ? " · " + escapeHtml(s.note) : ""}</div>
      </div>
      <span class="badge ${st.badge}">${st.label}</span>
      ${actions}
    </div>`;
}

async function checkIn(id) {
  try {
    await dbCheckInSchedule(id);
    showToast("Đã vào ca — dạy tốt nhé!");
    renderPage(currentPage);
  } catch (e) {
    console.error(e);
    showToast("Lỗi: " + (e.message || "Không thể vào ca"), "error");
  }
}

async function completeSession(id) {
  try {
    await dbCompleteSchedule(id);
    showToast("Đã hoàn thành ca dạy");
    renderPage(currentPage);
  } catch (e) {
    console.error(e);
    showToast("Lỗi: " + (e.message || "Không thể kết thúc ca"), "error");
  }
}

// ============================================================
// PAGE: BRANCHES — Chi nhánh (admin)
// ============================================================

function branches() {
  const rows = DB.branches
    .map((b) => {
      const subjects = getSubjectsOfBranch(b.id);
      const teachers = getTeachers(b.id);
      return `<tr>
        <td><b>${escapeHtml(b.name)}</b></td>
        <td>${escapeHtml(b.address || "—")}</td>
        <td>${escapeHtml(b.phone || "—")}</td>
        <td>${subjects.length ? subjects.map((s) => `<span class="badge badge-blue">${escapeHtml(s.name)}${s.fee ? " · " + formatMoney(s.fee) : ""}</span>`).join(" ") : '<span class="badge badge-gray">Chưa có môn</span>'}</td>
        <td>${teachers.length}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openSubjectsModal('${b.id}')" title="Môn học"><i class="ti ti-book-2"></i> Môn học</button>
          <button class="btn btn-outline btn-sm btn-icon" onclick="openBranchModal('${b.id}')" title="Sửa"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteBranch('${b.id}')" title="Xóa"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Chi nhánh</div>
        <div class="page-desc">Tạo chi nhánh, sau đó khai báo môn học và gán giáo viên</div>
      </div>
      <button class="btn btn-primary" onclick="openBranchModal()"><i class="ti ti-plus"></i> Thêm chi nhánh</button>
    </div>
    <div class="card">
      ${
        DB.branches.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Tên chi nhánh</th><th>Địa chỉ</th><th>SĐT</th><th>Môn học</th><th>GV</th><th></th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : `<div class="empty-state"><i class="ti ti-building-community"></i><p>Chưa có chi nhánh nào — hãy tạo chi nhánh đầu tiên</p></div>`
      }
    </div>`;
}

function openBranchModal(id) {
  const b = id ? getBranch(id) : null;
  openModal(b ? "Sửa chi nhánh" : "Thêm chi nhánh", `
    <form onsubmit="saveBranch(event, '${id || ""}')">
      <div class="form-group">
        <label class="form-label">Tên chi nhánh *</label>
        <input type="text" class="form-control" id="br-name" required value="${escapeHtml(b?.name || "")}" placeholder="Cơ sở 1 - Cầu Giấy">
      </div>
      <div class="form-group">
        <label class="form-label">Địa chỉ</label>
        <input type="text" class="form-control" id="br-address" value="${escapeHtml(b?.address || "")}" placeholder="Số 1 Trần Thái Tông, Hà Nội">
      </div>
      <div class="form-group">
        <label class="form-label">Số điện thoại chi nhánh</label>
        <input type="tel" class="form-control" id="br-phone" value="${escapeHtml(b?.phone || "")}" ${phoneInputAttrs()}>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary">${b ? "Lưu" : "Thêm"}</button>
      </div>
    </form>`);
}

async function saveBranch(e, id) {
  e.preventDefault();
  try {
    const fields = {
      name: document.getElementById("br-name").value.trim(),
      address: document.getElementById("br-address").value.trim() || null,
      phone: readPhoneField("br-phone"),
    };
    if (id) {
      await dbUpdateBranch(id, fields);
      showToast("Đã cập nhật chi nhánh");
    } else {
      await dbAddBranch(fields);
      showToast("Đã thêm chi nhánh");
    }
    closeModal();
    renderPage("branches");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  }
}

function confirmDeleteBranch(id) {
  const b = getBranch(id);
  openConfirm(
    "Xóa chi nhánh",
    `Xóa chi nhánh <b>${escapeHtml(b?.name || "")}</b>?<br>Toàn bộ môn học và lịch dạy của chi nhánh sẽ bị xóa; giáo viên thuộc chi nhánh sẽ không còn chi nhánh.`,
    async () => {
      await dbDeleteBranch(id);
      showToast("Đã xóa chi nhánh");
      renderPage("branches");
    },
  );
}

// ---- Môn học của chi nhánh ----

function openSubjectsModal(branchId) {
  const b = getBranch(branchId);
  const items = getSubjectsOfBranch(branchId)
    .map(
      (s) => `
      <div class="subject-item">
        <i class="ti ti-book-2"></i>
        <span>${escapeHtml(s.name)}
          <span class="stat-sub" style="display:block">${s.fee ? "Học phí: " + formatMoney(s.fee) : "Chưa có học phí"}</span>
        </span>
        <button class="btn btn-outline btn-sm btn-icon" onclick="openEditSubjectModal('${s.id}', '${branchId}')" title="Sửa"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSubject('${s.id}', '${branchId}')" title="Xóa"><i class="ti ti-trash"></i></button>
      </div>`,
    )
    .join("");
  openModal(`Môn học — ${escapeHtml(b?.name || "")}`, `
    <div class="subject-list">${items || '<div class="empty-state" style="padding:16px"><p>Chưa có môn học nào</p></div>'}</div>
    <form onsubmit="addSubject(event, '${branchId}')" style="margin-top:14px">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tên môn học *</label>
          <input type="text" class="form-control" id="subj-name" required placeholder="VD: Toán tư duy">
        </div>
        <div class="form-group">
          <label class="form-label">Học phí (đ)</label>
          <input type="number" class="form-control" id="subj-fee" min="0" step="1000" placeholder="500000">
        </div>
      </div>
      <div class="form-actions" style="margin-top:0">
        <button type="submit" class="btn btn-primary"><i class="ti ti-plus"></i> Thêm môn học</button>
      </div>
    </form>`);
}

async function addSubject(e, branchId) {
  e.preventDefault();
  const name = document.getElementById("subj-name").value.trim();
  if (!name) return;
  const fee = document.getElementById("subj-fee").value;
  try {
    await dbAddSubject(branchId, name, fee ? Number(fee) : null);
    showToast("Đã thêm môn học");
    openSubjectsModal(branchId);
    if (currentPage === "branches") renderPage("branches");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không thêm được"), "error");
  }
}

function openEditSubjectModal(id, branchId) {
  const s = getSubject(id);
  openModal(`Sửa môn học — ${escapeHtml(s?.name || "")}`, `
    <form onsubmit="saveSubjectEdit(event, '${id}', '${branchId}')">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tên môn học *</label>
          <input type="text" class="form-control" id="subj-edit-name" required value="${escapeHtml(s?.name || "")}">
        </div>
        <div class="form-group">
          <label class="form-label">Học phí (đ)</label>
          <input type="number" class="form-control" id="subj-edit-fee" min="0" step="1000" value="${s?.fee ?? ""}" placeholder="500000">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="openSubjectsModal('${branchId}')">Quay lại</button>
        <button type="submit" class="btn btn-primary">Lưu</button>
      </div>
    </form>`);
}

async function saveSubjectEdit(e, id, branchId) {
  e.preventDefault();
  const fee = document.getElementById("subj-edit-fee").value;
  try {
    await dbUpdateSubject(id, {
      name: document.getElementById("subj-edit-name").value.trim(),
      fee: fee ? Number(fee) : null,
    });
    showToast("Đã cập nhật môn học");
    openSubjectsModal(branchId);
    if (currentPage === "branches") renderPage("branches");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  }
}

async function deleteSubject(id, branchId) {
  try {
    await dbDeleteSubject(id);
    showToast("Đã xóa môn học");
    openSubjectsModal(branchId);
    if (currentPage === "branches") renderPage("branches");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không xóa được"), "error");
  }
}

// ============================================================
// PAGE: TEACHERS — Giáo viên (admin)
// ============================================================

let teacherBranchFilter = "";

function teachers() {
  const list = getTeachers(teacherBranchFilter || null);
  const rows = list
    .map((t) => {
      const salary = getLatestSalary(t.id);
      const salaryText = salary
        ? `<span class="badge badge-blue">${SALARY_TYPE_LABELS[salary.salary_type]}</span>
           <div class="stat-sub" style="margin-top:3px">${salarySummary(salary)}</div>`
        : '<span class="badge badge-gray">Chưa chốt lương</span>';
      return `<tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px">
            <span class="avatar">${escapeHtml(initials(t.full_name))}</span>
            <div><b>${escapeHtml(t.full_name || "(chưa đặt tên)")}</b>
            <div class="stat-sub">${escapeHtml(t.email || "")}</div></div>
          </div>
        </td>
        <td>${escapeHtml(t.phone || "—")}</td>
        <td>${escapeHtml(getBranch(t.branch_id)?.name || "—")}</td>
        <td>${salaryText}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openSalaryModal('${t.id}')" title="Lương"><i class="ti ti-coin"></i> Lương</button>
          <button class="btn btn-outline btn-sm btn-icon" onclick="openTeacherModal('${t.id}')" title="Sửa"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-outline btn-sm btn-icon" onclick="openResetPasswordModal('${t.id}')" title="Đổi mật khẩu"><i class="ti ti-key"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteTeacher('${t.id}')" title="Xóa"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");

  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${teacherBranchFilter === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Giáo viên</div>
        <div class="page-desc">Cấp tài khoản, gán chi nhánh và khởi tạo lương cho giáo viên</div>
      </div>
      <button class="btn btn-primary" onclick="openTeacherModal()"><i class="ti ti-user-plus"></i> Thêm giáo viên</button>
    </div>
    <div class="filter-bar">
      <select class="form-control" style="max-width:240px" onchange="teacherBranchFilter=this.value; renderPage('teachers')">
        <option value="">Tất cả chi nhánh</option>
        ${branchOptions}
      </select>
    </div>
    <div class="card">
      ${
        list.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Giáo viên</th><th>SĐT</th><th>Chi nhánh</th><th>Lương hiện tại</th><th></th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : `<div class="empty-state"><i class="ti ti-users"></i><p>${DB.branches.length ? "Chưa có giáo viên nào — bấm “Thêm giáo viên” để cấp tài khoản" : "Hãy tạo chi nhánh trước, rồi thêm giáo viên"}</p></div>`
      }
    </div>`;
}

function salarySummary(s) {
  const parts = [];
  if (s.salary_type === "fixed" || s.salary_type === "mixed")
    parts.push(`${formatMoney(s.base_salary)}/tháng`);
  if (s.salary_type === "per_session" || s.salary_type === "mixed")
    parts.push(`${formatMoney(s.per_session_amount)}/tiết`);
  return parts.join(" + ");
}

function openTeacherModal(id) {
  const t = id ? getProfile(id) : null;
  if (!DB.branches.length) {
    showToast("Hãy tạo chi nhánh trước khi thêm giáo viên", "error");
    return;
  }
  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${t?.branch_id === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  const accountFields = t
    ? ""
    : `
      <div class="form-group">
        <label class="form-label">Email đăng nhập *</label>
        <input type="email" class="form-control" id="tc-email" required placeholder="giaovien@gmail.com">
      </div>
      <div class="form-group">
        <label class="form-label">Mật khẩu (cấp cho giáo viên) *</label>
        <input type="text" class="form-control" id="tc-password" required minlength="6" placeholder="Ít nhất 6 ký tự">
      </div>`;
  openModal(t ? "Sửa giáo viên" : "Thêm giáo viên", `
    <form onsubmit="saveTeacher(event, '${id || ""}')">
      ${accountFields}
      <div class="form-group">
        <label class="form-label">Họ tên *</label>
        <input type="text" class="form-control" id="tc-name" required value="${escapeHtml(t?.full_name || "")}" placeholder="Trần Thị B">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Số điện thoại</label>
          <input type="tel" class="form-control" id="tc-phone" value="${escapeHtml(t?.phone || "")}" ${phoneInputAttrs()}>
        </div>
        <div class="form-group">
          <label class="form-label">Chi nhánh *</label>
          <select class="form-control" id="tc-branch" required>${branchOptions}</select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary" id="tc-submit">${t ? "Lưu" : "Tạo tài khoản"}</button>
      </div>
    </form>`);
}

async function saveTeacher(e, id) {
  e.preventDefault();
  const btn = document.getElementById("tc-submit");
  btn.disabled = true;
  try {
    const phone = readPhoneField("tc-phone");
    if (id) {
      await dbUpdateProfile(id, {
        full_name: document.getElementById("tc-name").value.trim(),
        phone,
        branch_id: document.getElementById("tc-branch").value,
      });
      showToast("Đã cập nhật giáo viên");
    } else {
      await dbCreateTeacher({
        email: document.getElementById("tc-email").value.trim(),
        password: document.getElementById("tc-password").value,
        full_name: document.getElementById("tc-name").value.trim(),
        phone,
        branch_id: document.getElementById("tc-branch").value,
      });
      showToast("Đã tạo tài khoản giáo viên — gửi email + mật khẩu cho giáo viên nhé");
    }
    closeModal();
    renderPage("teachers");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  } finally {
    btn.disabled = false;
  }
}

function openResetPasswordModal(id) {
  const t = getProfile(id);
  openModal(`Đổi mật khẩu — ${escapeHtml(t?.full_name || "")}`, `
    <form onsubmit="resetTeacherPassword(event, '${id}')">
      <div class="form-group">
        <label class="form-label">Mật khẩu mới *</label>
        <input type="text" class="form-control" id="rp-password" required minlength="6" placeholder="Ít nhất 6 ký tự">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary">Đổi mật khẩu</button>
      </div>
    </form>`);
}

async function resetTeacherPassword(e, id) {
  e.preventDefault();
  try {
    await dbResetTeacherPassword(id, document.getElementById("rp-password").value);
    showToast("Đã đổi mật khẩu — nhớ báo cho giáo viên");
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không đổi được mật khẩu"), "error");
  }
}

function confirmDeleteTeacher(id) {
  const t = getProfile(id);
  openConfirm(
    "Xóa giáo viên",
    `Xóa tài khoản giáo viên <b>${escapeHtml(t?.full_name || "")}</b>?<br>Lịch dạy và lịch sử lương của giáo viên này cũng bị xóa. Hành động không thể hoàn tác.`,
    async () => {
      await dbDeleteTeacher(id);
      showToast("Đã xóa giáo viên");
      renderPage("teachers");
    },
  );
}

// ---- Lương giáo viên ----

function openSalaryModal(teacherId) {
  const t = getProfile(teacherId);
  const history = getSalaryHistory(teacherId);
  const historyRows = history
    .map(
      (s, i) => `<tr>
        <td>${formatDate(s.effective_from)} ${i === 0 ? '<span class="badge badge-green">Hiện tại</span>' : ""}</td>
        <td>${SALARY_TYPE_LABELS[s.salary_type]}</td>
        <td>${salarySummary(s)}</td>
        <td>${escapeHtml(s.note || "")}</td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteSalary('${s.id}', '${teacherId}')"><i class="ti ti-trash"></i></button></td>
      </tr>`,
    )
    .join("");

  openModal(`Lương — ${escapeHtml(t?.full_name || "")}`, `
    ${
      history.length
        ? `<div class="table-wrap" style="margin-bottom:16px"><table>
            <thead><tr><th>Hiệu lực từ</th><th>Loại</th><th>Mức lương</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>${historyRows}</tbody></table></div>`
        : `<p class="login-hint" style="margin-bottom:14px">Chưa khởi tạo lương — thêm lần chốt lương đầu tiên bên dưới.</p>`
    }
    <form onsubmit="saveSalary(event, '${teacherId}')">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Loại lương *</label>
          <select class="form-control" id="sl-type" onchange="toggleSalaryFields()">
            <option value="fixed">Cố định (theo tháng)</option>
            <option value="per_session">Theo tiết</option>
            <option value="mixed">Cố định + theo tiết</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Hiệu lực từ *</label>
          ${dmyDateField("sl-from", todayStr())}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="sl-base-group">
          <label class="form-label">Lương cố định (đ/tháng) *</label>
          <input type="number" class="form-control" id="sl-base" min="0" step="1000" placeholder="5000000">
        </div>
        <div class="form-group" id="sl-per-group" style="display:none">
          <label class="form-label">Đơn giá mỗi tiết (đ) *</label>
          <input type="number" class="form-control" id="sl-per" min="0" step="1000" placeholder="200000">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ghi chú</label>
        <input type="text" class="form-control" id="sl-note" placeholder="VD: tăng lương theo thỏa thuận">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Đóng</button>
        <button type="submit" class="btn btn-primary"><i class="ti ti-plus"></i> Chốt lương mới</button>
      </div>
    </form>`);
}

function toggleSalaryFields() {
  const type = document.getElementById("sl-type").value;
  document.getElementById("sl-base-group").style.display =
    type === "fixed" || type === "mixed" ? "" : "none";
  document.getElementById("sl-per-group").style.display =
    type === "per_session" || type === "mixed" ? "" : "none";
}

async function saveSalary(e, teacherId) {
  e.preventDefault();
  const type = document.getElementById("sl-type").value;
  const base = document.getElementById("sl-base").value;
  const per = document.getElementById("sl-per").value;
  if ((type === "fixed" || type === "mixed") && !base) {
    showToast("Nhập lương cố định", "error");
    return;
  }
  if ((type === "per_session" || type === "mixed") && !per) {
    showToast("Nhập đơn giá mỗi tiết", "error");
    return;
  }
  if (!document.getElementById("sl-from").value) {
    showToast("Chọn ngày hiệu lực", "error");
    return;
  }
  try {
    await dbAddSalary({
      teacher_id: teacherId,
      salary_type: type,
      base_salary: type === "per_session" ? null : Number(base),
      per_session_amount: type === "fixed" ? null : Number(per),
      effective_from: document.getElementById("sl-from").value,
      note: document.getElementById("sl-note").value.trim() || null,
    });
    showToast("Đã chốt lương mới");
    openSalaryModal(teacherId);
    if (currentPage === "teachers") renderPage("teachers");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  }
}

async function deleteSalary(id, teacherId) {
  try {
    await dbDeleteSalary(id);
    showToast("Đã xóa lần chốt lương");
    openSalaryModal(teacherId);
    if (currentPage === "teachers") renderPage("teachers");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không xóa được"), "error");
  }
}

// ============================================================
// PAGE: SCHEDULE — Thời khóa biểu (tuần)
// ============================================================

let schedWeekStartDate = weekStart(new Date());
let schedBranchFilter = "";
let schedTeacherFilter = "";

function schedule() {
  const me = getCurrentUser();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(schedWeekStartDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const weekLabel = `${days[0].toLocaleDateString("vi-VN")} — ${days[6].toLocaleDateString("vi-VN")}`;

  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${schedBranchFilter === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  const teacherOptions = getTeachers(schedBranchFilter || null)
    .map((t) => `<option value="${t.id}" ${schedTeacherFilter === t.id ? "selected" : ""}>${escapeHtml(t.full_name)}</option>`)
    .join("");

  const adminToolbar = isAdmin()
    ? `
      <select class="form-control" onchange="schedBranchFilter=this.value; schedTeacherFilter=''; renderPage('schedule')">
        <option value="">Tất cả chi nhánh</option>${branchOptions}
      </select>
      <select class="form-control" onchange="schedTeacherFilter=this.value; renderPage('schedule')">
        <option value="">Tất cả giáo viên</option>${teacherOptions}
      </select>
      <button class="btn btn-outline" onclick="copyPrevWeek()"><i class="ti ti-copy"></i> Sao chép tuần trước</button>
      <button class="btn btn-primary" onclick="openScheduleModal()"><i class="ti ti-plus"></i> Thêm ca dạy</button>`
    : "";

  const dayCols = days
    .map((d) => {
      const dateStr = toDateStr(d);
      const isToday = dateStr === todayStr();
      let entries = getSchedulesOfDate(dateStr, isAdmin() ? schedTeacherFilter || null : me.id);
      if (isAdmin() && schedBranchFilter)
        entries = entries.filter((s) => s.branch_id === schedBranchFilter);
      const cards = entries.map((s) => scheduleEntryCard(s)).join("");
      return `
        <div class="day-col ${isToday ? "day-today" : ""}">
          <div class="day-head">
            <span>${WEEKDAYS[days.indexOf(d)]}</span>
            <span class="day-date">${d.getDate()}/${d.getMonth() + 1}</span>
          </div>
          <div class="day-body">
            ${cards || '<div class="day-empty">—</div>'}
            ${isAdmin() ? `<button class="day-add" onclick="openScheduleModal(null, '${dateStr}')"><i class="ti ti-plus"></i></button>` : ""}
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Thời khóa biểu</div>
        <div class="page-desc">${isAdmin() ? "Xếp lịch dạy theo từng ngày cho giáo viên" : "Lịch dạy của bạn — bấm Vào ca / Xong ca ngay trên ô lịch"}</div>
      </div>
    </div>
    <div class="sched-toolbar">
      <div class="sched-week-nav">
        <button class="btn btn-outline btn-sm btn-icon" onclick="schedShiftWeek(-1)"><i class="ti ti-chevron-left"></i></button>
        <span class="sched-week-label">${weekLabel}</span>
        <button class="btn btn-outline btn-sm btn-icon" onclick="schedShiftWeek(1)"><i class="ti ti-chevron-right"></i></button>
        <button class="btn btn-outline btn-sm" onclick="schedGoToday()">Tuần này</button>
      </div>
      ${adminToolbar}
    </div>
    <div class="week-grid">${dayCols}</div>`;
}

function scheduleEntryCard(s) {
  const st = SCHEDULE_STATUS[displayStatus(s)];
  const teacher = getProfile(s.teacher_id);
  let actions = "";
  if (isAdmin()) {
    actions = `
      <div class="entry-actions">
        <button onclick="openScheduleModal('${s.id}')" title="Sửa"><i class="ti ti-pencil"></i></button>
        <button onclick="confirmDeleteSchedule('${s.id}')" title="Xóa"><i class="ti ti-trash"></i></button>
      </div>`;
  } else if (s.sched_date === todayStr() && s.status === "scheduled") {
    actions = `<button class="btn btn-primary btn-sm entry-btn" onclick="checkIn('${s.id}')"><i class="ti ti-player-play"></i> Vào ca</button>`;
  } else if (s.status === "in_progress") {
    actions = `<button class="btn btn-primary btn-sm entry-btn" onclick="completeSession('${s.id}')"><i class="ti ti-flag-check"></i> Xong ca</button>`;
  }
  return `
    <div class="sched-entry st-${displayStatus(s)}">
      <div class="entry-time">${formatTime(s.start_time)} - ${formatTime(s.end_time)}</div>
      <div class="entry-subject">${escapeHtml(getSubject(s.subject_id)?.name || "?")}</div>
      ${isAdmin() ? `<div class="entry-teacher">${escapeHtml(teacher?.full_name || "?")}</div>` : ""}
      <div class="entry-branch">${escapeHtml(getBranch(s.branch_id)?.name || "")}</div>
      <span class="badge ${st.badge}">${st.label}</span>
      ${actions}
    </div>`;
}

function schedShiftWeek(dir) {
  const d = new Date(schedWeekStartDate);
  d.setDate(d.getDate() + dir * 7);
  schedWeekStartDate = d;
  renderPage("schedule");
}

function schedGoToday() {
  schedWeekStartDate = weekStart(new Date());
  renderPage("schedule");
}

function openScheduleModal(id, dateStr) {
  const s = id ? DB.schedules.find((x) => x.id === id) : null;
  if (!DB.branches.length) {
    showToast("Hãy tạo chi nhánh và môn học trước", "error");
    return;
  }
  const selectedBranch = s?.branch_id || schedBranchFilter || DB.branches[0].id;
  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${selectedBranch === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  openModal(s ? "Sửa ca dạy" : "Thêm ca dạy", `
    <form onsubmit="saveSchedule(event, '${id || ""}')">
      <div class="form-group">
        <label class="form-label">Chi nhánh *</label>
        <select class="form-control" id="sc-branch" onchange="schedModalBranchChanged()">${branchOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Môn học *</label>
          <select class="form-control" id="sc-subject" required></select>
        </div>
        <div class="form-group">
          <label class="form-label">Giáo viên *</label>
          <select class="form-control" id="sc-teacher" required></select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ngày dạy *</label>
        ${dmyDateField("sc-date", s?.sched_date || dateStr || todayStr())}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Giờ bắt đầu *</label>
          <input type="time" class="form-control" id="sc-start" required value="${s ? formatTime(s.start_time) : "18:00"}">
        </div>
        <div class="form-group">
          <label class="form-label">Giờ kết thúc *</label>
          <input type="time" class="form-control" id="sc-end" required value="${s ? formatTime(s.end_time) : "19:30"}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ghi chú</label>
        <input type="text" class="form-control" id="sc-note" value="${escapeHtml(s?.note || "")}" placeholder="VD: lớp Toán 6A">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary">${s ? "Lưu" : "Thêm"}</button>
      </div>
    </form>`);
  schedModalBranchChanged(s?.subject_id, s?.teacher_id);
}

function schedModalBranchChanged(subjectId, teacherId) {
  const branchId = document.getElementById("sc-branch").value;
  const subjects = getSubjectsOfBranch(branchId);
  const teachers = getTeachers(branchId);
  document.getElementById("sc-subject").innerHTML = subjects.length
    ? subjects
        .map((x) => `<option value="${x.id}" ${subjectId === x.id ? "selected" : ""}>${escapeHtml(x.name)}</option>`)
        .join("")
    : '<option value="">(chi nhánh chưa có môn học)</option>';
  document.getElementById("sc-teacher").innerHTML = teachers.length
    ? teachers
        .map((x) => `<option value="${x.id}" ${teacherId === x.id ? "selected" : ""}>${escapeHtml(x.full_name)}</option>`)
        .join("")
    : '<option value="">(chi nhánh chưa có giáo viên)</option>';
}

async function saveSchedule(e, id) {
  e.preventDefault();
  const start = document.getElementById("sc-start").value;
  const end = document.getElementById("sc-end").value;
  if (end <= start) {
    showToast("Giờ kết thúc phải sau giờ bắt đầu", "error");
    return;
  }
  const subjectId = document.getElementById("sc-subject").value;
  const teacherId = document.getElementById("sc-teacher").value;
  if (!subjectId || !teacherId) {
    showToast("Chi nhánh này chưa có môn học hoặc giáo viên", "error");
    return;
  }
  if (!document.getElementById("sc-date").value) {
    showToast("Chọn ngày dạy", "error");
    return;
  }
  const fields = {
    branch_id: document.getElementById("sc-branch").value,
    subject_id: subjectId,
    teacher_id: teacherId,
    sched_date: document.getElementById("sc-date").value,
    start_time: start,
    end_time: end,
    note: document.getElementById("sc-note").value.trim() || null,
  };
  try {
    if (id) {
      await dbUpdateSchedule(id, fields);
      showToast("Đã cập nhật ca dạy");
    } else {
      await dbAddSchedule(fields);
      showToast("Đã thêm ca dạy");
    }
    closeModal();
    renderPage("schedule");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  }
}

function confirmDeleteSchedule(id) {
  openConfirm("Xóa ca dạy", "Xóa ca dạy này khỏi thời khóa biểu?", async () => {
    await dbDeleteSchedule(id);
    showToast("Đã xóa ca dạy");
    renderPage("schedule");
  });
}

function copyPrevWeek() {
  const prevStart = new Date(schedWeekStartDate);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(prevStart);
    d.setDate(d.getDate() + i);
    prevDates.push(toDateStr(d));
  }
  let candidates = DB.schedules.filter((s) => prevDates.includes(s.sched_date));
  if (schedBranchFilter) candidates = candidates.filter((s) => s.branch_id === schedBranchFilter);
  if (!candidates.length) {
    showToast("Tuần trước không có ca dạy nào để sao chép", "error");
    return;
  }
  openConfirm(
    "Sao chép tuần trước",
    `Sao chép <b>${candidates.length}</b> ca dạy của tuần trước sang tuần này? Ca trùng (cùng giáo viên, ngày, giờ bắt đầu) sẽ được bỏ qua.`,
    async () => {
      let copied = 0;
      for (const s of candidates) {
        const d = new Date(s.sched_date + "T00:00:00");
        d.setDate(d.getDate() + 7);
        const newDate = toDateStr(d);
        const dup = DB.schedules.some(
          (x) =>
            x.teacher_id === s.teacher_id &&
            x.sched_date === newDate &&
            x.start_time === s.start_time,
        );
        if (dup) continue;
        await dbAddSchedule({
          branch_id: s.branch_id,
          subject_id: s.subject_id,
          teacher_id: s.teacher_id,
          sched_date: newDate,
          start_time: s.start_time,
          end_time: s.end_time,
          note: s.note,
        });
        copied++;
      }
      showToast(`Đã sao chép ${copied} ca dạy`);
      renderPage("schedule");
    },
  );
}

// ============================================================
// PAGE: REPORT — Báo cáo lương & chuyên cần dạy
// ============================================================

let reportMonth = new Date().getMonth() + 1;
let reportYear = new Date().getFullYear();
let reportBranchFilter = "";

function report() {
  const me = getCurrentUser();
  const teachers = isAdmin() ? getTeachers(reportBranchFilter || null) : [getProfile(me.id)];

  let grandTotal = 0;
  let hasMissingRate = false;
  const rows = teachers
    .filter(Boolean)
    .map((t) => {
      const r = calcTeacherSalary(t.id, reportMonth, reportYear);
      if (r.total != null) grandTotal += r.total;
      else hasMissingRate = true;
      return `<tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px">
            <span class="avatar">${escapeHtml(initials(t.full_name))}</span>
            <b>${escapeHtml(t.full_name || "?")}</b>
          </div>
        </td>
        <td>${escapeHtml(getBranch(t.branch_id)?.name || "—")}</td>
        <td>${r.rate ? `<span class="badge badge-blue">${SALARY_TYPE_LABELS[r.rate.salary_type]}</span>` : '<span class="badge badge-gray">Chưa chốt lương</span>'}</td>
        <td>${r.rate ? salarySummary(r.rate) : "—"}</td>
        <td>${r.assigned}</td>
        <td><span class="badge badge-green">${r.completed}</span></td>
        <td>${r.missed ? `<span class="badge badge-red">${r.missed}</span>` : "0"}</td>
        <td><b>${r.total == null ? "—" : formatMoney(r.total)}</b></td>
      </tr>`;
    })
    .join("");

  const monthOptions = MONTHS.map(
    (m) => `<option value="${m}" ${m === reportMonth ? "selected" : ""}>Tháng ${m}</option>`,
  ).join("");
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];
  const yearOptions = years
    .map((y) => `<option value="${y}" ${y === reportYear ? "selected" : ""}>${y}</option>`)
    .join("");
  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${reportBranchFilter === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Báo cáo tháng ${reportMonth}/${reportYear}</div>
        <div class="page-desc">Số ca dạy và lương ${isAdmin() ? "của từng giáo viên" : "của bạn"} — ca <b>Đã dạy</b> là ca giáo viên đã bấm "Xong ca"</div>
      </div>
    </div>
    <div class="filter-bar">
      <select class="form-control" style="max-width:130px" onchange="reportMonth=Number(this.value); renderPage('report')">${monthOptions}</select>
      <select class="form-control" style="max-width:110px" onchange="reportYear=Number(this.value); renderPage('report')">${yearOptions}</select>
      ${
        isAdmin()
          ? `<select class="form-control" style="max-width:240px" onchange="reportBranchFilter=this.value; renderPage('report')">
              <option value="">Tất cả chi nhánh</option>${branchOptions}
            </select>`
          : ""
      }
    </div>
    <div class="card">
      ${
        rows
          ? `<div class="table-wrap"><table>
              <thead><tr>
                <th>Giáo viên</th><th>Chi nhánh</th><th>Loại lương</th><th>Mức lương</th>
                <th>Ca xếp</th><th>Đã dạy</th><th>Không dạy</th><th>Lương tháng</th>
              </tr></thead>
              <tbody>${rows}</tbody>
              ${
                isAdmin()
                  ? `<tfoot><tr>
                      <td colspan="7" style="text-align:right"><b>Tổng chi lương &nbsp;&nbsp;&nbsp; ${hasMissingRate ? " (chưa gồm GV chưa chốt lương)" : ""}</b></td>
                      <td><b>${formatMoney(grandTotal)}</b></td>
                    </tr></tfoot>`
                  : ""
              }
            </table></div>`
          : `<div class="empty-state"><i class="ti ti-chart-bar"></i><p>Chưa có giáo viên nào</p></div>`
      }
    </div>
    <div class="card" style="padding:14px 18px">
      <div class="card-subtitle">
        Cách tính: lương <b>cố định</b> nhận nguyên mức theo tháng; lương <b>theo tiết</b> = đơn giá × số ca <b>Đã dạy</b>;
        lương <b>hỗn hợp</b> = cố định + theo tiết. Mức lương lấy theo lần chốt gần nhất tính đến cuối tháng.
        Ca không được cập nhật "Xong ca" trước khi qua ngày được tính là <b>không dạy</b>.
      </div>
    </div>`;
}

// ============================================================
// PAGE: ACCOUNT — Tài khoản của tôi
// ============================================================

function account() {
  const me = getCurrentUser();
  const roleLabel = isAdmin() ? "Quản trị viên" : "Giáo viên";
  return `
    <div class="card">
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:14px">
          <span class="avatar" style="width:44px;height:44px;font-size:16px">${escapeHtml(initials(me.full_name))}</span>
          <div>
            <div class="card-title">${escapeHtml(me.full_name || "(chưa đặt tên)")}</div>
            <div class="card-subtitle">${escapeHtml(me.email || "")} · <span class="badge ${isAdmin() ? "badge-blue" : "badge-green"}">${roleLabel}</span>
            ${!isAdmin() && me.branch_id ? " · " + escapeHtml(getBranch(me.branch_id)?.name || "") : ""}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="handleLogout()"><i class="ti ti-logout-2"></i> Đăng xuất</button>
      </div>
    </div>

    <div class="card" style="padding:18px">
      <div class="card-title" style="margin-bottom:14px">Thông tin cá nhân</div>
      <form onsubmit="saveMyProfile(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Họ tên</label>
            <input type="text" class="form-control" id="ac-name" required value="${escapeHtml(me.full_name || "")}">
          </div>
          <div class="form-group">
            <label class="form-label">Số điện thoại</label>
            <input type="tel" class="form-control" id="ac-phone" value="${escapeHtml(me.phone || "")}" ${phoneInputAttrs()}>
          </div>
        </div>
        <div class="form-actions" style="justify-content:flex-start">
          <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy"></i> Lưu thông tin</button>
        </div>
      </form>
    </div>

    <div class="card" style="padding:18px">
      <div class="card-title" style="margin-bottom:14px">Đổi mật khẩu</div>
      <form onsubmit="saveMyPassword(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mật khẩu mới</label>
            <input type="password" class="form-control" id="ac-pass1" required minlength="6" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">Nhập lại mật khẩu mới</label>
            <input type="password" class="form-control" id="ac-pass2" required minlength="6" autocomplete="new-password">
          </div>
        </div>
        <div class="form-actions" style="justify-content:flex-start">
          <button type="submit" class="btn btn-primary"><i class="ti ti-key"></i> Đổi mật khẩu</button>
        </div>
      </form>
    </div>`;
}

async function saveMyProfile(e) {
  e.preventDefault();
  try {
    await dbUpdateProfile(getCurrentUser().id, {
      full_name: document.getElementById("ac-name").value.trim(),
      phone: readPhoneField("ac-phone"),
    });
    showToast("Đã lưu thông tin");
    renderPage("account");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được"), "error");
  }
}

async function saveMyPassword(e) {
  e.preventDefault();
  const p1 = document.getElementById("ac-pass1").value;
  const p2 = document.getElementById("ac-pass2").value;
  if (p1 !== p2) {
    showToast("Mật khẩu nhập lại không khớp", "error");
    return;
  }
  try {
    await changeMyPassword(p1);
    showToast("Đã đổi mật khẩu");
    document.getElementById("ac-pass1").value = "";
    document.getElementById("ac-pass2").value = "";
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không đổi được mật khẩu"), "error");
  }
}

// ============================================================
// MODAL / CONFIRM / TOAST
// ============================================================

function openModal(title, body) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modalOverlay").classList.add("open");
  setTimeout(() => {
    if (isMobile()) return;
    document.querySelector("#modalBody input, #modalBody select, #modalBody textarea")?.focus();
  }, 250);
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  document.activeElement?.blur();
}

let _confirmCallback = null;

function openConfirm(title, message, onConfirm) {
  _confirmCallback = onConfirm;
  openModal(title, `
    <p style="font-size:13.5px; line-height:1.7">${message}</p>
    <div class="form-actions">
      <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
      <button type="button" class="btn btn-danger" id="confirm-btn" onclick="runConfirm()">Xác nhận</button>
    </div>`);
}

async function runConfirm() {
  const btn = document.getElementById("confirm-btn");
  if (btn) btn.disabled = true;
  try {
    await _confirmCallback?.();
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Thao tác thất bại"), "error");
    if (btn) btn.disabled = false;
  }
}

let toastTimer;
function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  const toastType = type || (String(msg).startsWith("Lỗi") ? "error" : "success");
  el.className = `toast ${toastType}`;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => el.classList.add("show"));
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}
