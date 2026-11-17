# AI Artwork Extractor — MVP Project Plan

> **Mục tiêu:** Làm một MVP để designer upload ảnh sản phẩm, mô tả hoặc khoanh vùng artwork cần lấy, nhận gợi ý prompt từ Qwen khi cần, chạy SAM 3, xem các mask và xuất PNG nền trong suốt giữ nguyên pixel từ ảnh gốc.
>
> **Nguyên tắc:** SAM 3 và Qwen chạy trên Google Colab T4; giao diện thử nghiệm chạy local trên laptop. Local app gọi backend Colab qua HTTPS URL do Cloudflare Tunnel cấp. Không dùng API inference trả phí trong MVP.

---

## 1. Tóm tắt quyết định

### Kiến trúc được chọn

- **GPU / inference host:** Google Colab T4 16GB.
- **Segmentation:** Meta SAM 3 image model, dùng checkpoint chính thức mà tài khoản đã được cấp quyền.
- **LLM Prompt Assistant:** Qwen3-VL-4B-Instruct, multimodal, chạy local trong Colab ở chế độ 4-bit khi GPU còn đủ bộ nhớ.
- **Remote API:** FastAPI chạy trong Colab.
- **Tunnel:** Cloudflare Quick Tunnel trong giai đoạn test.
- **Local UI:** Streamlit chạy trên laptop, gửi ảnh và request đến FastAPI trên Colab.
- **Image processing:** Pillow + NumPy; OpenCV chỉ dùng cho thao tác ảnh/box cần thiết.
- **Output:** Candidate mask, overlay preview và transparent PNG được tạo từ pixel ảnh gốc.

### Vì sao chọn cách này?

SAM 3 và Qwen đều là model tương đối nặng so với RTX 3050 Laptop 4GB. Dùng Colab T4 làm inference host tránh phải tải model lên GPU laptop. Local app chỉ đảm nhiệm giao diện và gửi request HTTP.

Sơ đồ tổng thể:

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

**Lưu ý:** Ảnh không cần được tải lên một website lưu trữ công khai trước. Local app gửi trực tiếp file bytes qua HTTPS đến endpoint Colab. Quick Tunnel chỉ cung cấp đường truy cập vào API.

---

## 2. Phạm vi MVP

### 2.1. Có trong MVP

1. Upload một ảnh sản phẩm JPG / JPEG / PNG.
2. Nhập prompt thủ công để SAM 3 tìm artwork.
3. Vẽ một bounding box quanh khu vực muốn tách.
4. Chạy ba mode:
   - `text`: chỉ dùng text prompt.
   - `box`: chỉ dùng box prompt.
   - `text_box`: kết hợp text và box.
5. Gọi Qwen3-VL-4B để phân tích ảnh + ý định bằng tiếng Việt, rồi đề xuất prompt ngắn cho SAM 3.
6. Người dùng có thể sửa prompt do Qwen đề xuất trước khi chạy SAM 3.
7. Xem tất cả candidate masks SAM 3 trả về, kèm confidence score và bounding box.
8. Chọn một candidate và xem overlay / transparent preview.
9. Xuất:
   - Mask PNG trắng/đen.
   - Transparent PNG full canvas.
   - Transparent PNG crop sát artwork (có padding tùy chọn).
   - ZIP chứa kết quả và metadata.
10. Ghi log cơ bản: prompt, mode, số candidate, thời gian xử lý.

### 2.2. Chưa làm trong MVP

- Tự động tách toàn bộ sản phẩm theo batch.
- Tự động chọn candidate thay designer.
- Brush / eraser chỉnh mask từng pixel.
- Positive / negative point refinement.
- Perspective correction / mesh dewarping.
- AI generative reconstruction hoặc vẽ lại artwork.
- PSD nhiều layer, Photoshop UXP.
- POD template placement, DPI automation.
- Database, user login, phân quyền nhiều nhân viên.
- Queue/job scheduler và xử lý nhiều người cùng lúc.

**MVP không làm phẳng artwork.** Mục tiêu trước mắt là lấy đúng vùng artwork từ ảnh gốc và xuất PNG trung thực với ảnh đầu vào.

---

## 3. Luồng sử dụng của designer

### Luồng A — Người dùng đã biết muốn tách gì

1. Mở local tool trên laptop.
2. Upload ảnh sản phẩm.
3. Nhập prompt, ví dụ `square embroidered fabric patch`.
4. Chọn `Text` hoặc `Text + Box`.
5. Nếu cần, vẽ box bao quanh patch cần lấy.
6. Nhấn **Run SAM 3**.
7. Xem danh sách mask candidate.
8. Chọn candidate chính xác.
9. Preview trên nền caro / nền tối / nền sáng.
10. Download PNG hoặc ZIP.

### Luồng B — Người dùng chưa biết nên viết prompt thế nào

