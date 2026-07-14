// ============================================================
// SUPABASE CLIENT + CACHE + CRUD — EduBranch (managementBranch)
// ============================================================

// Điền 2 giá trị này sau khi tạo project Supabase
// (Project Settings > API: Project URL + publishable/anon key — key công khai, commit được)
const SUPABASE_URL = "https://dzngwgqoecfiktjhyxuy.supabase.co";
const SUPABASE_KEY = "sb_publishable_GH3VEtVE2VHKdpwq9nmfwg_AuCPLiYE";

const _sb =
  SUPABASE_URL && SUPABASE_KEY
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

function sb() {
  if (!_sb) throw new Error("Chưa cấu hình SUPABASE_URL hoặc SUPABASE_KEY trong data.js");
  return _sb;
}

function sbConfigured() {
  return !!_sb;
}

// In-memory cache — page renderers đọc đồng bộ từ đây, không await.
// RLS phía server tự lọc dữ liệu theo vai trò (admin thấy chi nhánh mình,
// giáo viên chỉ thấy dữ liệu của mình) nên client cứ select('*').
const DB = {
  profiles: [],         // admin + giáo viên (bản thân + GV thuộc chi nhánh mình)
  branches: [],
  subjects: [],
  teacher_salaries: [], // lịch sử lương (mỗi lần chốt là 1 dòng)
  schedules: [],        // lịch dạy theo ngày cụ thể + trạng thái ca
};

let currentUser = null; // dòng profiles của người đang đăng nhập

function _emptyDB() {
  DB.profiles = [];
  DB.branches = [];
  DB.subjects = [];
  DB.teacher_salaries = [];
  DB.schedules = [];
}

function getCurrentUser() {
  return currentUser;
}

function isAdmin() {
  return currentUser?.role === "admin";
}

// ============================================================
// AUTH / SESSION
// ============================================================

async function _fetchMyProfile() {
  if (!_sb) return null;
  const { data: sessionData, error: sessionError } = await sb().auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await sb()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // chưa có profile
    throw error;
  }
  return data;
}

async function restoreSession() {
  try {
    currentUser = await _fetchMyProfile();
  } catch (e) {
    console.error(e);
    currentUser = null;
  }
  return currentUser;
}

async function loginUser(email, password) {
  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = await _fetchMyProfile();
  if (!currentUser) {
    await sb().auth.signOut();
    throw new Error("Tài khoản chưa có hồ sơ (profiles). Liên hệ quản trị viên.");
  }
  return currentUser;
}

// Đăng ký tài khoản ADMIN (chủ trung tâm). Giáo viên KHÔNG tự đăng ký —
// admin tạo qua Edge Function create-teacher.
async function registerAdmin(email, password, fullName) {
  const { data, error } = await sb().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }, // trigger handle_new_user đọc full_name
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error(
      'Đăng ký thành công nhưng chưa có phiên đăng nhập — hãy TẮT "Confirm email" trong Supabase Authentication.',
    );
  }
  currentUser = await _fetchMyProfile();
  return currentUser;
}

async function logoutUser() {
  try {
    await sb().auth.signOut();
  } catch (e) {
    console.error(e);
  }
  currentUser = null;
  _emptyDB();
}

// ============================================================
// INIT — nạp toàn bộ cache trước khi render trang đầu tiên
// ============================================================

async function initDB() {
  const tables = ["profiles", "branches", "subjects", "teacher_salaries", "schedules"];
  const results = await Promise.all(
    tables.map((t) => sb().from(t).select("*")),
  );
  results.forEach(({ data, error }, i) => {
    if (error) throw error;
    DB[tables[i]] = data || [];
  });
  DB.teacher_salaries.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
}

async function _refresh(table) {
  const { data, error } = await sb().from(table).select("*");
  if (error) throw error;
  DB[table] = data || [];
}

// ============================================================
// BRANCHES — chi nhánh (admin)
// ============================================================

async function dbAddBranch(fields) {
  const { data, error } = await sb()
    .from("branches")
    .insert({ ...fields, owner_admin_id: currentUser.id })
    .select()
    .single();
  if (error) throw error;
  DB.branches.push(data);
  return data;
}

async function dbUpdateBranch(id, fields) {
  const { data, error } = await sb()
    .from("branches").update(fields).eq("id", id).select().single();
  if (error) throw error;
  const i = DB.branches.findIndex((b) => b.id === id);
  if (i !== -1) DB.branches[i] = data;
  return data;
}

async function dbDeleteBranch(id) {
  const { error } = await sb().from("branches").delete().eq("id", id);
  if (error) throw error;
  DB.branches = DB.branches.filter((b) => b.id !== id);
  DB.subjects = DB.subjects.filter((s) => s.branch_id !== id);
  DB.schedules = DB.schedules.filter((s) => s.branch_id !== id);
  DB.profiles = DB.profiles.filter((p) => p.branch_id !== id || p.id === currentUser.id);
}

// ============================================================
// SUBJECTS — môn học của chi nhánh (admin)
// ============================================================

