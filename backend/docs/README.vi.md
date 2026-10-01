<div align="center">

# 🎬 XOi · Nhà máy phim ngắn AI

**Công cụ sản xuất phim ngắn AI trọn gói: từ tiểu thuyết đến video hoàn chỉnh, tự động hóa toàn bộ quy trình.**

Vòng khép kín hoàn chỉnh "Lên kế hoạch → Viết kịch bản → Phân cảnh → Sản xuất", hỗ trợ quy trình chạy nội bộ, có thể lập trình và phát triển lặp, hiệu quả tăng 10+ lần.

</div>

---

## 🌐 Ngôn ngữ hỗ trợ

| Language              |
| --------------------- |
| Chinese (Simplified)  |
| Chinese (Traditional) |
| English               |
| Thai                  |
| Vietnamese            |
| Japanese              |
| Russian               |

---

## 🌟 Tính năng chính

- ✅ **Bàn làm việc Canvas vô hạn** — tổ chức kịch bản, nhân vật, phân cảnh, tài nguyên và nút video trên canvas vô hạn với sắp xếp tự do và sản xuất song song.
- ✅ **Hệ thống Agent ba lớp** — lớp ra quyết định, lớp thực thi và lớp giám sát phối hợp, bao phủ phân rã nhiệm vụ, tạo nội dung, kiểm tra chất lượng và phản hồi chỉnh sửa.
- ✅ **Bộ nhớ Agent bền vững** — hệ thống bộ nhớ xuyên phiên dựa trên tìm kiếm vector ONNX cục bộ (tin nhắn ngắn hạn, tóm tắt dài hạn, truy hồi ngữ nghĩa).
- ✅ **Hệ thống Vendor có thể lập trình** — viết logic TypeScript của vendor ngay trong trung tâm cài đặt và áp dụng ngay lập tức mà không cần khởi động lại.
- ✅ **Chuyển thể dựa trên đồ thị sự kiện chương** — tự động trích xuất và cấu trúc hóa sự kiện của các chương từ tiểu thuyết gốc để chuyển thể chính xác.
- ✅ **Cấu hình Skill dạng file** — prompt chính của ScriptAgent và ProductionAgent được tách ra thành file Markdown Skill để chỉnh sửa trực tuyến.

---

## 🚀 Bắt đầu nhanh

1. Khởi động dịch vụ và đăng nhập (mặc định: `admin` / `admin123`).
2. Cấu hình vendor mô hình (văn bản / hình ảnh / video) trong trung tâm cài đặt.
3. Tạo dự án, nhập tiểu thuyết gốc và trích xuất sự kiện chương.
4. Dùng ScriptAgent tạo khung truyện, chiến lược chuyển thể và kịch bản có cấu trúc.
5. Chuyển sang ProductionAgent, tổ chức phân cảnh, tài nguyên và nút video trên canvas vô hạn.
6. Tinh chỉnh hình ảnh phân cảnh rồi ghép và xuất video cuối cùng.

> ⚠️ **Đăng nhập đầu tiên** — tài khoản: `admin`, mật khẩu: `admin123`. Trong môi trường production, hãy đổi mật khẩu qua biến môi trường `XOI_ADMIN_PASSWORD`.

---

## 🚀 Cài đặt

### Yêu cầu

- ✅ Endpoint LLM API
- ✅ Endpoint tạo video
- ✅ Endpoint tạo hình ảnh

### Chạy nội bộ

```bash
yarn install
yarn dev        # chế độ dev, cổng 10588
yarn build      # build production
yarn start      # chạy bản production
```

### Docker

```shell
docker build -t xoi .
docker run -d -p <cổng-local>:10588 -v <đường-dẫn-dữ-liệu>:/app/data xoi
```

### Biến môi trường

| Biến                 | Mô tả                                           |
| -------------------- | ----------------------------------------------- |
| `NODE_ENV`           | Môi trường runtime, `prod` là production        |
| `PORT`               | Cổng dịch vụ (mặc định 10588)                    |
| `OSSURL`             | URL truy cập tài nguyên tĩnh                     |
| `XOI_ADMIN_USERNAME` | Tên quản trị (chỉ khởi tạo lần đầu, mặc định admin) |
| `XOI_ADMIN_PASSWORD` | Mật khẩu quản trị (chỉ khởi tạo lần đầu, mặc định admin123) |

### Triển khai trên cloud

```bash
# 1. Cài Node.js / Yarn / PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g yarn pm2

# 2. Triển khai
cd /opt
git clone <địa-chỉ-repo-xoi-của-bạn>
cd <repo>
yarn install
yarn build

# 3. Cấu hình PM2 (pm2.json)
```

```json
{
  "name": "xoi",
  "script": "data/serve/app.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": { "NODE_ENV": "prod", "PORT": 10588, "OSSURL": "http://127.0.0.1:10588/" }
}
```

```bash
# 4. Khởi động dịch vụ
pm2 start pm2.json
pm2 startup
pm2 save
```

---

## 🔧 Phát triển

### Công nghệ sử dụng

| Danh mục     | Công nghệ                                                                                |
| ------------ | ---------------------------------------------------------------------------------------- |
| Runtime      | Node.js 23.11.1+                                                                         |
| Ngôn ngữ     | TypeScript 5.x                                                                           |
| Backend      | Express 5                                                                                |
| Cơ sở dữ liệu| SQLite (better-sqlite3 / knex)                                                           |
| AI           | Vercel AI SDK (OpenAI / Anthropic / Google / DeepSeek / Zhipu / MiniMax / Qwen / xAI)    |
| AI cục bộ    | @huggingface/transformers (ONNX)                                                         |
| Realtime     | Socket.IO                                                                                |
| Hình ảnh     | Sharp                                                                                    |
| Container    | Docker                                                                                   |

```bash
git clone <địa-chỉ-repo-xoi-của-bạn>
cd <repo>
yarn install
yarn dev       # server dev backend, cổng 10588
yarn lint      # kiểm tra kiểu
```

---

## 💌 Liên hệ

- 🌐 Website: https://xoi.net
- 📧 Email: contact@xoi.net

---

## 📜 Giấy phép

XOi là **phần mềm thương mại độc quyền (closed-source)**. Nghiêm cấm sao chép, phân phối, dịch ngược hoặc phát hành lại khi chưa có sự cho phép bằng văn bản của XOi. Các phụ thuộc nguồn mở của bên thứ ba tuân theo giấy phép riêng của chúng; xem `NOTICES.txt`.

Điều khoản đầy đủ: xem [LICENSE](../LICENSE)

---

##### © 2026 XOi. All rights reserved.