1. Upload ảnh sản phẩm.
2. Nhập yêu cầu tự nhiên bằng tiếng Việt, ví dụ:
   - “Lấy toàn bộ patch vuông ở ngực áo, bao gồm viền vải.”
   - “Lấy riêng chữ thêu cong phía trên logo.”
   - “Lấy phần hoa bên trong, không lấy patch bên ngoài.”
3. Nhấn **Suggest prompt**.
4. Qwen xem ảnh và yêu cầu, trả về:
   - Đối tượng cần lấy.
   - Scope: toàn bộ patch hay artwork bên trong.
   - Prompt SAM 3 chính.
   - Một vài prompt thay thế ngắn.
5. UI đưa prompt lên textbox để người dùng kiểm tra / sửa.
6. Người dùng có thể chọn một prompt thay thế rồi chạy SAM 3.
7. Người dùng chọn mask candidate và xuất ảnh.

**Qwen không được tự chạy segmentation hoặc tự quyết định candidate cuối cùng.** LLM chỉ gợi ý cách mô tả đối tượng. Người dùng vẫn duyệt prompt và mask.

---

## 4. Thiết kế LLM Prompt Assistant

### 4.1. Model

- Model: `Qwen/Qwen3-VL-4B-Instruct`.
- Đầu vào: ảnh sản phẩm + yêu cầu tiếng Việt của người dùng.
- Đầu ra: JSON ngắn, có cấu trúc.
- Chế độ chạy dự kiến: 4-bit quantization (NF4 / bitsandbytes), giới hạn kích thước ảnh đưa vào LLM và giới hạn `max_new_tokens`.
- Không gọi inference provider hoặc API trả phí.

Model card chính thức: <https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct>.

Model card ghi license Apache-2.0 và hướng dẫn xử lý image-text input bằng Transformers. Bitsandbytes hỗ trợ NF4/FP4 trên GPU NVIDIA compute capability từ 6.0; T4 thuộc thế hệ Turing. Điều này chỉ xác nhận hỗ trợ kỹ thuật quantization, **không đảm bảo Qwen và SAM 3 sẽ luôn cùng nằm vừa trong 16GB VRAM**.

### 4.2. Vai trò của Qwen

Qwen cần:

- Hiểu người dùng muốn lấy `entire_patch`, `inner_artwork` hay `individual_decoration`.
- Hiểu loại đối tượng: patch, badge, applique, embroidered text, logo, flower, symbol, printed graphic...
- Dựa trên ảnh để thêm thuộc tính phân biệt có ích: hình vuông, patch ở ngực trái, patch trên visor, chữ cong...
- Chuyển yêu cầu thành cụm danh từ ngắn, cụ thể, phù hợp với text prompt của SAM 3.
- Đề xuất tối đa 3 prompt thay thế, mỗi prompt mô tả một concept.
- Nêu rõ khi yêu cầu còn mơ hồ; không bịa ra chi tiết không nhìn thấy.

Qwen không cần:

- Vẽ mask.
- Vẽ lại logo / artwork.
- Tự tạo tọa độ box để thay thế thao tác khoanh vùng của người dùng.
- Tự chọn candidate segmentation.
- Khẳng định chắc chắn một đối tượng có tồn tại khi ảnh không thể hiện rõ.

### 4.3. Scope taxonomy

| Scope | Ý nghĩa | Ví dụ prompt |
|---|---|---|
| `entire_patch` | Lấy cả patch, gồm nền vải và viền | `square embroidered fabric patch` |
| `inner_artwork` | Chỉ lấy hình / chữ nằm bên trong patch | `embroidered heart-shaped flower design` |
| `individual_decoration` | Lấy một họa tiết độc lập | `embroidered flower decoration` |
| `unknown` | Chưa xác định được phạm vi | Yêu cầu người dùng làm rõ / khoanh vùng |

### 4.4. System prompt đề xuất cho Qwen

```text
You are an assistant that converts a designer's natural-language
request into concise object concepts for Meta SAM 3 segmentation.

You receive:
1. A product image.
2. A request written by the designer, usually in Vietnamese.

Your job is NOT to segment the image. Your job is to identify the
intended visible object and propose short text prompts for SAM 3.

Rules:
- Preserve the designer's intended extraction scope.
- Distinguish entire_patch, inner_artwork, and individual_decoration.
- If the user asks for the whole patch, describe the patch itself,
  not only the artwork inside it.
- If the user asks for the inner artwork, describe only that inner
  artwork.
- Prefer short noun phrases, not long natural-language instructions.
- Describe one concept per prompt.
- Do not combine multiple object categories into one prompt.
- Do not invent hidden, occluded, or unseen details.
- Do not rewrite or recreate lettering, logos, or artwork.
- Do not generate bounding-box coordinates.
- Provide up to 3 alternative prompts only when useful.
- If the target is ambiguous, explain briefly and set needs_clarification=true.
- The user must approve or edit the suggested prompt before segmentation.

Return valid JSON only, using this schema:
{
  "target_description": "short description",
  "scope": "entire_patch | inner_artwork | individual_decoration | unknown",
  "sam_prompt": "short noun phrase for SAM 3",
  "alternative_prompts": ["prompt 1", "prompt 2"],
  "location_hint": "short visible location or empty string",
  "needs_clarification": false,
  "clarification_question": "empty string or one short question",
  "reason": "brief explanation"
}
```

