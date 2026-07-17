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

// ---- MONEY FIELD (hiển thị dấu chấm phân cách hàng nghìn, lưu số nguyên) ----
function formatMoneyInputValue(value) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

function moneyInput(el) {
  const original = el.value;
  const caret = el.selectionStart ?? original.length;
  const digitsBeforeCaret = original.slice(0, caret).replace(/\D/g, "").length;
  el.value = formatMoneyInputValue(original);
  let pos = 0;
  let seen = 0;
  while (pos < el.value.length && seen < digitsBeforeCaret) {
    if (/\d/.test(el.value[pos])) seen++;
    pos++;
  }
  try { el.setSelectionRange(pos, pos); } catch (_) {}
}

function readMoneyInput(inputOrId) {
  const el = typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
  const digits = String(el?.value || "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
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

function toggleReportNav() {
  document.getElementById("reportNavGroup")?.classList.toggle("open");
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
  "report-branch": "Báo cáo theo chi nhánh",
  "report-teacher": "Báo cáo theo giáo viên",
  "salary-adjustments": "Phụ cấp & khấu trừ",
  "report-salary": "Báo cáo lương",
  account: "Tài khoản",
};

const ADMIN_ONLY_PAGES = ["branches", "teachers", "salary-adjustments", "report-branch"];

function renderPage(page) {
  if (!getCurrentUser()) {
    showLoginPage();
    return;
  }
  document.getElementById("moreDrawer")?.classList.remove("open");
  document.getElementById("moreDrawerOverlay")?.classList.remove("show");

  if (page === "report") page = isAdmin() ? "report-branch" : "report-teacher";
  if (page === "report-adjustments") page = "salary-adjustments";

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
  const reportPages = ["report-branch", "report-teacher", "report-salary"];
  const reportNavGroup = document.getElementById("reportNavGroup");
  reportNavGroup?.classList.toggle("active", reportPages.includes(page));
  if (reportPages.includes(page)) reportNavGroup?.classList.add("open");
  const morePages = ["branches", "teachers", "salary-adjustments", "account"];
  document.querySelectorAll(".bottom-nav-item").forEach((n) => {
    n.classList.toggle(
      "active",
      n.dataset.page === page ||
        (n.dataset.page === "report" && reportPages.includes(page)) ||
        (n.dataset.page === "more" && morePages.includes(page)),
    );
  });

  const el = document.getElementById("pageContent");
  el.innerHTML = "";
  const pages = {
    dashboard, branches, teachers, schedule, account,
    "report-branch": () => report("branch"),
    "report-teacher": () => report("teacher"),
    "salary-adjustments": salaryAdjustmentsPage,
    "report-salary": () => report("salary"),
  };
  const fn = pages[page];
  el.innerHTML = fn ? fn() : `<div class="empty-state"><p>Không tìm thấy trang</p></div>`;

  if (page === "schedule" && !isAdmin()) maybeShowTodayScheduleNotice();
}

let scheduleNoticeCheckId = 0;

async function maybeShowTodayScheduleNotice() {
  const checkId = ++scheduleNoticeCheckId;
  const me = getCurrentUser();
  if (!me || isAdmin()) return;

  const noticeDate = todayStr();
  const sessions = getSchedulesOfDate(noticeDate, me.id);
  if (!sessions.length) return;

  try {
    if (await dbHasAcknowledgedScheduleNotice(noticeDate)) return;
  } catch (err) {
    // Vẫn nhắc lịch nếu chưa kiểm tra được server để tránh giáo viên bỏ sót ca.
    console.warn("Không kiểm tra được trạng thái nhắc lịch", err);
  }
  if (checkId !== scheduleNoticeCheckId || currentPage !== "schedule") return;
  if (getCurrentUser()?.id !== me.id) return;

  const sessionItems = sessions
    .map((session) => {
      const subject = getSubject(session.subject_id)?.name || "Ca dạy";
      const branch = getBranch(session.branch_id)?.name || "";
      return `<div class="schedule-notice-item">
        <div class="schedule-notice-time">${formatTime(session.start_time)} – ${formatTime(session.end_time)}</div>
        <div class="schedule-notice-info">
          <b>${escapeHtml(subject)}</b>
          ${branch ? `<span>${escapeHtml(branch)}</span>` : ""}
        </div>
      </div>`;
    })
    .join("");

  openModal(
    "Nhắc lịch dạy hôm nay",
    `<div class="schedule-notice">
      <div class="schedule-notice-intro">
        <i class="ti ti-bell-ringing"></i>
        <p>Bạn có <b>${sessions.length} ca dạy</b> ngày hôm nay:</p>
      </div>
      <div class="schedule-notice-list">${sessionItems}</div>
      <div class="form-actions schedule-notice-actions">
        <button type="button" class="btn btn-primary" id="schedule-notice-ack-btn" onclick="acknowledgeTodayScheduleNotice()">
          <i class="ti ti-check"></i> Đã hiểu
        </button>
      </div>
    </div>`,
  );
}

async function acknowledgeTodayScheduleNotice() {
  const btn = document.getElementById("schedule-notice-ack-btn");
  if (btn) btn.disabled = true;
  try {
    await dbAcknowledgeScheduleNotice(todayStr());
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Chưa lưu được xác nhận. Vui lòng thử lại.", "error");
    if (btn) btn.disabled = false;
  }
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
          <span class="logo-image"><img src="assets/tnl-logo.jpg" alt="Logo TNL"></span>
          <div>
            <div class="login-title">EduTrack</div>
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

  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const sessionsByTeacher = new Map();
  todaySessions.forEach((session) => {
    if (!sessionsByTeacher.has(session.teacher_id)) sessionsByTeacher.set(session.teacher_id, []);
    sessionsByTeacher.get(session.teacher_id).push(session);
  });
  const teachersToday = Array.from(sessionsByTeacher.entries())
    .map(([teacherId, sessions]) => ({
      teacher: getProfile(teacherId),
      sessions,
    }))
    .sort((a, b) => (a.teacher?.full_name || "").localeCompare(b.teacher?.full_name || "", "vi"));
  const checkedInTeachers = teachersToday.filter(({ sessions }) =>
    sessions.some((s) => s.status === "in_progress" || s.status === "completed"),
  ).length;

  const attendanceRows = teachersToday
    .map(({ teacher, sessions }) => {
      const checkedIn = sessions.filter((s) => s.status === "in_progress" || s.status === "completed").length;
      const completed = sessions.filter((s) => s.status === "completed").length;
      const inProgress = sessions.some((s) => s.status === "in_progress");
      const late = sessions.filter(
        (s) => s.status === "scheduled" && s.start_time.slice(0, 5) <= currentTime,
      ).length;
      let status = { label: "Chờ vào ca", badge: "badge-gray" };
      if (inProgress) status = { label: "Đang dạy", badge: "badge-warn" };
      else if (late) status = { label: `Chưa vào ca (${late} ca)`, badge: "badge-red" };
      else if (completed === sessions.length) status = { label: "Đã hoàn thành", badge: "badge-green" };
      else if (completed) status = { label: "Chờ ca tiếp theo", badge: "badge-gray" };

      const timeSlots = sessions
        .map((s) => `${formatTime(s.start_time)}–${formatTime(s.end_time)}`)
        .join(", ");
      const branchNames = [...new Set(sessions.map((s) => getBranch(s.branch_id)?.name || "?"))].join(", ");
      return `<tr>
        <td><b>${escapeHtml(teacher?.full_name || "?")}</b></td>
        <td>${escapeHtml(timeSlots)}</td>
        <td><b>${checkedIn}/${sessions.length}</b></td>
        <td><span class="badge badge-green">${completed}</span></td>
        <td>${escapeHtml(branchNames)}</td>
        <td><span class="badge ${status.badge}">${status.label}</span></td>
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
        <div class="stat-icon"><i class="ti ti-login-2"></i></div>
        <div><div class="stat-label">Giáo viên đã vào ca</div><div class="stat-value">${checkedInTeachers}</div>
        <div class="stat-sub">${checkedInTeachers}/${teachersToday.length} giáo viên có lịch hôm nay</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Lương tháng ${month} (dự kiến)</div><div class="stat-value" style="font-size:20px">${formatMoney(salaryTotal)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Theo dõi vào ca hôm nay</div>
          <div class="card-subtitle">Cập nhật theo thao tác Vào ca và Xong ca của giáo viên · ${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="renderPage('schedule')"><i class="ti ti-calendar-time"></i> Xem thời khóa biểu</button>
      </div>
      ${
        teachersToday.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Giáo viên</th><th>Khung giờ</th><th>Đã vào ca</th><th>Hoàn thành</th><th>Chi nhánh</th><th>Trạng thái hiện tại</th></tr></thead>
              <tbody>${attendanceRows}</tbody></table></div>`
          : `<div class="empty-state"><i class="ti ti-user-check"></i><p>Hôm nay chưa có giáo viên nào được xếp ca</p></div>`
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
  const branchLabel = getTeacherBranches(me.id).map((b) => b.name).join(" · ");

  const rows = todaySessions.map((s) => teacherSessionCard(s)).join("");

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Xin chào, ${escapeHtml(me.full_name || "Giáo viên")} 👋</div>
          <div class="card-subtitle">${escapeHtml(branchLabel || "Chưa được gán chi nhánh")}</div>
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
          <input type="text" class="form-control money-input" id="subj-fee" inputmode="numeric" autocomplete="off" oninput="moneyInput(this)" placeholder="500.000">
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
  const fee = readMoneyInput("subj-fee");
  try {
    await dbAddSubject(branchId, name, fee);
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
          <input type="text" class="form-control money-input" id="subj-edit-fee" inputmode="numeric" autocomplete="off" oninput="moneyInput(this)" value="${formatMoneyInputValue(s?.fee)}" placeholder="500.000">
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
  const fee = readMoneyInput("subj-edit-fee");
  try {
    await dbUpdateSubject(id, {
      name: document.getElementById("subj-edit-name").value.trim(),
      fee,
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
        <td>${getTeacherBranches(t.id).length
          ? getTeacherBranches(t.id).map((b) => `<span class="badge badge-gray">${escapeHtml(b.name)}</span>`).join(" ")
          : "—"}</td>
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
        <div class="page-desc">Cấp tài khoản, gán nhiều chi nhánh và khởi tạo lương cho giáo viên</div>
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
  const selectedBranchIds = new Set(t ? getTeacherBranchIds(t.id) : []);
  const branchOptions = DB.branches
    .map((b, index) => `<label class="choice-chip">
      <input type="checkbox" name="tc-branch" value="${b.id}" ${selectedBranchIds.has(b.id) || (!t && index === 0) ? "checked" : ""}>
      <span>${escapeHtml(b.name)}</span>
    </label>`)
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
      </div>
      <div class="form-group">
        <label class="form-label">Chi nhánh giảng dạy * <span class="form-hint">(có thể chọn nhiều)</span></label>
        <div class="choice-grid">${branchOptions}</div>
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
    const branchIds = [...document.querySelectorAll('input[name="tc-branch"]:checked')].map((x) => x.value);
    if (!branchIds.length) throw new Error("Chọn ít nhất một chi nhánh");
    if (id) {
      await dbSetTeacherBranches(id, branchIds);
      await dbUpdateProfile(id, {
        full_name: document.getElementById("tc-name").value.trim(),
        phone,
        branch_id: branchIds[0],
      });
      showToast("Đã cập nhật giáo viên");
    } else {
      await dbCreateTeacher({
        email: document.getElementById("tc-email").value.trim(),
        password: document.getElementById("tc-password").value,
        full_name: document.getElementById("tc-name").value.trim(),
        phone,
        branch_ids: branchIds,
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
          <input type="text" class="form-control money-input" id="sl-base" inputmode="numeric" autocomplete="off" oninput="moneyInput(this)" placeholder="5.000.000">
        </div>
        <div class="form-group" id="sl-per-group" style="display:none">
          <label class="form-label">Đơn giá mỗi tiết (đ) *</label>
          <input type="text" class="form-control money-input" id="sl-per" inputmode="numeric" autocomplete="off" oninput="moneyInput(this)" placeholder="200.000">
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
  const base = readMoneyInput("sl-base");
  const per = readMoneyInput("sl-per");
  if ((type === "fixed" || type === "mixed") && base == null) {
    showToast("Nhập lương cố định", "error");
    return;
  }
  if ((type === "per_session" || type === "mixed") && per == null) {
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
      base_salary: type === "per_session" ? null : base,
      per_session_amount: type === "fixed" ? null : per,
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
  const referenceDate = s?.sched_date || dateStr || toDateStr(schedWeekStartDate);
  const referenceDay = new Date(referenceDate + "T00:00:00").getDay();
  const defaultWeekday = referenceDay === 0 ? 6 : referenceDay - 1;
  const weekdayPicker = s
    ? ""
    : `<div class="form-group">
        <label class="form-label">Các ngày cần tạo trong tuần *</label>
        <div class="choice-grid weekday-picker">
          ${WEEKDAYS.map((label, index) => `<label class="choice-chip">
            <input type="checkbox" name="sc-weekday" value="${index}" ${index === defaultWeekday ? "checked" : ""}>
            <span>${label}</span>
          </label>`).join("")}
        </div>
        <div class="form-hint">Ví dụ: chọn Thứ 3 và Thứ 5 để tạo hai ca cùng lúc trong tuần.</div>
      </div>`;
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
        <label class="form-label">${s ? "Ngày dạy" : "Tuần áp dụng (chọn một ngày trong tuần)"} *</label>
        ${dmyDateField("sc-date", referenceDate)}
      </div>
      ${weekdayPicker}
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
  const dateValue = document.getElementById("sc-date").value;
  if (!dateValue) {
    showToast("Chọn ngày dạy", "error");
    return;
  }
  const commonFields = {
    branch_id: document.getElementById("sc-branch").value,
    subject_id: subjectId,
    teacher_id: teacherId,
    start_time: start,
    end_time: end,
    note: document.getElementById("sc-note").value.trim() || null,
  };
  try {
    if (id) {
      await dbUpdateSchedule(id, { ...commonFields, sched_date: dateValue });
      showToast("Đã cập nhật ca dạy");
    } else {
      const weekdayIndexes = [...document.querySelectorAll('input[name="sc-weekday"]:checked')]
        .map((x) => Number(x.value));
      if (!weekdayIndexes.length) {
        showToast("Chọn ít nhất một ngày trong tuần", "error");
        return;
      }
      const firstDay = weekStart(new Date(dateValue + "T00:00:00"));
      const items = weekdayIndexes.map((dayIndex) => {
        const d = new Date(firstDay);
        d.setDate(d.getDate() + dayIndex);
        return { ...commonFields, sched_date: toDateStr(d) };
      });
      const added = await dbAddSchedules(items);
      const skipped = items.length - added.length;
      showToast(`Đã thêm ${added.length} ca dạy${skipped ? `, bỏ qua ${skipped} ca trùng` : ""}`);
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
let reportTeacherBranchFilters = null; // null = tất cả; [] = chưa chọn chi nhánh nào
let reportTeacherNameFilter = "";

const REPORT_VIEW_LABELS = {
  branch: "Theo chi nhánh",
  teacher: "Theo giáo viên",
  salary: "Báo cáo lương",
};

function reportViewTabs(activeView) {
  return [
    ...(isAdmin() ? [{ page: "report-branch", view: "branch", icon: "building-community" }] : []),
    { page: "report-teacher", view: "teacher", icon: "user-check" },
    { page: "report-salary", view: "salary", icon: "coin" },
  ].map((item) => `<button class="btn btn-sm ${activeView === item.view ? "btn-primary" : "btn-outline"}" onclick="renderPage('${item.page}')">
    <i class="ti ti-${item.icon}"></i> ${REPORT_VIEW_LABELS[item.view]}
  </button>`).join("");
}

function reportPeriodOptions(selectedMonth, selectedYear) {
  const monthOptions = MONTHS.map(
    (m) => `<option value="${m}" ${m === selectedMonth ? "selected" : ""}>Tháng ${m}</option>`,
  ).join("");
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear - 2, thisYear - 1, thisYear, thisYear + 1, selectedYear])].sort();
  const yearOptions = years
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");
  return { monthOptions, yearOptions };
}

function normalizeAdjustmentSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatAdjustmentDelta(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount);
}

function salaryAdjustmentsPage() {
  const teachers = getTeachers(reportBranchFilter || null);
  const { monthOptions, yearOptions } = reportPeriodOptions(reportMonth, reportYear);
  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${reportBranchFilter === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  let totalAllowance = 0;
  let totalDeduction = 0;
  const rows = teachers.map((teacher) => {
    const adjustment = getMonthlySalaryAdjustment(teacher.id, reportMonth, reportYear);
    const allowance = Number(adjustment?.allowance || 0);
    const deduction = Number(adjustment?.deduction || 0);
    const net = allowance - deduction;
    totalAllowance += allowance;
    totalDeduction += deduction;
    const branches = getTeacherBranches(teacher.id).map((b) => b.name).join(", ") || "—";
    const searchValue = normalizeAdjustmentSearch(`${teacher.full_name || ""} ${teacher.email || ""} ${branches}`);
    return `<tr data-adjustment-row data-teacher-id="${teacher.id}" data-search="${escapeHtml(searchValue)}">
      <td data-label="Giáo viên">
        <div class="adjustment-teacher">
          <span class="avatar">${escapeHtml(initials(teacher.full_name))}</span>
          <div><b>${escapeHtml(teacher.full_name || "?")}</b><span>${escapeHtml(teacher.email || "")}</span></div>
        </div>
      </td>
      <td data-label="Chi nhánh"><span class="adjustment-branches">${escapeHtml(branches)}</span></td>
      <td data-label="Phụ cấp">
        <div class="adjustment-money-field is-allowance"><span>+</span><input class="money-input" data-field="allowance" type="text" inputmode="numeric" autocomplete="off" value="${formatMoneyInputValue(allowance)}" oninput="moneyInput(this); updateSalaryAdjustmentPreview()" aria-label="Phụ cấp của ${escapeHtml(teacher.full_name || "giáo viên")}"><small>đ</small></div>
      </td>
      <td data-label="Khấu trừ">
        <div class="adjustment-money-field is-deduction"><span>−</span><input class="money-input" data-field="deduction" type="text" inputmode="numeric" autocomplete="off" value="${formatMoneyInputValue(deduction)}" oninput="moneyInput(this); updateSalaryAdjustmentPreview()" aria-label="Khấu trừ của ${escapeHtml(teacher.full_name || "giáo viên")}"><small>đ</small></div>
      </td>
      <td data-label="Chênh lệch"><b class="adjustment-net ${net > 0 ? "color-green" : net < 0 ? "color-red" : ""}" data-field="net">${formatAdjustmentDelta(net)}</b></td>
    </tr>`;
  }).join("");
  const totalNet = totalAllowance - totalDeduction;

  return `
    <div class="page-header adjustment-page-header">
      <div>
        <div class="page-title">Phụ cấp & khấu trừ</div>
        <div class="page-desc">Khai báo các khoản phát sinh theo từng giáo viên trước khi xem báo cáo lương.</div>
      </div>
      <button class="btn btn-outline" onclick="openSalaryAdjustmentCopyModal()"><i class="ti ti-copy"></i> Sao chép từ tháng khác</button>
    </div>

    <div class="adjustment-period-card">
      <div class="adjustment-period-title"><span><i class="ti ti-calendar-dollar"></i></span><div><b>Kỳ lương đang khai báo</b><small>Chọn tháng, năm và phạm vi giáo viên</small></div></div>
      <div class="adjustment-period-controls">
        <label><span>Tháng</span><select class="form-control" onchange="reportMonth=Number(this.value); renderPage(currentPage)">${monthOptions}</select></label>
        <label><span>Năm</span><select class="form-control" onchange="reportYear=Number(this.value); renderPage(currentPage)">${yearOptions}</select></label>
        <label class="adjustment-branch-filter"><span>Chi nhánh</span><select class="form-control" onchange="reportBranchFilter=this.value; renderPage(currentPage)"><option value="">Tất cả chi nhánh</option>${branchOptions}</select></label>
      </div>
    </div>

    <form class="adjustment-form" onsubmit="saveSalaryAdjustments(event)">
      <div class="card adjustment-editor-card">
        <div class="adjustment-editor-head">
          <div><div class="card-title">Danh sách giáo viên · Tháng ${reportMonth}/${reportYear}</div><div class="card-subtitle" id="adjustment-visible-count">${teachers.length} giáo viên</div></div>
          ${teachers.length ? `<div class="search-wrap adjustment-search"><i class="ti ti-search"></i><input class="search-input" type="search" placeholder="Tìm tên, email hoặc chi nhánh..." oninput="filterSalaryAdjustmentRows(this.value)" onkeydown="if(event.key==='Enter') event.preventDefault()"></div>` : ""}
        </div>

        <div class="adjustment-summary-strip">
          <div><span>Tổng phụ cấp</span><b class="color-green" id="adjustment-total-allowance">${formatAdjustmentDelta(totalAllowance)}</b></div>
          <div><span>Tổng khấu trừ</span><b class="color-red" id="adjustment-total-deduction">${totalDeduction ? `-${formatMoney(totalDeduction)}` : formatMoney(0)}</b></div>
          <div><span>Chênh lệch kỳ lương</span><b id="adjustment-total-net" class="${totalNet > 0 ? "color-green" : totalNet < 0 ? "color-red" : ""}">${formatAdjustmentDelta(totalNet)}</b></div>
        </div>

        ${rows ? `<div class="table-wrap adjustment-table-wrap"><table class="adjustment-table">
          <thead><tr><th>Giáo viên</th><th>Chi nhánh</th><th>Phụ cấp</th><th>Khấu trừ</th><th>Chênh lệch</th></tr></thead>
          <tbody>${rows}</tbody>
        </table><div class="adjustment-search-empty" id="adjustment-search-empty" hidden><i class="ti ti-search-off"></i><span>Không tìm thấy giáo viên phù hợp</span></div></div>` : `<div class="empty-state"><i class="ti ti-users"></i><p>Chưa có giáo viên trong chi nhánh đã chọn</p></div>`}

        ${rows ? `<div class="adjustment-save-bar"><div><i class="ti ti-info-circle"></i><span>Số tiền đã lưu sẽ tự động được dùng trong báo cáo lương tháng ${reportMonth}.</span></div><button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy"></i> Lưu thay đổi</button></div>` : ""}
      </div>
    </form>`;
}

function updateSalaryAdjustmentPreview() {
  let totalAllowance = 0;
  let totalDeduction = 0;
  document.querySelectorAll("[data-adjustment-row]").forEach((row) => {
    const allowance = readMoneyInput(row.querySelector('[data-field="allowance"]')) || 0;
    const deduction = readMoneyInput(row.querySelector('[data-field="deduction"]')) || 0;
    const net = allowance - deduction;
    totalAllowance += allowance;
    totalDeduction += deduction;
    const netEl = row.querySelector('[data-field="net"]');
    netEl.textContent = formatAdjustmentDelta(net);
    netEl.className = `adjustment-net ${net > 0 ? "color-green" : net < 0 ? "color-red" : ""}`;
  });
  const totalNet = totalAllowance - totalDeduction;
  document.getElementById("adjustment-total-allowance").textContent = formatAdjustmentDelta(totalAllowance);
  document.getElementById("adjustment-total-deduction").textContent = totalDeduction ? `-${formatMoney(totalDeduction)}` : formatMoney(0);
  const netEl = document.getElementById("adjustment-total-net");
  netEl.textContent = formatAdjustmentDelta(totalNet);
  netEl.className = totalNet > 0 ? "color-green" : totalNet < 0 ? "color-red" : "";
}

function filterSalaryAdjustmentRows(value) {
  const query = normalizeAdjustmentSearch(value);
  const rows = [...document.querySelectorAll("[data-adjustment-row]")];
  let visible = 0;
  rows.forEach((row) => {
    const show = !query || row.dataset.search.includes(query);
    row.classList.toggle("is-hidden", !show);
    if (show) visible++;
  });
  const countEl = document.getElementById("adjustment-visible-count");
  if (countEl) countEl.textContent = query ? `${visible}/${rows.length} giáo viên` : `${rows.length} giáo viên`;
  const emptyEl = document.getElementById("adjustment-search-empty");
  if (emptyEl) emptyEl.hidden = visible !== 0;
}

async function saveSalaryAdjustments(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  if (submitButton) submitButton.disabled = true;
  const items = [...e.currentTarget.querySelectorAll("[data-adjustment-row]")].map((row) => ({
    teacher_id: row.dataset.teacherId,
    allowance: readMoneyInput(row.querySelector('[data-field="allowance"]')) || 0,
    deduction: readMoneyInput(row.querySelector('[data-field="deduction"]')) || 0,
  }));
  if (items.some((item) => item.allowance < 0 || item.deduction < 0)) {
    showToast("Phụ cấp và khấu trừ không được là số âm", "error");
    if (submitButton) submitButton.disabled = false;
    return;
  }
  try {
    await dbSaveMonthlySalaryAdjustments(reportMonth, reportYear, items);
    showToast(`Đã lưu khai báo tháng ${reportMonth}/${reportYear}`);
    renderPage("salary-adjustments");
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không lưu được khai báo"), "error");
    if (submitButton) submitButton.disabled = false;
  }
}

function openSalaryAdjustmentCopyModal() {
  const nextMonth = reportMonth === 12 ? 1 : reportMonth + 1;
  const nextYear = reportMonth === 12 ? reportYear + 1 : reportYear;
  const sourceOptions = reportPeriodOptions(reportMonth, reportYear);
  const targetOptions = reportPeriodOptions(nextMonth, nextYear);
  openModal("Sao chép phụ cấp & khấu trừ", `
    <form onsubmit="copySalaryAdjustments(event)">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Từ tháng</label><select id="adjustment-copy-from-month" class="form-control">${sourceOptions.monthOptions}</select></div>
        <div class="form-group"><label class="form-label">Năm</label><select id="adjustment-copy-from-year" class="form-control">${sourceOptions.yearOptions}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sang tháng</label><select id="adjustment-copy-to-month" class="form-control">${targetOptions.monthOptions}</select></div>
        <div class="form-group"><label class="form-label">Năm</label><select id="adjustment-copy-to-year" class="form-control">${targetOptions.yearOptions}</select></div>
      </div>
      <div class="report-history-note"><i class="ti ti-info-circle"></i><span>Dữ liệu của các giáo viên có trong tháng nguồn sẽ ghi đè lên dữ liệu tương ứng ở tháng đích.</span></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary"><i class="ti ti-copy"></i> Sao chép</button>
      </div>
    </form>`);
}

async function copySalaryAdjustments(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  if (submitButton) submitButton.disabled = true;
  const fromMonth = Number(document.getElementById("adjustment-copy-from-month").value);
  const fromYear = Number(document.getElementById("adjustment-copy-from-year").value);
  const toMonth = Number(document.getElementById("adjustment-copy-to-month").value);
  const toYear = Number(document.getElementById("adjustment-copy-to-year").value);
  try {
    const copied = await dbCopyMonthlySalaryAdjustments(fromMonth, fromYear, toMonth, toYear);
    reportMonth = toMonth;
    reportYear = toYear;
    closeModal();
    renderPage("salary-adjustments");
    showToast(`Đã sao chép ${copied.length} giáo viên sang tháng ${toMonth}/${toYear}`);
  } catch (err) {
    console.error(err);
    showToast("Lỗi: " + (err.message || "Không sao chép được dữ liệu"), "error");
    if (submitButton) submitButton.disabled = false;
  }
}

function setAllTeacherReportBranchCheckboxes(checked) {
  document.querySelectorAll('input[name="report-teacher-branch"]')
    .forEach((input) => { input.checked = checked; });
}

function applyTeacherReportBranchFilters() {
  const selectedIds = [...document.querySelectorAll('input[name="report-teacher-branch"]:checked')]
    .map((input) => input.value);
  reportTeacherBranchFilters = selectedIds.length === DB.branches.length ? null : selectedIds;
  renderPage("report-teacher");
}

function filterTeacherReportRows(value) {
  reportTeacherNameFilter = value || "";
  const query = normalizeAdjustmentSearch(reportTeacherNameFilter);
  let visibleCount = 0;
  document.querySelectorAll("[data-teacher-report-row]").forEach((row) => {
    const matches = !query || (row.dataset.teacherSearch || "").includes(query);
    row.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  const tableWrap = document.getElementById("teacher-report-table-wrap");
  const emptyState = document.getElementById("teacher-report-empty");
  const emptyMessage = document.getElementById("teacher-report-empty-message");
  if (tableWrap) tableWrap.hidden = visibleCount === 0;
  if (emptyState) emptyState.hidden = visibleCount > 0;
  if (emptyMessage) {
    emptyMessage.textContent = query
      ? "Không tìm thấy giáo viên phù hợp"
      : "Chưa có tiết đã hoàn thành trong tháng";
  }
}

function getReportCompletedSessions(view) {
  const me = getCurrentUser();
  let sessions = getSchedulesInMonth(reportMonth, reportYear, isAdmin() ? null : me.id);
  if (isAdmin() && view === "teacher" && Array.isArray(reportTeacherBranchFilters)) {
    sessions = sessions.filter((schedule) => reportTeacherBranchFilters.includes(schedule.branch_id));
  } else if (isAdmin() && reportBranchFilter) {
    sessions = sessions.filter((schedule) => schedule.branch_id === reportBranchFilter);
  }
  return sessions
    .filter((schedule) => schedule.status === "completed")
    .sort((a, b) => a.sched_date.localeCompare(b.sched_date) || a.start_time.localeCompare(b.start_time));
}

function reportExportFilterLabel(view) {
  if (view === "teacher" && isAdmin()) {
    const selectedBranches = reportTeacherBranchFilters === null
      ? DB.branches
      : DB.branches.filter((branch) => reportTeacherBranchFilters.includes(branch.id));
    const branchLabel = reportTeacherBranchFilters === null
      ? "Tất cả chi nhánh"
      : selectedBranches.length
        ? selectedBranches.map((branch) => branch.name).join(", ")
        : "Không chọn chi nhánh";
    return `Chi nhánh: ${branchLabel}${reportTeacherNameFilter.trim() ? ` | Tên giáo viên: ${reportTeacherNameFilter.trim()}` : ""}`;
  }
  if (isAdmin()) {
    return `Chi nhánh: ${reportBranchFilter ? (getBranch(reportBranchFilter)?.name || "Không xác định") : "Tất cả chi nhánh"}`;
  }
  return `Giáo viên: ${getCurrentUser()?.full_name || getProfile(getCurrentUser()?.id)?.full_name || "Tài khoản hiện tại"}`;
}

function exportReportExcel(view) {
  if (!window.XLSX) {
    showToast("Không tải được thư viện xuất Excel. Vui lòng kiểm tra kết nối mạng và thử lại.", "error");
    return;
  }

  const reportConfigs = {
    branch: { title: "BÁO CÁO THEO CHI NHÁNH", sheet: "Theo chi nhánh", file: "bao-cao-chi-nhanh" },
    teacher: { title: "BÁO CÁO THEO GIÁO VIÊN", sheet: "Theo giáo viên", file: "bao-cao-giao-vien" },
    salary: { title: "BÁO CÁO LƯƠNG", sheet: "Báo cáo lương", file: "bao-cao-luong" },
  };
  const config = reportConfigs[view];
  if (!config) return;

  let headers = [];
  let dataRows = [];
  let moneyColumns = [];

  if (view === "branch" || view === "teacher") {
    let completedSessions = getReportCompletedSessions(view);
    const totals = new Map();
    completedSessions.forEach((schedule) => {
      const totalKey = view === "branch" ? schedule.branch_id : schedule.teacher_id;
      totals.set(totalKey, (totals.get(totalKey) || 0) + 1);
    });
    if (view === "teacher") {
      const nameQuery = normalizeAdjustmentSearch(reportTeacherNameFilter);
      if (nameQuery) {
        completedSessions = completedSessions.filter((schedule) => {
          const teacherName = getProfile(schedule.teacher_id)?.full_name || "";
          return normalizeAdjustmentSearch(teacherName).includes(nameQuery);
        });
      }
      headers = ["Giáo viên", "Ngày dạy", "Giờ ca dạy", "Chi nhánh", "Môn học", "Tổng tiết tháng"];
      dataRows = completedSessions.map((schedule) => [
        getProfile(schedule.teacher_id)?.full_name || "?",
        formatDate(schedule.sched_date),
        `${formatTime(schedule.start_time)} – ${formatTime(schedule.end_time)}`,
        getBranch(schedule.branch_id)?.name || "?",
        getSubject(schedule.subject_id)?.name || "?",
        totals.get(schedule.teacher_id) || 0,
      ]);
    } else {
      headers = ["Chi nhánh", "Ngày dạy", "Giờ ca dạy", "Giáo viên", "Môn học", "Tổng tiết tháng"];
      dataRows = completedSessions.map((schedule) => [
        getBranch(schedule.branch_id)?.name || "?",
        formatDate(schedule.sched_date),
        `${formatTime(schedule.start_time)} – ${formatTime(schedule.end_time)}`,
        getProfile(schedule.teacher_id)?.full_name || "?",
        getSubject(schedule.subject_id)?.name || "?",
        totals.get(schedule.branch_id) || 0,
      ]);
    }
  } else {
    const teachers = (isAdmin() ? getTeachers(reportBranchFilter || null) : [getProfile(getCurrentUser().id)]).filter(Boolean);
    headers = ["Giáo viên", "Chi nhánh", "Loại lương", "Ca xếp", "Ca thực tế", "Lương tháng theo ca", "Lương tiết", "Phụ cấp", "Khấu trừ", "Thực nhận"];
    let grandTotal = 0;
    dataRows = teachers.map((teacher) => {
      const salary = calcTeacherSalary(teacher.id, reportMonth, reportYear);
      if (salary.total != null) grandTotal += salary.total;
      return [
        teacher.full_name || "?",
        getTeacherBranches(teacher.id).map((branch) => branch.name).join(", ") || "—",
        salary.rate ? SALARY_TYPE_LABELS[salary.rate.salary_type] : "Chưa chốt lương",
        salary.assigned,
        salary.completed,
        salary.rate ? salary.baseEarned : null,
        salary.rate ? salary.sessionEarned : null,
        salary.rate ? salary.allowance : null,
        salary.rate ? salary.deduction : null,
        salary.total,
      ];
    });
    if (isAdmin() && dataRows.length) {
      dataRows.push(["TỔNG CỘNG", "", "", "", "", "", "", "", "", grandTotal]);
    }
    moneyColumns = [5, 6, 7, 8, 9];
  }

  if (!dataRows.length) {
    showToast("Không có dữ liệu phù hợp để xuất Excel", "error");
    return;
  }

  const metadataRows = [
    [config.title],
    [`Kỳ báo cáo: Tháng ${reportMonth}/${reportYear}`],
    [reportExportFilterLabel(view)],
    [],
  ];
  const worksheetRows = [...metadataRows, headers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  const lastColumn = Math.max(0, headers.length - 1);
  worksheet["!merges"] = [0, 1, 2].map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: lastColumn } }));
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + dataRows.length, c: lastColumn } }) };
  worksheet["!cols"] = headers.map((header, columnIndex) => {
    const maxLength = worksheetRows.reduce((max, row) => Math.max(max, String(row[columnIndex] ?? "").length), header.length);
    return { wch: Math.min(Math.max(maxLength + 2, 12), 36) };
  });
  moneyColumns.forEach((columnIndex) => {
    for (let rowIndex = 5; rowIndex < 5 + dataRows.length; rowIndex += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell && typeof cell.v === "number") cell.z = '#,##0 "đ"';
    }
  });

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: config.title, Author: "EduBranch", CreatedDate: new Date() };
  XLSX.utils.book_append_sheet(workbook, worksheet, config.sheet);
  const monthLabel = String(reportMonth).padStart(2, "0");
  try {
    XLSX.writeFile(workbook, `${config.file}-${monthLabel}-${reportYear}.xlsx`, { compression: true });
    showToast("Đã tạo file Excel", "success");
  } catch (error) {
    console.error(error);
    showToast("Không thể xuất file Excel", "error");
  }
}

function report(view) {
  const me = getCurrentUser();
  if (Array.isArray(reportTeacherBranchFilters)) {
    const validIds = new Set(DB.branches.map((branch) => branch.id));
    reportTeacherBranchFilters = reportTeacherBranchFilters.filter((id) => validIds.has(id));
  }
  const teachers = (isAdmin() ? getTeachers(reportBranchFilter || null) : [getProfile(me.id)]).filter(Boolean);
  const completedSessions = getReportCompletedSessions(view);

  const branchTotals = new Map();
  const teacherTotals = new Map();
  completedSessions.forEach((s) => {
    branchTotals.set(s.branch_id, (branchTotals.get(s.branch_id) || 0) + 1);
    teacherTotals.set(s.teacher_id, (teacherTotals.get(s.teacher_id) || 0) + 1);
  });

  const branchReportRows = completedSessions.map((s) => `<tr>
    <td><b>${escapeHtml(getBranch(s.branch_id)?.name || "?")}</b></td>
    <td>${formatDate(s.sched_date)}</td>
    <td><b>${formatTime(s.start_time)} – ${formatTime(s.end_time)}</b></td>
    <td>${escapeHtml(getProfile(s.teacher_id)?.full_name || "?")}</td>
    <td>${escapeHtml(getSubject(s.subject_id)?.name || "?")}</td>
    <td><span class="badge badge-green">${branchTotals.get(s.branch_id)}</span></td>
  </tr>`).join("");

  const normalizedTeacherNameFilter = normalizeAdjustmentSearch(reportTeacherNameFilter);
  let teacherReportMatchCount = 0;
  const teacherReportRows = completedSessions.map((s) => {
    const teacherName = getProfile(s.teacher_id)?.full_name || "?";
    const teacherSearch = normalizeAdjustmentSearch(teacherName);
    const matchesTeacherName = !normalizedTeacherNameFilter || teacherSearch.includes(normalizedTeacherNameFilter);
    if (matchesTeacherName) teacherReportMatchCount += 1;
    return `<tr data-teacher-report-row data-teacher-search="${escapeHtml(teacherSearch)}" ${matchesTeacherName ? "" : "hidden"}>
      <td><b>${escapeHtml(teacherName)}</b></td>
      <td>${formatDate(s.sched_date)}</td>
      <td><b>${formatTime(s.start_time)} – ${formatTime(s.end_time)}</b></td>
      <td>${escapeHtml(getBranch(s.branch_id)?.name || "?")}</td>
      <td>${escapeHtml(getSubject(s.subject_id)?.name || "?")}</td>
      <td><span class="badge badge-green">${teacherTotals.get(s.teacher_id)}</span></td>
    </tr>`;
  }).join("");

  let grandTotal = 0;
  let hasMissingRate = false;
  const salaryRows = teachers.map((t) => {
    const r = calcTeacherSalary(t.id, reportMonth, reportYear);
    if (r.total != null) grandTotal += r.total;
    else hasMissingRate = true;
    const branches = getTeacherBranches(t.id).map((b) => b.name).join(", ") || "—";
    return `<tr>
      <td><b>${escapeHtml(t.full_name || "?")}</b><div class="stat-sub">${escapeHtml(branches)}</div></td>
      <td>${r.rate ? `<span class="badge badge-blue">${SALARY_TYPE_LABELS[r.rate.salary_type]}</span>` : '<span class="badge badge-gray">Chưa chốt lương</span>'}</td>
      <td>${r.assigned}</td>
      <td><span class="badge badge-green">${r.completed}</span></td>
      <td>${r.rate ? formatMoney(r.baseEarned) : "—"}</td>
      <td>${r.rate ? formatMoney(r.sessionEarned) : "—"}</td>
      <td class="color-green">${r.rate ? (r.allowance ? `+${formatMoney(r.allowance)}` : formatMoney(0)) : "—"}</td>
      <td class="color-red">${r.rate ? (r.deduction ? `-${formatMoney(r.deduction)}` : formatMoney(0)) : "—"}</td>
      <td><b>${r.total == null ? "—" : formatMoney(r.total)}</b></td>
    </tr>`;
  }).join("");

  const { monthOptions, yearOptions } = reportPeriodOptions(reportMonth, reportYear);
  const branchOptions = DB.branches
    .map((b) => `<option value="${b.id}" ${reportBranchFilter === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  const selectedTeacherBranchIds = reportTeacherBranchFilters === null
    ? new Set(DB.branches.map((branch) => branch.id))
    : new Set(reportTeacherBranchFilters);
  const selectedTeacherBranches = DB.branches.filter((branch) => selectedTeacherBranchIds.has(branch.id));
  const teacherBranchFilterLabel = reportTeacherBranchFilters === null
    ? "Tất cả chi nhánh"
    : selectedTeacherBranches.length === 0
      ? "Chưa chọn chi nhánh"
      : selectedTeacherBranches.length === 1
        ? selectedTeacherBranches[0].name
        : `${selectedTeacherBranches.length} chi nhánh`;
  const teacherBranchCheckboxes = DB.branches.map((branch) => `<label class="report-branch-check">
    <input type="checkbox" name="report-teacher-branch" value="${branch.id}" ${selectedTeacherBranchIds.has(branch.id) ? "checked" : ""}>
    <span><i class="ti ti-building-community"></i>${escapeHtml(branch.name)}</span>
  </label>`).join("");
  const teacherBranchMultiFilter = `<details class="report-branch-multiselect">
    <summary class="form-control"><i class="ti ti-building-community"></i><span>${escapeHtml(teacherBranchFilterLabel)}</span><i class="ti ti-chevron-down"></i></summary>
    <div class="report-branch-panel">
      <div class="report-branch-panel-head"><b>Chọn chi nhánh</b><span>Có thể chọn nhiều</span></div>
      <div class="report-branch-check-list">${teacherBranchCheckboxes || '<div class="stat-sub">Chưa có chi nhánh</div>'}</div>
      <div class="report-branch-panel-actions">
        <button type="button" class="btn btn-sm btn-outline" onclick="setAllTeacherReportBranchCheckboxes(false)">Bỏ chọn</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="setAllTeacherReportBranchCheckboxes(true)">Chọn tất cả</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="applyTeacherReportBranchFilters()">Áp dụng</button>
      </div>
    </div>
  </details>`;
  const reportTabs = reportViewTabs(view);

  return `
    <div class="page-header">
      <div>
        <div class="page-title">${REPORT_VIEW_LABELS[view]} · Tháng ${reportMonth}/${reportYear}</div>
        <div class="page-desc">Chi tiết ngày dạy, giờ dạy, số tiết thực tế và lương thực nhận. Một tiết được ghi nhận khi giáo viên bấm “Xong ca”.</div>
      </div>
      <button type="button" class="btn btn-outline" onclick="exportReportExcel('${view}')"><i class="ti ti-file-spreadsheet"></i> Xuất Excel</button>
    </div>
    <div class="report-view-tabs">${reportTabs}</div>
    <div class="filter-bar ${view === "teacher" && isAdmin() ? "report-filter-layer" : ""}">
      <select class="form-control" style="max-width:130px" onchange="reportMonth=Number(this.value); renderPage(currentPage)">${monthOptions}</select>
      <select class="form-control" style="max-width:110px" onchange="reportYear=Number(this.value); renderPage(currentPage)">${yearOptions}</select>
      ${
        isAdmin()
          ? view === "teacher"
            ? `${teacherBranchMultiFilter}
              <div class="search-wrap report-teacher-search">
                <i class="ti ti-search"></i>
                <input class="search-input" type="search" value="${escapeHtml(reportTeacherNameFilter)}" placeholder="Tìm theo tên giáo viên..." oninput="filterTeacherReportRows(this.value)" onkeydown="if(event.key==='Enter') event.preventDefault()">
              </div>`
            : `<select class="form-control" style="max-width:240px" onchange="reportBranchFilter=this.value; renderPage(currentPage)">
                <option value="">Tất cả chi nhánh</option>${branchOptions}
              </select>`
          : ""
      }
    </div>
    ${view === "branch" && isAdmin() ? `<div class="card">
      <div class="card-header"><div><div class="card-title">Báo cáo theo chi nhánh</div><div class="card-subtitle">Ngày dạy, giờ ca, giáo viên và tổng số tiết thực tế trong tháng</div></div></div>
      ${branchReportRows ? `<div class="table-wrap"><table>
        <thead><tr><th>Chi nhánh</th><th>Ngày dạy</th><th>Giờ ca dạy</th><th>Giáo viên</th><th>Môn học</th><th>Tổng tiết tháng</th></tr></thead>
        <tbody>${branchReportRows}</tbody>
      </table></div>` : `<div class="empty-state"><i class="ti ti-building-community"></i><p>Chưa có tiết đã hoàn thành trong tháng</p></div>`}
    </div>` : ""}

    ${view === "teacher" ? `<div class="card">
      <div class="card-header"><div><div class="card-title">Báo cáo theo giáo viên</div><div class="card-subtitle">Chi tiết từng ngày và giờ dạy đã hoàn thành</div></div></div>
      ${teacherReportRows ? `<div class="table-wrap" id="teacher-report-table-wrap" ${teacherReportMatchCount ? "" : "hidden"}><table>
        <thead><tr><th>Giáo viên</th><th>Ngày dạy</th><th>Giờ ca dạy</th><th>Chi nhánh</th><th>Môn học</th><th>Tổng tiết tháng</th></tr></thead>
        <tbody>${teacherReportRows}</tbody>
      </table></div>` : ""}
      <div class="empty-state" id="teacher-report-empty" ${teacherReportMatchCount ? "hidden" : ""}><i class="ti ti-user-check"></i><p id="teacher-report-empty-message">${normalizedTeacherNameFilter ? "Không tìm thấy giáo viên phù hợp" : "Chưa có tiết đã hoàn thành trong tháng"}</p></div>
    </div>` : ""}

    ${view === "salary" ? `<div class="card">
      <div class="card-header"><div><div class="card-title">Báo cáo lương thực nhận</div><div class="card-subtitle">Lương theo ca thực tế, sau phụ cấp và khấu trừ</div></div></div>
      ${salaryRows ? `<div class="table-wrap"><table>
        <thead><tr><th>Giáo viên</th><th>Loại lương</th><th>Ca xếp</th><th>Ca thực tế</th><th>Lương tháng theo ca</th><th>Lương tiết</th><th>Phụ cấp</th><th>Khấu trừ</th><th>Thực nhận</th></tr></thead>
        <tbody>${salaryRows}</tbody>
        ${isAdmin() ? `<tfoot><tr><td colspan="8" style="text-align:right"><b>Tổng chi lương${hasMissingRate ? " (chưa gồm GV chưa chốt lương)" : ""}</b></td><td><b>${formatMoney(grandTotal)}</b></td></tr></tfoot>` : ""}
      </table></div>` : `<div class="empty-state"><i class="ti ti-coin"></i><p>Chưa có giáo viên nào</p></div>`}
    </div>` : ""}

    ${view === "salary" ? `<div class="card" style="padding:14px 18px">
      <div class="card-subtitle">Cách tính: lương <b>theo tiết</b> = đơn giá × ca thực tế. Lương <b>theo tháng</b> = mức tháng ÷ ca được xếp × ca thực tế. Lương hỗn hợp cộng cả hai phần. <b>Thực nhận</b> = lương theo ca + lương tiết + phụ cấp − khấu trừ.</div>
    </div>` : ""}`;
}

// ============================================================
// PAGE: ACCOUNT — Tài khoản của tôi
// ============================================================

function account() {
  const me = getCurrentUser();
  const roleLabel = isAdmin() ? "Quản trị viên" : "Giáo viên";
  const myBranchLabel = !isAdmin() ? getTeacherBranches(me.id).map((b) => b.name).join(" · ") : "";
  return `
    <div class="card">
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:14px">
          <span class="avatar" style="width:44px;height:44px;font-size:16px">${escapeHtml(initials(me.full_name))}</span>
          <div>
            <div class="card-title">${escapeHtml(me.full_name || "(chưa đặt tên)")}</div>
            <div class="card-subtitle">${escapeHtml(me.email || "")} · <span class="badge ${isAdmin() ? "badge-blue" : "badge-green"}">${roleLabel}</span>
            ${myBranchLabel ? " · " + escapeHtml(myBranchLabel) : ""}</div>
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
