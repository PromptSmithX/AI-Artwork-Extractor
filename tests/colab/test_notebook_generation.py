"""Tests for Colab notebook generation and embedded server reference code.

Per Task W4 and Review Rounds 1 & 2 requirements:
- Generated notebook is valid JSON with nbformat 4
- Contains a %%writefile cell for every server_reference/*.py
- Embedded content equals the source file content
- Every code cell parses with ast.parse after stripping lines starting with %/!
- No hardcoded token-looking strings (hf_ + 20+ chars)
- Notebook is up to date (re-generate in memory and compare to committed file)
- Single config cell right after GPU check with no reassignments in later cells
- Notebook delegates uvicorn, cloudflared, assistant, and stop logic to server_main
- Torch version check around install step using subprocess (no importlib.reload)
- VRAM cache cleanup before Qwen loading
- Re-run safe uvicorn thread join when stopping/restarting
"""
from __future__ import annotations

import ast
import json
from pathlib import Path
import re
from typing import Any, Dict, List

import pytest

from colab.build_notebook import build_notebook, generate_notebook

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
NOTEBOOK_PATH = REPO_ROOT / "colab" / "SAM3_Qwen_Artwork_Extraction_Server_Colab.ipynb"
SERVER_REF_DIR = REPO_ROOT / "server_reference"


@pytest.fixture(scope="module")
def notebook_data() -> Dict[str, Any]:
    """Load the generated notebook from disk as JSON."""
    assert NOTEBOOK_PATH.exists(), f"Notebook file not found at {NOTEBOOK_PATH}"
    content = NOTEBOOK_PATH.read_text(encoding="utf-8")
    return json.loads(content)


def test_notebook_is_valid_json_and_nbformat_4(notebook_data: Dict[str, Any]) -> None:
    """Verify notebook has nbformat 4 and expected Colab GPU metadata."""
    assert notebook_data.get("nbformat") == 4
    assert "cells" in notebook_data
    assert isinstance(notebook_data["cells"], list)
    assert len(notebook_data["cells"]) > 0

    metadata = notebook_data.get("metadata", {})
    assert metadata.get("accelerator") == "GPU"
    colab_meta = metadata.get("colab", {})
    assert colab_meta.get("accelerator") == "GPU"
    assert colab_meta.get("gpuType") == "T4"


def test_notebook_contains_all_server_reference_files(notebook_data: Dict[str, Any]) -> None:
    """Verify there is a %%writefile cell for every file in server_reference/*.py."""
    source_py_files = sorted(SERVER_REF_DIR.glob("*.py"))
    assert len(source_py_files) > 0, "No Python files found in server_reference/"

    # Map target path -> cell source lines
    writefile_cells: Dict[str, str] = {}
    pattern = re.compile(r"^%%writefile\s+(/content/server_reference/\S+)")

    for cell in notebook_data["cells"]:
        if cell.get("cell_type") != "code":
            continue
        source_text = "".join(cell.get("source", []))
        match = pattern.match(source_text.strip())
        if match:
            dest_path = match.group(1)
            writefile_cells[dest_path] = source_text

    for py_file in source_py_files:
        expected_dest = f"/content/server_reference/{py_file.name}"
        assert expected_dest in writefile_cells, (
            f"Missing %%writefile cell for {expected_dest}. Found: {list(writefile_cells.keys())}"
        )


def test_embedded_content_matches_source_files(notebook_data: Dict[str, Any]) -> None:
    """Verify embedded content in %%writefile cells equals actual source files on disk."""
    source_py_files = sorted(SERVER_REF_DIR.glob("*.py"))

    # Extract all writefile cells
    writefile_cells: Dict[str, str] = {}
    pattern = re.compile(r"^%%writefile\s+(/content/server_reference/\S+)")

    for cell in notebook_data["cells"]:
        if cell.get("cell_type") != "code":
            continue
        lines = cell.get("source", [])
        if not lines:
            continue
        first_line = lines[0].strip()
        match = pattern.match(first_line)
        if match:
            dest_path = match.group(1)
            # Content is everything after the first line (the %%writefile line)
            content = "".join(lines[1:])
            writefile_cells[dest_path] = content

    for py_file in source_py_files:
        dest_path = f"/content/server_reference/{py_file.name}"
        assert dest_path in writefile_cells, f"Missing %%writefile cell for {dest_path}"

        expected_content = py_file.read_text(encoding="utf-8").replace("\r\n", "\n")
        embedded_content = writefile_cells[dest_path].replace("\r\n", "\n")

        assert embedded_content == expected_content, (
            f"Mismatch between embedded content and source file for {py_file.name}"
        )


