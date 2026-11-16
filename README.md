# AI Artwork Extractor (MVP)

> **English Summary:**  
> AI Artwork Extractor is an MVP tool tailored for print-on-demand (POD) and apparel designers to extract embroidered patches, badges, and artwork prints from product mockup images into clean, transparent-background PNGs using Meta SAM 3 and Qwen3-VL-4B-Instruct. Heavy inference runs on Google Colab (Tesla T4 16GB) exposed via Cloudflare Quick Tunnel, while a lightweight Streamlit interface runs locally on the designer's laptop. Original RGB pixels are preserved strictly from the input image without generative redrawing.
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
│ LAPTOP                               │
│                                      │
│  Local Streamlit UI                  │
│  - Upload product image              │
│  - Enter manual prompt               │
│  - Ask Qwen Prompt Assistant         │
│  - Draw target bounding box          │
│  - Review candidates                 │
│  - Download transparent PNG          │
└──────────────────┬───────────────────┘
                   │ HTTPS request
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
│  FastAPI                             │
│     │                                │
│     ├── Qwen3-VL-4B Prompt Assistant │
│     │      image + user intent       │
│     │      → short SAM prompt(s)     │
│     │                                │
│     └── SAM 3 Segmentation Engine    │
│            text / box / text + box   │
│                 │                    │
│                 ▼                    │
│         masks + scores + boxes       │
│                 │                    │
│                 ▼                    │
│         PNG / overlay / metadata     │
└──────────────────────────────────────┘
```

> [!NOTE]
> Ảnh sản phẩm không cần tải lên bất kỳ dịch vụ lưu trữ đám mây công khai nào trước. Ứng dụng local trên laptop gửi trực tiếp dữ liệu nhị phân của ảnh qua đường truyền HTTPS tới backend FastAPI trên Colab thông qua Cloudflare Quick Tunnel.

### 1.3. Phạm vi tính năng MVP

#### Có trong MVP:
- Hỗ trợ tải lên ảnh sản phẩm các định dạng: JPG, JPEG, PNG, WebP.
- Nhập prompt văn bản thủ công bằng tiếng Anh để SAM 3 tìm kiếm artwork.
- Vẽ hộp giới hạn (Bounding Box) trực tiếp trên khung vẽ ảnh để định vị khu vực cần tách.
- Hỗ trợ 3 chế độ trích xuất linh hoạt:
  - `text`: Chỉ sử dụng text prompt.
  - `box`: Chỉ sử dụng bounding box.
  - `text_box`: Kết hợp cả text prompt và bounding box để định vị tối ưu.
- Trợ lý AI Qwen3-VL-4B phân tích ảnh và yêu cầu tiếng Việt tự nhiên, tự động gợi ý prompt tiếng Anh ngắn gọn cùng danh sách prompt thay thế.
- Designer chủ động kiểm tra, chỉnh sửa hoặc lựa chọn prompt thay thế trước khi chạy trích xuất.
- Hiển thị toàn bộ các candidate masks SAM 3 sinh ra kèm confidence score và bounding box.
- Xem trước trực quan: Mask đen/trắng, Overlay trên ảnh gốc, và Cutout nền trong suốt (trên hoa văn caro).
- Xuất kết quả đa dạng:
  - Mask PNG trắng/đen chuẩn kích thước ảnh gốc.
  - Transparent PNG nguyên khổ canvas (full canvas cutout).
  - Transparent PNG cắt cúp sát biên artwork (crop cutout kèm padding tùy chọn).
  - Gói nén ZIP chứa đầy đủ file ảnh và file `metadata.json`.
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
│   └── build_notebook.py                                # Script đóng gói notebook tự động
├── local_app/
│   ├── app.py                  # Giao diện chính Streamlit cho designer
│   ├── remote_client.py        # Client HTTP kết nối tới Colab API
│   ├── canvas_utils.py         # Quy đổi tọa độ box từ canvas sang ảnh gốc
│   ├── result_viewer.py        # Hiển thị mask, overlay và alpha preview
│   ├── requirements.txt        # Các thư viện Python cho local app
│   ├── .env.example            # Mẫu cấu hình môi trường local
│   └── .env                    # Cấu hình chứa API URL và Token (đã gitignore)
├── server_reference/
│   ├── api.py                  # Triển khai FastAPI server trên Colab
│   ├── sam3_engine.py          # Wrapper nạp và suy luận Meta SAM 3
│   ├── qwen_prompt_assistant.py# Wrapper nạp và gợi ý prompt Qwen3-VL-4B
│   ├── image_export.py         # Hàm xử lý pixel RGB và xuất ZIP kết quả
│   ├── schemas.py              # Pydantic schemas cho API request/response
│   ├── errors.py               # Định nghĩa các ngoại lệ chuẩn
│   ├── fake_engines.py         # Mock engines dùng cho local dev và unit test
│   └── run_local_fake.py       # Script chạy server giả lập tại máy local
├── tests/
│   ├── server/                 # Unit & integration tests cho FastAPI và SAM 3
│   ├── assistant/              # Unit tests cho Qwen Prompt Assistant
│   └── local_app/              # Unit tests cho các module của local UI
├── docs/
│   ├── API_CONTRACT.md         # Đặc tả chi tiết chuẩn giao tiếp API giữa Local và Colab
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

### Bước 3: Cấu hình Colab Secrets
Mở biểu tượng chiếc chìa khóa (**Secrets**) ở thanh công cụ bên trái giao diện Colab và thêm các secret sau:
- **`HF_TOKEN`** (*Bắt buộc*): Điền Hugging Face User Access Token (loại **Read**). Tài khoản Hugging Face của bạn cần đã được cấp quyền truy cập vào repository có kiểm duyệt [facebook/sam3](https://huggingface.co/facebook/sam3). Bật quyền *Notebook access* cho secret này.
- **`ARTWORK_API_TOKEN`** (*Tùy chọn*): Khóa bảo vệ Bearer token tùy chỉnh (tối thiểu 16 ký tự). Nếu bỏ qua, notebook sẽ tự động sinh ngẫu nhiên một chuỗi token 32 ký tự an toàn.

> [!TIP]
> **Cờ điều khiển Qwen (`ENABLE_QWEN`):**  
> Mặc định notebook kích hoạt thử nghiệm trợ lý Qwen3-VL-4B ở chế độ 4-bit (`ENABLE_QWEN = True`). Nếu bộ nhớ VRAM của GPU T4 không đủ hoặc bạn muốn tối ưu tốc độ cho SAM 3, bạn có thể chuyển thành `ENABLE_QWEN = False`. Khi đó hệ thống sẽ tự động chuyển sang chế độ Manual Mode (chỉ chạy SAM 3) một cách an toàn mà không làm gián đoạn API.

### Bước 4: Chạy Notebook
1. Chọn **Runtime** > **Run all** (hoặc nhấn tổ hợp phím `Ctrl + F9`).
2. Quá trình chạy sẽ tuần tự: cài đặt thư viện cần thiết, tải checkpoint SAM 3, nạp Qwen (nếu bật), khởi chạy FastAPI server trên cổng nội bộ `8000`, và mở Cloudflare Quick Tunnel.

### Bước 5: Lấy thông tin kết nối
Tại cell cuối cùng của notebook, Colab sẽ hiển thị thông tin dạng:
```text
======================================================================
🚀 AI ARTWORK EXTRACTOR SERVER IS READY!
======================================================================
Public API URL : https://random-subdomain.trycloudflare.com
API Bearer Token: your-generated-secret-token-here
Health Check   : https://random-subdomain.trycloudflare.com/health
======================================================================
```
Hãy sao chép **Public API URL** và **API Bearer Token** để cấu hình cho Local App trên máy tính của bạn.

---

## 4. Quick Start — Phần B: Khởi chạy Giao diện Local trên Laptop

Ứng dụng giao diện Streamlit chạy trên laptop của designer, kết nối tới máy chủ Colab qua Internet.

### Yêu cầu hệ thống:
- Hệ điều hành: Windows 10/11, macOS, hoặc Linux.
- Python: Phiên bản 3.10 trở lên (đã kiểm tra tương thích tốt trên Python 3.10 – 3.13).
- Kết nối Internet ổn định.

### Bước 1: Tạo và kích hoạt môi trường ảo (Virtual Environment)

- **Trên Windows (PowerShell):**
  ```powershell
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  ```

- **Trên Linux / macOS (Bash):**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

### Bước 2: Cài đặt các thư viện cần thiết
Từ thư mục gốc của repository, thực hiện:
```bash
pip install -r local_app/requirements.txt
```

### Bước 3: Cấu hình file môi trường `.env`
Sao chép file cấu hình mẫu `.env.example` thành `.env`:

- **Trên Windows (PowerShell):**
  ```powershell
  Copy-Item local_app\.env.example local_app\.env
  ```

- **Trên Linux / macOS (Bash):**
  ```bash
  cp local_app/.env.example local_app/.env
  ```

Mở file `local_app/.env` bằng trình soạn thảo văn bản và dán URL cùng Token lấy từ Colab:
```env
COLAB_API_URL=https://random-subdomain.trycloudflare.com
COLAB_API_TOKEN=your-generated-secret-token-here
REQUEST_TIMEOUT_SECONDS=180
```

### Bước 4: Khởi chạy ứng dụng Streamlit
Chạy lệnh sau từ thư mục gốc của repository:
```bash
streamlit run local_app/app.py
```
Trình duyệt web sẽ tự động mở trang ứng dụng tại địa chỉ `http://localhost:8501`.

