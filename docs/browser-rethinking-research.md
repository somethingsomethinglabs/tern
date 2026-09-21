Research collected 21 September 2026. Product descriptions below come from official documentation, not hands-on comparative testing. Interpretations and proposals are identified separately. Historical and academic details are in [the companion note](browser-history-research.md).

The working hypothesis is that tab overload combines several problems: remembering unfinished work, retrieving sources, preserving a line of investigation, switching activities, and managing live applications. Domain sorting addresses one retrieval problem. It does not describe why pages belong together.

Evidence supports investigating this hypothesis. The CHI 2021 paper [When the Tab Comes Due](https://josephcc.com/static/papers/233987809/paper.pdf) reports conflicting pressures to retain tabs and close them, based on interviews with 10 information workers and a survey of 103 people. Treat this as evidence about observed practices, not a claim that everyone should have fewer tabs.

A particularly relevant newer study is [From Tabs to Structures, CHI 2026](https://doi.org/10.1145/3772318.3791979). Its Gstell probe combines a temporary Shelf with groups that can emerge later. A field experiment with 29 knowledge workers supplies early evidence for accommodating uncertain relevance instead of demanding immediate filing. It does not establish a universal or lasting productivity benefit.

| Approach | Verified example | Interpretation and tradeoff |
| --- | --- | --- |
| Organize by activity | [Vivaldi Workspaces](https://vivaldi.com/features/workspaces/) holds separate sets of tabs, with stacks and tiled layouts; workspaces persist across browser closes. | A project can span many websites. Users still have to decide which workspace owns ambiguous material. |
| Separate activities and accounts | [Zen Workspaces](https://docs.zen-browser.app/user-manual/workspaces) can use containers, and [Split View](https://docs.zen-browser.app/user-manual/split-view) places pages together. | Useful for concurrent accounts and comparison, though a workspace can still accumulate clutter. |
| Preserve where a page came from | [Tree Style Tab](https://github.com/piroor/treestyletab) makes links opened in new tabs children of their source tab, with collapsible branches. | A browsing trail may preserve task context better than domain order. Link ancestry is still only a guess about intent. |
| Make quick lookups temporary | [Zen Glance](https://docs.zen-browser.app/user-manual/glance) previews a link over the current page and can promote it to a tab or split. | Users can inspect a source without treating every lookup as continuing work. |
| Separate lasting resources from temporary tabs | [Arc Auto Archive](https://resources.arc.net/hc/en-us/articles/19228855311127-Auto-Archive-Clean-as-you-go) archives idle unpinned tabs; [pinned tabs](https://resources.arc.net/hc/en-us/articles/19231060187159-Pinned-Tabs-Tabs-you-want-to-stick-around) persist. | A useful lifecycle distinction, but automatic removal depends on confidence in recovery. |
| Make previously read content retrievable | [Min](https://minbrowser.org/) offers local full-text search of visited pages, task groups, and focus mode. | Search could reduce the need to keep a page visible just to find it again. This does not itself preserve application state. |
| Put research on a canvas | [Kosmik's browser documentation](https://www.kosmik.app/faq/browser-and-built-in-web-capture) describes capturing page elements onto a canvas with source links. | Useful for visual evidence and comparisons; arranging material also creates work. |
| Synthesize across sources | [Dia](https://www.diabrowser.com/) advertises answers and reports using tabs and connected tools, plus remembered split layouts and project groups. | Could reduce manual comparison. User-visible sources, corrections, and control over context remain essential design requirements. |

Availability matters. [Vivaldi offers Linux downloads](https://vivaldi.com/download/); [Zen supports Linux and labels itself beta](https://zen-browser.app/download/). Tree Style Tab is a Firefox extension. Dia's current homepage lists Apple macOS 14+ with M1 or later. [Arc's homepage](https://arc.net/) now says it receives Chromium updates only and directs users to Dia for active security patches. [Kosmik's shutdown notice](https://launchpad.kosmik.app/) says it sunsetted on 31 May 2026. Arc and Kosmik are included as design precedents, not daily-browser recommendations.

PWAs address a different boundary. They support installing a web application, standalone windows, and capabilities such as offline operation, depending on implementation. [MDN's overview](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app). Interpretation: putting email and a document editor in separate app windows still leaves the user to relate them to the same task.

Resource management is also distinct from information management. Chrome already [deactivates inactive tabs with Memory Saver](https://support.google.com/chrome/answer/12929150?hl=en). Interpretation: a system can preserve access to information while loading fewer pages, but sleeping tabs alone do not preserve the user's purpose or next action.

An older precedent is Vannevar Bush's 1945 memex proposal: named associative trails with branching, commentary, replay, and sharing, including an item in multiple trails. [Original text, section 7](https://www.w3.org/History/1945/vbush/vbush7.shtml). The lesson for this project is to retain useful relationships and conclusions, rather than only URLs.

Proposed experiment, not an implemented feature or claim of novelty:

1. Let a user start a named activity, such as "Choose a browser for work". Naming can happen later.
2. Record pages opened from that activity as an editable trail. Offer a temporary place for uncertain material without demanding a category.
3. Keep selected sources, short notes, and the next action with the activity. Allow a source to belong to more than one activity.
4. Let the user put the activity away after confirming what is saved. Separate saved references from live pages and make restoration limits explicit.
5. Resume with a short account of what was being done and selected pages, rather than reopening every visited page.

Do not assume that closing and reopening a URL restores unsaved forms, application state, scroll position, or navigation history. Rich capture would require additional permissions and careful user controls beyond Quicktabs' current design. Keep this experiment separate from the existing extension's release work.

Evaluate one real task in Vivaldi, Zen, and Firefox with Tree Style Tab before proposing another browser. Measure time to resume after an interruption, time to find a source, organization effort, and lost context. Tab count is a secondary metric. The research supports investigating lower-cost context recovery, but it does not demonstrate that this proposed combination is unique or better than existing tools.
