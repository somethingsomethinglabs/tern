# Task context evaluation

Tested on 26 September 2026 with the existing pinned LFM2.5 1.2B Instruct QAD Q4_0 model. Inputs were synthetic. The native checks use the same Electron utility process, CPU limits and 256-token response limit as the application.

The first prompts asked the model to interpret several JSON fields and both draft a goal and suggest searches. Results included literal field names such as `savedGoal nextStep`, generic research advice and a query with an unsupported year. A shorter prompt with labelled text produced more useful results. The host now filters outputs with no topic-word overlap and skips inference when only generic metadata is available. This is a basic relevance check; it does not establish factual accuracy or resistance to instructions embedded in page titles.

| Synthetic task | Raw search suggestions with the retained prompt | Generation time |
| --- | --- | ---: |
| Choose a Linux laptop; next check Framework 13 suspend support | Framework 13 support; Linux laptop reviews | 3.6 s |
| Find a short walk near Halls Gap; next check open tracks | Grampians walking tracks; open tracks near Halls Gap | 3.7 s |
| Research; only a Google page, no goal or next step | Google; open pages | 3.2 s |

The third row deliberately bypassed the normal host check to inspect the model. In the application, that input skips inference and shows no suggestions. The grounding check also removes those raw outputs. The first row remains too broad: it drops the specific suspend question. These examples support treating the feature as optional suggestions that need review, not reliable task planning.

A generated goal remains a draft. The host drops it when a saved goal exists, regardless of model output. Editing a suggested goal puts it into the goal field and requires Save goal. Suggestions cannot change task status or operate websites. Search commands always encode the text as a query and open a new tab, even when a model emits something that looks like an address.

Automated checks cover workspace migration and persistence, findings with sources, draft isolation between tasks, model and input cache invalidation, malformed output, cancellation during startup and generation, late responses, AI off, source selection excluding editable fields, and preserving an unsaved form while opening a suggested search. Native checks also verify the response grammar and process cleanup. Wide and narrow panel screenshots were inspected during implementation.

To repeat the native checks after building, set `TERN_AI_TEST_MODEL` and `TERN_AI_BUILTIN_MODEL` to the existing pinned GGUF, then run:

```sh
npm test --workspace=@tern/desktop -- local-ai-process.spec.ts task-context-ui.spec.ts
```

The tests use temporary profiles. The built-in UI check disables model-network requests and reuses the local model file.

## Starting a task from a request

The goal-first flow has a separate response schema for a title, goal and two or three distinct search queries. It uses only the entered request. Search phrases are encoded through the configured search engine; the model cannot supply navigation destinations.

For the synthetic request “Find a Linux laptop under $1,500 with reliable suspend and good battery life,” the final prompt produced:

- Title: “Linux Laptop Recommendations Under $1500”
- Goal: “Identify suitable Linux laptops within budget and performance criteria”
- Searches: “Linux laptop under $1500 reliable suspend”, “best Linux laptops battery life”, “affordable Linux machines with good battery”

The title and searches are useful starting points, though the third search overlaps with the second. The goal is too general and omits the exact budget and suspend requirement. Tern keeps the full original request alongside the editable goal and includes it as context for later suggestions. It does not treat the generated goal as a complete record of the user's requirements.

The final run passed 50 Electron UI checks, including native task creation, plus 12 focused context and planning checks. The tests covered canceling a late model response, retaining the request after errors, explicit manual fallback, saving the entire task before opening tabs, preserving an existing live form, and reopening the saved task after restart. The request dialog was visually checked at wide and narrow window sizes.


## Opening the first result

Starting tabs now follow the first recognized organic web result from each generated search. This also applies to the single search used by Create without AI. Address-bar searches and later task-context suggestions keep their existing behavior.

The host reads result links in an isolated renderer world, using engine-specific organic-result containers and filtering ads and non-web destinations. It does not ask the model for URLs or make another inference request. Each tab stops looking after 12 seconds, after navigating away, or when the user interacts with the page or uses navigation controls. Back returns to the search results without triggering another automatic navigation. The resulting page addresses are saved with the task.

Live checks with the public query “Electron documentation” opened the documentation site through Brave, DuckDuckGo and Bing. Google presented a verification screen, which remained open. Engine markup can change; unrecognized results leave the search page available.

Deterministic Electron fixtures cover all four engines, ads before organic results, invalid links, encoded result redirects, delayed rendering, the 12-second deadline, manual navigation, Stop, page clicks, Back/Forward, saved destinations after restart, and preservation of existing work.