> [!TIP]
> **Cập nhật URL nhanh khi Colab thay đổi:**  
> Mỗi khi phiên làm việc trên Colab khởi động lại, Cloudflare Quick Tunnel sẽ cấp một URL ngẫu nhiên mới. Designer có thể dán trực tiếp URL mới vào ô **API URL** ngay trên thanh **Sidebar** của ứng dụng Streamlit và nhấn **Update** mà không cần sửa file `.env` hay khởi động lại terminal.

---

## 5. Phát triển & Kiểm thử Local không cần GPU

Dành cho lập trình viên muốn phát triển thêm tính năng giao diện hoặc chạy trọn bộ unit test trên máy tính cá nhân không có GPU:

### 1. Cài đặt môi trường kiểm thử (Dev Dependencies)
```bash
pip install -r requirements-dev.txt
```

### 2. Khởi chạy Fake Server nội bộ
Kho mã nguồn cung cấp sẵn module `server_reference.run_local_fake` tích hợp động cơ giả lập (mock engines) trả về kết quả mẫu chuẩn xác mà không cần tải mô hình AI nặng:

- **Trên Windows (PowerShell):**
  ```powershell
  python -m server_reference.run_local_fake --port 8000 --token "dev-secret-token-12345"
  ```

- **Trên Linux / macOS (Bash):**
  ```bash
  python3 -m server_reference.run_local_fake --port 8000 --token "dev-secret-token-12345"
  ```