### 4.5. Ví dụ đầu vào / đầu ra

Người dùng:

> “Tôi muốn lấy toàn bộ patch vuông ở ngực áo có bông hoa hình trái tim bên trong, bao gồm viền vải.”

Qwen đề xuất:

```json
{
  "target_description": "The entire square fabric patch on the chest",
  "scope": "entire_patch",
  "sam_prompt": "square embroidered fabric patch",
  "alternative_prompts": [
    "square embroidered badge",
    "square fabric applique"
  ],
  "location_hint": "chest area",
  "needs_clarification": false,
  "clarification_question": "",
  "reason": "The user asked for the complete outer patch, not only the flower inside it."
}
```

UI hiển thị prompt chính và alternatives thành các lựa chọn. Người dùng phải bấm chọn / xác nhận mới gửi sang SAM 3.

---

## 5. SAM 3 Segmentation Engine

### 5.1. Model và API hiện có

Dùng code SAM 3 đang chạy được trong notebook thử nghiệm hiện tại. Không thay model trong MVP.

Các biến / API ở notebook hiện có:

- `model`: SAM 3 image model.
- `processor`: `Sam3Processor`.
- `image_state = processor.set_image(image)`.
- Text: `processor.set_text_prompt(state=image_state, prompt=prompt)`.
- Box: `processor.add_geometric_prompt(state=image_state, box=normalized_box, label=True)`.
- Output: `output["masks"]`, `output["boxes"]`, `output["scores"]`.

Tham khảo source code: <https://github.com/facebookresearch/sam3/blob/main/sam3/model/sam3_image_processor.py>.

### 5.2. Ba mode segmentation

#### Mode 1 — Text

```python
image_state = processor.set_image(image)
output = processor.set_text_prompt(
    state=image_state,
    prompt=sam_prompt,
)
```

#### Mode 2 — Box

Box do UI vẽ cần chuyển thành normalized `[center_x, center_y, width, height]` với giá trị trong khoảng 0–1.

```python
image_state = processor.set_image(image)
output = processor.add_geometric_prompt(
    state=image_state,
    box=normalized_box,
    label=True,
)
```

#### Mode 3 — Text + Box

```python
image_state = processor.set_image(image)
output = processor.set_text_prompt(
    state=image_state,
    prompt=sam_prompt,
)
output = processor.add_geometric_prompt(
    state=image_state,
    box=normalized_box,
    label=True,
)
```

Phải kiểm tra đúng phiên bản SAM 3 đã cài trong notebook. Mỗi lần chạy prompt mới cần reset prompt state hoặc tạo state mới để tránh prompt cũ ảnh hưởng kết quả.

### 5.3. Candidate handling

- Hiển thị tất cả candidate SAM 3 trả về trong giới hạn UI hợp lý.
- Mỗi candidate có mask preview, overlay, bbox và score.
- Không tự động chọn candidate khi có nhiều mask.
- Không coi confidence score là xác suất đúng tuyệt đối.
- Cho phép chạy lại với prompt thay thế.
- Với MVP, chưa tự động gộp candidate trùng nhau.

### 5.4. Tạo transparent PNG

**Không dùng generative model để tái tạo ảnh.**

Quy trình:

1. Đọc pixel RGB từ ảnh gốc.
2. Lấy mask candidate do SAM 3 sinh ra.
3. Chuẩn hóa mask về kích thước ảnh gốc nếu cần.
4. Dùng mask làm alpha channel.
5. Xuất ảnh RGBA.
6. Tùy chọn crop theo bounding box của mask và thêm padding.

Pseudo-code:

```python
rgba = original_image.convert("RGBA")
alpha = binary_mask.astype("uint8") * 255
rgba_array = np.array(rgba)
rgba_array[..., 3] = alpha
cutout = Image.fromarray(rgba_array, mode="RGBA")
```

Output cần giữ nguyên chi tiết, màu, chữ và texture có trong pixel ảnh gốc. Nếu mask thiếu chi tiết thì transparent PNG cũng sẽ thiếu đúng phần đó; không được tự điền / vẽ thêm.

---

## 6. Kiến trúc Colab Notebook mới

Notebook được rebuild từ notebook SAM 3 hiện có, nhưng chuyển từ notebook tương tác thủ công thành **Colab inference server**.

Tên đề xuất:

`SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb`

### 6.1. Những gì notebook phải làm

- Chạy SAM 3 trên T4.
- Nạp Qwen3-VL-4B dạng 4-bit khi được bật.
- Khởi chạy FastAPI.
- Tạo Cloudflare Quick Tunnel.
- In ra API URL và hướng dẫn cấu hình local tool.
- Giữ model nạp trong RAM/VRAM để nhận nhiều request trong cùng runtime.

