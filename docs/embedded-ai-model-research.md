# Embedded AI model selection

Researched on 2026-09-26 against Liquid AI's model cards, model files and release notes, and the inference runtime's documentation. The job is a factual task description of at most 40 words from a task name, saved note and up to 12 page titles and hostnames. It does not need outside knowledge, coding ability or a reasoning trace.

## Recommendation

Use **LFM2.5-1.2B-Instruct, QAD Q4_0** as the built-in default. It downloads 696 MB, used roughly 1.6 GB in the Node evaluation, and generated captions in about 2.9 seconds. Its captions sometimes lose useful detail, especially product names, but it passes the native Electron integration checks. This recommendation combines caption quality, latency, memory and actual application compatibility.

**LFM2-2.6B-Exp, Q4_K_M** produced more specific captions in standalone Node, at roughly 6.5 seconds and 3.1 GB process memory. It initially looked like the quality winner. However, repeated Electron utility-process tests crashed during model loading, before generation. The crash report shows `posix_memalign` in Electron called from llama.cpp's CPU repack-buffer allocation, ending in SIGILL. Explicit memory mapping and lazy loading did not fix it. This establishes an allocation-path compatibility failure; it does not establish its exact size threshold or upstream cause. The model is therefore not offered in Settings.

The **350M** model was faster and smaller, but followed an instruction embedded in a page title under the revised prompt. It is not offered. The newer 2.6B thinking model adds reasoning that this short caption job does not need.

The 1.2B Instruct model answers directly and has a 32,768-token model context. Liquid recommends it for data extraction and retrieval-assisted generation, which are closer to this job than mathematics or agentic reasoning. Its reported IFEval is 86.23, IFBench 47.33 and Multi-IF 60.98. Use the author's sampling defaults as the baseline: temperature 0.1, top-k 50, repetition penalty 1.05. These are model-wide settings, not measured optima for short descriptions. [1.2B model card](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct)