def test_embedded_server_main_matches_source(notebook_data: Dict[str, Any]) -> None:
    """Verify colab/server_main.py is embedded and matches the disk source."""
    server_main_path = REPO_ROOT / "colab" / "server_main.py"
    if not server_main_path.is_file():
        pytest.skip("colab/server_main.py does not exist")

    pattern = re.compile(r"^%%writefile\s+/content/server_main\.py")
    found_content = None

    for cell in notebook_data["cells"]:
        if cell.get("cell_type") != "code":
            continue
        lines = cell.get("source", [])
        if lines and pattern.match(lines[0].strip()):
            found_content = "".join(lines[1:]).replace("\r\n", "\n")
            break

    assert found_content is not None, "Missing %%writefile /content/server_main.py cell"
    expected = server_main_path.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert found_content == expected


def test_all_code_cells_parse_with_ast(notebook_data: Dict[str, Any]) -> None:
    """Verify every code cell parses with ast.parse after stripping lines starting with % or !."""
    for idx, cell in enumerate(notebook_data["cells"]):
        if cell.get("cell_type") != "code":
            continue

        raw_lines = cell.get("source", [])
        # Strip lines that start with % or ! (IPython magics and shell escapes)
        python_lines = [
            line for line in raw_lines
            if not line.lstrip().startswith(("%", "!"))
        ]
        clean_code = "".join(python_lines)

        try:
            ast.parse(clean_code)
        except SyntaxError as e:
            cell_id = cell.get("id", f"index_{idx}")
            pytest.fail(
                f"SyntaxError in code cell {cell_id} (index {idx}): {e}\n"
                f"--- Clean Code ---\n{clean_code}\n--- End ---"
            )


def test_no_hardcoded_token_looking_strings(notebook_data: Dict[str, Any]) -> None:
    """Verify there are no hardcoded token-like strings (e.g. hf_ followed by 20+ chars)."""
    token_pattern = re.compile(r"hf_[a-zA-Z0-9]{20,}")

    for idx, cell in enumerate(notebook_data["cells"]):
        text = "".join(cell.get("source", []))
        matches = token_pattern.findall(text)
        assert not matches, (
            f"Found potential hardcoded token in cell {cell.get('id', idx)}: {matches}"
        )


def test_notebook_is_up_to_date() -> None:
    """Verify that committed notebook matches in-memory re-generation exactly."""
    in_memory_dict = generate_notebook(repo_root=REPO_ROOT)
    committed_content = NOTEBOOK_PATH.read_text(encoding="utf-8")
    committed_dict = json.loads(committed_content)

    assert in_memory_dict == committed_dict, (
        "Committed notebook does not match in-memory generation. Run 'python colab/build_notebook.py' to update."
    )


def test_single_config_cell_and_no_reassignments(notebook_data: Dict[str, Any]) -> None:
    """Verify ONE config cell exists and configuration variables are never reassigned in later cells."""
    code_cells = [c for c in notebook_data["cells"] if c.get("cell_type") == "code"]

    config_cell_idx = 1
    config_text = "".join(code_cells[config_cell_idx].get("source", []))

    config_vars = [
        "ENABLE_QWEN",
        "QWEN_MIN_FREE_VRAM_GB",
        "USE_DRIVE_CACHE",
        "MAX_UPLOAD_MB",
        "DEFAULT_THRESHOLD",
        "MAX_CANDIDATES",
        "OVERLAY_MAX_SIDE",
        "CORS_ORIGINS",
        "SAM_DEVICE",
    ]

    for var in config_vars:
        assert f"{var} =" in config_text, f"{var} not assigned in config cell"

    # Verify no later code cell (excluding %%writefile cells) reassigns these variables
    assignment_patterns = [
        re.compile(rf"^\s*{var}\s*=", re.MULTILINE)
        for var in config_vars
    ]

    for idx, cell in enumerate(code_cells):
        if idx <= config_cell_idx:
            continue
        cell_text = "".join(cell.get("source", []))
        # Skip %%writefile cells where library code may define constants
        if cell_text.lstrip().startswith("%%writefile"):
            continue

        for pat, var in zip(assignment_patterns, config_vars):
            match = pat.search(cell_text)
            assert match is None, (
                f"Variable {var} was reassigned in code cell {cell.get('id', idx)}:\n{cell_text}"
            )


