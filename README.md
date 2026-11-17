# AI Artwork Extractor (MVP)

> **English Summary:**  
> AI Artwork Extractor is an MVP tool tailored for print-on-demand (POD) and apparel designers to extract embroidered patches, badges, and artwork prints from product mockup images into clean, transparent-background PNGs using Meta SAM 3 and Qwen3-VL-4B-Instruct. Heavy inference runs on Google Colab (Tesla T4 16GB) exposed via Cloudflare Quick Tunnel, while a modern React web interface (Vite + React 19 + TypeScript) runs locally on the designer's laptop / browser. Original RGB pixels are preserved strictly from the input image without generative redrawing.
>
> *(Phần hướng dẫn chi tiết bên dưới được viết bằng tiếng Việt).*

---

## 1. Giới thiệu & Kiến trúc hệ thống

### 1.1. Mục tiêu dự án
**AI Artwork Extractor** là công cụ MVP hỗ trợ designer thời trang và Print-on-Demand (POD):
- Tải lên ảnh chụp hoặc mockup sản phẩm (áo thun, hoodie, mũ lưỡi trai, balo...).
- Mô tả bằng tiếng Việt tự nhiên để nhận gợi ý prompt tiếng Anh từ trợ lý **Qwen3-VL-4B-Instruct**.
- Hoặc nhập prompt thủ công và khoanh vùng đối tượng bằng **Bounding Box**.
- Chạy mô hình phân đoạn đối tượng tiên tiến **Meta SAM 3** trên Google Colab T4.
- Duyệt qua các mặt nạ ứng viên (candidate masks) kèm điểm tin cậy (confidence score) và bounding box.
- Xuất file ảnh PNG nền trong suốt (RGBA) **bảo toàn nguyên vẹn 100% pixel gốc** (không dùng AI tái tạo hay vẽ lại nét) phục vụ thiết kế in ấn và lưu trữ tư liệu.

### 1.2. Sơ đồ kiến trúc tổng thể

```text
┌──────────────────────────────────────┐
│ LAPTOP / BROWSER                     │
│                                      │
│  React Web UI (web_app/)             │
│  http://localhost:5173               │
│  - Upload product image              │
│  - Interactive Canvas & Box drawing  │
│  - Ask Qwen Prompt Assistant         │
│  - Review candidates & live preview  │
│  - Lossless full-cutout composition  │
│  - Export transparent PNG / ZIP      │
└──────────────────┬───────────────────┘
                   │ HTTPS request (CORS enabled)
                   │ image + prompt + optional box
                   ▼
┌──────────────────────────────────────┐
│ CLOUDFLARE QUICK TUNNEL              │
│ temporary https://xxxxx.trycloudflare.com
└──────────────────┬───────────────────┘
                   │ tunnel to localhost:8000
                   ▼
┌──────────────────────────────────────┐
│ GOOGLE COLAB — T4 16GB               │
│                                      │
│  FastAPI (Uvicorn background daemon) │
│     │                                │
│     ├── Qwen3-VL-4B Prompt Assistant │
│     │      image + user intent       │
│     │      → short English prompt(s) │
│     │                                │
│     └── SAM 3 Segmentation Engine    │
│            text / box / text + box   │
│                 │                    │
│                 ▼                    │
│         masks + scores + boxes       │
│                 │                    │
│                 ▼                    │
│     Image Export (Lean Profile ZIP)  │
│     crop PNG + overlay + metadata    │
└──────────────────────────────────────┘
```

> [!NOTE]
> Ảnh sản phẩm không cần tải lên bất kỳ dịch vụ lưu trữ đám mây công khai nào trước. Trình duyệt gửi trực tiếp dữ liệu nhị phân của ảnh qua đường truyền HTTPS tới backend FastAPI trên Colab thông qua Cloudflare Quick Tunnel (đã được bật CORS).

### 1.3. Phạm vi tính năng MVP

#### Có trong MVP:
- Hỗ trợ tải lên ảnh sản phẩm định dạng JPG, JPEG, PNG trên giao diện Web UI (phía backend FastAPI hỗ trợ thêm WebP khi gọi trực tiếp qua API).
- Nhập prompt văn bản thủ công bằng tiếng Anh để SAM 3 tìm kiếm artwork (giao diện tự động cảnh báo màu vàng nếu người dùng nhập ký tự tiếng Việt / non-ASCII vì SAM 3 chỉ hiểu tiếng Anh).
- Vẽ hộp giới hạn (Bounding Box) trực tiếp trên canvas tương tác để định vị khu vực cần tách.
- Hỗ trợ 3 chế độ trích xuất linh hoạt:
  - `text`: Chỉ sử dụng text prompt.
  - `box`: Chỉ sử dụng bounding box.
  - `text_box`: Kết hợp cả text prompt và bounding box để định vị tối ưu.