async function dbAddSubject(branchId, name, fee) {
  const { data, error } = await sb()
    .from("subjects").insert({ branch_id: branchId, name, fee: fee ?? null }).select().single();
  if (error) {
    if (error.code === "23505") throw new Error("Môn học này đã tồn tại trong chi nhánh");
    throw error;
  }
  DB.subjects.push(data);
  return data;
}

async function dbUpdateSubject(id, fields) {
  const { data, error } = await sb()
    .from("subjects").update(fields).eq("id", id).select().single();
  if (error) {
    if (error.code === "23505") throw new Error("Môn học này đã tồn tại trong chi nhánh");
    throw error;
  }
  const i = DB.subjects.findIndex((s) => s.id === id);
  if (i !== -1) DB.subjects[i] = data;
  return data;
}

async function dbDeleteSubject(id) {
  const { error } = await sb().from("subjects").delete().eq("id", id);
  if (error) {
    if (error.code === "23503")
      throw new Error("Môn học đang được dùng trong thời khóa biểu, không thể xóa");
    throw error;
  }
  DB.subjects = DB.subjects.filter((s) => s.id !== id);
}

// ============================================================
// TEACHERS — tài khoản giáo viên (qua Edge Function create-teacher,
// vì client không có quyền tạo/xóa auth user khác)
// ============================================================

// Slug thật của Edge Function trên Supabase. Khi tạo qua Dashboard editor,
// slug được sinh lúc tạo ("super-processor") và KHÔNG đổi theo tên hiển thị.
// Nếu sau này deploy lại bằng CLI (supabase functions deploy create-teacher)
// thì đổi về "create-teacher".
const TEACHER_FN_NAME = "super-processor";