### 6.2. Cấu trúc cell dự kiến

| Cell | Nội dung |
|---|---|
| 1 | Giới thiệu, chọn T4 GPU, cảnh báo runtime tạm thời |
| 2 | Kiểm tra Python / CUDA / GPU / VRAM |
| 3 | Mount Google Drive tùy chọn để cache checkpoint |
| 4 | Cài SAM 3 dependencies, FastAPI, Uvicorn, multipart, Pillow, OpenCV |
| 5 | Đăng nhập Hugging Face qua Colab Secrets, không hardcode token |
| 6 | Load SAM 3 checkpoint và processor một lần |
| 7 | Smoke test SAM 3 bằng một ảnh / prompt ngắn |
| 8 | Thiết lập Qwen3-VL-4B Prompt Assistant (optional, 4-bit) |
| 9 | Smoke test Qwen bằng ảnh và yêu cầu tiếng Việt |
| 10 | Định nghĩa FastAPI endpoints |
| 11 | Định nghĩa auth token và giới hạn upload |
| 12 | Khởi chạy API bằng Uvicorn trên `127.0.0.1:8000` |
| 13 | Cài / chạy `cloudflared` Quick Tunnel |
| 14 | Hiển thị URL, API token và lệnh test từ laptop |
| 15 | Health check từ bên ngoài và test một request segmentation |

### 6.3. Tổ chức VRAM — điểm cần kiểm tra thực tế

T4 có 16GB VRAM. SAM 3 đã sử dụng một phần GPU memory; Qwen3-VL-4B dù ở 4-bit vẫn cần thêm bộ nhớ cho model, vision tower, input image, KV cache và activation.

Vì vậy notebook phải có cơ chế an toàn:

1. Load và smoke-test SAM 3 trước.
2. Đo `torch.cuda.memory_allocated()` và `torch.cuda.mem_get_info()`.
3. Chỉ bật Qwen nếu còn đủ VRAM theo ngưỡng an toàn cấu hình được.
4. Qwen chạy 4-bit, giới hạn kích thước ảnh gửi vào LLM, `max_new_tokens` khoảng 128–192 và context ngắn.
5. Không cho hai request inference chạy đồng thời.
6. Nếu load Qwen gây CUDA OOM, giải phóng Qwen và tiếp tục chạy MVP ở chế độ manual prompt + SAM 3. UI phải báo rõ Prompt Assistant tạm thời không khả dụng.
7. Không để lỗi Qwen làm hỏng SAM 3 segmentation.

**Không cam kết trước rằng cả hai model sẽ luôn nằm vừa trong T4 16GB.** Đây là một mục benchmark bắt buộc trong notebook. Nếu Qwen 4B gây OOM, phương án MVP dự phòng là giữ SAM 3 hoạt động và tắt Prompt Assistant; không chuyển sang API trả phí.

### 6.4. Cách dùng Hugging Face token

Người dùng đã được cấp quyền SAM 3. Notebook cần:

- Lấy `HF_TOKEN` từ Colab Secrets hoặc ô nhập ẩn.
- Chỉ dùng token Read.
- Không ghi token vào cell output, log hoặc repo.
- Dùng token để tải checkpoint chính thức `facebook/sam3`.

---

## 7. FastAPI — API contract giữa local app và Colab

### 7.1. Endpoints

#### `GET /health`

Trả về trạng thái API, GPU và model:

```json
{
  "status": "ok",
  "gpu": "Tesla T4",
  "sam3_loaded": true,
  "qwen_loaded": false,
  "prompt_assistant_available": true,
  "busy": false
}
```

`prompt_assistant_available` nghĩa là Qwen đã được bật / có thể nạp; `qwen_loaded` cho biết model đang nằm trong memory.

#### `POST /api/v1/assistant/prompt`

Multipart fields:

- `image`: ảnh sản phẩm.
- `user_request`: yêu cầu tiếng Việt.
- `scope_preference`: `auto`, `entire_patch`, `inner_artwork`, `individual_decoration`.

Response JSON theo schema ở mục 4.4.

#### `POST /api/v1/segment`

Multipart fields:

- `image`: ảnh gốc.
- `mode`: `text`, `box`, `text_box`.
- `prompt`: prompt đã được người dùng xác nhận (bỏ trống nếu box-only).
- `bbox`: JSON `[cx, cy, width, height]` chuẩn hóa 0–1; bắt buộc cho `box` và `text_box`.
- `confidence_threshold`: tùy chọn, default dùng giá trị đang hoạt động trong notebook.

Response đề xuất: file ZIP chứa:

```text
result/
  metadata.json
  candidate_00_mask.png
  candidate_00_overlay.png
  candidate_00_cutout.png
  candidate_01_mask.png
  candidate_01_overlay.png
  candidate_01_cutout.png
  ...
```