Server giả lập sẽ hoạt động tại địa chỉ: `http://127.0.0.1:8000`. Bạn có thể kiểm tra sức khỏe server tại `http://127.0.0.1:8000/health`.

### 3. Kết nối Local UI với Fake Server
Chỉ cần cấu hình trong `local_app/.env` hoặc nhập trực tiếp trên thanh Sidebar của UI:
- **API URL:** `http://127.0.0.1:8000`
- **Bearer Token:** `dev-secret-token-12345`

### 4. Chạy bộ kiểm thử tự động (Unit & Integration Tests)
```bash
python -m pytest
```
Toàn bộ 55+ bài kiểm tra sẽ được thực thi và xác thực trong môi trường CPU cục bộ.

---

## 6. Luồng làm việc của Designer (Workflows)

### Luồng A — Khi đã biết rõ đối tượng cần tách (Manual Mode)
1. **Mở giao diện:** Mở Streamlit UI trên trình duyệt laptop và đảm bảo sidebar hiển thị `Connected`.
2. **Tải ảnh:** Chọn hoặc kéo thả ảnh sản phẩm (áo, mũ, balo...) vào khu vực upload.
3. **Nhập mô tả:** Nhập text prompt tiếng Anh rõ ràng (ví dụ: `square embroidered fabric patch`, `round logo badge`, `printed graphic skull`).
4. **Chọn chế độ trích xuất:**
   - Chọn `Text` nếu muốn SAM 3 quét toàn bộ ảnh theo mô tả.
   - Chọn `Box` nếu chỉ muốn tách dựa trên khung khoanh vùng.
   - Chọn `Text + Box` nếu muốn kết hợp cả mô tả ngữ nghĩa và vị trí khoanh vùng.
