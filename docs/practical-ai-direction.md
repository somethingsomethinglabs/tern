# Practical AI for Tern

Researched 22 September 2026. This is a proposed product direction, not an implemented feature or an accepted architecture decision. It combines a review of the current desktop code with primary-source research. No models were downloaded, browser content sent to a provider, or performance benchmarks run.

AI should reduce the work of finding, organizing and resuming tasks. A feature earns its place when it saves more effort than reviewing and correcting it costs. Ordinary browsing must stay fast and complete with assistance disabled.

## What to build first

| Priority | Feature and example | Interaction | Proposed implementation |
| --- | --- | --- | --- |
| 1 | Find by meaning. Search for "the browser extension docs" even when those words do not exactly match a title. | Extend the existing task/page search. Return actual pages and their owning tasks. | Combine keyword matches with local embeddings of titles, task names and saved notes. Preserve strong exact matches. |
| 2 | Suggest a task for a page. An extension API page might belong to "Bitwarden compatibility". | Rank destinations inside a Move to task picker. Keep the current owner until the user chooses. | Compare the page with task descriptions and existing pages; allow no useful match. A classifier can rerank ambiguous candidates later. |
| 3 | Draft a resumption note. "Read the extension support list; next check popup behavior." | A Draft note action inside Task notes or Put aside. Show selected sources and let the user edit, keep or discard. | An optional local text-generation model, using a bounded source selection. Never infer a completed action from a page merely being open. |
| 4 | Find relevant work for a stated intention. "Show tasks related to packaging the Linux build." | A temporary ranked search view. Sidebar order and keyboard assignments remain stable. | Reuse local retrieval. Add explicit pins or dates through ordinary application logic if needed. |
| 5 | Answer or compare selected sources. "Which of these APIs supports popups?" | A page or selection menu command opens a temporary result with evidence links. | Retrieve passages from selected pages and generate a short answer. Missing evidence produces an incomplete answer, not an invented value. |
| Later | Interpret a short task command. "Put this aside with a note to check packaging." | An explicit command entry point with a preview when the interpretation is ambiguous. | Deterministic commands first; constrained local parsing only if it removes real friction. |

The first search release searches workspace metadata. It cannot find a detail that exists only in a page body. Broader recall needs separately enabled indexing of readable content. That distinction belongs in the feature description and evaluation.

I would start with search. It offers a useful result without changing the user's organization or asking them to review a stream of suggestions. Task placement is next because the suggestion appears at the exact moment the user needs a destination.

## Behavior that keeps it out of the way

- Put assistance inside existing search, task notes and page menus. No permanent chat panel, greeting, completion toast or unsolicited daily recap.
- Make setup a single clear choice for each capability. Local organization can index changed metadata after it is enabled; note drafting and source questions run when invoked.
- Keep a master off switch and individual controls. Off cancels work, stops indexing and unloads models. Deleting the index and downloaded models is a separate, clearly available action.
- A suggestion may be absent. Low confidence should usually mean silence. Do not repeatedly offer a dismissed page/task pairing unless its context changes.
- Show a concrete basis for a suggested destination, such as the related page it matched. Do not present a similarity score as a probability or generate a persuasive explanation unsupported by the inputs.
- Task placement and naming changes remain reversible. Preserve page identity and the live Chromium view when moving a page; moving a URL must not recreate the page and lose its form state.
- Keep task lifecycle, website save state and assistant state separate. Only the user marks work Later or Settled. A recap never establishes that a form was saved, submitted or successfully processed.

Useful rules should precede models. New tabs opened from a task already have an obvious default owner. Exact duplicate addresses can be detected with code. Dates the user entered can be sorted with code. Do not automatically close duplicate-looking live pages, since their in-memory state may differ. Do not discard query parameters broadly when comparing addresses.

## What other browsers establish

The [browser precedent research](ai-browser-precedents.md) compares documented behavior and data scope. These are product references, not evidence that Tern will improve productivity.