`metadata.json` chứa prompt, mode, candidate id, score, bbox và kích thước ảnh.

### 7.2. Request concurrency

- MVP chỉ cho một inference request chạy tại một thời điểm.
- Dùng `asyncio.Lock` hoặc `threading.Lock` phù hợp với cách gọi model.
- Request thứ hai phải đợi hoặc nhận thông báo `busy`.
- Không dùng batch inference trong giai đoạn đầu.

### 7.3. Bảo vệ API

- Tạo random bearer token khi khởi chạy Colab.
- Local app gửi `Authorization: Bearer <token>`.
- Không đưa token vào URL query string.
- Không commit token vào Git.
- Giới hạn file upload, ví dụ 15–20MB.
- Chỉ nhận định dạng ảnh hợp lệ.
- Không ghi ảnh gốc vào log.
- Xóa file tạm sau khi trả ZIP hoặc sau TTL ngắn.

---

## 8. Cloudflare Tunnel

### 8.1. Cách hoạt động

FastAPI chạy bên trong Colab trên `127.0.0.1:8000`. `cloudflared` mở một tunnel outbound và cung cấp URL dạng:

`https://random-name.trycloudflare.com`

Local app dùng URL này làm `COLAB_API_URL`.

Lệnh minh họa chạy trong Colab:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

Quick Tunnel phù hợp cho thử nghiệm vì không yêu cầu domain riêng. URL thay đổi khi tạo tunnel mới và ngừng hoạt động khi tunnel process dừng.

### 8.2. Bảo mật và giới hạn

- Quick Tunnel là URL công khai tạm thời; người biết URL có thể truy cập tới service.
- Vì vậy bắt buộc thêm bearer token ở FastAPI.
- Không chạy API không có authentication.
- Không đưa dữ liệu khách hàng / file nhạy cảm lên endpoint test khi chưa được công ty cho phép.
- Quick Tunnel không có uptime guarantee; phù hợp dev/test, không phải production.
- Cloudflare Quick Tunnel có giới hạn và không hỗ trợ SSE; MVP dùng request-response thông thường, không phụ thuộc SSE.
- Khi chuyển production, xem xét Named Tunnel + Cloudflare Access.

Tài liệu: <https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/>.

---

## 9. Local UI trên laptop

### 9.1. Tech stack đề xuất

- Python 3.10+.
- Streamlit.
- `requests` để gọi Colab API.
- `python-dotenv` để đọc URL và API token.
- `streamlit-drawable-canvas` hoặc canvas component tương đương để vẽ rectangle.
- Pillow để preview / đọc ZIP.

UI chạy tại `http://localhost:8501`; đây chỉ là giao diện local. Model không chạy trên laptop.

### 9.2. Layout

```text
┌────────────────────────────────────────────────────────────┐
│ AI ARTWORK EXTRACTOR                          API: CONNECTED │
├─────────────────────┬──────────────────────┬───────────────┤
│ INPUT               │ IMAGE CANVAS         │ PROMPT         │
│                     │                      │                │
│ [Upload image]      │   Original product   │ [Text prompt]  │
│                     │                      │                │
│ Extraction mode     │   [Draw bounding box]│ [Ask Qwen]     │
│ ( ) Text            │                      │                │
│ ( ) Box             │                      │ [Alternatives] │
│ ( ) Text + Box      │                      │                │
│                     │                      │ [Run SAM 3]    │
├─────────────────────┴──────────────────────┴───────────────┤
│ SEGMENTATION CANDIDATES                                      │
│ [Mask 1]       [Mask 2]       [Mask 3]        [Mask 4]       │
│ score/bbox     score/bbox     score/bbox      score/bbox     │
├────────────────────────────────────────────────────────────┤
│ SELECTED PREVIEW: Original | Overlay | Transparent           │
│                                    [Download PNG] [ZIP]       │
└────────────────────────────────────────────────────────────┘
```

### 9.3. UI behavior

- Khi local app mở, gọi `/health` để kiểm tra Colab endpoint.
- Nếu tunnel đã hết hạn / Colab disconnected, hiển thị `Disconnected` và yêu cầu cập nhật URL.
- Khi upload ảnh, hiển thị preview và kích thước ảnh.
- Box coordinates phải quy đổi chính xác từ canvas preview về ảnh gốc.
- Khi chọn `Text + Box`, gửi prompt đã xác nhận và bbox normalized.
- Candidate hiển thị score và bbox; người dùng tự chọn.
- Transparent preview cần có nền caro để nhìn rõ alpha.
- Download riêng candidate đã chọn hoặc tải cả ZIP.

### 9.4. File cấu hình local

`.env.example`:

```env
COLAB_API_URL=https://your-random-name.trycloudflare.com
COLAB_API_TOKEN=replace-with-token-from-colab
REQUEST_TIMEOUT_SECONDS=180
```

`.env` thật không được commit lên Git.

---

## 10. Cấu trúc source code dự kiến

