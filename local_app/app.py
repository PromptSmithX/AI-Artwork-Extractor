"""AI Artwork Extractor — Local Streamlit UI.

Laptop-side application calling the Colab inference API.
Follows docs/API_CONTRACT.md and plan section 9.
"""
from __future__ import annotations

import io
import os
import sys
from typing import Optional

# 1. Insert repository root into sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import streamlit as st
from PIL import Image

# 2. Compatibility shim for streamlit-drawable-canvas on newer Streamlit versions
try:
    import streamlit.elements.image as _st_image
    import streamlit.elements.lib.image_utils as _image_utils

    def _shim_image_to_url(
        image,
        width_or_layout=None,
        clamp=False,
        channels="RGB",
        output_format="PNG",
        image_id="",
    ):
        if not hasattr(width_or_layout, "width"):
            layout_config = _st_image.create_layout_config(width=width_or_layout)
        else:
            layout_config = width_or_layout
        return _image_utils.image_to_url(
            image, layout_config, clamp, channels, output_format, image_id
        )

    _st_image.image_to_url = _shim_image_to_url
except Exception:
    pass

try:
    from streamlit_drawable_canvas import st_canvas

    CANVAS_AVAILABLE = True
except Exception:
    CANVAS_AVAILABLE = False

from local_app.canvas_utils import (
    canvas_rect_to_image_xyxy,
    extract_last_rect,
    fit_display_size,
    load_display_image,
    xyxy_to_norm_cxcywh,
)
from local_app.remote_client import (
    ApiError,
    AssistantUnavailable,
    AuthError,
    ClientConfig,
    Disconnected,
    RemoteClient,
    RemoteError,
    ServerBusy,
    load_config,
)
from local_app.result_viewer import (
    candidate_caption,
    composite_on_background,
    draw_bbox,
    to_png_bytes,
)
from server_reference.schemas import Mode, ScopePreference


def init_session_state() -> None:
    """Initialize Streamlit session state defaults without conflicting with widget keys."""
    if "config" not in st.session_state:
        st.session_state.config = load_config()

    if "input_api_url" not in st.session_state:
        st.session_state["input_api_url"] = st.session_state.config.url

    if "input_api_token" not in st.session_state:
        st.session_state["input_api_token"] = st.session_state.config.token

    if "confidence_threshold" not in st.session_state:
        st.session_state["confidence_threshold"] = 0.35

    if "req_text_area" not in st.session_state:
        st.session_state["req_text_area"] = ""

    if "sam_prompt_field" not in st.session_state:
        st.session_state["sam_prompt_field"] = ""

    if "uploaded_image_bytes" not in st.session_state:
        st.session_state.uploaded_image_bytes = None

    if "uploaded_image_name" not in st.session_state:
        st.session_state.uploaded_image_name = ""

    if "current_file_id" not in st.session_state:
        st.session_state.current_file_id = None

    if "prompt_suggestion" not in st.session_state:
        st.session_state.prompt_suggestion = None

    if "segment_result" not in st.session_state:
        st.session_state.segment_result = None

    if "selected_candidate_idx" not in st.session_state:
        st.session_state.selected_candidate_idx = None

    if "current_box_xyxy" not in st.session_state:
        st.session_state.current_box_xyxy = None

    if "current_box_norm" not in st.session_state:
        st.session_state.current_box_norm = None

    if "health_status" not in st.session_state:
        st.session_state.health_status = None

    if "initial_health_checked" not in st.session_state:
        st.session_state.initial_health_checked = False


def get_client() -> RemoteClient:
    """Return configured RemoteClient instance reading directly from session state."""
    url = st.session_state.get("input_api_url", "")
    token = st.session_state.get("input_api_token", "")
    timeout = st.session_state.config.timeout
    return RemoteClient(base_url=url, token=token, timeout=timeout)