- Trợ lý AI Qwen3-VL-4B phân tích ảnh và yêu cầu tiếng Việt tự nhiên, tự động gợi ý prompt tiếng Anh ngắn gọn cùng danh sách prompt thay thế (alternative prompts).
- Designer chủ động kiểm tra, chỉnh sửa hoặc lựa chọn prompt thay thế trước khi chạy trích xuất; hệ thống không tự động chạy khi chưa được xác nhận.
- Hiển thị danh sách các candidate masks SAM 3 sinh ra kèm confidence score và bounding box trên thanh Candidate Strip.
- Xem trước trực quan đa chế độ: Mask đen/trắng, Overlay viền màu trên ảnh gốc, và Cutout nền trong suốt (hỗ trợ chuyển đổi giữa nền lưới caro checkerboard và nền tối dark).
- Xuất kết quả với hai profile xuất ảnh:
  - **Lean Export Profile (mặc định)**: Tối ưu truyền tải siêu tốc qua Cloudflare Quick Tunnel. Server chỉ xuất mask gốc, transparent crop PNG và overlay xem trước thu nhỏ (max side ≤ 768px). Web UI sẽ tự động tái tạo full-canvas cutout losslessly (ghép crop PNG lên canvas trong suốt theo đúng tọa độ pixel gốc), bảo đảm chất lượng **pixel-exact**.
  - **Full Export Profile**: Server xuất đầy đủ file full-canvas cutout RGBA.
  - Xuất gói nén ZIP chứa đầy đủ file ảnh và file `metadata.json`.
- Ghi nhận thông tin xử lý cơ bản: prompt, mode, số lượng candidate, thời gian hoàn thành (ms).

#### Chưa làm trong MVP:
- Tự động tách hàng loạt sản phẩm theo đợt (batch processing).
- Tự động chọn candidate thay thế cho designer.
- Bộ cọ quét / tẩy (brush / eraser) chỉnh sửa chi tiết mask từng pixel.
- Tinh chỉnh điểm tương tác (positive / negative points refinement).
- Nắn thẳng phối cảnh hoặc khử cong nếp gấp vải (perspective correction / dewarping).
- Tái tạo ảnh bằng AI sinh hình ảnh mới (generative redraw / inpainting).
- Xuất file Photoshop PSD phân tầng (layered PSD) hoặc tiện ích Photoshop UXP.
- Tự động xếp mẫu khuôn in POD (POD template placement) hoặc tính toán DPI in ấn.
- Hệ thống tài khoản người dùng, đăng nhập, phân quyền hoặc lưu trữ cơ sở dữ liệu.
- Cơ chế hàng đợi (queue / job scheduler) phục vụ nhiều người dùng đồng thời.

---

## 2. Cấu trúc thư mục dự án

```text
ai-artwork-extractor/
├── colab/
│   ├── SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb  # Notebook Colab máy chủ inference
│   ├── build_notebook.py                                # Script đóng gói notebook tự động
│   └── server_main.py                                   # Helper functions hỗ trợ runtime Colab
├── web_app/                                             # Giao diện Web UI (Vite + React 19 + TypeScript)
│   ├── src/
│   │   ├── core/           # API client, config storage, types, zip parsing, geometry, cutout composer
│   │   ├── state/          # Zustand store quản lý state toàn ứng dụng
│   │   ├── features/       # Feature modules: upload, canvas, prompt, candidates, preview, export, shortcuts, connection
│   │   ├── components/     # UI primitives: Modal, Button, Slider, Toast, Kbd, EmptyState...
│   │   ├── styles/         # CSS design tokens & global themes (dark/light)
│   │   ├── App.tsx         # Layout chính ứng dụng
│   │   └── main.tsx        # Entry point ứng dụng
│   ├── package.json        # Cấu hình dependency npm & scripts (Vite, React, Vitest)
│   ├── vite.config.ts      # Cấu hình Vite dev server & test environment
│   └── tsconfig.json       # Cấu hình TypeScript
├── server_reference/
│   ├── api.py                  # Triển khai FastAPI server trên Colab (CORS, single lock, zip export)
│   ├── sam3_engine.py          # Wrapper nạp và suy luận Meta SAM 3
│   ├── qwen_prompt_assistant.py# Wrapper nạp và gợi ý prompt Qwen3-VL-4B (4-bit NF4)
│   ├── image_export.py         # Hàm xử lý pixel RGB và xuất ZIP (hỗ trợ lean/full profile)
│   ├── schemas.py              # Pydantic schemas cho API request/response
│   ├── errors.py               # Định nghĩa các ngoại lệ chuẩn
│   ├── fake_engines.py         # Mock engines dùng cho local dev và unit test
│   └── run_local_fake.py       # Script chạy server giả lập tại máy local
├── tests/
│   ├── server/                 # Unit & integration tests cho FastAPI và SAM 3
│   ├── assistant/              # Unit tests cho Qwen Prompt Assistant
│   └── colab/                  # Tests kiểm tra notebook generator và server_main
├── docs/
│   ├── API_CONTRACT.md         # Đặc tả chi tiết chuẩn giao tiếp API giữa Web UI và Colab
│   └── TESTING.md              # Kế hoạch kiểm thử F01–F14, smoke test và nghiệm thu
├── AI_Artwork_Extractor_MVP_Project_Plan.md  # Tài liệu kế hoạch chi tiết MVP
├── pytest.ini                  # Cấu hình thực thi bộ test pytest
├── requirements-dev.txt        # Thư viện cho môi trường phát triển & kiểm thử local
└── README.md                   # Tài liệu hướng dẫn cài đặt và sử dụng dự án
```