def test_server_main_helpers_delegation(notebook_data: Dict[str, Any]) -> None:
    """Verify that notebook code cells call server_main helper functions instead of duplicating logic."""
    code_cells_text = [
        "".join(c.get("source", []))
        for c in notebook_data["cells"]
        if c.get("cell_type") == "code" and not "".join(c.get("source", [])).lstrip().startswith("%%writefile")
    ]
    all_user_code = "\n".join(code_cells_text)

    # 1. build_assistant helper called in Qwen cell
    assert "server_main.build_assistant(" in all_user_code
    # 2. start_uvicorn helper called in uvicorn cell
    assert "server_main.start_uvicorn(" in all_user_code
    # 3. start_cloudflared helper called in cloudflared cell
    assert "server_main.start_cloudflared(" in all_user_code
    # 4. stop_server_and_tunnel helper called in shutdown cell and restart cell
    assert "server_main.stop_server_and_tunnel(" in all_user_code
    assert "thread=globals().get(\"server_thread\")" in all_user_code


def test_torch_version_check_around_install(notebook_data: Dict[str, Any]) -> None:
    """Verify install cell checks PyTorch version before and after installation via subprocess."""
    install_cell = None
    for cell in notebook_data["cells"]:
        text = "".join(cell.get("source", []))
        if "facebookresearch/sam3.git" in text:
            install_cell = text
            break

    assert install_cell is not None, "Install cell not found"
    assert "orig_torch_version = torch.__version__" in install_cell
    assert "orig_torch_version" in install_cell
    assert "post_torch_version != orig_torch_version" in install_cell
    assert "import torch; print(torch.__version__)" in install_cell


def test_no_importlib_reload_in_notebook(notebook_data: Dict[str, Any]) -> None:
    """Verify notebook contains no importlib.reload( calls."""
    all_text = " ".join("".join(c.get("source", [])) for c in notebook_data["cells"])
    assert "importlib.reload(" not in all_text


def test_cache_cleanup_before_qwen_load(notebook_data: Dict[str, Any]) -> None:
    """Verify gc.collect() and torch.cuda.empty_cache() are called before Qwen free VRAM measurement."""
    qwen_cell = None
    for cell in notebook_data["cells"]:
        text = "".join(cell.get("source", []))
        if "VRAM before Qwen load" in text:
            qwen_cell = text
            break

    assert qwen_cell is not None, "Qwen load cell not found"
    empty_cache_pos = qwen_cell.find("torch.cuda.empty_cache()")
    gc_collect_pos = qwen_cell.find("gc.collect()")
    mem_get_info_pos = qwen_cell.find("torch.cuda.mem_get_info()")

    assert empty_cache_pos != -1, "torch.cuda.empty_cache() not in Qwen cell"
    assert gc_collect_pos != -1, "gc.collect() not in Qwen cell"
    assert empty_cache_pos < mem_get_info_pos, "empty_cache() must precede mem_get_info()"
    assert gc_collect_pos < mem_get_info_pos, "gc.collect() must precede mem_get_info()"