def check_health(silent_error: bool = False) -> None:
    """Query GET /health and update session_state."""
    client = get_client()
    try:
        health = client.health(timeout=10.0)
        st.session_state.health_status = {
            "connected": True,
            "gpu": health.gpu,
            "sam3_loaded": health.sam3_loaded,
            "qwen_loaded": health.qwen_loaded,
            "assistant_available": health.prompt_assistant_available,
            "busy": health.busy,
            "message": "Connected",
        }
    except Disconnected as e:
        st.session_state.health_status = {
            "connected": False,
            "message": f"Disconnected: {e}",
        }
    except Exception as e:
        st.session_state.health_status = {
            "connected": False,
            "message": f"Error: {e}",
        }


def set_sam_prompt(new_prompt: str) -> None:
    """Callback to update SAM prompt widget state reliably."""
    st.session_state["sam_prompt_field"] = new_prompt


def render_sidebar() -> None:
    """Render sidebar connection controls and health display using session-state keys."""
    st.sidebar.title("Connection & Settings")

    st.sidebar.text_input(
        "Colab API URL",
        key="input_api_url",
        help="Cloudflare Quick Tunnel URL (e.g. https://xxxx.trycloudflare.com)",
    )

    st.sidebar.text_input(
        "API Bearer Token",
        type="password",
        key="input_api_token",
        help="Secret token printed in Colab output",
    )

    col_btn, _ = st.sidebar.columns([1, 1])
    with col_btn:
        if st.sidebar.button("Check connection"):
            check_health()

    # Health display
    hs = st.session_state.health_status
    if hs:
        if hs.get("connected"):
            st.sidebar.success("🟢 API: CONNECTED")
            st.sidebar.caption(
                f"**GPU:** {hs.get('gpu') or 'None'} | "
                f"**SAM3:** {'Loaded' if hs.get('sam3_loaded') else 'Not loaded'}\n\n"
                f"**Qwen:** {'Loaded' if hs.get('qwen_loaded') else 'Not loaded'} | "
                f"**Assistant:** {'Available' if hs.get('assistant_available') else 'Unavailable'}"
            )
            if hs.get("busy"):
                st.sidebar.warning("⚠️ Server is currently busy.")
        else:
            st.sidebar.error("🔴 API: DISCONNECTED")
            st.sidebar.caption(hs.get("message", "Cannot connect to Colab API."))
    else:
        st.sidebar.info("Connection status: Not checked")

    st.sidebar.markdown("---")
    st.sidebar.subheader("Inference Settings")
    st.sidebar.slider(
        "Confidence Threshold",
        min_value=0.05,
        max_value=0.95,
        step=0.05,
        key="confidence_threshold",
        help="SAM 3 detection confidence threshold (default 0.35)",
    )