5. **Khoanh vùng (nếu dùng Box hoặc Text+Box):** Dùng chuột vẽ hộp chữ nhật bao quanh artwork trên khung canvas xem trước ảnh.
6. **Thực thi:** Bấm **Run SAM 3** để gửi request tới Colab.
7. **Duyệt kết quả:** Xem danh sách candidate masks kèm điểm tin cậy (`score`) và bounding box.
8. **Xem trước (Preview):** Nhấp chọn candidate phù hợp nhất, chuyển đổi qua lại giữa các chế độ xem: ảnh gốc, overlay phủ màu, và cutout nền trong suốt (trên nền caro).
9. **Tải kết quả:** Nhấn tải ảnh Transparent PNG (bản nguyên khổ hoặc bản crop sát viền có padding) hoặc tải file ZIP tổng hợp.

### Luồng B — Khi chưa biết cách đặt prompt tiếng Anh (Prompt Assistant Mode)
1. **Tải ảnh:** Upload ảnh sản phẩm lên giao diện.
2. **Nhập yêu cầu bằng tiếng Việt:** Nhập câu miêu tả tự nhiên vào ô hỏi trợ lý, ví dụ:
   - *"Lấy toàn bộ patch vuông thêu ở ngực áo, bao gồm cả viền vải thêu."*
   - *"Chỉ lấy phần chữ thêu uốn cong ở phía trên, không lấy hình vẽ bên dưới."*
   - *"Lấy hình in bông hoa bên trong, bỏ phần viền nhãn mác bên ngoài."*
3. **Yêu cầu trợ lý:** Bấm **Suggest prompt** (hoặc **Ask Qwen**).
4. **Nhận phân tích:** Qwen3-VL-4B phân tích trực quan bức ảnh cùng ngữ nghĩa câu hỏi, trả về:
   - Xác định phạm vi: `entire_patch` (toàn bộ nhãn), `inner_artwork` (họa tiết bên trong), hoặc `individual_decoration`.
   - Prompt tiếng Anh gợi ý chính xác cho SAM 3.
   - Tối đa 3 prompt thay thế (alternative prompts).
5. **Xác nhận prompt:** Prompt gợi ý tự động được điền vào khung text để designer kiểm tra. Designer có thể sửa đổi thêm hoặc nhấp chọn một prompt thay thế bất kỳ.
6. **Khoanh vùng bổ sung (tùy chọn):** Vẽ thêm bounding box nếu muốn giới hạn tuyệt đối khu vực tách.
7. **Thực thi:** Designer bấm **Run SAM 3** để tiến hành phân đoạn.
8. **Xuất file:** Chọn candidate chính xác nhất và tải ảnh Transparent PNG.

> [!IMPORTANT]
> **Qwen không tự ý chạy phân đoạn hay tự ý quyết định candidate cuối cùng.** Trợ lý LLM chỉ đóng vai trò dịch thuật ngữ nghĩa và đề xuất từ khóa. Designer luôn giữ quyền duyệt prompt và chọn mask cuối cùng.

---

## 7. Bảng tóm tắt API & Ví dụ cURL