Firefox is a close technical precedent. Mozilla describes local embeddings for related-tab suggestions and a separate small model for group names. That supports testing narrow models for organization instead of running a generative model for every browser event. [Mozilla's implementation account](https://blog.mozilla.org/en/firefox/ai-tab-groups/)

Tern should organize around the user's work. Two pages on the same topic can serve different tasks, and one task can contain unrelated-looking websites. The task note and the user's corrections should therefore matter more than a generic topic label.

## Where Jev fits

The user confirmed TypeSafe AI's Jev as the intended model. Its official API supports selecting a defined option, scoring against a rubric, and returning a yes/no probability. This is a plausible fit for deciding which existing task is relevant or whether a page supports a stated intention. It does not generate the prose needed for a resumption note. [TypeSafe introduction](https://docs.typesafe.ai/introduction)

The documented integration calls TypeSafe's hosted API. I found no official local inference or downloadable-weight instructions in the sources reviewed. Treat Jev as an optional remote provider, not the foundation of an offline feature. Its launch announcement describes early access as of 15 September 2026. [Official quick start](https://docs.typesafe.ai/introduction/quickstart), [launch announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

For task assignment, supply task IDs with meaningful descriptions and include an explicit no-match option. Choice supports up to 255 options; larger workspaces would need candidate retrieval or a staged decision. A valid task ID can still be the wrong task. [Choice documentation](https://docs.typesafe.ai/primitives/choice)

Jev's confidence summarizes the concentration of its probability distribution. It is not itself the probability that the chosen task is correct. Tune suggestion thresholds against Tern examples, measuring both mistakes and how often the system abstains. [Confidence documentation](https://docs.typesafe.ai/confidence)

Pin a model version when evaluating. The official model page says requests and responses are not used for training and points enterprise customers to zero-retention terms. That does not establish zero retention for every account. Verify the applicable terms before adding real browsing data to a remote evaluation. [Model documentation](https://docs.typesafe.ai/models)

The worthwhile experiment is whether Jev improves ambiguous classification enough to justify a network dependency. Start that comparison with synthetic or explicitly selected test data. Do not silently escalate uncertain local results to a remote provider.

## Local implementation options

| Option | Appropriate work | Assessment |
| --- | --- | --- |
| Rules and keyword search | Exact lookup, known destinations, duplicates, explicit dates and priorities | Required baseline. Fast, predictable and no model download. |
| Small embedding model through Transformers.js and ONNX | Semantic search and candidate task ranking | Recommended first experiment. Can share one metadata index across both features. |
| Small local classifier | Reranking candidates or classifying page roles | Add only if measured errors justify it. The model must handle changing user-defined tasks or classify stable roles that application code can use. |
| Local generative model through Ollama | Draft notes, extract candidate next steps, compare selected text | Optional later capability with greater memory and cold-start costs to measure. |
| Jev hosted API | Typed classification and relevance scoring | Optional comparator or provider for users who choose remote processing. |

Transformers.js supports Node inference, filesystem caching and loading models from local paths with remote model loading disabled. This makes it a candidate for the desktop app, subject to testing Electron packaging and native runtime compatibility. [Node tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/node)

An initial baseline is `all-MiniLM-L6-v2`. Its publisher describes a 384-dimensional representation for semantic search and clustering; the model card lists Apache-2.0 licensing. It is a candidate, not a claim that it is the best model for Tern or every language. Evaluate the exact ONNX artifact and license before redistribution. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

Ollama offers local operation, a way to disable cloud features and controls for unloading idle models. A loopback address alone is insufficient to promise local processing when a service also supports cloud models. Require an explicitly local model and local-only configuration for Tern's local mode. [Ollama FAQ](https://docs.ollama.com/faq)

Model download size, working RAM, warm query time, first-use delay and power use need measurements on the target Linux machine. Avoid promising instant or cheap operation based on a model's weight-file size.

## Fit with the current desktop

The inspected [contracts](../packages/core/src/contracts.ts) already contain task names, notes, lifecycle, selected page IDs, page titles and URLs. [Workspace persistence](../desktop/host/workspace-file.ts) saves those references. The [React shell](../packages/app/src/App.tsx) implements text filtering, and the [host](../desktop/host/main.ts) receives navigation and title updates. These are sufficient inputs and update points for a metadata-only experiment.

The current [page preload](../desktop/host/page-preload.cjs) reports scroll direction and deliberately sends no website content. Full-page recaps need a new, narrowly scoped collection path. The current persisted model also lacks a detailed activity log, completion evidence and explicit due dates. A model cannot recover those facts from titles.

Proposed sequence of responsibilities:

1. The host creates a bounded metadata record when a relevant field changes. Omit URL credentials, queries and fragments from model input by default, and let users exclude tasks or sites. Titles and notes can also be sensitive.
2. A separate inference worker embeds changed records. Keep compute off both the Electron main process and the UI thread. Debounce updates and cancel obsolete work.
3. Store a rebuildable index separately from `workspace.json`, keyed by entity ID, content fingerprint and model version. Deletion and exclusions remove derived records as well. Workspace metadata remains authoritative.
4. Search combines lexical and semantic results. Start with a simple local vector scan and measure it before adding a vector database. The persisted format allows large workspaces, so bounded queues and large-workspace measurements still matter.
5. A suggestion returns candidate IDs and supporting records. The host validates that those entities and their source revisions still exist before displaying or applying it. Models receive no direct workspace mutation or website action capability.
6. Accepted organization changes go through ordinary host commands and support undo. A failed model download, crashed worker or missing model falls back to current browsing and search.

For a later recap feature, users choose the pages or text included. Capture readable text with source IDs, addresses and capture times; exclude form values, password fields, hidden content and cross-origin frames initially. Authenticated readable text may still be private, so exclusions are not a guarantee of sanitization. Page instructions are source material, never authority to change the browser or call tools. Keep draft evidence separate from the user's accepted note and make stale captures visible.

## How to decide whether it is useful

Build a small, locally held evaluation set before choosing a provider. Include multiple tasks using the same domain, similar task names, mixed-topic tasks, vague titles, missing metadata, unrelated pages and pages with more than one plausible owner. Keep evaluation examples separate from examples used to tune ranking and thresholds.

Compare keyword search, local embeddings and any optional classifier on the same cases. Measure retrieval in the first five results, correctness of shown suggestions, abstention, correction effort and time to find or resume work. Acceptance alone is weak evidence, since a user may accept a bad suggestion.

For the first feature, proposed acceptance checks are:

- Meaning-based queries find useful pages that literal search misses, while exact titles and addresses remain easy to find.
- The existing search remains usable during cold model startup, download failure and offline operation.
- Enabling assistance does not move tasks or change their keyboard letters.
- Disabling it stops inference; excluded or deleted material disappears from the index.
- A network-observed offline run completes after model installation, with no inference requests leaving the device.
- On the target machine, record warm and cold latency, peak memory and UI responsiveness with both ordinary and large workspaces. Set release budgets from those measurements.

For task placement, measure suggestion precision together with coverage. A system that stays silent on every difficult case can look accurate while doing little useful work. For resumption notes, measure unsupported claims and time spent correcting the draft against writing a note manually.

The first deliverable should be optional local semantic search in the existing search control, accompanied by that comparison. It gives us evidence for the next feature without committing the browser to an always-running assistant.
