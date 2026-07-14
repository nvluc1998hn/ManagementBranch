# EduBranch (managementBranch)

Ứng dụng quản lý **chi nhánh – giáo viên – lương – thời khóa biểu** cho trung tâm.
Cùng công nghệ với EduTrack (ManagementStudent): HTML/CSS/JS thuần + Supabase qua CDN, **không có build step**.

## 2 vai trò

| Vai trò | Quyền |
|---------|-------|
| **Admin** (chủ trung tâm) | Tự đăng ký trên app. Tạo chi nhánh, môn học của chi nhánh, cấp tài khoản giáo viên, khởi tạo/chốt lương (cố định / theo tiết / hỗn hợp), xếp thời khóa biểu, xem báo cáo lương. |
| **Giáo viên** | Đăng nhập bằng tài khoản admin cấp. Tự đổi tên/SĐT/mật khẩu, xem lịch dạy của mình, bấm **Vào ca** khi bắt đầu và **Xong ca** khi kết thúc. Ca quá ngày mà không bấm "Xong ca" được tính là **không dạy**. |

## Chạy thử local

```bash
npx serve .
# hoặc
python -m http.server 8080
```

(Service worker cần HTTP, không chạy được qua `file://`.)

## Cấu hình Supabase (làm 1 lần)

1. Tạo project mới trên [supabase.com](https://supabase.com).
2. **SQL Editor** → dán toàn bộ `supabase_schema.sql` → Run.
3. **Authentication → Sign In / Providers** → tắt **Confirm email**
   (app cần có session ngay sau khi đăng ký).
4. **Project Settings → API** → copy `Project URL` và `publishable (anon) key`
   → dán vào 2 hằng `SUPABASE_URL`, `SUPABASE_KEY` đầu file `data.js`.
5. Deploy Edge Function tạo tài khoản giáo viên (cần [Supabase CLI](https://supabase.com/docs/guides/cli)):

   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase functions deploy create-teacher
   ```

   Function này dùng để **tạo / xóa tài khoản giáo viên và reset mật khẩu** —
   bắt buộc chạy server-side vì client không có quyền `auth.admin.*`.
   Không cần khai báo secret: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` được tự inject.

6. Mở app → tab **Đăng ký quản trị** → tạo tài khoản admin đầu tiên.

## Luồng sử dụng

1. Admin tạo **chi nhánh** → thêm **môn học** cho chi nhánh.
2. Admin vào **Giáo viên** → "Thêm giáo viên" (email + mật khẩu cấp cho GV, chọn chi nhánh) → bấm **Lương** để chốt lương (loại: cố định / theo tiết / hỗn hợp, có lịch sử theo `effective_from`).
3. Admin vào **Thời khóa biểu** → thêm ca dạy theo ngày (chi nhánh → môn → giáo viên → giờ); có nút **Sao chép tuần trước**.
4. Giáo viên đăng nhập → Tổng quan/Thời khóa biểu hiện ca hôm nay → bấm **Vào ca** rồi **Xong ca**.
5. **Báo cáo**: chọn tháng → số ca xếp / đã dạy / không dạy và lương từng giáo viên.
   Công thức: lương cố định nhận nguyên mức; theo tiết = đơn giá × số ca **đã dạy**; hỗn hợp = cả hai.

## Bảo mật (đã làm sẵn trong schema)

- RLS bật trên mọi bảng: admin chỉ thấy chi nhánh mình sở hữu; giáo viên chỉ thấy dữ liệu của chính mình.
- Giáo viên **không có quyền UPDATE** bảng `schedules` — chỉ đổi trạng thái qua 2 RPC `check_in_schedule` / `complete_schedule` (kiểm tra đúng người, đúng ngày, đúng thứ tự trạng thái).
- `role`/`branch_id` của profile nằm trong `app_metadata` (chỉ service role đặt được) — người tự đăng ký không thể tự phong mình làm giáo viên của chi nhánh người khác; trigger `protect_profile_fields` chặn đổi role qua API.

## PWA

`sw.js` cache-first theo `CACHE_NAME = 'edubranch-v1'` — **bump version** mỗi khi sửa `index.html` / `app.js` / `data.js` / `style.css`, nếu không client đã cài PWA vẫn dùng bản cũ.
