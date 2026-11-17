# Kế hoạch & Danh mục Kiểm thử — AI Artwork Extractor MVP

Tài liệu này xác định danh mục kiểm thử chức năng (F01–F14), danh sách bộ dữ liệu mẫu (Dataset Smoke Test) và tiêu chí nghiệm thu demo thành công cho dự án **AI Artwork Extractor MVP**.

Căn cứ thiết kế:
- Kế hoạch tổng thể: [AI_Artwork_Extractor_MVP_Project_Plan.md](../AI_Artwork_Extractor_MVP_Project_Plan.md) (§12).
- Đặc tả kỹ thuật API: [API_CONTRACT.md](API_CONTRACT.md).
- Hướng dẫn vận hành: [README.md](../README.md).

---

## 1. Functional Test Checklist (F01–F14)

Bảng dưới đây ánh xạ chi tiết 14 ca kiểm thử chức năng theo kế hoạch MVP cho giao diện **React Web UI** (`web_app/`, Vite + React 19 + TypeScript) và Colab API backend. Các mục tự động hóa được kiểm thử qua:
- Bộ test backend Python: `pytest` trong thư mục `tests/` (chạy trên fake engines không cần GPU).
- Bộ test frontend Web UI: `Vitest` trong `web_app/src` (`npm run test`).

