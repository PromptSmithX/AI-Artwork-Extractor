# Task W2 — Qwen3-VL-4B Prompt Assistant Report

## 1. Summary of Changes
- Implemented `server_reference/qwen_prompt_assistant.py`:
  - `SYSTEM_PROMPT` constant matching plan §4.4 verbatim.
  - `build_user_message` formatted with designer request and scope preference line if `scope_preference != auto`.
  - `parse_suggestion` with string-aware JSON brace extraction, markdown code fence stripping, Pydantic `PromptSuggestion` validation, invalid scope fallback to `Scope.UNKNOWN`, and empty `sam_prompt` validation when `needs_clarification=False`.
  - `QwenPromptAssistant`:
    - Lazy loading of PyTorch, Transformers, BitsAndBytes 4-bit NF4 quantization (`device_map="cuda:0"`).
    - VRAM threshold check (`min_free_vram_gb=5.0`) and CUDA availability requirement.
    - `unload()` with explicit model/processor cleanup, garbage collection, and CUDA empty cache.
    - `suggest()` with image downscaling preserving aspect ratio and RGB conversion, chat prompt assembly, generation with max new tokens, prompt token trimming, and automatic single retry on invalid JSON.
    - CUDA OOM handling on load and generate paths, automatically unloading resources and marking `available=False`.
    - Overridable `_generate()` method for testing without PyTorch/GPU.
    - `vram_report()` returning allocated, free, and total VRAM in GB.
  - Safe import and re-export of `PromptAssistantUnavailable` and `PromptAssistantOutputError`.
- Comprehensive test suite in `tests/assistant/`:
  - `test_system_prompt.py`: Tests `SYSTEM_PROMPT` content and `build_user_message` formatting across all scopes.
  - `test_parser.py`: Tests plain JSON, fenced JSON, prose wrapping, nested braces inside strings, invalid JSON, alternatives truncation/deduplication, invalid scope fallback, and empty prompt rule.
  - `test_assistant.py`: Tests initialization, disabled assistant handling, aspect-ratio-preserving downscaling, subclass single-turn success, retry-then-success, double failure, simulated OOM handling, unload, and VRAM reporting.

## 2. Test Execution Evidence
Command: `python -m pytest tests/assistant -q`
```
...........................                                              [100%]
27 passed
```

## 3. Compilation Evidence
Command: `python -m py_compile server_reference/qwen_prompt_assistant.py tests/assistant/__init__.py tests/assistant/test_system_prompt.py tests/assistant/test_parser.py tests/assistant/test_assistant.py`
Exit code: 0 (No syntax errors or compilation issues).

## 4. Git Commit Log
Command: `git log --oneline dev..HEAD`
```
e1fcda2 feat(assistant): implement Qwen3-VL-4B prompt assistant and unit tests
```

## 5. Design Decisions & Colab GPU Verification Notes
- **String-aware brace extraction:** Ensures nested braces within string literals (e.g. descriptions mentioning `{curly}` braces) or escaped quotes do not prematurely terminate JSON parsing.
- **Lazy Imports:** PyTorch, Transformers, and BitsAndBytesConfig are imported lazily inside methods so the module can be imported and tested on non-GPU environments without heavy dependencies.
- **OOM Detection:** Recognizes both `torch.cuda.OutOfMemoryError` and string pattern matches for simulated OOM testing on CPU.
- **Verification on Colab GPU:**
  - Real weight loading of `Qwen/Qwen3-VL-4B-Instruct` with `bitsandbytes` 4-bit NF4 quantization on Tesla T4.
  - Dual-model VRAM headroom check alongside Meta SAM 3 image model.
  - Actual token generation latency and chat template formatting with CUDA FP16 autocast.
