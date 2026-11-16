# Kế hoạch & Danh mục Kiểm thử — AI Artwork Extractor MVP

Tài liệu này xác định danh mục kiểm thử chức năng (F01–F14), danh sách bộ dữ liệu mẫu (Dataset Smoke Test) và tiêu chí nghiệm thu demo thành công cho dự án **AI Artwork Extractor MVP**.

Căn cứ thiết kế:
- Kế hoạch tổng thể: [AI_Artwork_Extractor_MVP_Project_Plan.md](../AI_Artwork_Extractor_MVP_Project_Plan.md) (§12).
- Đặc tả kỹ thuật API: [API_CONTRACT.md](API_CONTRACT.md).
- Hướng dẫn vận hành: [README.md](../README.md).

---

## 1. Functional Test Checklist (F01–F14)

Bảng dưới đây ánh xạ chi tiết 14 ca kiểm thử chức năng theo kế hoạch MVP (§12.1). Các mục tự động hóa được kiểm tra thông qua `pytest` sử dụng fake engines mà không cần GPU; các mục tích hợp trực tiếp với trọng số mô hình Meta SAM 3 và Qwen3-VL được kiểm thử trên Google Colab.

| ID | Tên ca kiểm thử | Các bước thực hiện (Steps) | Kết quả mong đợi (Expected) | Trạng thái tự động hóa |
|---|---|---|---|---|
| **F01** | Kiểm tra kết nối khi Colab API online | 1. Khởi chạy FastAPI backend (hoặc fake server).<br>2. Mở ứng dụng Streamlit local (`streamlit run local_app/app.py`).<br>3. Kiểm tra thanh trạng thái trên Sidebar. | Sidebar hiển thị trạng thái **API Connected** (hoặc `Connected (SAM3: ready, Qwen: ready)`), không có lỗi kết nối. | **Automated** (`tests/server/test_api.py::test_health_without_auth`, `tests/local_app/test_app.py`) + Manual trên UI |
| **F02** | Upload ảnh định dạng JPG/JPEG | 1. Mở UI, chọn hoặc kéo thả file ảnh `.jpg` / `.jpeg`.<br>2. Kiểm tra khung hiển thị ảnh và kích thước. | Ảnh hiển thị rõ ràng, đúng tỷ lệ khung hình gốc (aspect ratio), kích thước ảnh (width x height) được ghi nhận chính xác. | **Automated** (`tests/local_app/test_app.py`, `tests/server/test_api.py::test_assistant_endpoints`) + Manual trên UI |
| **F03** | Upload ảnh định dạng PNG có alpha | 1. Chọn file ảnh `.png` (có thể chứa kênh alpha trong suốt sẵn có).<br>2. Xem hiển thị trên UI và gửi qua API. | Ảnh hiển thị ổn định, không bị bệt màu hoặc vỡ kênh alpha; API xử lý và giữ nguyên giá trị alpha gốc. | **Automated** (`tests/server/test_export.py::test_export_cutout_rgba_input_alpha_preserved`, `tests/server/test_api.py`) + Manual trên UI |
| **F04** | Trích xuất với Text Prompt | 1. Nhập prompt tiếng Anh (vd: `embroidered patch`).<br>2. Chọn mode `Text`.<br>3. Bấm **Run SAM 3**. | Server xử lý thành công, trả về file ZIP chứa metadata và danh sách candidate mask tương ứng với mô tả. | **Automated** (`tests/server/test_api.py::test_segment_modes_success`, `tests/server/test_sam3_engine.py`) + Manual trên Colab GPU |
| **F05** | Vẽ Bounding Box và chạy Box mode | 1. Dùng chuột vẽ hộp chữ nhật quanh artwork trên canvas.<br>2. Chọn mode `Box`.<br>3. Bấm **Run SAM 3**. | Tọa độ box được chuẩn hóa `[cx, cy, w, h]` trong khoảng `[0, 1]` chuẩn xác; SAM 3 nhận đúng vùng chọn và trả về mask bao quanh đối tượng. | **Automated** (`tests/local_app/test_canvas_utils.py`, `tests/server/test_api.py::test_segment_modes_success`) + Manual trên Colab GPU |
| **F06** | Kết hợp Text + Box mode | 1. Nhập prompt (vd: `logo embroidery`).<br>2. Vẽ bounding box định vị vùng cần lấy.<br>3. Chọn mode `Text + Box` và bấm **Run SAM 3**. | Server nhận cả text prompt và bbox; kết quả candidate được cô lập chính xác theo cả ngữ nghĩa mô tả lẫn vị trí khoanh vùng. | **Automated** (`tests/server/test_api.py::test_segment_modes_success`, `tests/local_app/test_remote_client.py`) + Manual trên Colab GPU |
| **F07** | Yêu cầu Qwen gợi ý prompt bằng tiếng Việt | 1. Upload ảnh sản phẩm.<br>2. Nhập câu yêu cầu bằng tiếng Việt tự nhiên (vd: *"Lấy toàn bộ patch vuông ở ngực áo"*).<br>3. Bấm **Suggest prompt**. | Qwen3-VL-4B phân tích ảnh và trả về JSON hợp lệ (`target_description`, `scope`, `sam_prompt`, `alternative_prompts`); nếu lỗi trả về thông báo rõ ràng. | **Automated** (`tests/assistant/test_assistant.py`, `tests/assistant/test_parser.py`, `tests/server/test_api.py::test_assistant_endpoints`) + Manual trên Colab GPU |
| **F08** | Chỉnh sửa prompt do Qwen đề xuất | 1. Nhận prompt do Qwen đề xuất trong ô nhập liệu.<br>2. Sửa đổi nội dung prompt thủ công (hoặc click chọn alternative prompt).<br>3. Bấm **Run SAM 3**. | SAM 3 thực thi chính xác theo prompt đã được người dùng chỉnh sửa, không tự động dùng prompt cũ hoặc tự động chạy khi chưa bấm duyệt. | **Automated** (`tests/server/test_api.py::test_segment_modes_success`, `tests/local_app/test_app.py`) + Manual trên UI |
| **F09** | Xử lý khi có nhiều candidate masks | 1. Chạy prompt chung cho sản phẩm có nhiều chi tiết tương đồng.<br>2. Kiểm tra danh sách candidate hiển thị trên UI. | UI hiển thị đầy đủ danh sách candidates sắp xếp theo confidence score giảm dần, kèm bounding box và ảnh xem trước; không tự chọn thay người dùng. | **Automated** (`tests/server/test_export.py`, `tests/local_app/test_result_viewer.py`, `tests/server/test_api.py`) + Manual trên UI |
| **F10** | Chọn candidate và xem trước (Preview) | 1. Click chọn một candidate cụ thể từ danh sách.<br>2. Đổi giữa các tab: Mask, Overlay, Cutout. | Hiển thị chính xác mask đen/trắng, overlay màu trên ảnh gốc, và cutout tách nền trên pattern caro trong suốt. | **Automated** (`tests/local_app/test_result_viewer.py`, `tests/server/test_export.py`) + Manual trên UI |
| **F11** | Tải Transparent PNG giữ nguyên pixel gốc | 1. Tải file `candidate_XX_cutout.png` hoặc `candidate_XX_cutout_crop.png`.<br>2. Mở kiểm tra trên phần mềm đồ họa (Photoshop / GIMP / viewer). | Ảnh PNG có kênh alpha thực sự; các pixel RGB trong vùng mask giữ nguyên 100% giá trị màu sắc, độ nhiễu và chi tiết từ ảnh gốc, không bị vẽ lại. | **Automated** (`tests/server/test_export.py::test_export_cutout_rgb_and_alpha`, `test_export_cutout_crop_bbox_and_padding`) + Manual verification |
| **F12** | Ứng xử khi Colab / Tunnel bị ngắt kết nối | 1. Tắt Cloudflare tunnel hoặc dừng cell server trên Colab.<br>2. Thao tác trên UI local (bấm Run hoặc reload). | UI hiển thị trạng thái mất kết nối (**Disconnected**), hướng dẫn cập nhật URL mới trên sidebar; ứng dụng không bị crash. | **Automated** (`tests/local_app/test_remote_client.py`, `tests/local_app/test_app.py`) + Manual simulation |
| **F13** | Kiểm tra phân quyền Bearer Token | 1. Gửi request không kèm header `Authorization`.<br>2. Gửi request kèm sai token. | Server từ chối request với mã lỗi HTTP **401 Unauthorized** và thông báo chi tiết; không cho phép truy cập trái phép. | **Automated** (`tests/server/test_api.py::test_auth_missing_or_wrong_token`, `test_create_app_requires_strong_token`) |
| **F14** | Khả năng tự phục hồi khi Qwen OOM / tắt | 1. Giả lập trường hợp Qwen bị lỗi bộ nhớ VRAM hoặc bị vô hiệu hóa (`ENABLE_QWEN=False`).<br>2. Thực hiện trích xuất thủ công với SAM 3. | Qwen tự ngắt tải an toàn, trả về 503 cho endpoint assistant; luồng Manual Mode với SAM 3 vẫn hoạt động độc lập bình thường. | **Automated** (`tests/server/test_api.py::test_assistant_endpoints`, `tests/assistant/test_assistant.py::test_suggest_oom_unloads_and_disables`) + Manual trên Colab |

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