def test_required_cells_present(notebook_data: Dict[str, Any]) -> None:
    """Verify key functional requirements exist in the notebook cells."""
    all_text = " ".join("".join(c.get("source", [])) for c in notebook_data["cells"])

    # 1. GPU / CUDA check
    assert "torch.cuda.is_available()" in all_text
    assert "total_memory" in all_text

    # 2. Config cell
    assert "ENABLE_QWEN" in all_text
    assert "SAM_DEVICE" in all_text

    # 3. Drive cache option
    assert "USE_DRIVE_CACHE" in all_text
    assert "HF_HOME" in all_text

    # 4. Dependencies
    assert "facebookresearch/sam3.git" in all_text
    assert "fastapi" in all_text
    assert "uvicorn" in all_text

    # 5. Hugging Face Login
    assert "userdata.get(\"HF_TOKEN\")" in all_text
    assert "getpass" in all_text
    assert "del hf_token" in all_text

    # 6. SAM 3 Engine
    assert "Sam3Engine(device=SAM_DEVICE" in all_text

    # 7. Qwen Assistant configuration
    assert "Prompt Assistant disabled — SAM 3 manual mode still works" in all_text

    # 8. Server Auth and Limits
    assert "secrets.token_urlsafe(32)" in all_text
    assert "MAX_UPLOAD_MB" in all_text
    assert "DEFAULT_THRESHOLD" in all_text

    # 9. Local .env guidance and curl examples
    assert "COLAB_API_URL=" in all_text
    assert "COLAB_API_TOKEN=" in all_text
    assert "curl" in all_text
    assert "/api/v1/segment" in all_text

    # 10. External check
    assert "/api/v1/segment" in all_text


def _code_cells(notebook_data: Dict[str, Any]) -> List[str]:
    return ["".join(c["source"]) for c in notebook_data["cells"] if c["cell_type"] == "code"]


def test_sam3_repo_not_shadowing_package(notebook_data: Dict[str, Any]) -> None:
    """Repo must not be cloned to /content/sam3, which shadows the real `sam3` package."""
    code = [c for c in _code_cells(notebook_data) if not c.startswith("%%writefile")]
    all_code = "\n".join(code)
    assert 'repo_dir = "/content/sam3_repo"' in all_code
    assert '"/content/sam3"' not in all_code
    assert "%cd /content/sam3\n" not in all_code
    install = next(c for c in code if "pip\", \"install\", \"-e\"" in c)
    assert "sys.path.insert(0, repo_dir)" in install
    assert "import sam3.model_builder" in install
    assert 'sys.path.insert(0, "/content")' not in all_code


def test_stop_cell_guarded_by_flag(notebook_data: Dict[str, Any]) -> None:
    """Verify stop server cell is guarded by STOP_SERVER flag and does not call stop at top level."""
    stop_cell = None
    for cell in notebook_data["cells"]:
        if cell.get("cell_type") == "code":
            source = "".join(cell.get("source", []))
            if "STOP_SERVER" in source:
                stop_cell = source
                break

    assert stop_cell is not None, "Stop server cell with STOP_SERVER not found"
    assert "STOP_SERVER = False" in stop_cell
    assert "if STOP_SERVER:" in stop_cell

    # AST check: stop_server_and_tunnel call must NOT be executed at module top-level
    tree = ast.parse(stop_cell)
    for stmt in tree.body:
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
            func_name = ast.unparse(stmt.value.func)
            assert "stop_server_and_tunnel" not in func_name, (
                "stop_server_and_tunnel was called at top level in stop cell"
            )

    # Must be inside If block
    if_stmts = [stmt for stmt in tree.body if isinstance(stmt, ast.If)]
    assert len(if_stmts) > 0
    if_body = ast.unparse(if_stmts[0])
    assert "server_main.stop_server_and_tunnel" in if_body


def test_final_server_status_cell(notebook_data: Dict[str, Any]) -> None:
    """Verify final server status cell re-prints URL and checks health without revealing token."""
    cells = notebook_data["cells"]
    code_cells = [c for c in cells if c.get("cell_type") == "code"]
    last_code_cell = "".join(code_cells[-1].get("source", []))

    assert "TRẠNG THÁI SERVER" in last_code_cell
    assert "tunnel_url" in last_code_cell
    assert "/health" in last_code_cell
    assert "API_TOKEN" not in last_code_cell