Chi tiết đầy đủ về định dạng dữ liệu, quy ước trường và mã lỗi được ghi rõ trong tài liệu [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

### 7.1. Bảng tóm tắt Endpoints

| Phương thức | Đường dẫn (Path) | Xác thực (Auth) | Định dạng Body | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/health` | Không yêu cầu | Không có | Kiểm tra trạng thái server, GPU, SAM 3, Qwen và cờ `busy`. |
| `POST` | `/api/v1/assistant/prompt` | `Bearer <token>` | `multipart/form-data` | Gửi ảnh + yêu cầu tiếng Việt; nhận JSON gợi ý prompt SAM 3. |
| `POST` | `/api/v1/segment` | `Bearer <token>` | `multipart/form-data` | Gửi ảnh + mode (`text`/`box`/`text_box`) + prompt/bbox; nhận file `result.zip`. |

### 7.2. Ví dụ gọi cURL

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

- **Trên Linux / macOS (Bash):**
  ```bash
  curl -X POST "https://your-tunnel.trycloudflare.com/api/v1/assistant/prompt" \
    -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
    -F "image=@sample_cap.jpg" \
    -F "user_request=Lấy toàn bộ patch vuông thêu ở mặt trước mũ" \
    -F "scope_preference=auto"
  ```

- **Trên Windows (PowerShell):**
  ```powershell
  curl.exe -X POST "https://your-tunnel.trycloudflare.com/api/v1/assistant/prompt" `
    -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" `
    -F "image=@sample_cap.jpg" `
    -F "user_request=Lấy toàn bộ patch vuông thêu ở mặt trước mũ" `
    -F "scope_preference=auto"
  ```

#### 3. Phân đoạn đối tượng (`POST /api/v1/segment`):

- **Trên Linux / macOS (Bash):**
  ```bash
  curl -X POST "https://your-tunnel.trycloudflare.com/api/v1/segment" \
    -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
    -F "image=@sample_cap.jpg" \
    -F "mode=text_box" \
    -F "prompt=square embroidered fabric patch" \
    -F 'bbox=[0.5, 0.45, 0.35, 0.3]' \
    -F "confidence_threshold=0.35" \
    --output result.zip
  ```

- **Trên Windows (PowerShell):**
  ```powershell
  curl.exe -X POST "https://your-tunnel.trycloudflare.com/api/v1/segment" `
    -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" `
    -F "image=@sample_cap.jpg" `
    -F "mode=text_box" `
    -F "prompt=square embroidered fabric patch" `
    -F "bbox=[0.5, 0.45, 0.35, 0.3]" `
    -F "confidence_threshold=0.35" `
    --output result.zip
  ```

---

## 8. An toàn thông tin & Bảo mật

Tuân thủ nghiêm ngặt theo các nguyên tắc an ninh của dự án (Kế hoạch §7.3, §8.2):
1. **Xác thực Bearer Token bắt buộc:** Mọi endpoint xử lý nghiệp vụ (`/api/v1/...`) đều bắt buộc phải có header `Authorization: Bearer <token>`. Request thiếu token hoặc sai token sẽ bị từ chối ngay lập tức với mã lỗi `401 Unauthorized`. Token không bao giờ được phép truyền qua URL query string.
2. **Không commit bí mật lên Git:** Tuyệt đối không commit file `.env`, Hugging Face token, hay API Bearer token vào repository. Kho mã nguồn đã cấu hình sẵn quy tắc chặn trong `.gitignore`.
3. **Bản chất của Cloudflare Quick Tunnel:** Quick Tunnel là đường hầm công khai tạm thời phục vụ giai đoạn thử nghiệm (không yêu cầu domain riêng). Bất kỳ ai có đường link URL đều có thể truy cập tới cổng dịch vụ; do đó Bearer token là chốt chặn bảo vệ duy nhất và bắt buộc.
4. **Bảo mật dữ liệu khách hàng:** Không tải lên ảnh thiết kế độc quyền chưa công bố, hình ảnh nhạy cảm hoặc tư liệu khách hàng bí mật lên môi trường thử nghiệm khi chưa có sự phê duyệt chính thức từ ban quản lý.
5. **Giới hạn tải lên & Dọn dẹp bộ nhớ:** Server giới hạn dung lượng upload tối đa (mặc định 20MB) và chỉ chấp nhận định dạng ảnh hợp lệ. File tạm trên RAM/Disk được tự động dọn dẹp sau khi gửi trả kết quả.

---

## 9. Xử lý sự cố thường gặp (Troubleshooting)

| Tình huống / Mã lỗi | Nguyên nhân khả dĩ | Hướng dẫn khắc phục |
|---|---|---|
| **Mất kết nối / Expired Tunnel**<br>(*UI báo "Disconnected"*) | - Phiên làm việc Google Colab bị ngắt do hết hạn hoặc mất kết nối mạng.<br>- Tiến trình `cloudflared` Quick Tunnel bị dừng. | 1. Kiểm tra lại tab Google Colab.<br>2. Nếu runtime bị ngắt, chạy lại notebook.<br>3. Sao chép URL mới và dán vào ô **API URL** ở thanh Sidebar của UI rồi bấm **Update**. |
| **Lỗi 401 Unauthorized** | - Token trong file `.env` hoặc thanh Sidebar chưa được cấu hình.<br>- Token không khớp chính xác với Bearer Token trên Colab. | Kiểm tra lại thông báo ở cell cuối cùng của Colab, copy lại chính xác toàn bộ chuỗi token (không thừa dấu cách) và cập nhật vào ô **API Token** trên Sidebar. |
| **Lỗi 409 Conflict ("busy")** | - GPU đang bận xử lý một request phân đoạn hoặc trợ lý khác.<br>- Hệ thống áp dụng khóa đơn nhiệm (`single-request lock`) để tránh tràn bộ nhớ VRAM. | Hệ thống không xếp hàng tự động. Bạn chỉ cần đợi từ 3–5 giây để request trước hoàn tất rồi bấm thực hiện lại. |
| **Lỗi 413 Payload Too Large** | Kích thước file ảnh tải lên vượt quá giới hạn cấu hình của server (mặc định 20MB). | Dùng công cụ đồ họa nén nhẹ ảnh hoặc giảm độ phân giải xuống dưới mức 20MB trước khi tải lên. |
| **Qwen OOM / Báo lỗi 503**<br>(*Prompt Assistant Unavailable*) | GPU Tesla T4 (16GB) bị tràn bộ nhớ VRAM khi nạp đồng thời cả Qwen3-VL-4B và SAM 3. | Hệ thống sẽ tự động giải phóng Qwen và tiếp tục duy trì SAM 3 hoạt động. Chuyển sang **Luồng A (Manual Mode)**: tự nhập prompt tiếng Anh trực tiếp để tiếp tục công việc bình thường. |
| **SAM không tìm thấy đối tượng**<br>(*num_candidates = 0*) | - Prompt mô tả quá chung chung, dùng sai từ khóa hoặc sai ngữ nghĩa.<br>- Ngưỡng tin cậy (`confidence_threshold`) đang đặt quá cao.<br>- Đối tượng có độ tương phản quá kém so với nền. | 1. Đổi sang prompt mô tả cụ thể về hình dáng/chất liệu (vd: từ `logo` thành `round embroidered fabric patch`).<br>2. Chuyển sang mode `Box` hoặc `Text + Box` và vẽ bounding box định vị chính xác khu vực.<br>3. Hạ nhẹ ngưỡng `confidence_threshold` trên UI (ví dụ từ 0.35 xuống 0.25). |

---

## 10. Tài liệu tham khảo liên quan

- 📋 [AI Artwork Extractor MVP Project Plan](AI_Artwork_Extractor_MVP_Project_Plan.md) — Bản kế hoạch chi tiết, kiến trúc và phân tích rủi ro.
- 🔌 [API Contract Specification](docs/API_CONTRACT.md) — Chi tiết hợp đồng API, schema dữ liệu và cấu trúc gói ZIP.
- 🧪 [Testing & Validation Guide](docs/TESTING.md) — Danh mục kiểm thử chức năng F01–F14, dataset smoke test và tiêu chí nghiệm thu demo.