```text
ai-artwork-extractor/
│
├── README.md
├── PROJECT_PLAN.md
├── .gitignore
│
├── colab/
│   └── SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb
│
├── local_app/
│   ├── app.py                  # Streamlit UI
│   ├── remote_client.py        # HTTP client gọi Colab API
│   ├── canvas_utils.py         # box coordinate conversion
│   ├── result_viewer.py        # preview masks / alpha PNG
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                    # local secret, gitignored
│
├── server_reference/
│   ├── api.py                  # FastAPI implementation source
│   ├── sam3_engine.py          # SAM 3 loading/inference wrappers
│   ├── qwen_prompt_assistant.py# Qwen loading + structured prompt
│   ├── image_export.py         # original pixel + alpha output
│   └── schemas.py              # Pydantic request/response schemas
│
└── outputs/                    # local temporary downloads; gitignored
```

Trong MVP, phần `server_reference/` có thể được viết trực tiếp vào notebook hoặc được notebook import từ repository. Ưu tiên đơn giản: không cần đóng gói thành production service ngay.

---

## 11. Kế hoạch rebuild notebook

### Phase N1 — Giữ nguyên SAM 3 đang chạy ổn

- Bắt đầu từ notebook test hiện tại, không thay đổi API segmentation đang hoạt động.
- Giữ phiên bản repo / processor compatible.
- Chuyển phần upload + interactive cells thành hàm Python có thể gọi từ API.
- Đo GPU memory và thời gian inference.

### Phase N2 — Thêm Qwen Prompt Assistant

- Cài Transformers phiên bản tương thích với Qwen3-VL.
- Cài bitsandbytes nếu Colab CUDA/PyTorch stack hỗ trợ.
- Load Qwen 4-bit tùy chọn.
- Test ảnh có kích thước vừa phải và yêu cầu tiếng Việt.
- Validate JSON đầu ra; nếu parse lỗi thì báo lỗi rõ ràng hoặc fallback manual.
- Test memory khi SAM 3 đã được load.

### Phase N3 — Bọc SAM / Qwen thành FastAPI

- `/health`.
- `/api/v1/assistant/prompt`.
- `/api/v1/segment`.
- Bearer token.
- Upload validation.
- Một GPU inference lock.
- ZIP output.

### Phase N4 — Expose API qua Cloudflare

- Start FastAPI.
- Start Quick Tunnel.
- In URL.
- Tạo / đọc API token.
- Test `/health` qua URL công khai.

### Phase N5 — Local UI integration

- Local Streamlit app.
- Upload image.
- Prompt text / Qwen suggestion.
- Draw box.
- Call API.
- Preview candidates.
- Export selected result.

---

## 12. Kiểm thử và tiêu chí hoàn thành

### 12.1. Functional tests

| ID | Test | Kết quả mong đợi |
|---|---|---|
| F01 | Mở local UI khi Colab API online | API Connected |
| F02 | Upload JPG | Hiển thị ảnh đúng tỷ lệ |
| F03 | Upload PNG | Giữ alpha / hiển thị ổn định |
| F04 | Gửi text prompt | SAM 3 trả candidate |
| F05 | Vẽ box rồi chạy Box mode | SAM 3 nhận đúng bbox normalized |
| F06 | Chạy Text + Box | Candidate bị giới hạn theo concept và vùng chọn |
| F07 | Ask Qwen bằng tiếng Việt | Trả JSON prompt hợp lệ hoặc báo lỗi rõ |
| F08 | Sửa prompt Qwen đề xuất | SAM 3 dùng đúng prompt đã sửa |
| F09 | Có nhiều candidate | Hiển thị tất cả candidate trong giới hạn UI |
| F10 | Chọn candidate | Preview mask / overlay / transparent |
| F11 | Download PNG | PNG có alpha thật, pixel RGB lấy từ ảnh gốc |
| F12 | Colab disconnect | UI báo mất kết nối, không crash |
| F13 | Thiếu token / token sai | API trả 401 |
| F14 | Qwen OOM / không load | SAM 3 manual mode vẫn hoạt động |

### 12.2. Dataset smoke test

Dùng 5–10 ảnh thực tế đã test SAM 3:

- Baseball cap có patch lớn.
- Áo thun có graphic.
- Hoodie có chữ / logo thêu.
- Balo có patch.
- Sản phẩm có nhiều artwork.
- Patch có viền tua rua.
- Patch nền trắng trên vải sáng.

Không cần fine-tune model trong MVP. Mục tiêu là kiểm tra toàn bộ trải nghiệm từ local UI đến output.

### 12.3. Tiêu chí MVP demo được

MVP được xem là demo thành công khi:

- Designer upload ảnh từ local app.
- Dùng prompt thủ công hoặc Qwen gợi ý prompt.
- Có thể vẽ box quanh đối tượng.
- Chọn Text / Box / Text + Box.
- Gọi SAM 3 chạy trên Colab.
- Xem được các candidate mask.
- Chọn candidate và tải transparent PNG.
- PNG giữ pixel gốc, không bị generative redraw.
- Nếu Qwen không khả dụng, luồng manual prompt vẫn hoạt động.
- Không cần API inference trả phí.