QAD means quantization-aware distillation. Liquid's August 19 release reports that 1.2B QAD Q4_0 matches ordinary Q4_K_M quality with 3–14% higher decoding throughput on its measured hardware. For 350M, QAD Q4_0 matches Q5_K_M quality within evaluation variance. These are vendor measurements across its benchmark suite, not Tern latency measurements. QAD uses ordinary GGUF Q4_0 storage and requires no separate model runtime. [Liquid's QAD release](https://huggingface.co/blog/LiquidAI/qad)

## Candidates considered

| Model | Role in this decision | Evidence and limitation |
| --- | --- | --- |
| LFM2.5-1.2B-Instruct | Built-in default | Direct responses; stronger published instruction following than the smaller candidates. |
| LFM2.5-350M | Small-download challenger | IFEval 76.96, IFBench 40.69, Multi-IF 44.92. Uses the same baseline sampling settings as 1.2B. [Model card](https://huggingface.co/LiquidAI/LFM2.5-350M) |
| LFM2.5-230M | Further size reduction if 350M works well | QAD Q4_0 is 149.1 MB. IFEval 71.71 and Multi-IF 37.70 suggest less margin for combined instructions. [Model card](https://huggingface.co/LiquidAI/LFM2.5-230M), [official file metadata](https://huggingface.co/api/models/LiquidAI/LFM2.5-230M-GGUF?blobs=true) |
| LFM2.5-1.2B-Thinking | Existing baseline | The previous local evaluation recorded 33.6 seconds for one reasoning response versus 3.5 seconds with reasoning disabled. Several direct responses lost useful details. That is evidence about those prompts and samples, not all uses of the model. [Local prompt evaluation](task-description-prompt-evaluation.md) |
| LFM2.5-2.6B | Larger reasoning alternative | Released August 2026. Despite its short name, this is explicitly a pure reasoning model whose chat template starts with a thinking tag. Its 1.59 GB QAD file fits the size budget, but extra reasoning is a poor default for a 40-word background description. [Model card](https://huggingface.co/LiquidAI/LFM2.5-2.6B), [GGUF files](https://huggingface.co/LiquidAI/LFM2.5-2.6B-GGUF/tree/main) |
| LFM2-2.6B-Exp | Quality winner, excluded after Electron crash | Earlier experimental instruction-following checkpoint trained with reinforcement learning. Its published chat example answers directly. Defaults are temperature 0.3, min-p 0.15, repetition penalty 1.05. Preserved more task details in Node, but failed native Electron loading. [Model card](https://huggingface.co/LiquidAI/LFM2-2.6B-Exp) |
| Original LFM2-350M, 1.2B, 2.6B and 8B-A1B | Superseded options | Liquid's current catalog marks them deprecated. LFM2-700M remains listed, but the newer small models are the more useful first comparison. Larger mixture-of-experts models offer no evident advantage for this download and task budget. [Current model catalog](https://www.liquid.ai/models) |

## Reproducible downloads

These are official `LiquidAI` repositories. The revisions, exact bytes and LFS SHA-256 values came from Hugging Face's model metadata API on the research date. Download from the pinned revision, check byte count and SHA-256 before marking the model ready, and retain the full model license alongside it. File size is not peak RAM use.

### Default model

```json
{
  "repository": "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
  "revision": "8ed288026e23958ad9dfa92d53ed773a8eee7125",
  "filename": "LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf",
  "bytes": 695755488,
  "sha256": "bb741ebb106d543e9de114b843a3d3d73d51c74b5801e69da2abde821a0cb3e1"
}
```

[Pinned download](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf), [metadata](https://huggingface.co/api/models/LiquidAI/LFM2.5-1.2B-Instruct-GGUF?blobs=true).

The ordinary Q4_K_M comparator at the same revision is `LFM2.5-1.2B-Instruct-Q4_K_M.gguf`, 730,895,168 bytes, SHA-256 `b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5`.

### Smaller challenger

```json
{
  "repository": "LiquidAI/LFM2.5-350M-GGUF",
  "revision": "657e078c94084481950a2d555a941481f715536b",
  "filename": "LFM2.5-350M-QAD-Q4_0.gguf",
  "bytes": 219312832,
  "sha256": "3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d"
}
```

[Pinned download](https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/657e078c94084481950a2d555a941481f715536b/LFM2.5-350M-QAD-Q4_0.gguf), [metadata](https://huggingface.co/api/models/LiquidAI/LFM2.5-350M-GGUF?blobs=true).

The ordinary Q4_K_M comparator at the same revision is `LFM2.5-350M-Q4_K_M.gguf`, 229,312,224 bytes, SHA-256 `7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4`.

### Larger tested candidate

`LiquidAI/LFM2-2.6B-Exp-GGUF`, revision `7d9bef941a2642e1d00967564fd55e1dcecf0d6a`, file `LFM2-2.6B-Exp-Q4_K_M.gguf`, 1,639,166,304 bytes, SHA-256 `95b9322dc81f577be1d966f508bc2fa3ec2cda56a556347d3cdf71cfefaba591`. [Pinned download](https://huggingface.co/LiquidAI/LFM2-2.6B-Exp-GGUF/resolve/7d9bef941a2642e1d00967564fd55e1dcecf0d6a/LFM2-2.6B-Exp-Q4_K_M.gguf), [metadata](https://huggingface.co/api/models/LiquidAI/LFM2-2.6B-Exp-GGUF?blobs=true).

## Runtime and distribution

Liquid publishes the chosen checkpoints for llama.cpp and compatible GGUF runtimes. A node-llama-cpp maintainer has demonstrated LFM2 inference on CPU and GPU, so the architecture has working precedent. The selected 1.2B artifact passes load-and-generate checks with the pinned package and packaged Electron app. The 2.6B artifact failed those checks as described above. [Official GGUF model card](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF), [runtime maintainer's LFM2 test](https://github.com/withcatai/node-llama-cpp/discussions/535)

The runtime's Electron guide prohibits loading it in a renderer. It requires preserving the package directory structure, excluding native binaries from ASAR and treating `node-llama-cpp` as external to the JavaScript bundle. Builds must include the platform's binaries; Electron does not build missing native binaries from source by default. A utility-process implementation needs its own packaged smoke test because the guide describes main-process use. [Electron integration guide](https://node-llama-cpp.withcat.ai/guide/electron)

The models use **LFM Open License v1.0**, not an unrestricted permissive license. Section 4 requires giving model recipients the license and preserving applicable notices; modified model files need change notices. Section 5 restricts commercial use for legal entities exceeding its revenue threshold. The definition describes annual revenue of US$10 million or more, while section 5 uses “exceeds.” Do not silently treat large-company commercial deployments as covered. The application can include the full model license with its third-party notices and model files. [Pinned license text](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/raw/8ed288026e23958ad9dfa92d53ed773a8eee7125/LICENSE)

## Local acceptance criteria

Use identical synthetic inputs, prompt and output schema for each candidate. Include the six earlier examples plus empty notes, misleading titles and title text containing instructions. Record cold load time separately from warm generation time, generated text, JSON validity, key facts retained and unsupported claims. Run CPU inference first because optional GPU acceleration cannot establish a usable baseline for every desktop.

Prefer the smaller model only after inspecting its answers. A valid JSON object can still contain vague or false text. Do not treat one successful hostile-title example as a security guarantee. Keep output length checks and the factual fallback regardless of the selected model. Measure actual memory and packaged startup behavior before making a RAM or latency promise.

The unmodified license downloaded from the pinned revision is included at [desktop/resources/licenses/lfm-open-license-1.0.txt](../desktop/resources/licenses/lfm-open-license-1.0.txt).

## Native model results

Ran eight synthetic tasks on an AMD Ryzen 5 Microsoft Surface Edition CPU through `node-llama-cpp` 3.21.1. The production backend uses at most four CPU threads, a 4,096-token context, JSON grammar, 256 output tokens and a fresh chat sequence for each task. All compared models used temperature 0.1, top-k 50 and repetition penalty 1.05. Those settings match the small Instruct models' published baseline; this was not a full sampling-parameter search for 2.6B-Exp.

| Model | Download | Load time | Median caption time | Maximum observed process RSS |
| --- | ---: | ---: | ---: | ---: |
| 350M QAD Q4_0 | 219 MB | 1.0 s | 1.1 s | 684 MB |
| 1.2B Instruct QAD Q4_0 | 696 MB | 1.6 s | 2.9 s | 1,661 MB |
| 2.6B Exp Q4_K_M | 1,639 MB | 2.8 s | 6.5 s | 3,140 MB |

RSS covers the evaluation process, including model weights and runtime overhead. The two smaller models ran sequentially in one process, so retained JavaScript/runtime allocations can affect the second reading. Latency is an observed sample, not a hardware-independent promise. The initial old-prompt run of 1.2B alone reached 1,592 MB, consistent with the approximate 1.6 GB footprint.

The prompt was revised to name open-tab topics explicitly. With the previous recap prompt, 1.2B repeatedly used words such as “reviewed” and added advice. Under the revised prompt:

- For the walking trip, 2.6B retained Grampians walks and Halls Gap accommodation and omitted the unrelated inbox. 1.2B retained the locations but included the inbox.
- For laptop shopping, 2.6B focused on Framework 13 and Linux suspend support. The earlier 350M run began with “Buy a Linux laptop” despite a note saying not to buy yet.
- For cameras, 2.6B retained the Fujinon XF 16-80mm and OM-1 Mark II. 1.2B reduced the task to “Camera options and lens weight considerations.”
- For the hostile page title, 350M copied the instructed fake purchase/password sentence under the revised prompt. Both larger models ignored it in these samples.
- 2.6B still sometimes over-compressed the input. For unrelated email, cake and TypeScript tabs, it returned “Email, recipe, handbook.” It is not consistently precise enough to remove the inferred label.

Every result in these three runs was parseable JSON and within the length limit. That validates formatting on these samples, not general factual accuracy or injection resistance. Raw synthetic inputs, outputs and measurements are in [the evaluation artifact](performance/embedded-ai-models-2026-09-26.json).

To repeat after building:

```sh
npm run evaluate:ai --workspace=@tern/desktop -- --output /tmp/tern-ai-results.json /path/to/model.gguf
```

Separate integration tests verify actual packaged Electron inference, offline model reuse, cache reuse after restart, immediate startup cancellation, worker cleanup, disabled AI, resumable downloads, checksum rejection and retained custom Ollama support.