async function _invokeTeacherFn(body) {
  const { data, error } = await sb().functions.invoke(TEACHER_FN_NAME, { body });
  if (error) {
    // FunctionsHttpError: đọc message tiếng Việt từ body {error}
    let msg = "Lỗi gọi Edge Function create-teacher (đã deploy chưa?)";
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch (_) { /* giữ msg mặc định */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function dbCreateTeacher({ email, password, full_name, phone, branch_id }) {
  const data = await _invokeTeacherFn({
    action: "create", email, password, full_name, phone, branch_id,
  });
  if (data.profile) DB.profiles.push(data.profile);
  return data.profile;
}

async function dbResetTeacherPassword(teacherId, newPassword) {
  await _invokeTeacherFn({ action: "reset_password", teacher_id: teacherId, password: newPassword });
}

async function dbDeleteTeacher(teacherId) {
  await _invokeTeacherFn({ action: "delete", teacher_id: teacherId });
  DB.profiles = DB.profiles.filter((p) => p.id !== teacherId);
  DB.teacher_salaries = DB.teacher_salaries.filter((s) => s.teacher_id !== teacherId);
  DB.schedules = DB.schedules.filter((s) => s.teacher_id !== teacherId);
}

// Admin sửa tên/SĐT/chi nhánh của giáo viên; hoặc user tự sửa tên/SĐT của mình
async function dbUpdateProfile(id, fields) {
  const { data, error } = await sb()
    .from("profiles").update(fields).eq("id", id).select().single();
  if (error) throw error;
  const i = DB.profiles.findIndex((p) => p.id === id);
  if (i !== -1) DB.profiles[i] = data;
  if (currentUser?.id === id) currentUser = data;
  return data;
}

async function changeMyPassword(newPassword) {
  const { error } = await sb().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ============================================================
// TEACHER SALARIES — lịch sử lương (admin ghi, GV chỉ đọc của mình)
// salary_type: fixed | per_session | mixed
// ============================================================

async function dbAddSalary(fields) {
  const { data, error } = await sb()
    .from("teacher_salaries").insert(fields).select().single();
  if (error) {
    if (error.code === "23505")
      throw new Error("Đã có một lần chốt lương đúng ngày hiệu lực này — chọn ngày khác");
    throw error;
  }
  DB.teacher_salaries.push(data);
  DB.teacher_salaries.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return data;
}

async function dbDeleteSalary(id) {
  const { error } = await sb().from("teacher_salaries").delete().eq("id", id);
  if (error) throw error;
  DB.teacher_salaries = DB.teacher_salaries.filter((s) => s.id !== id);
}

// ============================================================
// SCHEDULES — lịch dạy theo ngày cụ thể (admin xếp, GV cập nhật trạng thái)
// status: scheduled -> in_progress (vào ca) -> completed (xong ca)
// Quá ngày mà vẫn scheduled/in_progress = hôm đó không dạy.
// ============================================================

async function dbAddSchedule(fields) {
  const { data, error } = await sb()
    .from("schedules").insert(fields).select().single();
  if (error) {
    if (error.code === "23505")
      throw new Error("Giáo viên này đã có ca trùng giờ bắt đầu trong ngày đó");
    throw error;
  }
  DB.schedules.push(data);
  return data;
}

async function dbUpdateSchedule(id, fields) {
  const { data, error } = await sb()
    .from("schedules").update(fields).eq("id", id).select().single();
  if (error) throw error;
  const i = DB.schedules.findIndex((s) => s.id === id);
  if (i !== -1) DB.schedules[i] = data;
  return data;
}

async function dbDeleteSchedule(id) {
  const { error } = await sb().from("schedules").delete().eq("id", id);
  if (error) throw error;
  DB.schedules = DB.schedules.filter((s) => s.id !== id);
}

// Giáo viên bấm "Vào ca" — RPC kiểm tra: đúng GV, đúng ngày hôm nay, đang scheduled
async function dbCheckInSchedule(id) {
  const { error } = await sb().rpc("check_in_schedule", { p_schedule_id: id });
  if (error) throw error;
  const s = DB.schedules.find((x) => x.id === id);
  if (s) {
    s.status = "in_progress";
    s.checked_in_at = new Date().toISOString();
  }
}

// Giáo viên bấm "Xong ca" — RPC kiểm tra: đúng GV, đang in_progress
async function dbCompleteSchedule(id) {
  const { error } = await sb().rpc("complete_schedule", { p_schedule_id: id });
  if (error) throw error;
  const s = DB.schedules.find((x) => x.id === id);
  if (s) {
    s.status = "completed";
    s.completed_at = new Date().toISOString();
  }
}

// ============================================================
// READ HELPERS (đồng bộ, đọc từ cache)
// ============================================================

function getBranch(id) {
  return DB.branches.find((b) => b.id === id);
}

function getSubject(id) {
  return DB.subjects.find((s) => s.id === id);
}

function getProfile(id) {
  return DB.profiles.find((p) => p.id === id);
}

function getTeachers(branchId) {
  return DB.profiles.filter(
    (p) => p.role === "teacher" && (!branchId || p.branch_id === branchId),
  );
}

function getSubjectsOfBranch(branchId) {
  return DB.subjects.filter((s) => s.branch_id === branchId);
}

// Bản ghi lương hiệu lực tại thời điểm cuối tháng month/year
function getSalaryAsOf(teacherId, month, year) {
  const endOfMonth = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
  // DB.teacher_salaries đã sort effective_from desc
  return (
    DB.teacher_salaries.find(
      (s) => s.teacher_id === teacherId && s.effective_from <= endOfMonth,
    ) || null
  );
}

function getLatestSalary(teacherId) {
  return DB.teacher_salaries.find((s) => s.teacher_id === teacherId) || null;
}

function getSalaryHistory(teacherId) {
  return DB.teacher_salaries.filter((s) => s.teacher_id === teacherId);
}

const SALARY_TYPE_LABELS = {
  fixed: "Cố định",
  per_session: "Theo tiết",
  mixed: "Cố định + theo tiết",
};

const SCHEDULE_STATUS = {
  scheduled: { label: "Chưa vào ca", badge: "badge-gray" },
  in_progress: { label: "Đang dạy", badge: "badge-warn" },
  completed: { label: "Đã dạy", badge: "badge-green" },
  missed: { label: "Không dạy", badge: "badge-red" }, // trạng thái suy ra, không lưu DB
};

// Trạng thái hiển thị: ca quá ngày mà chưa completed = không dạy
function displayStatus(schedule) {
  if (schedule.status === "completed") return "completed";
  if (schedule.sched_date < todayStr()) return "missed";
  return schedule.status;
}

function getSchedulesOfDate(dateStr, teacherId) {
  return DB.schedules
    .filter(
      (s) =>
        s.sched_date === dateStr && (!teacherId || s.teacher_id === teacherId),
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function getSchedulesInMonth(month, year, teacherId) {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return DB.schedules.filter(
    (s) =>
      s.sched_date.startsWith(prefix) &&
      (!teacherId || s.teacher_id === teacherId),
  );
}

// Tính lương tháng của 1 giáo viên (mirror của hàm SQL calc_teacher_salary):
// fixed/mixed cộng lương cố định; per_session/mixed cộng đơn giá × số ca completed.
function calcTeacherSalary(teacherId, month, year) {
  const rate = getSalaryAsOf(teacherId, month, year);
  const sessions = getSchedulesInMonth(month, year, teacherId);
  const assigned = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const missed = sessions.filter((s) => displayStatus(s) === "missed").length;

  if (!rate) {
    return { rate: null, assigned, completed, missed, total: null };
  }
  let total = 0;
  if (rate.salary_type === "fixed" || rate.salary_type === "mixed")
    total += Number(rate.base_salary || 0);
  if (rate.salary_type === "per_session" || rate.salary_type === "mixed")
    total += Number(rate.per_session_amount || 0) * completed;
  return { rate, assigned, completed, missed, total };
}

// ============================================================
// FORMAT HELPERS
// ============================================================

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

function formatMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("vi-VN") + " đ";
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str + (str.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("vi-VN");
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Thứ 2 của tuần chứa date
function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = CN
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