---

## 3. Quick Start — Phần A: Khởi chạy Máy chủ Colab

Phần này hướng dẫn thiết lập máy chủ suy luận trên Google Colab có GPU Tesla T4 (miễn phí).

### Bước 1: Mở Notebook
1. Truy cập [Google Colab](https://colab.research.google.com/).
2. Tải lên hoặc mở notebook `colab/SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb` từ repository.

### Bước 2: Thiết lập Runtime
1. Trên menu Colab, chọn **Runtime** > **Change runtime type** (Thay đổi loại phiên bản thời gian chạy).
2. Tại mục **Hardware accelerator** (Phần cứng tăng tốc), chọn **T4 GPU**.
3. Khuyến nghị sử dụng Runtime version tiêu chuẩn (2026.07).

### Bước 3: Cấu hình Colab Secrets & Tham số Runtime
Mở biểu tượng chiếc chìa khóa (**Secrets**) ở thanh công cụ bên trái giao diện Colab và thêm các secret sau:
- **`HF_TOKEN`** (*Bắt buộc*): Điền Hugging Face User Access Token (loại **Read**). Tài khoản Hugging Face của bạn cần đã được cấp quyền truy cập vào repository có kiểm duyệt [facebook/sam3](https://huggingface.co/facebook/sam3). Bật quyền *Notebook access* cho secret này.
- **`ARTWORK_API_TOKEN`** (*Tùy chọn*): Khóa bảo vệ Bearer token tùy chỉnh (tối thiểu 16 ký tự). Nếu bỏ qua, notebook sẽ tự động sinh ngẫu nhiên một chuỗi token 32 ký tự an toàn.

> [!TIP]
> **Các cờ cấu hình tại Mục 1b của Notebook:**  
> - `ENABLE_QWEN = True`: Bật/tắt trợ lý Qwen3-VL-4B (4-bit). Nếu VRAM GPU hạn chế, chuyển thành `False` để chạy thuần SAM 3.
> - `MAX_CANDIDATES = 12`: Số lượng candidate tối đa đóng gói vào ZIP kết quả. Giảm xuống (ví dụ 4–6) nếu cần tối ưu tốc độ mạng.
> - `OVERLAY_MAX_SIDE = 768`: Kích thước cạnh lớn nhất của ảnh overlay trong profile `lean` giúp giảm tải dung lượng.
> - `CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]`: Danh sách origins được phép gọi API. Nếu bạn mở Web UI từ một port hoặc host khác (ví dụ qua mạng LAN), hãy thêm URL origin đó vào danh sách này.
> - `STOP_SERVER = False`: Cờ an toàn bảo vệ cell dừng server. Cell dừng server sẽ bỏ qua khi bạn chọn **Run all** và chỉ dừng khi bạn đổi `STOP_SERVER = True`.

### Bước 4: Chạy Notebook
1. Chọn **Runtime** > **Run all** (hoặc nhấn tổ hợp phím `Ctrl + F9`).
2. Quá trình chạy sẽ tuần tự: cài đặt thư viện cần thiết, tải checkpoint SAM 3, nạp Qwen (nếu bật), khởi chạy FastAPI server trên cổng nội bộ `8000`, và mở Cloudflare Quick Tunnel.

### Bước 5: Lấy thông tin kết nối
Tại cell thông tin kết nối, Colab sẽ in URL công khai từ Cloudflare Quick Tunnel cùng API Bearer Token:

*(Ví dụ minh họa nội dung in ra trong notebook)*:
```text
======================================================================
  AI ARTWORK EXTRACTOR — INFERENCE SERVER ONLINE
======================================================================
Public API Base URL: https://random-subdomain.trycloudflare.com
Bearer Token       : your-generated-secret-token-here
WARNING: Do NOT share this token. It grants full access to your GPU server.
======================================================================

# Dán URL và Token vào hộp thoại kết nối trên Web UI ('Cài đặt kết nối API'):
COLAB_API_URL=https://random-subdomain.trycloudflare.com
COLAB_API_TOKEN=your-generated-secret-token-here
----------------------------------------------------------------------
```
Hãy sao chép **Public API Base URL** và **Bearer Token** để kết nối trực tiếp trên Web UI của bạn.

---

## 4. Quick Start — Phần B: Khởi chạy Giao diện Web UI trên Laptop

Giao diện Web UI hiện đại được xây dựng bằng Vite + React 19 + TypeScript, kết nối trực tiếp tới máy chủ Colab (hoặc Fake Server local) thông qua API contract chuẩn.

### Yêu cầu hệ thống:
- **Node.js:** Phiên bản 20 trở lên (`Node.js 20+`, khuyến nghị LTS).
- Trình duyệt web hiện đại: Chrome, Edge, Safari hoặc Firefox.
- Kết nối Internet ổn định.

### Bước 1: Di chuyển vào thư mục web_app và cài đặt dependencies
Từ thư mục gốc của repository, mở terminal và thực hiện:
```bash
cd web_app
npm install
```

### Bước 2: Khởi chạy Vite Dev Server
```bash
npm run dev
```
Terminal sẽ khởi chạy server phát triển và cung cấp đường dẫn truy cập:
```text
  VITE v6.x.x  ready in 250 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```
Mở trình duyệt và truy cập `http://localhost:5173`.

### Bước 3: Cấu hình kết nối API trong giao diện
> [!IMPORTANT]
> **Không cần tạo hay cấu hình file `.env` trên local!**  
> Mọi thông tin kết nối được lưu an toàn trực tiếp trong `localStorage` của trình duyệt.

1. Trên thanh tiêu đề (Top Bar) của Web UI, bấm vào nút trạng thái kết nối **Cài đặt kết nối API** (hoặc biểu tượng trạng thái màu vàng/đỏ).
2. Nhập thông tin:
   - **Colab API Base URL:** Dán URL từ Cloudflare Quick Tunnel (ví dụ `https://random-subdomain.trycloudflare.com`).
   - **API Bearer Token:** Dán Bearer Token từ Colab.
3. Bấm nút **Lưu & Kiểm tra kết nối**.
4. Nút trạng thái trên header sẽ chuyển sang màu xanh **Đã kết nối (Connected)** hiển thị GPU và trạng thái SAM 3 / Qwen.

---

## 5. Phát triển & Kiểm thử Local không cần GPU

Dành cho lập trình viên muốn phát triển giao diện Web UI hoặc chạy trọn bộ kiểm thử tự động trên máy tính cá nhân không có GPU:

### 1. Khởi chạy Fake Server nội bộ
Kho mã nguồn cung cấp sẵn module `server_reference.run_local_fake` tích hợp mock engines với khả năng sinh kết quả chuẩn xác và nhanh chóng mà không cần tải model:

- **Trên Windows (PowerShell):**
  ```powershell
  python -m server_reference.run_local_fake --port 8765 --token "dev-secret-token-12345"
  ```

- **Trên Linux / macOS (Bash):**
  ```bash
  python3 -m server_reference.run_local_fake --port 8765 --token "dev-secret-token-12345"
  ```

Server giả lập sẽ hoạt động tại địa chỉ: `http://127.0.0.1:8765`. Kiểm tra sức khỏe server tại `http://127.0.0.1:8765/health`.

### 2. Kết nối Web UI với Fake Server
1. Mở Web UI tại `http://localhost:5173`.
2. Bấm nút **Cài đặt kết nối API** trên header.
3. Nhập:
   - **Colab API Base URL:** `http://127.0.0.1:8765`
   - **Bearer Token:** `dev-secret-token-12345`
4. Bấm **Lưu & Kiểm tra kết nối**. Trạng thái sẽ chuyển sang xanh sẵn sàng làm việc!

### 3. Chạy bộ kiểm thử tự động (Automated Tests)

- **Kiểm thử Backend Python (pytest):**
  ```bash
  python -m pytest -q
  ```
  *(Chạy 100+ bài test bao gồm API contract, export logic, Qwen parser, notebook generation và fake engines).*

- **Kiểm thử Frontend Web UI (Vitest):**
  ```bash
  cd web_app
  npm run test
  ```
  *(Chạy 80+ bài test kiểm tra store Zustand, client API, box geometry, canvas drawing, candidate strip, preview modal và lossless cutout composition).*

- **Kiểm tra TypeScript & Linting:**
  ```bash
  cd web_app
  npm run typecheck
  npm run lint
  ```

---

## 6. Luồng làm việc của Designer (Workflows)

### Luồng A — Khi đã biết rõ đối tượng cần tách (Manual Mode)
1. **Mở giao diện:** Truy cập Web UI tại `http://localhost:5173` và đảm bảo header hiển thị trạng thái `Đã kết nối`.
2. **Tải ảnh:** Kéo thả hoặc click chọn ảnh sản phẩm (áo thun, hoodie, mũ, túi xách...) vào khung UploadDropzone bên trái.
3. **Nhập mô tả:** Nhập text prompt tiếng Anh rõ ràng (ví dụ: `square embroidered fabric patch`, `round logo badge`, `printed graphic skull`).
   > [!WARNING]
   > **SAM prompt phải là tiếng Anh:** Meta SAM 3 chỉ hiểu tiếng Anh (ký tự ASCII). Nếu bạn nhập tiếng Việt, giao diện sẽ hiển thị cảnh báo màu vàng để nhắc bạn đổi sang tiếng Anh.
4. **Chọn chế độ trích xuất:**
   - Chọn `Text` (phím `T`) nếu muốn SAM 3 tìm kiếm artwork trên toàn bộ ảnh.
   - Chọn `Box` (phím `B`) nếu chỉ muốn tách dựa trên khung khoanh vùng.
   - Chọn `Text + Box` nếu muốn kết hợp cả mô tả ngữ nghĩa và vị trí khoanh vùng.
5. **Khoanh vùng Bounding Box (nếu dùng Box hoặc Text+Box):** Dùng chuột kéo vẽ khung chữ nhật bao quanh artwork trên Canvas trung tâm. Bạn có thể kéo các góc để chỉnh kích thước hoặc nhấn `Esc` / `Delete` để xóa khung vẽ lại.
6. **Thực thi:** Bấm **Bóc tách Artwork** (hoặc nhấn tổ hợp phím tắt `R` hoặc `Ctrl + Enter`).
7. **Duyệt kết quả (Candidates):** Xem danh sách candidate masks trên thanh Candidate Strip ở đáy màn hình (dùng phím mũi tên `←` / `→` để chuyển đổi nhanh).
8. **Xem trước chi tiết (Preview Modal):** Nhấp chọn candidate hoặc bấm *Mở kiểm tra chi tiết ↗* để xem phóng to:
   - Tab **Overlay**: Đường viền phủ màu trên ảnh gốc.
   - Tab **Cutout**: Artwork tách nền hiển thị trên lưới caro trong suốt (hoặc nền tối).
   - Tab **Mask**: Mặt nạ nhị phân đen/trắng chuẩn xác.
9. **Tải kết quả:**
   - Tải file **Cutout Crop** (cắt sát viền artwork kèm padding).
   - Tải file **Full Cutout** (nguyên khổ canvas ảnh gốc, được Web UI tự động ghép losslessly từ crop).
   - Tải file **ZIP tổng hợp** chứa đầy đủ mask, overlay, cutout và `metadata.json`.

### Luồng B — Khi chưa biết cách đặt prompt tiếng Anh (Prompt Assistant Mode)
1. **Tải ảnh:** Upload ảnh sản phẩm lên giao diện.
2. **Nhập yêu cầu bằng tiếng Việt:** Nhập câu miêu tả tự nhiên vào ô hỏi trợ lý, ví dụ:
   - *"Lấy toàn bộ patch vuông thêu ở ngực áo, bao gồm cả viền vải thêu."*
   - *"Chỉ lấy phần chữ thêu uốn cong ở phía trên, không lấy hình vẽ bên dưới."*
   - *"Lấy hình in bông hoa bên trong, bỏ phần viền nhãn mác bên ngoài."*
3. **Yêu cầu trợ lý:** Bấm **Gợi ý prompt** (Ask Qwen).
4. **Nhận phân tích:** Qwen3-VL-4B phân tích trực quan bức ảnh cùng ngữ nghĩa câu hỏi, trả về:
   - Xác định phạm vi: `entire_patch` (toàn bộ nhãn), `inner_artwork` (họa tiết bên trong), hoặc `individual_decoration`.
   - Prompt tiếng Anh gợi ý chính xác cho SAM 3 (tự động điền vào ô SAM Prompt nếu ô đang trống).
   - Danh sách tối đa 3 prompt thay thế (alternative prompts) hiển thị dạng thẻ chip.
5. **Xác nhận prompt:** Designer có thể giữ nguyên prompt gợi ý, chỉnh sửa trực tiếp, hoặc click vào một chip alternative prompt bất kỳ để đổi sang prompt đó.
6. **Khoanh vùng bổ sung (tùy chọn):** Vẽ thêm bounding box nếu muốn giới hạn tuyệt đối khu vực tách.
7. **Thực thi & Tải file:** Bấm **Bóc tách Artwork** (hoặc `R` / `Ctrl + Enter`), chọn candidate ưng ý và xuất ảnh PNG nền trong suốt.

> [!IMPORTANT]
> **Qwen không tự ý chạy phân đoạn hay tự ý quyết định candidate cuối cùng.** Trợ lý LLM chỉ đóng vai trò dịch thuật ngữ nghĩa và đề xuất từ khóa. Designer luôn giữ quyền duyệt prompt và chọn mask cuối cùng.

---

## 7. Bảng phím tắt (Keyboard Shortcuts)

Web UI hỗ trợ hệ thống phím tắt trực quan giúp designer thao tác nhanh chóng và mượt mà:

| Phím tắt | Thao tác | Mô tả chi tiết |
|---|---|---|
| `R` hoặc `Ctrl + Enter` | **Bóc tách SAM 3** | Chạy phân đoạn artwork với các tham số hiện tại |
| `B` | **Chế độ Box** | Chuyển nhanh sang chế độ vẽ Bounding Box |
| `T` | **Chế độ Text** | Chuyển nhanh sang chế độ nhập SAM Text Prompt |
| `Esc` hoặc `Delete` | **Xóa Box** | Xóa khung Bounding Box hiện tại trên Canvas |
| `←` / `→` (Mũi tên) | **Duyệt Candidate** | Chuyển đổi qua lại giữa các Candidate Masks trên thanh đáy |
| `F` | **Fit Canvas** | Căn chỉnh kích thước ảnh vừa vặn khung nhìn Canvas |
| `Space` + Kéo chuột | **Di chuyển (Pan)** | Giữ phím cách và kéo chuột để di chuyển Canvas |
| `?` | **Mở bảng phím tắt** | Hiển thị modal tóm tắt các phím tắt |

---

## 8. Bảng tóm tắt API & Ví dụ cURL

Chi tiết đầy đủ về định dạng dữ liệu, quy ước trường và mã lỗi được ghi rõ trong tài liệu [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

### 8.1. Bảng tóm tắt Endpoints

| Phương thức | Đường dẫn (Path) | Xác thực (Auth) | Định dạng Body | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/health` | Không yêu cầu | Không có | Kiểm tra trạng thái server, GPU, SAM 3, Qwen và cờ `busy`. |
| `POST` | `/api/v1/assistant/prompt` | `Bearer <token>` | `multipart/form-data` | Gửi ảnh + yêu cầu tiếng Việt; nhận JSON gợi ý prompt SAM 3 tiếng Anh. |
| `POST` | `/api/v1/segment` | `Bearer <token>` | `multipart/form-data` | Gửi ảnh + mode (`text`/`box`/`text_box`) + prompt/bbox; nhận file `result.zip`. |

### 8.2. Ví dụ gọi cURL

#### 1. Kiểm tra trạng thái hệ thống (`GET /health`):
```bash
curl -X GET "https://your-tunnel.trycloudflare.com/health"
```
*Phản hồi mẫu:*
```json
{
  "status": "ok",
  "gpu": "Tesla T4",
  "sam3_loaded": true,
  "qwen_loaded": true,
  "prompt_assistant_available": true,
  "busy": false
}
```

#### 2. Yêu cầu gợi ý Prompt (`POST /api/v1/assistant/prompt`):
```bash
curl -X POST "https://your-tunnel.trycloudflare.com/api/v1/assistant/prompt" \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -F "image=@sample_cap.jpg" \
  -F "user_request=Lấy toàn bộ patch vuông thêu ở mặt trước mũ" \
  -F "scope_preference=auto"
```

#### 3. Phân đoạn đối tượng (`POST /api/v1/segment`):
```bash
curl -X POST "https://your-tunnel.trycloudflare.com/api/v1/segment" \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -F "image=@sample_cap.jpg" \
  -F "mode=text_box" \
  -F "prompt=square embroidered fabric patch" \
  -F 'bbox=[0.5, 0.45, 0.35, 0.3]' \
  -F "confidence_threshold=0.35" \
  -F "export_profile=lean" \
  --output result.zip
```

---

## 9. An toàn thông tin & Bảo mật

Tuân thủ nghiêm ngặt theo các nguyên tắc an ninh của dự án (Kế hoạch §7.3, §8.2):
1. **Xác thực Bearer Token bắt buộc:** Mọi endpoint xử lý nghiệp vụ (`/api/v1/...`) đều bắt buộc phải có header `Authorization: Bearer <token>`. Request thiếu token hoặc sai token sẽ bị từ chối ngay lập tức với mã lỗi `401 Unauthorized`. Token không bao giờ được phép truyền qua URL query string.
2. **Không commit bí mật lên Git:** Tuyệt đối không commit Hugging Face token hay API Bearer token vào repository. Kho mã nguồn đã cấu hình sẵn quy tắc chặn trong `.gitignore`.
3. **Bản chất của Cloudflare Quick Tunnel:** Quick Tunnel là đường hầm công khai tạm thời phục vụ giai đoạn thử nghiệm (không yêu cầu domain riêng). Bất kỳ ai có đường link URL đều có thể truy cập tới cổng dịch vụ; do đó Bearer token là chốt chặn bảo vệ duy nhất và bắt buộc.
4. **Cấu hình CORS an toàn:** Server FastAPI Colab giới hạn các domain được phép gọi API thông qua danh sách `cors_origins` (mặc định cho phép `localhost:5173` và `127.0.0.1:5173`).
5. **Bảo mật dữ liệu khách hàng:** Không tải lên ảnh thiết kế độc quyền chưa công bố, hình ảnh nhạy cảm hoặc tư liệu khách hàng bí mật lên môi trường thử nghiệm khi chưa có sự phê duyệt chính thức từ ban quản lý.
6. **Giới hạn tải lên & Xử lý In-Memory:** Server giới hạn dung lượng upload tối đa (mặc định 20MB) và chỉ chấp nhận định dạng ảnh hợp lệ. Toàn bộ quá trình tạo ảnh cutout, overlay và đóng gói file ZIP kết quả đều được thực hiện hoàn toàn trong bộ nhớ RAM (`io.BytesIO`), không ghi file tạm ra ổ đĩa, giúp bảo vệ dữ liệu và giải phóng bộ nhớ ngay sau khi request hoàn tất.

---

## 10. Xử lý sự cố thường gặp (Troubleshooting)

| Tình huống / Mã lỗi | Nguyên nhân khả dĩ | Hướng dẫn khắc phục |
|---|---|---|
| **Lỗi CORS trong browser console**<br>(*Access-Control-Allow-Origin*) | Origin của trình duyệt (ví dụ `http://localhost:5173` hoặc IP mạng LAN) chưa được khai báo trong danh sách `CORS_ORIGINS` của server Colab. | 1. Mở lại notebook Colab, tìm đến **Mục 1b (Cell cấu hình chung)**.<br>2. Thêm origin của bạn vào danh sách `CORS_ORIGINS`, ví dụ: `CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://192.168.1.x:5173"]`.<br>3. Chạy lại cell khởi chạy FastAPI server (Mục 11). |
| **Phản hồi chậm / Quá thời gian chờ (Timeout > 100s)** | - Cloudflare Quick Tunnel tự động ngắt kết nối với các request kéo dài hơn ~100 giây.<br>- Ảnh có độ phân giải rất lớn (ví dụ 2000×1805 trở lên) sinh quá nhiều candidate masks làm nặng gói ZIP. | 1. Giảm `MAX_CANDIDATES` ở Mục 1b của Colab (ví dụ giảm từ 12 xuống 4–6).<br>2. Chuyển sang dùng chế độ `Box` hoặc `Text + Box` để khoanh vùng mục tiêu cụ thể thay vì để SAM quét toàn ảnh.<br>3. Giữ nguyên chế độ export mặc định là `lean` (tránh dùng `full`). |
| **0 candidates tìm thấy**<br>(*num_candidates = 0*) | - Prompt mô tả bằng tiếng Việt (Meta SAM 3 chỉ hiểu tiếng Anh).<br>- Prompt tiếng Anh quá chung chung hoặc sai ngữ nghĩa.<br>- Ngưỡng tin cậy (`confidence_threshold`) đang đặt quá cao.<br>- Đối tượng có độ tương phản quá kém so với nền. | 1. **Kiểm tra prompt tiếng Anh**: Đảm bảo dùng tiếng Anh (ví dụ `embroidered patch` thay vì `miếng vá thêu`); chú ý cảnh báo màu vàng trên Web UI.<br>2. Dùng trợ lý Qwen để nhận gợi ý từ khóa chuẩn xác.<br>3. Chuyển sang mode `Box` hoặc `Text + Box` và vẽ bounding box định vị đối tượng.<br>4. Kéo thanh trượt hạ nhẹ ngưỡng tin cậy trên UI (ví dụ từ 0.35 xuống 0.20–0.25). |
| **Mất kết nối / Expired Tunnel**<br>(*Web UI báo "Disconnected"*) | - Phiên làm việc Google Colab bị ngắt do hết hạn runtime hoặc mất mạng.<br>- Tiến trình `cloudflared` Quick Tunnel bị dừng. | 1. Kiểm tra lại tab Google Colab.<br>2. Nếu runtime bị ngắt, chạy lại notebook.<br>3. Sao chép URL mới, bấm nút trạng thái kết nối trên header của Web UI, dán URL mới và bấm **Lưu & Kiểm tra kết nối**. |
| **Lỗi 401 Unauthorized** | - Bearer Token chưa được nhập hoặc nhập sai trong Web UI.<br>- Token không khớp chính xác với Token được sinh trên Colab. | Kiểm tra lại thông báo ở cell Mục 13 của Colab, copy lại chính xác toàn bộ chuỗi token (không thừa dấu cách), dán vào ô **API Bearer Token** trong hộp thoại 'Cài đặt kết nối API' rồi bấm **Lưu & Kiểm tra kết nối**. |
| **Lỗi 409 Conflict ("busy")** | - GPU đang bận xử lý một request phân đoạn hoặc trợ lý khác.<br>- Hệ thống áp dụng khóa đơn nhiệm (`single-request lock`) để tránh tràn bộ nhớ VRAM GPU. | Hệ thống không xếp hàng tự động. Bạn chỉ cần đợi từ 3–5 giây để request trước hoàn tất rồi bấm bóc tách lại. |
| **Lỗi 413 Payload Too Large** | Kích thước file ảnh tải lên vượt quá giới hạn cấu hình của server (mặc định 20MB). | Dùng công cụ đồ họa nén nhẹ ảnh hoặc giảm độ phân giải xuống dưới mức 20MB trước khi tải lên (Web UI cũng sẽ cảnh báo trước khi gửi). |
| **Lỗi 503 trên /api/v1/segment**<br>(*SAM 3 Not Loaded*) | Mô hình SAM 3 chưa được nạp vào bộ nhớ GPU trên Colab, hoặc cell khởi tạo model gặp lỗi/chưa được chạy xong. | Mở lại notebook trên Colab, chạy lại cell nạp SAM 3 (`Sam3Engine.load()`), hoặc chọn **Runtime** > **Restart session and run all** nếu GPU bị lỗi trạng thái. |
| **Lỗi 503 trên /api/v1/assistant/prompt**<br>(*Prompt Assistant Unavailable*) | Trợ lý Qwen3-VL-4B bị vô hiệu hóa (`ENABLE_QWEN=False`) hoặc gặp sự cố tràn bộ nhớ VRAM (OOM) khi nạp đồng thời cùng SAM 3 trên GPU Tesla T4 (16GB). | Hệ thống tự động giải phóng Qwen để bảo vệ SAM 3. Chuyển sang **Luồng A (Manual Mode)**: tự nhập trực tiếp prompt tiếng Anh để tiếp tục trích xuất mà không làm gián đoạn công việc. |
| **Server dừng ngoài ý muốn khi Run all** | Cell dừng server bị chạy tự động. | Cell dừng server đã được bảo vệ bởi cờ `STOP_SERVER = False`. Nếu muốn dừng server Uvicorn và Cloudflare Tunnel, bạn chỉ cần sửa `STOP_SERVER = True` trong cell đó rồi chạy lại. |

---

## 11. Tài liệu tham khảo liên quan

- 📋 [AI Artwork Extractor MVP Project Plan](AI_Artwork_Extractor_MVP_Project_Plan.md) — Bản kế hoạch chi tiết, kiến trúc và phân tích rủi ro.
- 🔌 [API Contract Specification](docs/API_CONTRACT.md) — Chi tiết hợp đồng API, schema dữ liệu và cấu trúc gói ZIP.
- 🧪 [Testing & Validation Guide](docs/TESTING.md) — Danh mục kiểm thử chức năng F01–F14, dataset smoke test và tiêu chí nghiệm thu demo.