def main() -> None:
    st.set_page_config(page_title="AI Artwork Extractor", layout="wide")
    init_session_state()

    # Automatic initial health check on first load
    if not st.session_state.initial_health_checked:
        st.session_state.initial_health_checked = True
        if st.session_state.get("input_api_url"):
            check_health(silent_error=True)

    render_sidebar()

    # Top Header
    header_col1, header_col2 = st.columns([3, 1])
    with header_col1:
        st.title("AI ARTWORK EXTRACTOR")
    with header_col2:
        hs = st.session_state.health_status
        if hs and hs.get("connected"):
            st.markdown(
                "<h3 style='text-align: right; color: #28a745;'>🟢 API: CONNECTED</h3>",
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                "<h3 style='text-align: right; color: #dc3545;'>🔴 API: DISCONNECTED</h3>",
                unsafe_allow_html=True,
            )

    st.markdown("---")

    # Three-Column Layout: INPUT | IMAGE CANVAS | PROMPT
    col_input, col_canvas, col_prompt = st.columns([1.1, 1.6, 1.3])

    # ==========================
    # 1. COLUMN: INPUT
    # ==========================
    with col_input:
        st.subheader("1. INPUT")
        uploaded_file = st.file_uploader(
            "Upload product image",
            type=["jpg", "jpeg", "png"],
            help="Select an original product photo containing artwork/patch",
        )

        if uploaded_file is not None:
            # Check if this is a new file
            file_id = f"{uploaded_file.name}_{uploaded_file.size}"
            if file_id != st.session_state.current_file_id:
                st.session_state.uploaded_image_bytes = uploaded_file.getvalue()
                st.session_state.uploaded_image_name = uploaded_file.name
                st.session_state.current_file_id = file_id
                # Reset previous results
                st.session_state.segment_result = None
                st.session_state.selected_candidate_idx = None
                st.session_state.current_box_xyxy = None
                st.session_state.current_box_norm = None
                st.session_state.prompt_suggestion = None

        if st.session_state.uploaded_image_bytes:
            display_image = load_display_image(st.session_state.uploaded_image_bytes)
            st.caption(f"**Dimensions:** {display_image.width} × {display_image.height} px")
        else:
            display_image = None

        mode_choice = st.radio(
            "Extraction Mode",
            ["Text", "Box", "Text + Box"],
            index=0,
            help="Choose input guidance for SAM 3",
        )
        mode_map = {
            "Text": Mode.TEXT,
            "Box": Mode.BOX,
            "Text + Box": Mode.TEXT_BOX,
        }
        selected_mode = mode_map[mode_choice]

    # ==========================
    # 2. COLUMN: IMAGE CANVAS
    # ==========================
    with col_canvas:
        st.subheader("2. IMAGE CANVAS")
        if display_image is not None:
            img_w, img_h = display_image.width, display_image.height
            disp_w, disp_h, scale = fit_display_size(
                img_w, img_h, max_w=650, max_h=550
            )

            used_canvas = False
            if CANVAS_AVAILABLE:
                st.caption(
                    "Vẽ bounding box xung quanh artwork bằng chuột (chế độ Rectangle):"
                )
                try:
                    display_bg = display_image.resize((disp_w, disp_h))
                    canvas_result = st_canvas(
                        fill_color="rgba(255, 75, 75, 0.2)",
                        stroke_width=2,
                        stroke_color="#FF4B4B",
                        background_image=display_bg,
                        update_streamlit=True,
                        height=disp_h,
                        width=disp_w,
                        drawing_mode="rect",
                        key="canvas_box",
                    )
                    used_canvas = True

                    rect = extract_last_rect(canvas_result.json_data)
                    if rect:
                        xyxy = canvas_rect_to_image_xyxy(
                            rect["left"],
                            rect["top"],
                            rect["width"],
                            rect["height"],
                            scale,
                            img_w,
                            img_h,
                        )
                        try:
                            norm_box = xyxy_to_norm_cxcywh(xyxy, img_w, img_h)
                            st.session_state.current_box_xyxy = xyxy
                            st.session_state.current_box_norm = norm_box
                            st.success(
                                f"Box: [{int(xyxy[0])}, {int(xyxy[1])}, {int(xyxy[2])}, {int(xyxy[3])}] px "
                                f"(norm: [{norm_box[0]:.2f}, {norm_box[1]:.2f}, {norm_box[2]:.2f}, {norm_box[3]:.2f}])"
                            )
                        except ValueError:
                            st.session_state.current_box_xyxy = None
                            st.session_state.current_box_norm = None
                    else:
                        st.session_state.current_box_xyxy = None
                        st.session_state.current_box_norm = None
                except Exception as ex:
                    used_canvas = False
                    st.warning(
                        f"Canvas component failed: {ex}. Falling back to manual coordinates."
                    )

            if not used_canvas:
                st.info("Chế độ nhập tọa độ thủ công (Manual Coordinates):")
                num_c1, num_c2 = st.columns(2)
                with num_c1:
                    bx1 = st.number_input(
                        "X min (px)", 0, img_w, 0, key="box_x1"
                    )
                    by1 = st.number_input(
                        "Y min (px)", 0, img_h, 0, key="box_y1"
                    )
                with num_c2:
                    bx2 = st.number_input(
                        "X max (px)", 0, img_w, img_w, key="box_x2"
                    )
                    by2 = st.number_input(
                        "Y max (px)", 0, img_h, img_h, key="box_y2"
                    )

                if bx2 > bx1 and by2 > by1:
                    xyxy = (float(bx1), float(by1), float(bx2), float(by2))
                    norm_box = xyxy_to_norm_cxcywh(xyxy, img_w, img_h)
                    st.session_state.current_box_xyxy = xyxy
                    st.session_state.current_box_norm = norm_box

                    preview_box_img = draw_bbox(display_image, xyxy, color="red", width=3)
                    st.image(
                        preview_box_img,
                        caption=f"Box: {xyxy} px | norm: {norm_box}",
                        use_container_width=True,
                    )
                else:
                    st.session_state.current_box_xyxy = None
                    st.session_state.current_box_norm = None
        else:
            st.info("👈 Vui lòng upload ảnh ở cột INPUT để hiển thị canvas.")

    # ==========================
    # 3. COLUMN: PROMPT
    # ==========================
    with col_prompt:
        st.subheader("3. PROMPT")

        st.text_area(
            "Yêu cầu tự nhiên (Tiếng Việt):",
            key="req_text_area",
            placeholder="Ví dụ: Tách toàn bộ patch vuông ở ngực áo, bao gồm cả viền vải...",
            help="Qwen Prompt Assistant sẽ phân tích yêu cầu này và gợi ý prompt chuẩn cho SAM 3",
        )
        user_req = st.session_state.get("req_text_area", "")

        scope_pref = st.selectbox(
            "Scope Preference:",
            ["auto", "entire_patch", "inner_artwork", "individual_decoration"],
            index=0,
            help="Định hướng phạm vi trích xuất",
        )

        if st.button("✨ Ask Qwen (Suggest Prompt)", use_container_width=True):
            if not st.session_state.uploaded_image_bytes:
                st.error("Vui lòng upload ảnh trước khi hỏi Qwen.")
            elif not user_req.strip():
                st.error("Vui lòng nhập mô tả yêu cầu bằng tiếng Việt.")
            else:
                client = get_client()
                with st.spinner("Qwen đang phân tích hình ảnh và yêu cầu..."):
                    try:
                        suggestion = client.suggest_prompt(
                            image_bytes=st.session_state.uploaded_image_bytes,
                            filename=st.session_state.uploaded_image_name,
                            user_request=user_req.strip(),
                            scope_preference=ScopePreference(scope_pref),
                        )
                        st.session_state.prompt_suggestion = suggestion
                        st.session_state["sam_prompt_field"] = suggestion.sam_prompt
                    except AssistantUnavailable:
                        st.warning(
                            "Prompt Assistant tạm thời không khả dụng — dùng prompt thủ công."
                        )
                    except Disconnected as e:
                        st.error(f"Mất kết nối Colab: {e}")
                    except AuthError as e:
                        st.error(f"Lỗi xác thực (401): {e}")
                    except RemoteError as e:
                        st.error(f"Lỗi API: {e}")
                    except Exception as e:
                        st.error(f"Lỗi không xác định: {e}")

        # Display suggestion card
        suggestion = st.session_state.prompt_suggestion
        if suggestion:
            with st.expander("Qwen Assistant Output", expanded=True):
                st.markdown(f"**Target:** {suggestion.target_description}")
                st.markdown(f"**Scope:** `{suggestion.scope.value}`")
                if suggestion.location_hint:
                    st.markdown(f"**Location:** {suggestion.location_hint}")
                if suggestion.reason:
                    st.markdown(f"**Reason:** {suggestion.reason}")
                if suggestion.needs_clarification:
                    st.warning(
                        f"⚠️ **Cần làm rõ:** {suggestion.clarification_question}"
                    )

                if suggestion.alternative_prompts:
                    st.markdown("**Gợi ý thay thế:**")
                    for alt_idx, alt_p in enumerate(suggestion.alternative_prompts):
                        st.button(
                            f"Use: {alt_p}",
                            key=f"btn_alt_{alt_idx}",
                            on_click=set_sam_prompt,
                            args=(alt_p,),
                        )

        st.markdown("---")

        # Editable SAM prompt input (using session-state-key pattern without value=)
        st.text_input(
            "SAM 3 Prompt (English):",
            key="sam_prompt_field",
            placeholder="e.g. square embroidered patch",
            help="Prompt tiếng Anh được xác nhận bởi người dùng để gửi cho SAM 3",
        )
        sam_prompt_val = st.session_state.get("sam_prompt_field", "").strip()

        # Run SAM 3 Button
        run_sam = st.button(
            "🚀 Run SAM 3", type="primary", use_container_width=True
        )
        if run_sam:
            # Validations
            if not st.session_state.uploaded_image_bytes:
                st.error("Vui lòng upload ảnh sản phẩm trước.")
            elif (
                selected_mode in (Mode.TEXT, Mode.TEXT_BOX)
                and not sam_prompt_val
            ):
                st.error("Vui lòng nhập SAM 3 prompt cho Text / Text + Box mode.")
            elif (
                selected_mode in (Mode.BOX, Mode.TEXT_BOX)
                and st.session_state.current_box_norm is None
            ):
                st.error(
                    "Vui lòng vẽ bounding box trên canvas cho Box / Text + Box mode."
                )
            else:
                client = get_client()
                with st.spinner("Đang chạy SAM 3 segmentation trên Colab..."):
                    try:
                        res = client.segment(
                            image_bytes=st.session_state.uploaded_image_bytes,
                            filename=st.session_state.uploaded_image_name,
                            mode=selected_mode,
                            prompt=sam_prompt_val
                            if selected_mode != Mode.BOX
                            else None,
                            bbox=st.session_state.current_box_norm
                            if selected_mode != Mode.TEXT
                            else None,
                            threshold=float(st.session_state.get("confidence_threshold", 0.35)),
                        )
                        st.session_state.segment_result = res
                        st.session_state.selected_candidate_idx = None
                        st.success(
                            f"Hoàn thành! Tìm thấy {res.metadata.num_candidates} candidate(s) "
                            f"trong {res.metadata.elapsed_ms}ms."
                        )
                    except Disconnected as e:
                        st.error(f"Mất kết nối Colab: {e}")
                    except AuthError as e:
                        st.error(f"Lỗi xác thực (401): {e}")
                    except ServerBusy as e:
                        st.warning(f"Server Colab đang bận: {e}")
                    except ApiError as e:
                        if e.status_code == 503:
                            st.error(f"SAM 3 chưa sẵn sàng trên Colab (503): {e.detail}")
                        else:
                            st.error(f"Lỗi API ({e.status_code}): {e.detail}")
                    except RemoteError as e:
                        st.error(f"Lỗi API: {e}")
                    except Exception as e:
                        st.error(f"Lỗi không xác định: {e}")

    # ==========================================
    # 4. SECTION: SEGMENTATION CANDIDATES GRID
    # ==========================================
    st.markdown("---")
    st.header("SEGMENTATION CANDIDATES")

    res = st.session_state.segment_result
    if res is not None:
        if res.num_candidates == 0:
            st.info("Không có candidate — thử prompt khác hoặc Box mode.")
        else:
            candidates = res.metadata.candidates
            # Show grid 4 per row
            num_cols = 4
            for row_start in range(0, len(candidates), num_cols):
                cols = st.columns(num_cols)
                for col_idx, cand_idx in enumerate(
                    range(row_start, min(row_start + num_cols, len(candidates)))
                ):
                    cand = candidates[cand_idx]
                    overlay_img = res.get_candidate_image(cand_idx, "overlay")
                    with cols[col_idx]:
                        if overlay_img:
                            st.image(overlay_img, use_container_width=True)
                        st.caption(candidate_caption(cand))
                        is_selected = (
                            st.session_state.selected_candidate_idx == cand_idx
                        )
                        btn_label = (
                            f"✅ Candidate #{cand_idx + 1} (Selected)"
                            if is_selected
                            else f"Select #{cand_idx + 1}"
                        )
                        if st.button(
                            btn_label,
                            key=f"select_cand_{cand_idx}",
                            use_container_width=True,
                        ):
                            st.session_state.selected_candidate_idx = cand_idx
                            st.rerun()
    else:
        st.caption("Chưa có kết quả segmentation. Nhấn 'Run SAM 3' để bắt đầu.")

    # ==========================================
    # 5. SECTION: SELECTED CANDIDATE PREVIEW & EXPORT
    # ==========================================
    sel_idx = st.session_state.selected_candidate_idx
    if res is not None and sel_idx is not None and 0 <= sel_idx < res.num_candidates:
        st.markdown("---")
        st.header(f"SELECTED PREVIEW: Candidate #{sel_idx + 1}")

        cand_meta = res.metadata.candidates[sel_idx]
        cand_imgs = (
            res.candidate_images[sel_idx]
            if sel_idx < len(res.candidate_images)
            else {}
        )

        tab_orig, tab_overlay, tab_mask, tab_trans = st.tabs(
            ["Original", "Overlay", "Mask", "Transparent"]
        )

        orig_img = (
            load_display_image(st.session_state.uploaded_image_bytes)
            if st.session_state.uploaded_image_bytes
            else None
        )
        overlay_img = cand_imgs.get("overlay")
        mask_img = cand_imgs.get("mask")
        cutout_img = cand_imgs.get("cutout")
        cutout_crop_img = cand_imgs.get("cutout_crop")

        with tab_orig:
            if orig_img:
                st.image(
                    orig_img,
                    caption="Original Image (EXIF transposed)",
                    use_container_width=True,
                )

        with tab_overlay:
            if overlay_img:
                st.image(
                    overlay_img,
                    caption=f"Overlay — {candidate_caption(cand_meta)}",
                    use_container_width=True,
                )

        with tab_mask:
            if mask_img:
                st.image(
                    mask_img,
                    caption="Mask (0/255 L-mode)",
                    use_container_width=True,
                )

        with tab_trans:
            if cutout_img:
                bg_choice = st.radio(
                    "Background Preview Mode:",
                    ["Checkerboard", "Dark", "Light"],
                    index=0,
                    horizontal=True,
                    key="bg_mode_select",
                )
                bg_map = {
                    "Checkerboard": "checker",
                    "Dark": "dark",
                    "Light": "light",
                }
                comp_img = composite_on_background(
                    cutout_img, kind=bg_map[bg_choice]
                )
                st.image(
                    comp_img,
                    caption=f"Cutout on {bg_choice} background",
                    use_container_width=True,
                )

                if cutout_crop_img:
                    st.markdown("**Tight Crop Preview:**")
                    crop_comp = composite_on_background(
                        cutout_crop_img, kind=bg_map[bg_choice]
                    )
                    st.image(
                        crop_comp,
                        caption="Tight artwork crop (with padding)",
                        width=min(400, cutout_crop_img.width),
                    )
            else:
                st.warning("Cutout image not available for this candidate.")

        # Download Buttons
        st.subheader("Export Results")
        dcol1, dcol2, dcol3, dcol4 = st.columns(4)

        with dcol1:
            if cutout_img:
                st.download_button(
                    label="⬇️ Cutout PNG",
                    data=to_png_bytes(cutout_img),
                    file_name=f"candidate_{sel_idx:02d}_cutout.png",
                    mime="image/png",
                    use_container_width=True,
                )

        with dcol2:
            if cutout_crop_img:
                st.download_button(
                    label="⬇️ Cutout Crop PNG",
                    data=to_png_bytes(cutout_crop_img),
                    file_name=f"candidate_{sel_idx:02d}_crop.png",
                    mime="image/png",
                    use_container_width=True,
                )

        with dcol3:
            if mask_img:
                st.download_button(
                    label="⬇️ Mask PNG",
                    data=to_png_bytes(mask_img),
                    file_name=f"candidate_{sel_idx:02d}_mask.png",
                    mime="image/png",
                    use_container_width=True,
                )

        with dcol4:
            if res.zip_bytes:
                st.download_button(
                    label="📦 Full Result ZIP",
                    data=res.zip_bytes,
                    file_name="result.zip",
                    mime="application/zip",
                    use_container_width=True,
                )


if __name__ == "__main__":
    main()