---

## 13. Rủi ro và phương án xử lý

| Rủi ro | Ảnh hưởng | Cách xử lý trong MVP |
|---|---|---|
| Qwen + SAM 3 vượt 16GB VRAM | Qwen hoặc SAM OOM | Qwen 4-bit, lazy load, giới hạn ảnh / token; fallback tắt Qwen |
| Colab runtime bị ngắt | API URL mất kết nối | Restart notebook, load model, tạo tunnel URL mới, cập nhật local `.env` |
| Quick Tunnel URL thay đổi | Local app gọi URL cũ | Hiển thị URL mới trong notebook, cho phép sửa trong UI |
| API bị người khác truy cập | Lộ endpoint / tiêu tốn GPU | Bearer token, giới hạn upload, không log ảnh, tắt tunnel khi ngừng test |
| Box coordinates sai | Segmentation lệch | Test conversion preview → original; hiển thị box overlay trên ảnh gốc |
| Prompt Assistant diễn giải sai | SAM tìm nhầm object | User duyệt và sửa prompt; không auto-run |
| SAM trả nhiều mask / score gần nhau | Khó chọn | Hiển thị candidate riêng, người dùng quyết định |
| SAM không trả mask | Không có output | Thử prompt alternative hoặc Box mode; UI báo không có candidate |
| Qwen không xuất JSON đúng | Assistant lỗi | JSON parser + retry một lần; nếu vẫn lỗi thì chuyển sang manual prompt |

### Ghi chú về Cloudflare

Quick Tunnel là chức năng phát triển / thử nghiệm, không có uptime guarantee; URL ngẫu nhiên thay đổi khi tạo mới. Người có URL có thể truy cập service, vì thế API bearer token vẫn bắt buộc. Với MVP request-response thông thường là đủ, không cần SSE.

---

## 14. Kế hoạch thực hiện theo thứ tự

### Bước 1 — Rebuild Colab notebook

Ưu tiên hoàn thành một notebook duy nhất có:

- SAM 3 đang hoạt động.
- Qwen Prompt Assistant tùy chọn.
- FastAPI server.
- Cloudflare Tunnel.
- Health check.

### Bước 2 — Test API bằng laptop trước

Trước khi làm UI, dùng `curl` hoặc Python `requests` kiểm tra:

- `/health`.
- `/assistant/prompt`.
- `/segment` text.
- `/segment` box.

Điều này giúp phân biệt lỗi backend / GPU với lỗi giao diện.

### Bước 3 — Build local Streamlit UI

Tập trung vào một màn hình duy nhất: upload, prompt, canvas box, candidates và export.

### Bước 4 — Demo với designer

Đưa 5–10 ảnh thực tế cho designer thử. Ghi nhận:

- Prompt nào hiệu quả.
- Người dùng có cần Qwen gợi ý không.
- Box mode có giảm số lần prompt lại không.
- Candidate nào hay bị chọn nhầm.
- Output PNG có giữ đủ artwork không.

### Bước 5 — Chốt các cải tiến tiếp theo

Chỉ sau khi demo mới quyết định thêm brush/eraser, multi-artwork, matting, crop-based inference, PSD hay Photoshop integration.

---

## 15. Master prompt để giao coding agent vibe-code MVP

Có thể dùng prompt dưới đây cho Cursor / Claude Code / Codex. Coding agent cần đọc notebook hiện tại trước khi sửa để lấy đúng tên biến, phiên bản dependency và cách khởi tạo SAM 3 đang chạy được.