- [x] **Trải nghiệm Designer hoàn chỉnh trên Laptop:** Designer mở ứng dụng local Streamlit trên laptop, kết nối ổn định tới Colab backend qua Cloudflare Quick Tunnel URL.
- [x] **Hỗ trợ 2 luồng linh hoạt:**
  - *Luồng A (Manual):* Nhập prompt thủ công tiếng Anh, vẽ box và chạy trực tiếp SAM 3.
  - *Luồng B (Assistant):* Nhập mô tả tiếng Việt tự nhiên, nhận gợi ý prompt từ Qwen3-VL-4B, chỉnh sửa prompt và xác nhận trước khi gửi sang SAM 3.
- [x] **Tương tác trực quan trên Canvas:** Cho phép designer vẽ bounding box định vị vùng chọn trên ảnh sản phẩm và chuyển đổi tọa độ chuẩn xác sang server.
- [x] **Đầy đủ 3 chế độ trích xuất:** Chạy ổn định cả 3 mode `text`, `box`, và `text_box`.
- [x] **Đánh giá Candidates minh bạch:** Hiển thị danh sách tất cả các candidate mask do SAM 3 trả về kèm theo điểm số tự tin (`score`) và bounding box; designer toàn quyền chọn candidate chính xác.
- [x] **Xem trước đa dạng (Multi-view Preview):** Cung cấp các chế độ xem trước Mask (đen/trắng), Overlay (phủ màu trên ảnh gốc), và Cutout (tách nền hiển thị trên hoa văn caro trong suốt).
- [x] **Chất lượng Xuất ảnh Trung thực (Pixel-Perfect):** File PNG nền trong suốt xuất ra bảo toàn nguyên vẹn 100% pixel RGB gốc từ ảnh chụp, không bị méo mó, mờ nhòe hay can thiệp bởi các mô hình AI generative redraw/inpainting.
- [x] **Đóng gói ZIP đầy đủ:** Hỗ trợ tải về trọn bộ kết quả gồm metadata JSON, mask PNG, overlay PNG và transparent cutout PNG (cả bản full-canvas và bản crop sát artwork kèm padding).
- [x] **Cách ly & Chịu lỗi (Fault Tolerance):** Nếu Qwen gặp sự cố VRAM OOM hoặc chưa được nạp, hệ thống thông báo trạng thái rõ ràng và luồng trích xuất thủ công với SAM 3 vẫn hoạt động bình thường mà không làm sập server.
- [x] **Không phụ thuộc API trả phí:** Toàn bộ giải pháp vận hành hoàn toàn trên hạ tầng mã nguồn mở và GPU miễn phí (Google Colab Tesla T4), không tiêu tốn chi phí inference của bên thứ ba.

---

## 4. Hướng dẫn Chạy Kiểm thử Tự động Local

Để chạy toàn bộ bộ kiểm thử tự động trên máy phát triển (không yêu cầu GPU hay CUDA):

### 1. Chuẩn bị môi trường
```bash
# Cài đặt các gói phụ thuộc kiểm thử
pip install -r requirements-dev.txt
```

### 2. Chạy toàn bộ test suite
```bash
python -m pytest -v
```

### 3. Chạy riêng từng module kiểm thử
```bash
# Kiểm thử API server và tích hợp fake engines
python -m pytest tests/server/test_api.py -v

# Kiểm thử xuất ảnh, cắt cúp và đóng gói ZIP
python -m pytest tests/server/test_export.py -v

# Kiểm thử SAM 3 engine wrapper
python -m pytest tests/server/test_sam3_engine.py -v

# Kiểm thử Qwen Prompt Assistant và bộ phân tích JSON
python -m pytest tests/assistant/ -v

# Kiểm thử giao diện và client local
python -m pytest tests/local_app/ -v
```
