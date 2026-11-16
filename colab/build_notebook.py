"""Deterministic notebook generator for AI Artwork Extractor Colab Inference Server.

Embeds current server_reference/*.py files and colab/server_main.py into
SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def _make_code_cell(source_text: str, cell_id: str) -> Dict[str, Any]:
    """Create a Jupyter code cell with standard nbformat 4 schema."""
    lines = source_text.splitlines(keepends=True)
    return {
        "cell_type": "code",
        "execution_count": None,
        "id": cell_id,
        "metadata": {},
        "outputs": [],
        "source": lines,
    }


def _make_markdown_cell(source_text: str, cell_id: str) -> Dict[str, Any]:
    """Create a Jupyter markdown cell with standard nbformat 4 schema."""
    lines = source_text.splitlines(keepends=True)
    return {
        "cell_type": "markdown",
        "id": cell_id,
        "metadata": {},
        "source": lines,
    }


def generate_notebook(repo_root: Optional[Path] = None) -> Dict[str, Any]:
    """Generate the complete Colab inference server notebook dictionary."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent

    server_ref_dir = repo_root / "server_reference"
    server_main_path = repo_root / "colab" / "server_main.py"

    cells: List[Dict[str, Any]] = []
    cell_idx = 0

    def next_id(prefix: str = "c") -> str:
        nonlocal cell_idx
        cell_idx += 1
        return f"{prefix}_{cell_idx:03d}"

    # 1. Intro Markdown
    cells.append(
        _make_markdown_cell(
            "# SAM 3 + Qwen — AI Artwork Extraction Inference Server (Colab T4)\n"
            "\n"
            "Notebook này triển khai backend FastAPI inference server trên Google Colab T4 16GB, "
            "tích hợp Meta SAM 3 image model và Qwen3-VL-4B Prompt Assistant (4-bit), "
            "đồng thời mở Cloudflare Quick Tunnel để kết nối với ứng dụng local trên laptop.\n"
            "\n"
            "## Trước khi chạy\n"
            "\n"
            "1. **Mở Runtime → Change runtime type**.\n"
            "2. Chọn **Hardware accelerator: T4 GPU**.\n"
            "3. Ở **Runtime Version**, chọn **2026.07 (Python 3.12.13)** để tránh xung đột dependency PyTorch/CUDA.\n"
            "4. Đăng nhập Hugging Face và được cấp quyền truy cập gated model: [facebook/sam3](https://huggingface.co/facebook/sam3).\n"
            "5. Chuẩn bị Hugging Face **Read** token (lưu trong Colab Secrets với tên `HF_TOKEN` hoặc nhập trực tiếp).\n"
            "\n"
            "## Cảnh báo quan trọng\n"
            "\n"
            "- **Môi trường tạm thời (Ephemeral Runtime)**: Dữ liệu trên `/content` sẽ bị xóa khi session bị ngắt.\n"
            "- **Quick Tunnel Public URL**: URL `trycloudflare.com` là public qua internet. Server bắt buộc xác thực qua Bearer Token ngẫu nhiên được sinh trong notebook.\n"
            "- **Bảo mật dữ liệu**: Không upload hình ảnh chứa dữ liệu nhạy cảm hoặc bí mật kinh doanh lên endpoint test khi chưa được cho phép.\n",
            next_id("intro"),
        )
    )

    # 2. Check Python / CUDA / GPU / VRAM (Reused from SAM3_POD_Image_Extraction_Test_Colab.ipynb)
    cells.append(
        _make_markdown_cell(
            "## 1. Kiểm tra môi trường runtime và GPU\n"
            "\n"
            "Chạy cell này trước. Nếu không thấy GPU NVIDIA hoặc Python không phải 3.12, hãy kiểm tra lại Hardware accelerator.",
            next_id("h_gpu"),
        )
    )
    cells.append(
        _make_code_cell(
            "import sys, torch, platform\n"
            "\n"
            "print(\"Python:\", sys.version)\n"
            "print(\"PyTorch:\", torch.__version__)\n"
            "print(\"PyTorch CUDA build:\", torch.version.cuda)\n"
            "print(\"CUDA available:\", torch.cuda.is_available())\n"
            "\n"
            "if sys.version_info[:2] != (3, 12):\n"
            "    print(\"\\nWARNING: Notebook này được chuẩn bị để chạy với Colab Runtime Version 2026.07 (Python 3.12.13).\")\n"
            "\n"
            "if not torch.cuda.is_available():\n"
            "    raise RuntimeError(\n"
            "        \"Chưa có GPU. Vào Runtime → Change runtime type → Hardware accelerator → T4 GPU, rồi chạy lại cell.\"\n"
            "    )\n"
            "\n"
            "props = torch.cuda.get_device_properties(0)\n"
            "print(\"GPU:\", torch.cuda.get_device_name(0))\n"
            "print(f\"VRAM: {props.total_memory / 1024**3:.1f} GB\")\n"
            "\n"
            "if props.total_memory < 12 * 1024**3:\n"
            "    print(\"WARNING: GPU có ít hơn 12GB VRAM; inference có thể gặp CUDA out-of-memory.\")\n",
            next_id("code_gpu"),
        )
    )

    # 3. Optional Google Drive Mount
    cells.append(
        _make_markdown_cell(
            "## 2. Mount Google Drive tùy chọn để cache checkpoint Hugging Face\n"
            "\n"
            "Đặt `USE_DRIVE_CACHE = True` nếu bạn muốn lưu checkpoint SAM 3 vào Google Drive để tránh tải lại mỗi lần restart runtime.",
            next_id("h_drive"),
        )
    )
    cells.append(
        _make_code_cell(
            "import os\n"
            "\n"
            "# Đặt True nếu muốn lưu checkpoint Hugging Face vào Google Drive\n"
            "USE_DRIVE_CACHE = False\n"
            "\n"
            "if USE_DRIVE_CACHE:\n"
            "    from google.colab import drive\n"
            "    drive.mount(\"/content/drive\")\n"
            "    drive_hf_cache = \"/content/drive/MyDrive/huggingface_cache\"\n"
            "    os.makedirs(drive_hf_cache, exist_ok=True)\n"
            "    os.environ[\"HF_HOME\"] = drive_hf_cache\n"
            "    print(f\"HF_HOME set to Google Drive: {drive_hf_cache}\")\n"
            "else:\n"
            "    print(\"Drive cache disabled (USE_DRIVE_CACHE = False). Using default Colab local storage.\")\n",
            next_id("code_drive"),
        )
    )

    # 4. Install Dependencies
    cells.append(
        _make_markdown_cell(
            "## 3. Cài đặt repository SAM 3 và server dependencies\n"
            "\n"
            "Cài package từ repository facebookresearch/sam3 chính thức và các thư viện FastAPI, Uvicorn, Multipart. "
            "Dependencies của Qwen được cài đặt trong bước riêng có kiểm tra điều kiện để không nâng cấp PyTorch.",
            next_id("h_install"),
        )
    )
    cells.append(
        _make_code_cell(
            "import os, subprocess, sys\n"
            "\n"
            "repo_dir = \"/content/sam3\"\n"
            "if not os.path.isdir(repo_dir):\n"
            "    subprocess.run(\n"
            "        [\"git\", \"clone\", \"--depth\", \"1\", \"https://github.com/facebookresearch/sam3.git\", repo_dir],\n"
            "        check=True,\n"
            "    )\n"
            "\n"
            "%cd /content/sam3\n"
            "\n"
            "# Cài SAM 3 theo pyproject.toml của repository; không cài lại torch/torchvision.\n"
            "subprocess.run(\n"
            "    [sys.executable, \"-m\", \"pip\", \"install\", \"-e\", \".\"],\n"
            "    check=True,\n"
            ")\n"
            "subprocess.run(\n"
            "    [\n"
            "        sys.executable, \"-m\", \"pip\", \"install\",\n"
            "        \"fastapi\", \"uvicorn\", \"python-multipart\", \"pillow\", \"opencv-python-headless\", \"matplotlib\",\n"
            "    ],\n"
            "    check=True,\n"
            ")\n"
            "\n"
            "# Cài đặt Qwen dependencies có kiểm tra điều kiện (không nâng cấp torch)\n"
            "ENABLE_QWEN = True\n"
            "if ENABLE_QWEN:\n"
            "    print(\"Installing Qwen dependencies (transformers>=4.57, accelerate, bitsandbytes)...\")\n"
            "    subprocess.run(\n"
            "        [\n"
            "            sys.executable, \"-m\", \"pip\", \"install\",\n"
            "            \"transformers>=4.57\", \"accelerate\", \"bitsandbytes\",\n"
            "        ],\n"
            "        check=True,\n"
            "    )\n"
            "\n"
            "%cd /content\n"
            "print(\"SAM 3 and server dependencies installed successfully.\")\n",
            next_id("code_install"),
        )
    )

    # 5. Hugging Face Login
    cells.append(
        _make_markdown_cell(
            "## 4. Đăng nhập Hugging Face\n"
            "\n"
            "Checkpoint SAM 3 nằm trong repository gated `facebook/sam3`. Bạn cần token loại **Read**. "
            "Token được lấy tự động từ Colab Secret `HF_TOKEN` nếu có, hoặc nhập ẩn qua prompt mà không in ra màn hình.",
            next_id("h_hf_login"),
        )
    )
    cells.append(
        _make_code_cell(
            "from huggingface_hub import login\n"
            "\n"
            "hf_token = None\n"
            "try:\n"
            "    from google.colab import userdata\n"
            "    hf_token = userdata.get(\"HF_TOKEN\")\n"
            "except Exception:\n"
            "    hf_token = None\n"
            "\n"
            "if not hf_token:\n"
            "    from getpass import getpass\n"
            "    hf_token = getpass(\"Paste Hugging Face READ token (input hidden): \").strip()\n"
            "\n"
            "if not hf_token:\n"
            "    raise ValueError(\"Bạn chưa nhập Hugging Face token.\")\n"
            "\n"
            "login(token=hf_token, add_to_git_credential=False)\n"
            "del hf_token\n"
            "print(\"Hugging Face login completed successfully.\")\n",
            next_id("code_hf_login"),
        )
    )

    # 6. Write Server Code
    cells.append(
        _make_markdown_cell(
            "## 5. Tạo server source code trong runtime Colab\n"
            "\n"
            "Ghi toàn bộ module từ `server_reference/` vào `/content/server_reference/` "
            "và thêm `/content` vào `sys.path` để có thể import trực tiếp.",
            next_id("h_write_server"),
        )
    )

    # Prep directory cell
    cells.append(
        _make_code_cell(
            "import os\n"
            "os.makedirs(\"/content/server_reference\", exist_ok=True)\n"
            "print(\"Created /content/server_reference directory.\")\n",
            next_id("code_prep_dir"),
        )
    )

    # Embed server_reference/*.py files in alphabetical order
    py_files = sorted(server_ref_dir.glob("*.py"))
    for py_path in py_files:
        content = py_path.read_text(encoding="utf-8").replace("\r\n", "\n")
        fname = py_path.name
        code_body = f"%%writefile /content/server_reference/{fname}\n{content}"
        cells.append(_make_code_cell(code_body, next_id(f"write_{fname.replace('.', '_')}")))

    # Embed colab/server_main.py if present
    if server_main_path.is_file():
        sm_content = server_main_path.read_text(encoding="utf-8").replace("\r\n", "\n")
        sm_body = f"%%writefile /content/server_main.py\n{sm_content}"
        cells.append(_make_code_cell(sm_body, next_id("write_server_main_py")))

    # sys.path update cell
    cells.append(
        _make_code_cell(
            "import sys\n"
            "if \"/content\" not in sys.path:\n"
            "    sys.path.insert(0, \"/content\")\n"
            "print(\"server_reference modules loaded into sys.path.\")\n",
            next_id("code_syspath"),
        )
    )

    # 7. Load SAM 3 Once
    cells.append(
        _make_markdown_cell(
            "## 6. Nạp SAM 3 Image Model và Processor (Chỉ nạp 1 lần)\n"
            "\n"
            "Khởi tạo `Sam3Engine` và nạp model lên CUDA GPU. Thời gian nạp và dung lượng VRAM sử dụng sẽ được hiển thị.",
            next_id("h_load_sam3"),
        )
    )
    cells.append(
        _make_code_cell(
            "import gc, time, torch\n"
            "from server_reference.sam3_engine import Sam3Engine\n"
            "\n"
            "if torch.cuda.is_available():\n"
            "    torch.cuda.empty_cache()\n"
            "gc.collect()\n"
            "\n"
            "print(\"Loading SAM 3 image model and processor...\")\n"
            "start_time = time.time()\n"
            "sam_engine = Sam3Engine(device=\"cuda\", confidence_threshold=0.35)\n"
            "sam_engine.load()\n"
            "load_elapsed = time.time() - start_time\n"
            "\n"
            "alloc_gb = torch.cuda.memory_allocated() / (1024 ** 3)\n"
            "print(f\"SAM 3 loaded successfully in {load_elapsed:.2f} seconds.\")\n"
            "print(f\"GPU memory allocated: {alloc_gb:.2f} GB\")\n",
            next_id("code_load_sam3"),
        )
    )

    # 8. SAM 3 Smoke Test
    cells.append(
        _make_markdown_cell(
            "## 7. SAM 3 Smoke Test\n"
            "\n"
            "Chạy thử nghiệm một inference text mode đơn giản trên ảnh mẫu nhân tạo để đảm bảo engine hoạt động bình thường. "
            "Nếu trả về 0 candidates, notebook vẫn xử lý an toàn không gây crash.",
            next_id("h_smoke_sam3"),
        )
    )
    cells.append(
        _make_code_cell(
            "import time\n"
            "from PIL import Image, ImageDraw\n"
            "from server_reference.schemas import Mode\n"
            "\n"
            "# Tạo ảnh mẫu nhân tạo có patch màu rõ rệt để smoke test\n"
            "smoke_img = Image.new(\"RGB\", (600, 600), color=(245, 245, 245))\n"
            "draw = ImageDraw.Draw(smoke_img)\n"
            "draw.rectangle([150, 150, 450, 450], fill=(220, 50, 50), outline=(20, 20, 20), width=4)\n"
            "draw.text((230, 290), \"ARTWORK\", fill=(255, 255, 255))\n"
            "smoke_img_path = \"/content/smoke_sample.png\"\n"
            "smoke_img.save(smoke_img_path)\n"
            "\n"
            "print(f\"Running SAM 3 smoke test on test image ({smoke_img.size})...\")\n"
            "t0 = time.time()\n"
            "smoke_prompt = \"red square patch\"\n"
            "try:\n"
            "    smoke_result = sam_engine.segment(\n"
            "        image=smoke_img,\n"
            "        mode=Mode.TEXT,\n"
            "        prompt=smoke_prompt,\n"
            "        bbox_cxcywh_norm=None,\n"
            "        threshold=0.20,\n"
            "    )\n"
            "    smoke_elapsed = time.time() - t0\n"
            "    num_cands = len(smoke_result.scores)\n"
            "    print(f\"SAM 3 smoke test completed in {smoke_elapsed:.2f}s: {num_cands} candidate(s) found.\")\n"
            "    if num_cands > 0:\n"
            "        print(f\"Candidate scores: {smoke_result.scores.tolist()}\")\n"
            "    else:\n"
            "        print(\"Note: 0 candidates found for synthetic image. Handled safely without crash.\")\n"
            "except Exception as e:\n"
            "    print(f\"SAM 3 smoke test error: {e}\")\n",
            next_id("code_smoke_sam3"),
        )
    )

    # 9. Qwen Prompt Assistant Setup & Load
    cells.append(
        _make_markdown_cell(
            "## 8. Cấu hình và nạp Qwen3-VL-4B Prompt Assistant (Tùy chọn, 4-bit NF4)\n"
            "\n"
            "Đo bộ nhớ VRAM khả dụng trước và sau khi nạp. Nếu VRAM còn trống ít hơn ngưỡng an toàn (`QWEN_MIN_FREE_VRAM_GB = 5.0`) "
            "hoặc gặp lỗi OOM, Prompt Assistant sẽ tự động bị vô hiệu hóa và SAM 3 manual mode vẫn hoạt động bình thường.",
            next_id("h_qwen_load"),
        )
    )
    cells.append(
        _make_code_cell(
            "import torch\n"
            "from server_reference.errors import PromptAssistantUnavailable\n"
            "from server_reference.qwen_prompt_assistant import QwenPromptAssistant\n"
            "\n"
            "ENABLE_QWEN = True\n"
            "QWEN_MIN_FREE_VRAM_GB = 5.0\n"
            "\n"
            "assistant = QwenPromptAssistant(\n"
            "    model_id=\"Qwen/Qwen3-VL-4B-Instruct\",\n"
            "    enabled=ENABLE_QWEN,\n"
            "    min_free_vram_gb=QWEN_MIN_FREE_VRAM_GB,\n"
            "    max_image_side=768,\n"
            "    max_new_tokens=160,\n"
            "    device=\"cuda\",\n"
            ")\n"
            "\n"
            "if torch.cuda.is_available():\n"
            "    free_bytes, total_bytes = torch.cuda.mem_get_info()\n"
            "    print(f\"VRAM before Qwen load: {free_bytes / 1024**3:.2f} GB free / {total_bytes / 1024**3:.2f} GB total\")\n"
            "\n"
            "if ENABLE_QWEN:\n"
            "    print(\"Attempting to load Qwen3-VL-4B Prompt Assistant (4-bit NF4)...\")\n"
            "    try:\n"
            "        assistant.load()\n"
            "        print(\"Qwen Prompt Assistant loaded successfully!\")\n"
            "    except PromptAssistantUnavailable as e:\n"
            "        print(f\"Prompt Assistant disabled — SAM 3 manual mode still works (Reason: {e})\")\n"
            "    except Exception as e:\n"
            "        print(f\"Prompt Assistant disabled — SAM 3 manual mode still works (Unexpected error: {e})\")\n"
            "else:\n"
            "    print(\"Qwen Prompt Assistant disabled by user (ENABLE_QWEN = False).\")\n"
            "\n"
            "if torch.cuda.is_available():\n"
            "    free_bytes, total_bytes = torch.cuda.mem_get_info()\n"
            "    print(f\"VRAM after Qwen load attempt: {free_bytes / 1024**3:.2f} GB free / {total_bytes / 1024**3:.2f} GB total\")\n"
            "\n"
            "print(\"VRAM Report:\", assistant.vram_report())\n",
            next_id("code_qwen_load"),
        )
    )

    # 10. Qwen Smoke Test
    cells.append(
        _make_markdown_cell(
            "## 9. Qwen Prompt Assistant Smoke Test (Tiếng Việt)\n"
            "\n"
            "Gửi yêu cầu tiếng Việt kèm ảnh mẫu để kiểm tra khả năng đề xuất prompt có cấu trúc (bỏ qua nếu Qwen không khả dụng).",
            next_id("h_qwen_smoke"),
        )
    )
    cells.append(
        _make_code_cell(
            "from server_reference.schemas import ScopePreference\n"
            "\n"
            "if assistant.available and assistant.loaded:\n"
            "    print(\"Running Qwen smoke test with Vietnamese request...\")\n"
            "    vietnamese_request = \"Lấy miếng patch thêu hình vuông ở giữa ảnh, bao gồm cả viền vải.\"\n"
            "    try:\n"
            "        suggestion = assistant.suggest(\n"
            "            image=smoke_img,\n"
            "            user_request=vietnamese_request,\n"
            "            scope_preference=ScopePreference.AUTO,\n"
            "        )\n"
            "        print(\"Qwen Suggestion Result:\")\n"
            "        print(f\"  Target: {suggestion.target_description}\")\n"
            "        print(f\"  Scope: {suggestion.scope}\")\n"
            "        print(f\"  SAM Prompt: {suggestion.sam_prompt}\")\n"
            "        print(f\"  Alternatives: {suggestion.alternative_prompts}\")\n"
            "        print(f\"  Needs clarification: {suggestion.needs_clarification}\")\n"
            "    except Exception as e:\n"
            "        print(f\"Qwen smoke test error: {e}\")\n"
            "else:\n"
            "    print(\"Skipping Qwen smoke test: Prompt Assistant is not available or not loaded.\")\n",
            next_id("code_qwen_smoke"),
        )
    )

    # 11. Server Config
    cells.append(
        _make_markdown_cell(
            "## 10. Cấu hình bảo mật và tham số Server\n"
            "\n"
            "Tạo Bearer Token ngẫu nhiên (hoặc đọc từ Colab Secret `ARTWORK_API_TOKEN`) "
            "và thiết lập giới hạn upload file (20MB) cùng confidence threshold mặc định (0.35).",
            next_id("h_server_cfg"),
        )
    )
    cells.append(
        _make_code_cell(
            "import secrets\n"
            "\n"
            "API_TOKEN = None\n"
            "try:\n"
            "    from google.colab import userdata\n"
            "    API_TOKEN = userdata.get(\"ARTWORK_API_TOKEN\")\n"
            "except Exception:\n"
            "    API_TOKEN = None\n"
            "\n"
            "if not API_TOKEN or len(API_TOKEN.strip()) < 16:\n"
            "    API_TOKEN = secrets.token_urlsafe(32)\n"
            "\n"
            "MAX_UPLOAD_MB = 20\n"
            "DEFAULT_THRESHOLD = 0.35\n"
            "\n"
            "print(\"Server configuration ready:\")\n"
            "print(f\"  MAX_UPLOAD_MB    : {MAX_UPLOAD_MB}\")\n"
            "print(f\"  DEFAULT_THRESHOLD: {DEFAULT_THRESHOLD}\")\n"
            "print(f\"  API_TOKEN length : {len(API_TOKEN)} chars (will be displayed with tunnel URL)\")\n",
            next_id("code_server_cfg"),
        )
    )

    # 12. Start Uvicorn in background thread
    cells.append(
        _make_markdown_cell(
            "## 11. Khởi chạy FastAPI & Uvicorn (Daemon Background Thread)\n"
            "\n"
            "Khởi chạy Uvicorn trên `127.0.0.1:8000` trong background thread và chờ endpoint `/health` phản hồi.",
            next_id("h_uvicorn"),
        )
    )
    cells.append(
        _make_code_cell(
            "import threading, time, requests, uvicorn\n"
            "from server_reference.api import create_app\n"
            "\n"
            "app = create_app(\n"
            "    sam_engine=sam_engine,\n"
            "    assistant=assistant,\n"
            "    api_token=API_TOKEN,\n"
            "    max_upload_mb=MAX_UPLOAD_MB,\n"
            "    default_threshold=DEFAULT_THRESHOLD,\n"
            ")\n"
            "\n"
            "server_config = uvicorn.Config(\n"
            "    app=app,\n"
            "    host=\"127.0.0.1\",\n"
            "    port=8000,\n"
            "    log_level=\"info\",\n"
            "    loop=\"asyncio\",\n"
            ")\n"
            "server = uvicorn.Server(config=server_config)\n"
            "\n"
            "server_thread = threading.Thread(target=server.run, daemon=True, name=\"uvicorn-worker\")\n"
            "server_thread.start()\n"
            "\n"
            "print(\"Waiting for local server on http://127.0.0.1:8000/health...\")\n"
            "server_ready = False\n"
            "start_wait = time.time()\n"
            "while time.time() - start_wait < 30:\n"
            "    try:\n"
            "        resp = requests.get(\"http://127.0.0.1:8000/health\", timeout=1.0)\n"
            "        if resp.status_code == 200:\n"
            "            print(f\"Local server is healthy! Response: {resp.json()}\")\n"
            "            server_ready = True\n"
            "            break\n"
            "    except Exception:\n"
            "        pass\n"
            "    time.sleep(0.5)\n"
            "\n"
            "if not server_ready:\n"
            "    raise RuntimeError(\"Timed out waiting for uvicorn server to start on 127.0.0.1:8000\")\n",
            next_id("code_uvicorn"),
        )
    )

    # 13. Cloudflared Tunnel
    cells.append(
        _make_markdown_cell(
            "## 12. Cài đặt và khởi chạy Cloudflare Quick Tunnel\n"
            "\n"
            "Tải binary `cloudflared-linux-amd64` chính thức từ GitHub releases, cấp quyền thực thi và mở tunnel kết nối tới `127.0.0.1:8000`. "
            "Trích xuất public URL `https://*.trycloudflare.com` từ log file.",
            next_id("h_cloudflared"),
        )
    )
    cells.append(
        _make_code_cell(
            "import os, re, subprocess, time, urllib.request\n"
            "\n"
            "cloudflared_path = \"/content/cloudflared\"\n"
            "log_path = \"/content/cloudflared.log\"\n"
            "\n"
            "if not os.path.exists(cloudflared_path):\n"
            "    print(\"Downloading cloudflared binary (linux-amd64)...\")\n"
            "    url = \"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64\"\n"
            "    urllib.request.urlretrieve(url, cloudflared_path)\n"
            "    os.chmod(cloudflared_path, 0o755)\n"
            "    print(\"cloudflared binary downloaded and set executable.\")\n"
            "else:\n"
            "    print(\"cloudflared binary already exists.\")\n"
            "\n"
            "if \"tunnel_proc\" in globals() and tunnel_proc and tunnel_proc.poll() is None:\n"
            "    print(\"Stopping existing tunnel process...\")\n"
            "    tunnel_proc.terminate()\n"
            "    try:\n"
            "        tunnel_proc.wait(timeout=5)\n"
            "    except Exception:\n"
            "        tunnel_proc.kill()\n"
            "\n"
            "print(\"Starting Cloudflare Quick Tunnel...\")\n"
            "log_file = open(log_path, \"w\")\n"
            "tunnel_proc = subprocess.Popen(\n"
            "    [cloudflared_path, \"tunnel\", \"--url\", \"http://127.0.0.1:8000\", \"--no-autoupdate\"],\n"
            "    stdout=log_file,\n"
            "    stderr=subprocess.STDOUT,\n"
            "    text=True,\n"
            ")\n"
            "\n"
            "tunnel_url = None\n"
            "tunnel_pattern = re.compile(r\"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com\")\n"
            "start_time = time.time()\n"
            "timeout_seconds = 60\n"
            "\n"
            "print(f\"Waiting for Cloudflare tunnel URL (timeout {timeout_seconds}s)...\")\n"
            "while time.time() - start_time < timeout_seconds:\n"
            "    if os.path.exists(log_path):\n"
            "        with open(log_path, \"r\", errors=\"ignore\") as f:\n"
            "            content = f.read()\n"
            "            match = tunnel_pattern.search(content)\n"
            "            if match:\n"
            "                tunnel_url = match.group(0)\n"
            "                break\n"
            "    if tunnel_proc.poll() is not None:\n"
            "        raise RuntimeError(f\"cloudflared process exited prematurely with code {tunnel_proc.returncode}\")\n"
            "    time.sleep(1.0)\n"
            "\n"
            "if not tunnel_url:\n"
            "    with open(log_path, \"r\", errors=\"ignore\") as f:\n"
            "        log_tail = f.read()[-500:]\n"
            "    raise RuntimeError(\n"
            "        f\"Failed to find Cloudflare tunnel URL within {timeout_seconds}s. Log tail:\\n{log_tail}\"\n"
            "    )\n"
            "\n"
            "print(f\"Cloudflare Tunnel online: {tunnel_url}\")\n",
            next_id("code_cloudflared"),
        )
    )

    # 14. Print URL, Token, .env lines, curl commands
    cells.append(
        _make_markdown_cell(
            "## 13. Thông tin kết nối & Cấu hình cho Local App\n"
            "\n"
            "Sao chép thông tin URL và Bearer Token vào file `local_app/.env` trên laptop để Streamlit UI có thể kết nối.",
            next_id("h_connect_info"),
        )
    )
    cells.append(
        _make_code_cell(
            "print(\"=\" * 72)\n"
            "print(\"  AI ARTWORK EXTRACTOR — INFERENCE SERVER ONLINE\")\n"
            "print(\"=\" * 72)\n"
            "print(f\"Public API Base URL: {tunnel_url}\")\n"
            "print(f\"Bearer Token       : {API_TOKEN}\")\n"
            "print(\"WARNING: Do NOT share this token. It grants full access to your GPU server.\")\n"
            "print(\"=\" * 72)\n"
            "\n"
            "print(\"\\n# Copy the lines below into your laptop's local_app/.env:\")\n"
            "print(f\"COLAB_API_URL={tunnel_url}\")\n"
            "print(f\"COLAB_API_TOKEN={API_TOKEN}\")\n"
            "print(\"REQUEST_TIMEOUT_SECONDS=180\")\n"
            "print(\"-\" * 72)\n"
            "\n"
            "print(\"\\n# Test curl commands:\")\n"
            "print(f\"# 1. Health check (no auth):\")\n"
            "print(f\"curl -s {tunnel_url}/health\\n\")\n"
            "\n"
            "print(f\"# 2. Segmentation request (text mode):\")\n"
            "print(f'curl -X POST \"{tunnel_url}/api/v1/segment\" \\\\')\n"
            "print(f'     -H \"Authorization: Bearer {API_TOKEN}\" \\\\')\n"
            "print(f'     -F \"image=@sample.jpg\" \\\\')\n"
            "print(f'     -F \"mode=text\" \\\\')\n"
            "print(f'     -F \"prompt=square embroidered fabric patch\" \\\\')\n"
            "print(f'     --output result.zip')\n"
            "print(\"=\" * 72)\n",
            next_id("code_connect_info"),
        )
    )

    # 15. External Check
    cells.append(
        _make_markdown_cell(
            "## 14. Kiểm tra Endpoint qua Public Tunnel\n"
            "\n"
            "Gửi request `/health` và request `/api/v1/segment` thử nghiệm qua đường tunnel công khai.",
            next_id("h_ext_check"),
        )
    )
    cells.append(
        _make_code_cell(
            "import os, requests\n"
            "\n"
            "print(f\"Testing public health endpoint through tunnel: {tunnel_url}/health\")\n"
            "try:\n"
            "    resp = requests.get(f\"{tunnel_url}/health\", timeout=15)\n"
            "    print(f\"Health response (status {resp.status_code}):\\n{resp.json()}\")\n"
            "except Exception as e:\n"
            "    print(f\"Tunnel health check failed: {e}\")\n"
            "\n"
            "if os.path.exists(\"/content/smoke_sample.png\"):\n"
            "    print(\"\\nTesting /api/v1/segment via public tunnel...\")\n"
            "    try:\n"
            "        with open(\"/content/smoke_sample.png\", \"rb\") as f:\n"
            "            seg_resp = requests.post(\n"
            "                f\"{tunnel_url}/api/v1/segment\",\n"
            "                headers={\"Authorization\": f\"Bearer {API_TOKEN}\"},\n"
            "                files={\"image\": (\"smoke_sample.png\", f, \"image/png\")},\n"
            "                data={\"mode\": \"text\", \"prompt\": \"red square patch\", \"confidence_threshold\": \"0.20\"},\n"
            "                timeout=60,\n"
            "            )\n"
            "        print(f\"Segmentation test status: {seg_resp.status_code}\")\n"
            "        if seg_resp.status_code == 200:\n"
            "            print(f\"Received result.zip ({len(seg_resp.content)} bytes)\")\n"
            "        else:\n"
            "            print(f\"Error detail: {seg_resp.text}\")\n"
            "    except Exception as e:\n"
            "        print(f\"Tunnel segmentation check failed: {e}\")\n",
            next_id("code_ext_check"),
        )
    )

    # 16. Stop Server and Tunnel
    cells.append(
        _make_markdown_cell(
            "## 15. Dừng Server và Cloudflare Tunnel\n"
            "\n"
            "Chạy cell này khi muốn dừng server Uvicorn và đóng Cloudflare Tunnel.",
            next_id("h_stop_server"),
        )
    )
    cells.append(
        _make_code_cell(
            "print(\"Shutting down server and tunnel...\")\n"
            "\n"
            "if \"tunnel_proc\" in globals() and tunnel_proc:\n"
            "    tunnel_proc.terminate()\n"
            "    try:\n"
            "        tunnel_proc.wait(timeout=5)\n"
            "    except Exception:\n"
            "        tunnel_proc.kill()\n"
            "    print(\"Cloudflare tunnel stopped.\")\n"
            "\n"
            "if \"server\" in globals() and server:\n"
            "    server.should_exit = True\n"
            "    print(\"Uvicorn server signaled to exit.\")\n"
            "\n"
            "print(\"Shutdown complete.\")\n",
            next_id("code_stop_server"),
        )
    )

    # 17. Troubleshooting Markdown
    cells.append(
        _make_markdown_cell(
            "## Hướng dẫn xử lý sự cố (Troubleshooting)\n"
            "\n"
            "- **Tunnel URL thay đổi khi khởi động lại**:\n"
            "  Cloudflare Quick Tunnel tự động cấp một URL `https://*.trycloudflare.com` ngẫu nhiên mỗi khi tiến trình chạy lại. "
            "  Khi restart tunnel, bạn cần copy URL mới vào `local_app/.env` hoặc cập nhật trực tiếp tại thanh sidebar của local Streamlit UI.\n"
            "\n"
            "- **CUDA Out-of-Memory (OOM)**:\n"
            "  GPU T4 có 16GB VRAM. Nếu việc nạp Qwen3-VL-4B cùng SAM 3 gây quá tải bộ nhớ:\n"
            "  1. Vào menu **Runtime → Restart session**.\n"
            "  2. Ở Mục 8 (Cell cấu hình Qwen), đặt `ENABLE_QWEN = False`.\n"
            "  3. Chạy lại từ Mục 6. SAM 3 manual mode sẽ hoạt động ổn định trên GPU mà không cần Qwen.\n"
            "\n"
            "- **Colab Runtime bị ngắt kết nối (Disconnect / Timeout)**:\n"
            "  Google Colab có thể ngắt kết nối khi session không có tương tác trong một thời gian dài.\n"
            "  - Kết nối lại GPU T4 runtime.\n"
            "  - Chạy lại các cell trong notebook.\n"
            "  - Cập nhật URL và Token mới vào `local_app/.env`.\n"
            "\n"
            "- **Lỗi xác thực 401 Unauthorized**:\n"
            "  Đảm bảo header `Authorization: Bearer <API_TOKEN>` được đính kèm trong mọi request. Token được in ra ở Mục 13.\n",
            next_id("troubleshooting"),
        )
    )

    notebook_dict: Dict[str, Any] = {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {
                "accelerator": "GPU",
                "gpuType": "T4",
                "provenance": [],
            },
            "kernelspec": {
                "display_name": "Python 3",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    return notebook_dict


def build_notebook(
    output_path: Optional[Path] = None,
    repo_root: Optional[Path] = None,
) -> Path:
    """Generate and write SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent
    if output_path is None:
        output_path = repo_root / "colab" / "SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb"

    notebook_data = generate_notebook(repo_root=repo_root)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Use standard 1-space indentation matching SAM3_POD_Image_Extraction_Test_Colab.ipynb
    content = json.dumps(notebook_data, indent=1, ensure_ascii=False) + "\n"
    output_path.write_text(content, encoding="utf-8")
    return output_path


if __name__ == "__main__":
    out_file = build_notebook()
    print(f"Generated Colab server notebook at: {out_file}")