```text
Act as a senior Python AI engineer and pragmatic MVP builder.

Build an MVP called AI Artwork Extractor.

The project has two parts:
1. A Google Colab notebook that hosts SAM 3 and optional Qwen3-VL-4B,
   exposes a FastAPI API, and creates a Cloudflare Quick Tunnel.
2. A local Streamlit application on the user's laptop that calls the
   Colab API through the tunnel.

IMPORTANT CONTEXT:
- The user already has working SAM 3 inference in a Colab T4 16GB notebook.
- Read the existing notebook before writing code.
- Reuse the SAM 3 repository version, model builder, processor API,
  checkpoint access method, and working mixed-precision settings.
- Do not replace a working checkpoint or randomly change dependencies.
- Do not use paid inference APIs.
- Do not make the RTX 3050 4GB laptop run the SAM 3 model.

COLAB NOTEBOOK:
- Check T4 GPU and CUDA.
- Load SAM 3 once and keep it available.
- Load Qwen3-VL-4B-Instruct as an optional 4-bit NF4 model.
- Before loading Qwen, inspect free VRAM.
- Limit Qwen image resolution and generated tokens.
- If Qwen cannot load or causes OOM, disable only the Prompt Assistant;
  SAM 3 manual prompting must continue working.
- Qwen receives the uploaded image and user's Vietnamese request.
- Qwen returns structured JSON with target description, extraction scope,
  a concise SAM text prompt, up to three alternatives, and clarification flag.
- The user must review/edit the prompt before SAM is called.
- Never let Qwen generate masks or reconstruct artwork.
- Wrap SAM 3 and Qwen with FastAPI.
- Start Uvicorn on 127.0.0.1:8000.
- Start cloudflared Quick Tunnel to that local API.
- Print the temporary HTTPS base URL and a random bearer token.
- Never hardcode the HF token or API token into source files.

FASTAPI ENDPOINTS:
GET /health
POST /api/v1/assistant/prompt
POST /api/v1/segment

POST /api/v1/segment supports:
- text mode
- box mode
- text + box mode
- normalized bbox [cx, cy, width, height]
- one inference request at a time
- candidate masks, boxes, scores, overlay, transparent cutouts
- ZIP response with metadata.json and image files

SAM 3 RULES:
- Use processor.set_image once per uploaded image.
- Text mode: processor.set_text_prompt.
- Box mode: processor.add_geometric_prompt after set_image.
- Text + box: set_text_prompt followed by add_geometric_prompt.
- Inspect installed SAM 3 processor API before coding.
- Reset prompts or create a fresh image state for each separate run.
- Preserve original image pixels; use only the predicted mask as alpha.

LOCAL STREAMLIT APP:
- Upload image.
- Show image preview.
- Text prompt field.
- Button to ask Qwen for prompt suggestions.
- Editable prompt and clickable alternatives.
- Select Text / Box / Text + Box.
- Draw a rectangle using a canvas component.
- Convert canvas coordinates to normalized cx, cy, width, height.
- Call Colab API using requests and bearer token.
- Show every candidate with score, mask, overlay, transparent preview.
- Let user select candidate and download PNG or ZIP.
- Show API connected/disconnected status.
- Allow the user to update the temporary Cloudflare URL.

SECURITY:
- Require Authorization: Bearer token on all non-health endpoints.
- Limit upload file size and accept image formats only.
- Do not log image contents.
- Do not expose tokens in URLs.
- Keep local .env out of Git.

OUTPUT FILES:
- colab/SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb
- local_app/app.py
- local_app/remote_client.py
- local_app/canvas_utils.py
- local_app/requirements.txt
- local_app/.env.example
- README.md

Keep the implementation intentionally small.
Do not add authentication for individual employees, databases, queues,
batch processing, Photoshop plugins, PSD generation, dewarping,
matting, or production deployment in this MVP.

Write working code, not pseudocode. Add clear setup and run instructions.
Run syntax checks and lightweight local tests where possible.
Clearly report any Colab/GPU steps that cannot be executed locally.
```

---

## 16. Các giả định cần giữ rõ

1. Người dùng đã có quyền tải checkpoint SAM 3 trên Hugging Face.
2. Colab T4 16GB là inference host ban đầu; runtime có thể bị ngắt hoặc cấp GPU khác tùy availability.
3. Qwen3-VL-4B là Prompt Assistant tùy chọn; cần benchmark VRAM thực tế khi SAM 3 đã load.
4. Local app không chạy model; chỉ gửi ảnh / prompt / bbox đến API.
5. Cloudflare Quick Tunnel chỉ dành cho demo nội bộ ngắn hạn, không phải production endpoint.
6. MVP đo chất lượng segmentation và trải nghiệm designer; không cam kết làm phẳng hay tái tạo artwork bị che khuất.

---

## 17. Tài liệu tham khảo

- Meta SAM 3 repository và ví dụ image / visual prompting: <https://github.com/facebookresearch/sam3>
- SAM 3 image processor API: <https://github.com/facebookresearch/sam3/blob/main/sam3/model/sam3_image_processor.py>
- Qwen3-VL-4B-Instruct model card, image input và Transformers: <https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct>
- Bitsandbytes installation / supported NVIDIA compute capability / NF4: <https://huggingface.co/docs/bitsandbytes/en/installation>
- Cloudflare Quick Tunnels, URL tạm thời, bảo mật và giới hạn: <https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/>
- Google Colab FAQ, runtime và giới hạn phiên: <https://research.google.com/colaboratory/faq.html>

---

## Kết luận

MVP nên chứng minh được đúng một trải nghiệm đầu-cuối:

**Upload ảnh → (tuỳ chọn) Qwen hiểu yêu cầu và đề xuất prompt → người dùng sửa / xác nhận prompt → (tuỳ chọn) vẽ box → SAM 3 tách → người dùng chọn mask → tải PNG nền trong suốt.**

Toàn bộ model inference chạy trên Colab T4; laptop chỉ chạy giao diện. Nếu Qwen không vừa VRAM, manual prompt vẫn hoạt động. Đây là giới hạn an toàn quan trọng nhất để MVP không bị phụ thuộc vào LLM.
