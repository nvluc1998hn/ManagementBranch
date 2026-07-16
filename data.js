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
  teacher_branches: [], // liên kết nhiều chi nhánh của giáo viên
  subjects: [],
  teacher_salaries: [], // lịch sử lương (mỗi lần chốt là 1 dòng)
  monthly_salary_adjustments: [], // phụ cấp/khấu trừ theo giáo viên + tháng
  schedules: [],        // lịch dạy theo ngày cụ thể + trạng thái ca
};

let currentUser = null; // dòng profiles của người đang đăng nhập

function _emptyDB() {
  DB.profiles = [];
  DB.branches = [];
  DB.teacher_branches = [];
  DB.subjects = [];
  DB.teacher_salaries = [];
  DB.monthly_salary_adjustments = [];
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
  const branchLinks = await sb().from("teacher_branches").select("*");
  if (branchLinks.error && !["42P01", "PGRST205"].includes(branchLinks.error.code)) {
    throw branchLinks.error;
  }
  DB.teacher_branches = branchLinks.data || [];
  const salaryAdjustments = await sb().from("monthly_salary_adjustments").select("*");
  if (salaryAdjustments.error && !["42P01", "PGRST205"].includes(salaryAdjustments.error.code)) {
    throw salaryAdjustments.error;
  }
  DB.monthly_salary_adjustments = salaryAdjustments.data || [];
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
  DB.teacher_branches = DB.teacher_branches.filter((x) => x.branch_id !== id);
  DB.profiles.forEach((p) => {
    if (p.branch_id === id) p.branch_id = null;
  });
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
    if (/teacher_branches_pkey|duplicate key value/i.test(msg)) {
      msg = "Hàm tạo giáo viên trên Supabase chưa được cập nhật để hỗ trợ nhiều chi nhánh";
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function dbCreateTeacher({ email, password, full_name, phone, branch_ids }) {
  const data = await _invokeTeacherFn({
    action: "create", email, password, full_name, phone,
    branch_ids, branch_id: branch_ids[0], // branch_id giữ tương thích Edge Function cũ
  });
  if (data.profile) DB.profiles.push(data.profile);
  if (data.profile) {
    const uniqueBranchIds = [...new Set(branch_ids)].filter(Boolean);
    DB.teacher_branches = DB.teacher_branches.filter((x) => x.teacher_id !== data.profile.id);
    DB.teacher_branches.push(...uniqueBranchIds.map((branch_id) => ({
      teacher_id: data.profile.id,
      branch_id,
    })));
  }
  return data.profile;
}

async function dbResetTeacherPassword(teacherId, newPassword) {
  await _invokeTeacherFn({ action: "reset_password", teacher_id: teacherId, password: newPassword });
}

async function dbDeleteTeacher(teacherId) {
  await _invokeTeacherFn({ action: "delete", teacher_id: teacherId });
  DB.profiles = DB.profiles.filter((p) => p.id !== teacherId);
  DB.teacher_branches = DB.teacher_branches.filter((x) => x.teacher_id !== teacherId);
  DB.teacher_salaries = DB.teacher_salaries.filter((s) => s.teacher_id !== teacherId);
  DB.monthly_salary_adjustments = DB.monthly_salary_adjustments.filter((s) => s.teacher_id !== teacherId);
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

async function dbSetTeacherBranches(teacherId, branchIds) {
  const uniqueIds = [...new Set(branchIds)].filter(Boolean);
  if (!uniqueIds.length) throw new Error("Chọn ít nhất một chi nhánh");
  const currentIds = DB.teacher_branches
    .filter((x) => x.teacher_id === teacherId)
    .map((x) => x.branch_id);
  const toRemove = currentIds.filter((id) => !uniqueIds.includes(id));
  const rows = uniqueIds.map((branch_id) => ({ teacher_id: teacherId, branch_id }));

  // Gửi toàn bộ danh sách bằng ON CONFLICT DO NOTHING để an toàn khi cache cục bộ
  // chưa kịp phản ánh liên kết được tạo bởi trigger hoặc một trình duyệt khác.
  const { error: upsertError } = await sb().from("teacher_branches")
    .upsert(rows, { onConflict: "teacher_id,branch_id", ignoreDuplicates: true });
  if (upsertError) throw upsertError;
  if (toRemove.length) {
    const { error } = await sb().from("teacher_branches")
      .delete().eq("teacher_id", teacherId).in("branch_id", toRemove);
    if (error) throw error;
  }
  DB.teacher_branches = DB.teacher_branches.filter((x) => x.teacher_id !== teacherId);
  DB.teacher_branches.push(...rows);
  return rows;
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
// MONTHLY SALARY ADJUSTMENTS — phụ cấp/khấu trừ theo tháng
// ============================================================

function salaryAdjustmentMonth(month, year) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function getMonthlySalaryAdjustment(teacherId, month, year) {
  const adjustmentMonth = salaryAdjustmentMonth(month, year);
  return DB.monthly_salary_adjustments.find(
    (x) => x.teacher_id === teacherId && x.adjustment_month === adjustmentMonth,
  ) || null;
}

async function dbSaveMonthlySalaryAdjustments(month, year, items) {
  if (!items.length) return [];
  const adjustmentMonth = salaryAdjustmentMonth(month, year);
  const updatedAt = new Date().toISOString();
  const rows = items.map((item) => ({
    teacher_id: item.teacher_id,
    adjustment_month: adjustmentMonth,
    allowance: Number(item.allowance || 0),
    deduction: Number(item.deduction || 0),
    updated_at: updatedAt,
  }));
  const { data, error } = await sb().from("monthly_salary_adjustments")
    .upsert(rows, { onConflict: "teacher_id,adjustment_month" }).select();
  if (error) throw error;
  const teacherIds = new Set(rows.map((x) => x.teacher_id));
  DB.monthly_salary_adjustments = DB.monthly_salary_adjustments.filter(
    (x) => x.adjustment_month !== adjustmentMonth || !teacherIds.has(x.teacher_id),
  );
  DB.monthly_salary_adjustments.push(...(data || rows));
  return data || rows;
}

async function dbCopyMonthlySalaryAdjustments(fromMonth, fromYear, toMonth, toYear) {
  const sourceMonth = salaryAdjustmentMonth(fromMonth, fromYear);
  const targetMonth = salaryAdjustmentMonth(toMonth, toYear);
  if (sourceMonth === targetMonth) throw new Error("Tháng nguồn và tháng đích phải khác nhau");
  const sourceRows = DB.monthly_salary_adjustments.filter(
    (x) => x.adjustment_month === sourceMonth,
  );
  if (!sourceRows.length) throw new Error("Tháng nguồn chưa có dữ liệu để sao chép");
  const rows = sourceRows.map((x) => ({
    teacher_id: x.teacher_id,
    adjustment_month: targetMonth,
    allowance: Number(x.allowance || 0),
    deduction: Number(x.deduction || 0),
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await sb().from("monthly_salary_adjustments")
    .upsert(rows, { onConflict: "teacher_id,adjustment_month" }).select();
  if (error) throw error;
  const copiedTeacherIds = new Set(rows.map((x) => x.teacher_id));
  DB.monthly_salary_adjustments = DB.monthly_salary_adjustments.filter(
    (x) => x.adjustment_month !== targetMonth || !copiedTeacherIds.has(x.teacher_id),
  );
  DB.monthly_salary_adjustments.push(...(data || rows));
  return data || rows;
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

async function dbAddSchedules(items) {
  if (!items.length) return [];
  const { data, error } = await sb()
    .from("schedules")
    .upsert(items, {
      onConflict: "teacher_id,sched_date,start_time",
      ignoreDuplicates: true,
    })
    .select();
  if (error) throw error;
  const added = data || [];
  DB.schedules.push(...added);
  return added;
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

// Trạng thái "Đã hiểu" của nhắc lịch được lưu trên Supabase để đồng bộ
// giữa các trình duyệt và thiết bị. RLS chỉ cho giáo viên đọc/ghi của mình.
async function dbHasAcknowledgedScheduleNotice(noticeDate) {
  const me = getCurrentUser();
  if (!me) return false;
  const { data, error } = await sb()
    .from("schedule_notice_acknowledgements")
    .select("teacher_id")
    .eq("teacher_id", me.id)
    .eq("notice_date", noticeDate)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function dbAcknowledgeScheduleNotice(noticeDate) {
  const me = getCurrentUser();
  if (!me) throw new Error("Bạn chưa đăng nhập");
  const { error } = await sb()
    .from("schedule_notice_acknowledgements")
    .insert({ teacher_id: me.id, notice_date: noticeDate });
  // Hai tab có thể cùng xác nhận; trùng khóa vẫn được coi là đã lưu.
  if (error && error.code !== "23505") throw error;
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

function getTeacherBranchIds(teacherId) {
  const ids = DB.teacher_branches
    .filter((x) => x.teacher_id === teacherId)
    .map((x) => x.branch_id);
  if (!ids.length) {
    const legacyBranchId = getProfile(teacherId)?.branch_id;
    if (legacyBranchId) ids.push(legacyBranchId);
  }
  return [...new Set(ids)];
}

function getTeacherBranches(teacherId) {
  const ids = new Set(getTeacherBranchIds(teacherId));
  return DB.branches.filter((b) => ids.has(b.id));
}

function getTeachers(branchId) {
  return DB.profiles.filter(
    (p) => p.role === "teacher" && (!branchId || getTeacherBranchIds(p.id).includes(branchId)),
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
// fixed/mixed chia lương tháng theo ca thực tế; per_session/mixed nhân đơn giá;
// sau đó cộng phụ cấp và trừ khấu trừ.
function calcTeacherSalary(teacherId, month, year) {
  const rate = getSalaryAsOf(teacherId, month, year);
  const adjustment = getMonthlySalaryAdjustment(teacherId, month, year);
  const sessions = getSchedulesInMonth(month, year, teacherId);
  const assigned = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const missed = sessions.filter((s) => displayStatus(s) === "missed").length;

  if (!rate) {
    return {
      rate: null, assigned, completed, missed,
      baseEarned: 0, sessionEarned: 0, allowance: 0, deduction: 0, total: null,
    };
  }
  const baseEarned =
    (rate.salary_type === "fixed" || rate.salary_type === "mixed") && assigned
      ? Math.round((Number(rate.base_salary || 0) * completed) / assigned)
      : 0;
  const sessionEarned =
    rate.salary_type === "per_session" || rate.salary_type === "mixed"
      ? Number(rate.per_session_amount || 0) * completed
      : 0;
  const allowance = Number(adjustment?.allowance || 0);
  const deduction = Number(adjustment?.deduction || 0);
  const total = baseEarned + sessionEarned + allowance - deduction;
  return { rate, adjustment, assigned, completed, missed, baseEarned, sessionEarned, allowance, deduction, total };
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