| ID | Tên ca kiểm thử | Các bước thực hiện (Steps) | Kết quả mong đợi (Expected) | Trạng thái tự động hóa |
|---|---|---|---|---|
| **F01** | Kiểm tra kết nối khi Colab API online | 1. Khởi chạy FastAPI backend (hoặc fake server `python -m server_reference.run_local_fake --port 8765 --token <token>`).<br>2. Mở Web UI (`cd web_app && npm run dev` -> http://localhost:5173).<br>3. Bấm nút trạng thái 'Cài đặt kết nối API' trên header, nhập URL và token, bấm 'Lưu & Kiểm tra kết nối'. | Header hiển thị trạng thái **Đã kết nối (Connected)** màu xanh kèm GPU, SAM 3, Qwen; cấu hình được lưu vào `localStorage`; toast báo thành công. | **Automated** (`tests/server/test_api.py::test_health_without_auth`, `web_app/src/core/api/client.test.ts` - *health() sends no Authorization header*, `web_app/src/state/store.test.ts` - *checkHealth sets health on success*, `web_app/src/features/connection/ConnectionModal.test.tsx` - *saves new connection settings when clicking save and test*) + Manual trên UI |
| **F02** | Upload ảnh định dạng JPG/JPEG | 1. Kéo thả hoặc click chọn file ảnh `.jpg` / `.jpeg` tại UploadDropzone panel bên trái.<br>2. Kiểm tra khung hiển thị ảnh và thông tin kích thước (ImageInfo). | Ảnh hiển thị rõ ràng trên Canvas trung tâm, đúng tỷ lệ khung hình gốc (aspect ratio); panel ImageInfo ghi nhận đúng kích thước `naturalWidth × naturalHeight` và dung lượng; ảnh tự động fit khung nhìn. | **Automated** (`tests/server/test_api.py::test_assistant_endpoints`, `web_app/src/state/store.test.ts` - *loads image, creates URL, and resets downstream state*, `web_app/src/state/store.test.ts` - *rejects unsupported file type without throwing*) + Manual trên UI |
| **F03** | Upload ảnh định dạng PNG có alpha | 1. Chọn file ảnh `.png` (có thể chứa sẵn kênh alpha trong suốt).<br>2. Xem hiển thị trên Canvas và gửi yêu cầu phân đoạn qua API. | Ảnh hiển thị mượt mà trên Canvas; API xử lý và bảo toàn giá trị alpha gốc (`orig_alpha * mask`); pixel RGB nguyên vẹn không bị lem, đổi màu hay bệt viền. | **Automated** (`tests/server/test_export.py::test_export_rgba_input_alpha_preserved`, `tests/server/test_api.py::test_segment_modes_success`) + Manual trên UI |
| **F04** | Trích xuất với Text Prompt | 1. Nhập prompt tiếng Anh (vd: `embroidered patch`) vào ô SAM Prompt.<br>2. Chọn mode `Text` (phím `T` hoặc click nút Text trong ModeSelector).<br>3. Bấm **Bóc tách Artwork** (hoặc nhấn `R` / `Ctrl+Enter`). | Server xử lý thành công, trả về file ZIP `result.zip`; Web UI giải nén bằng JSZip và hiển thị danh sách candidate mask tương ứng trên thanh CandidateStrip. | **Automated** (`tests/server/test_api.py::test_segment_modes_success`, `tests/server/test_sam3_engine.py::test_seg_result_dataclass`, `web_app/src/core/api/client.test.ts` - *segment() sends Bearer token, correct FormData, and calls parseSegmentZip*, `web_app/src/state/store.test.ts` - *validates prompt required for text mode*) + Manual trên Colab GPU |
| **F05** | Vẽ Bounding Box và chạy Box mode | 1. Chọn mode `Box` (phím `B` hoặc click nút Box).<br>2. Dùng chuột kéo vẽ khung chữ nhật bao quanh artwork trên Canvas (hỗ trợ resize và phím `Esc`/`Del` để xóa).<br>3. Bấm **Bóc tách Artwork** (hoặc `R` / `Ctrl+Enter`). | Tọa độ box được quy đổi sang pixel ảnh gốc dựa trên `naturalWidth/naturalHeight`, chuẩn hóa `[cx, cy, w, h]` trong khoảng `[0, 1]`; SAM 3 nhận đúng bbox và trả về mask bao quanh đối tượng. | **Automated** (`web_app/src/core/geometry/box.test.ts` - *displayDragToImageBox*, *boxToNormCxCyWh & normCxCyWhToBox round-trip*, `web_app/src/state/store.test.ts` - *validates box required for box mode*, `web_app/src/features/canvas/SvgBoxOverlay.test.tsx`, `tests/server/test_api.py::test_segment_modes_success`) + Manual trên Colab GPU |
| **F06** | Kết hợp Text + Box mode | 1. Chọn mode `Text + Box`.<br>2. Nhập prompt tiếng Anh (vd: `logo embroidery`).<br>3. Vẽ bounding box định vị vùng cần lấy trên Canvas.<br>4. Bấm **Bóc tách Artwork**. | Server nhận cả text prompt và bbox; kết quả candidate được cô lập chính xác theo cả ngữ nghĩa mô tả lẫn vị trí khoanh vùng mục tiêu. | **Automated** (`tests/server/test_api.py::test_segment_modes_success`, `web_app/src/state/store.test.ts` - *validates both prompt and box for text_box mode*, `web_app/src/core/api/client.test.ts`) + Manual trên Colab GPU |
| **F07** | Yêu cầu Qwen gợi ý prompt bằng tiếng Việt | 1. Upload ảnh sản phẩm.<br>2. Nhập câu yêu cầu bằng tiếng Việt tự nhiên (vd: *"Lấy toàn bộ patch vuông ở ngực áo"*).<br>3. Bấm **Gợi ý prompt** (Ask Qwen). | Qwen3-VL-4B phân tích ảnh và trả về JSON: `target_description` (tiếng Việt), `sam_prompt` (tiếng Anh ngắn gọn), `alternative_prompts` (tiếng Anh); hiển thị trong thẻ SuggestionCard và tự động điền vào ô SAM Prompt nếu ô đang trống. | **Automated** (`tests/assistant/test_assistant.py::test_suggest_success`, `tests/assistant/test_parser.py`, `tests/server/test_api.py::test_assistant_endpoints`, `web_app/src/core/api/client.test.ts` - *suggestPrompt() sends Bearer token and correct FormData*, `web_app/src/state/store.test.ts` - *puts sam_prompt in prompt field if prompt was empty*, `web_app/src/features/prompt/SuggestionCard.test.tsx` - *renders target description, scope badge and reason*) + Manual trên Colab GPU |
| **F08** | Chỉnh sửa prompt do Qwen đề xuất | 1. Nhận prompt do Qwen đề xuất trong ô SAM Prompt.<br>2. Sửa đổi nội dung prompt thủ công (hoặc click chọn chip alternative prompt trên SuggestionCard).<br>3. Bấm **Bóc tách Artwork**. | Khi click chip alternative prompt, ô SAM Prompt cập nhật ngay lập tức; không tự động ghi đè nếu designer đã tự sửa; hiển thị cảnh báo màu vàng nếu nhập ký tự tiếng Việt (non-ASCII); SAM 3 thực thi chính xác theo prompt cuối cùng đã xác nhận. | **Automated** (`web_app/src/features/prompt/SuggestionCard.test.tsx` - *clicking an alternative chip updates the store prompt*, `web_app/src/state/store.test.ts` - *overwrites prompt if prompt was the previous suggestion, but preserves user edit*, *usePrompt sets prompt only and never triggers segmentation*, `web_app/src/features/prompt/SamPromptInput.test.tsx` - *shows non-English warning when Vietnamese characters are entered*, `web_app/src/core/config/storage.test.ts` - *isLikelyNonEnglish*, `tests/server/test_api.py::test_segment_modes_success`) + Manual trên UI |
| **F09** | Xử lý khi có nhiều candidate masks | 1. Chạy prompt chung cho sản phẩm có nhiều chi tiết tương đồng.<br>2. Kiểm tra thanh CandidateStrip ở đáy màn hình. | UI hiển thị danh sách thẻ CandidateCard sắp xếp theo confidence score giảm dần, kèm thumbnail overlay, score % và kích thước px; hỗ trợ phím mũi tên `←` / `→` để duyệt nhanh; không tự chọn thay người dùng. | **Automated** (`tests/server/test_export.py::test_export_zip_layout_and_metadata_validation`, `tests/server/test_api.py::test_segment_modes_success`, `web_app/src/core/zip/parseResult.test.ts` - *parses valid result zip with candidates and creates object URLs*, `web_app/src/features/candidates/CandidateStrip.test.tsx` - *navigates candidates using keyboard arrow keys*, `web_app/src/features/candidates/CandidateCard.test.tsx` - *renders score percentage, dimensions, and responds to click*) + Manual trên UI |
| **F10** | Chọn candidate và xem trước (Preview) | 1. Click chọn một candidate cụ thể trên CandidateStrip hoặc bấm 'Mở kiểm tra chi tiết ↗'.<br>2. Chuyển đổi qua lại giữa các tab: Overlay, Cutout, Mask.<br>3. Đổi chế độ nền (Lưới caro Checkerboard / Nền tối Dark). | Modal phóng to hiển thị chính xác ảnh; tab Overlay hiển thị viền phủ màu; tab Cutout hiển thị hình tách nền trên lưới trong suốt hoặc nền tối; tab Mask hiển thị nhị phân đen/trắng; hiển thị đầy đủ thông số kỹ thuật (score, bbox, mask area). | **Automated** (`web_app/src/features/preview/CandidatePreviewModal.test.tsx` - *renders candidate specs and switches tabs*, *switches background mode between checker and dark*, `tests/server/test_export.py::test_export_cutout_rgb_and_alpha`) + Manual trên UI |
| **F11** | Tải Transparent PNG giữ nguyên pixel gốc & Ghép Full Cutout in-browser | 1. Tại ExportPanel hoặc trong PreviewModal, bấm tải Cutout Crop (cắt sát viền kèm padding) hoặc Full Cutout (nguyên khổ canvas), hoặc tải file ZIP tổng hợp.<br>2. Mở kiểm tra file PNG trên Photoshop / viewer. | File PNG có kênh alpha thực sự; RGB trong vùng mask bảo toàn 100% pixel gốc; với profile `lean` (mặc định), Web UI tự ghép tái tạo `full cutout` nguyên khổ canvas bằng cách vẽ `cutout_crop` lên canvas trong suốt kích thước `image_size` tại vị trí `crop_box_xyxy_px`, bảo đảm pixel-exact. | **Automated** (`tests/server/test_export.py::test_export_cutout_rgb_and_alpha`, `tests/server/test_export.py::test_export_crop_bbox_and_padding_clamped`, `tests/server/test_export.py::test_export_lean_profile_default_and_crop_box`, `web_app/src/core/export/fullCutout.test.ts` - *creates canvas of imageSize and draws crop at (x0, y0)*, `web_app/src/state/store.test.ts` - *composes full cutout from cropBlob + cropBox when cutout is absent (lean profile), caches and disposes URL*) + Manual verification |
| **F12** | Ứng xử khi Colab / Tunnel bị ngắt kết nối | 1. Dừng Cloudflare tunnel hoặc tắt server backend.<br>2. Thao tác trên Web UI (bấm Bóc tách hoặc mở ConnectionModal). | Web UI không bị crash trắng trang; thanh trạng thái chuyển sang màu đỏ (**Disconnected**); hiển thị Toast thông báo lỗi mất kết nối; hướng dẫn mở 'Cài đặt kết nối API' để kiểm tra hoặc cập nhật URL mới. | **Automated** (`web_app/src/core/api/client.test.ts` - *maps network TypeError to disconnected*, *maps timeout to disconnected*, *maps Cloudflare 502/530/524 HTML error pages to disconnected*, `web_app/src/state/store.test.ts` - *checkHealth sets healthError on failure*) + Manual simulation |
| **F13** | Kiểm tra phân quyền Bearer Token | 1. Gửi request không kèm header `Authorization` hoặc kèm sai token.<br>2. Thử nhập sai token trong ConnectionModal và bấm 'Lưu & Kiểm tra'. | Server từ chối request với mã lỗi HTTP **401 Unauthorized** (`{"detail": "..."}`); Web UI hiển thị Toast lỗi xác thực không thành công; không cho phép truy cập trái phép. | **Automated** (`tests/server/test_api.py::test_auth_missing_or_wrong_token`, `tests/server/test_api.py::test_create_app_requires_strong_token`, `web_app/src/core/api/client.test.ts` - *maps 401 to auth*, `web_app/src/features/connection/ConnectionModal.test.tsx`) |
| **F14** | Khả năng tự phục hồi khi Qwen OOM / tắt | 1. Giả lập trường hợp Qwen bị lỗi bộ nhớ VRAM hoặc bị tắt (`ENABLE_QWEN=False`).<br>2. Thực hiện trích xuất thủ công với SAM 3 trên Web UI. | Qwen tự ngắt tải an toàn, trả về 503 cho endpoint assistant; header/modal hiển thị Qwen không khả dụng; panel Assistant thông báo trạng thái; luồng trích xuất thủ công với SAM 3 (`text`, `box`, `text_box`) vẫn hoạt động độc lập bình thường. | **Automated** (`tests/server/test_api.py::test_assistant_endpoints`, `tests/assistant/test_assistant.py::test_suggest_simulated_oom_first_call`, `tests/assistant/test_assistant.py::test_disabled_assistant_raises_unavailable`, `web_app/src/core/api/client.test.ts` - *maps 503 on assistant to assistant_unavailable*, *maps 503 on segment to sam_unavailable*) + Manual trên Colab |

---

## 2. Dataset Smoke Test (Bộ ảnh thực tế)

Theo kế hoạch MVP (§12.2), trước khi nghiệm thu bản demo, hệ thống cần được chạy thử nghiệm trên bộ ảnh mockup sản phẩm thực tế (5–10 ảnh) nhằm đánh giá độ bền vững và chất lượng tách nền:

| STT | Loại sản phẩm & Đặc điểm test case | Mục tiêu kiểm thử | Lưu ý khi đánh giá kết quả |
|---|---|---|---|
| **D01** | **Baseball Cap (Mũ lưỡi trai)**<br>Có patch thêu huy hiệu lớn ở mặt trước. | Kiểm tra khả năng tách trọn vẹn toàn bộ patch (`entire_patch`) bao gồm cả đường viền thêu nổi. | Kiểm tra viền ngoài không bị khuyết mất chỉ thêu; bề mặt vải mũ không bị dính vào mask. |
| **D02** | **T-Shirt (Áo thun)**<br>Họa tiết in lụa / kỹ thuật số đồ họa phẳng (graphic print). | Kiểm tra chế độ `inner_artwork` trích xuất đúng họa tiết in, loại bỏ hoàn toàn nền vải áo thun. | Chú ý các vùng rỗng bên trong chữ hoặc giữa các nét vẽ có được tách thủng nền hay không. |
| **D03** | **Hoodie (Áo nỉ có mũ)**<br>Có chữ thêu nổi dạng cong và logo thương hiệu ở ngực. | Kiểm tra Qwen diễn giải đúng câu lệnh tiếng Việt *"chữ thêu cong"* thành prompt SAM 3 phù hợp. | Dùng kết hợp Text + Box nếu chữ thêu nằm gần các nếp gấp vải của áo hoodie. |
| **D04** | **Backpack (Balo vải)**<br>Có patch cao su / da / vải gắn trên nền vải dù thô ráp. | Kiểm tra tính năng phân biệt chất liệu giữa bề mặt patch và chất liệu nền vải dù. | Bbox mode hỗ trợ định vị nhanh trong trường hợp balo có nhiều dây kéo và khóa cài kim loại. |
| **D05** | **Multi-Artwork Product**<br>Sản phẩm có nhiều nhãn mác, hình in và tem tag cùng xuất hiện. | Kiểm tra SAM 3 sinh nhiều candidate masks; UI hiển thị danh sách để designer lựa chọn đúng đối tượng mong muốn. | Xác nhận hệ thống không tự ý gộp hoặc tự ý chọn sai artwork thay designer. |
| **D06** | **Fringed Patch (Patch viền xù / tua rua)**<br>Patch thêu có sợi chỉ tưa ra ngoài viền vải. | Thử thách độ chi tiết của mask tại đường biên phức tạp. | Đánh giá mask candidate; kiểm tra transparent PNG xuất ra giữ nguyên các sợi chỉ thật từ pixel gốc. |
| **D07** | **White-on-White Challenge**<br>Patch nền vải trắng / thêu chỉ trắng nằm trên áo sơ mi hoặc áo thun màu trắng / kem. | Thử thách tách đối tượng có độ tương phản màu sắc cực thấp so với nền. | Khuyến nghị sử dụng chế độ `Text + Box` để trợ giúp SAM 3 định vị chính xác ranh giới của patch. |

---

## 3. Tiêu chí Nghiệm thu Demo Thành công (Demo Success Criteria)

Theo kế hoạch MVP (§12.3), phiên demo được xem là **thành công trọn vẹn** khi đạt được tất cả các tiêu chí sau:

- [ ] **Trải nghiệm Designer hoàn chỉnh trên Trình duyệt (Web UI):** Designer mở ứng dụng React Web UI (Vite + React 19 + TypeScript) trên trình duyệt, kết nối ổn định tới Colab backend qua Cloudflare Quick Tunnel URL (hoặc Fake Server cục bộ khi phát triển).
- [ ] **Hỗ trợ 2 luồng linh hoạt:**
  - *Luồng A (Manual):* Nhập prompt thủ công tiếng Anh, vẽ box trên Canvas và chạy trực tiếp SAM 3.
  - *Luồng B (Assistant):* Nhập mô tả tiếng Việt tự nhiên, nhận gợi ý prompt từ Qwen3-VL-4B, chỉnh sửa prompt và xác nhận trước khi gửi sang SAM 3.
- [ ] **Tương tác trực quan trên Canvas:** Cho phép designer vẽ bounding box định vị vùng chọn trên ảnh sản phẩm, căn chỉnh kích thước box và chuyển đổi tọa độ chuẩn xác sang server.
- [ ] **Đầy đủ 3 chế độ trích xuất:** Chạy ổn định cả 3 mode `text`, `box`, và `text_box`.
- [ ] **Đánh giá Candidates minh bạch:** Hiển thị danh sách tất cả các candidate mask do SAM 3 trả về kèm theo điểm số tự tin (`score`) và bounding box trên thanh CandidateStrip; designer toàn quyền chọn candidate chính xác.
- [ ] **Xem trước đa dạng (Multi-view Preview):** Cung cấp các chế độ xem trước Mask (đen/trắng), Overlay (phủ màu trên ảnh gốc), và Cutout (tách nền hiển thị trên hoa văn caro trong suốt hoặc nền tối).
- [ ] **Chất lượng Xuất ảnh Trung thực (Pixel-Perfect):** File PNG nền trong suốt xuất ra bảo toàn nguyên vẹn 100% pixel RGB gốc từ ảnh chụp, không bị méo mó, mờ nhòe hay can thiệp bởi các mô hình AI generative redraw/inpainting.
- [ ] **Ghép Full-Canvas Cutout siêu tốc & Đóng gói ZIP:** Hỗ trợ profile `lean` xuất file nén nhẹ qua tunnel và tự ghép tái tạo `full cutout` nguyên khổ pixel-exact ngay trong trình duyệt; hỗ trợ tải file ZIP tổng hợp.
- [ ] **Cách ly & Chịu lỗi (Fault Tolerance):** Nếu Qwen gặp sự cố VRAM OOM hoặc chưa được nạp, hệ thống thông báo trạng thái rõ ràng và luồng trích xuất thủ công với SAM 3 vẫn hoạt động bình thường mà không làm sập server hay UI.
- [ ] **Không phụ thuộc API trả phí:** Toàn bộ giải pháp vận hành hoàn toàn trên hạ tầng mã nguồn mở và GPU miễn phí (Google Colab Tesla T4), không tiêu tốn chi phí inference của bên thứ ba.

---

## 4. Hướng dẫn Chạy Kiểm thử Tự động Local

Hệ thống được kiểm thử tự động toàn diện cả backend (Python) lẫn frontend (React TypeScript) trên máy phát triển mà không cần GPU:

### 1. Kiểm thử Backend Python (`pytest`)

Chuẩn bị môi trường:
```bash
pip install -r requirements-dev.txt
```

Chạy toàn bộ backend test suite:
```bash
python -m pytest -v
```

Chạy riêng từng module kiểm thử:
```bash
# Kiểm thử API server và tích hợp fake engines
python -m pytest tests/server/test_api.py -v

# Kiểm thử xuất ảnh, cắt cúp và đóng gói ZIP
python -m pytest tests/server/test_export.py -v

# Kiểm thử SAM 3 engine wrapper
python -m pytest tests/server/test_sam3_engine.py -v

# Kiểm thử Qwen Prompt Assistant và bộ phân tích JSON
python -m pytest tests/assistant/ -v

# Kiểm thử script đóng gói và tạo Colab notebook
python -m pytest tests/colab/ -v
```

### 2. Kiểm thử Frontend Web UI (`Vitest`)

Chuẩn bị môi trường:
```bash
cd web_app
npm install
```

Chạy toàn bộ frontend test suite:
```bash
npm run test
```

Chạy kiểm tra kiểu dữ liệu TypeScript và linter:
```bash
npm run typecheck
npm run lint
```
