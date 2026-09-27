# Useful AI in browsers: precedents for Tern

Research checked 22 September 2026. These are documented product behaviors and engineering approaches, followed by proposed lessons for Tern. Vendor documentation establishes what a feature does, not whether it improves productivity. No browser or model was benchmarked for this note.

## Firefox makes a strong case for small, local models

Firefox offers a suggested name and related tabs when the user creates or manages a tab group. The user chooses which suggestions to retain. Its support page says processing happens on the device, using tab titles and descriptions, and currently limits the feature to English locales. It also acknowledges mistakes and provides a setting to disable suggestions. [Firefox support](https://support.mozilla.org/en-US/kb/how-use-ai-enhanced-tab-groups).

Mozilla's engineering account describes separate models for naming and matching. Naming uses distinctive keywords and sampled titles, followed by a distilled, quantized T5 model reduced to 57 MB. Matching uses MiniLM embeddings and logistic regression over the group name, anchor tab title and URL. Mozilla moved away from clustering because weighting those signals improved its internal evaluation. That result is not evidence of equivalent performance on Tern tasks. [Mozilla engineering account, November 2025](https://blog.mozilla.org/en/firefox/ai-tab-groups/).

Design implication, inferred: start with local suggestions that attach a saved page to an existing task. The task name and resumption note supply intent that generic topic clustering lacks. Keep "none of these" available. A general chat model is not a prerequisite for useful assistance.

## Edge shows both a review step and a data boundary to improve

Edge's Organize tabs command proposes named groups; users can adjust the proposal before applying it. Microsoft's privacy whitepaper says the service receives titles, URLs, opener relationships and creation timestamps. It says this data is deleted after processing and that tab organization is enabled by default. Turning it off leaves ordinary grouping available with generic names. [Edge privacy whitepaper, Tab organization](https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper/#tab-organization). Its policy documentation also names existing group information among the data sent to the service. [TabServicesEnabled policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/tabservicesenabled).

Design implication, inferred: preview proposed changes in the existing task interface, then apply them together with Undo. Opening a page from another page is a useful local relationship signal. It does not require transmitting browsing metadata to a remote service or letting similarity overwrite a user's task structure.

## Arc integrates narrow actions into existing work

Arc Max allows individual features to be enabled. Tidy Tabs is invoked from the sidebar and affects only Today Tabs. Tidy Tab Titles renames a tab when it is pinned, and Tidy Downloads automatically renames downloads once enabled, with an undo action. Arc says Max sends data to AI partners. Some features are macOS-only, so these are interaction precedents rather than Linux implementation examples. [Arc Max help](https://resources.arc.net/hc/en-us/articles/19335160678679-Arc-Max-Boost-Your-Browsing-with-AI).

Arc's macOS release notes record removal of Ask On Page on 28 August 2025. Older lists of Arc AI features therefore should not be treated as its current offering. [Arc release notes](https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes).

Design implication, inferred: put assistance at a useful moment, such as saving a page or writing a resumption note. For Tern, offer an editable short label before saving. Preserve the original title and URL so a generated label cannot erase identifying information. There is little reason to introduce a permanent assistant panel for this job.

## Dia illustrates the difference between local storage and local inference

Dia offers chat on demand and uses browsing context, chats and history for its answers. [Dia getting started](https://www.diabrowser.com/getting-started). Its security page says conversations and browsing data are stored locally by default, but requests and relevant context pass through Dia servers to model providers. Some features, including Morning Brief, send context proactively. Memory summaries are created on servers and stored locally. The same page says sharing content to improve Dia is enabled by default and can be disabled. Its homepage shows an illustrative settings view with content sharing off; use the explicit security description when discussing the default. [Dia security](https://www.diabrowser.com/security), [Dia homepage](https://www.diabrowser.com/).

Design implication, inferred: Tern should describe where each operation runs. "Stored locally" does not answer whether the page was sent away for processing. A user-invoked comparison of selected references has a clearer scope than a background assistant interpreting the whole browsing history. These documents do not establish that every answer contains sufficiently precise source citations; Tern would need to implement and evaluate that separately.

## Brave provides a useful local-provider precedent

Brave Leo supports user-configured models, including local servers such as Ollama. Users provide a model name and endpoint in settings. This needs a serving framework and installed model; it is not a zero-setup embedded runtime. [Brave BYOM instructions](https://support.brave.com/hc/en-us/articles/34070140231821-How-do-I-use-the-Bring-Your-Own-Model-BYOM-with-Brave-Leo). Leo also lets users mention particular tabs as context. [Brave desktop changes](https://brave.com/whats-new/desktop/).

Brave's privacy policy distinguishes page processing from tab management. Hosted page assistance sends page content and prompts to Leo's backend; tab management sends non-private tab titles and URLs. Locally stored conversation history is a separate setting. The policy permits brief caching of large prompts, so "no retention" should not be paraphrased as "nothing ever leaves the device." [Brave browser privacy policy](https://brave.com/privacy/browser/). Brave explicitly warns that Leo can produce inaccurate answers. [Leo FAQ](https://brave.com/leo/).

Design implication, inferred: an optional local model endpoint is reasonable for later note drafting or selected-page comparison. Keep the basic task workflow usable without installing a model. Small built-in classification and search models may serve ordinary organization better than requiring everyone to manage an LLM server.

## What to carry into Tern

The closest fit is assistance attached to an existing action: suggest the task when saving a page, find a remembered reference from a rough description, or draft a resumption note from selected evidence. Model output should remain a proposal. Each result should expose its source page or note, and a rejected suggestion should stay dismissed unless relevant inputs change.

Task ordering needs a stronger basis than topic similarity. First support explicit user order, dates and next steps with ordinary code. If AI later proposes a different order, show the reason and let the user apply it. The reviewed documentation does not establish that inferred task urgency or automatic Active/Later/Settled transitions are reliable.

Evaluate on Tern's actual jobs: successful reference retrieval, accepted task assignments, correction effort and time to resume. Track local latency, model download size, memory and cancellation behavior on target Linux hardware. Retain ordinary search and manual organization when inference is disabled, unavailable or uncertain.
