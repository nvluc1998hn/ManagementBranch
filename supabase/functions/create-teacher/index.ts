// ============================================================
// Edge Function: create-teacher
// Admin tạo / xóa tài khoản giáo viên và reset mật khẩu.
// Phải chạy server-side vì client không có quyền auth.admin.*.
//
// Deploy:  supabase functions deploy create-teacher
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//  được Supabase tự inject, không cần khai báo secret)
//
// Body:
//   { action: "create", email, password, full_name, phone?, branch_ids[] }
//   { action: "reset_password", teacher_id, password }
//   { action: "delete", teacher_id }
// Trả về: { profile } khi create, { ok: true } khi còn lại,
//         hoặc { error: "thông báo tiếng Việt" } + HTTP status lỗi.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Xác thực người gọi bằng chính JWT của họ
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Bạn chưa đăng nhập" }, 401);

    // 2. Người gọi phải là admin
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Chỉ quản trị viên mới được thực hiện thao tác này" }, 403);
    }

    const body = await req.json();
    const action: string = body.action ?? "create";

    const ownsBranch = async (branchId: string) => {
      const { data } = await admin
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("owner_admin_id", user.id)
        .maybeSingle();
      return !!data;
    };

    // Giáo viên có ít nhất một chi nhánh do admin này sở hữu?
    const ownedTeacher = async (teacherId: string) => {
      const { data: t } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", teacherId)
        .maybeSingle();
      if (!t || t.role !== "teacher") return null;
      const { data: links } = await admin
        .from("teacher_branches")
        .select("branch_id")
        .eq("teacher_id", teacherId);
      for (const link of links || []) {
        if (await ownsBranch(link.branch_id)) return t;
      }
      return null;
    };

    // ---- CREATE ------------------------------------------------
    if (action === "create") {
      const { email, password, full_name, phone } = body;
      const branchIds = [...new Set(
        (Array.isArray(body.branch_ids) ? body.branch_ids : [body.branch_id]).filter(Boolean),
      )] as string[];
      if (!email || !password || !full_name || !branchIds.length) {
        return json({ error: "Thiếu thông tin bắt buộc" }, 400);
      }
      if (String(password).length < 6) {
        return json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, 400);
      }
      for (const branchId of branchIds) {
        if (!(await ownsBranch(branchId))) {
          return json({ error: "Có chi nhánh không thuộc quyền quản lý của bạn" }, 403);
        }
      }
      const primaryBranchId = branchIds[0];
      // role + branch_id đặt trong app_metadata (client không tự đặt được),
      // trigger handle_new_user sẽ tạo dòng profiles tương ứng.
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, phone: phone ?? null },
          app_metadata: { role: "teacher", branch_id: primaryBranchId, branch_ids: branchIds },
        });
      if (createErr) {
        const msg = /already.*registered|already exists/i.test(createErr.message)
          ? "Email này đã được đăng ký"
          : createErr.message;
        return json({ error: msg }, 400);
      }
      // Trigger handle_new_user có thể chạy TRƯỚC khi app_metadata được ghi
      // (tùy phiên bản GoTrue) → profile bị tạo nhầm role 'admin'.
      // Ghi đè tường minh bằng service role cho chắc chắn
      // (trigger protect_profile_fields cho phép vì auth.uid() là null).
      const { data: profile, error: profErr } = await admin
        .from("profiles")
        .upsert(
          {
            id: created.user.id,
            role: "teacher",
            full_name,
            phone: phone ?? null,
            email,
            branch_id: primaryBranchId,
          },
          { onConflict: "id" },
        )
        .select()
        .single();
      if (profErr) return json({ error: profErr.message }, 500);
      const { error: branchErr } = await admin
        .from("teacher_branches")
        .upsert(
          branchIds.map((branch_id) => ({ teacher_id: created.user.id, branch_id })),
          { onConflict: "teacher_id,branch_id", ignoreDuplicates: true },
        );
      if (branchErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: branchErr.message }, 500);
      }
      // Đọc lại toàn bộ liên kết vì dòng chi nhánh chính có thể đã được trigger tạo trước,
      // nên upsert ở trên sẽ bỏ qua dòng đó và không trả về trong representation.
      const { data: teacherBranches, error: branchReadErr } = await admin
        .from("teacher_branches")
        .select("*")
        .eq("teacher_id", created.user.id);
      if (branchReadErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: branchReadErr.message }, 500);
      }
      return json({ profile, teacher_branches: teacherBranches });
    }

    // ---- RESET PASSWORD ---------------------------------------
    if (action === "reset_password") {
      const { teacher_id, password } = body;
      if (!teacher_id || !password) return json({ error: "Thiếu thông tin" }, 400);
      if (String(password).length < 6) {
        return json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, 400);
      }
      if (!(await ownedTeacher(teacher_id))) {
        return json({ error: "Giáo viên không thuộc chi nhánh của bạn" }, 403);
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(
        teacher_id,
        { password },
      );
      if (updErr) return json({ error: updErr.message }, 400);
      return json({ ok: true });
    }

    // ---- DELETE ------------------------------------------------
    if (action === "delete") {
      const { teacher_id } = body;
      if (!teacher_id) return json({ error: "Thiếu thông tin" }, 400);
      if (!(await ownedTeacher(teacher_id))) {
        return json({ error: "Giáo viên không thuộc chi nhánh của bạn" }, 403);
      }
      // Xóa auth user → profiles cascade → salaries/schedules cascade
      const { error: delErr } = await admin.auth.admin.deleteUser(teacher_id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Hành động không hợp lệ" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || "Lỗi không xác định" }, 500);
  }
});
