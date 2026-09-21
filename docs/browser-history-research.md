# Browsing beyond tabs: historical and research evidence

Research checked 21 September 2026. These notes distinguish reported findings from proposed design implications. Research prototypes are evidence about possibilities, not recommendations to install maintained products.

## Tabs have acquired several jobs

Chang and colleagues' CHI 2021 paper, *When the Tab Comes Due*, studied ten information workers through four walkthroughs of their open tabs over two weeks, followed by a survey of 103 participants. It describes competing pressures to retain tabs, including interaction and emotional costs, and to close them, including attention and computing resources. Tabs also act as reminders and representations of tasks. The authors argue that browsers should better represent complex task structures. This is a limited sample, not a population-wide prevalence estimate. [Author's paper](https://joe.cat/images/papers/tabs.pdf), [publication record](https://doi.org/10.1145/3411764.3445585).

Design implication, inferred: sorting by domain reduces visual disorder but cannot capture why a page matters. An email, spreadsheet, supplier page, and specification can all belong to one purchasing decision. Two pages on the same domain can belong to unrelated work. A product should help people preserve and resume that task context.

The same researchers explored task bundles, nested subtasks, prioritization, and scheduling in *Tabs.do*, UIST 2021. This is direct prior art for treating a group of tabs as a task. It means that a task-based successor to Quicktabs would also need a focused advantage rather than claiming a new category. [Author's paper](https://joe.cat/images/papers/tabs.do.pdf).

## Bush's 1945 memex preserved a line of thought

In *As We May Think*, Vannevar Bush described a proposed memex in which a person names a trail, links items into it, adds comments and side branches, and later revisits or shares the trail. One item can belong to several trails. It was a proposal using contemporary microfilm ideas, not a shipped electronic browser. [Original essay, section 7, archived by W3C](https://www.w3.org/History/1945/vbush/vbush7.shtml).

Design implication, inferred: preserve an investigation with its reasoning and useful excerpts. A replayable trail could answer “How did I reach this conclusion?” more directly than a chronological history of visited URLs. Automatic navigation history alone would not capture the user's reasoning; annotations or explicitly saved decisions would still matter.

## Engelbart treated the working record as part of thinking

Douglas Engelbart's 1962 *Augmenting Human Intellect* report treats tools, language, methods, and training as an interacting system. Its architect scenario includes an evolving, interlinked record of specifications, considerations, and design reasoning that another person can inspect and annotate. This part of the report is an illustrative proposed workflow, not a controlled experiment or a description of every feature of the later NLS system. [Original report at the Doug Engelbart Institute](https://dougengelbart.org/content/view/138/).

Design implication, inferred: judge a browser by whether it helps produce and revisit a useful working record, not solely by how many pages it can display. Saved comparisons, source-linked notes, decisions, and open questions could be part of a project alongside its live pages.

## Work can be the thing you suspend and resume

Bardram, Bunde-Pedersen, and Soegaard's CHI 2006 work implemented activity-based computing within Windows XP. It replaced the taskbar with an Activity Bar, grouped application windows, provided a zoomable interface, and supported moving activities between computers. The reported evaluation covered perceived usefulness and ease of use with interviews; it does not establish a universal productivity gain. [Original paper](https://interruptions.net/literature/Bardram-CHI06-p211-bardram.pdf), [authors' university publication record](https://pure.au.dk/portal/en/publications/support-for-activity-based-computing-in-a-personal-computing-oper).

Design implication, inferred: “Resume preparing the proposal” could restore its documents, pages, layout, and last recorded next step. This is a broader objective than restoring a list of URLs, and crosses the boundary between browser and operating system.

## Recent evidence favors allowing uncertainty

Rutishauser and Fritz's CHI 2026 *From Tabs to Structures* studied 29 knowledge workers, primarily students and IT professionals, over several weeks. Their Gstell probe pairs a temporary Shelf with a timeline of groups. People can save an uncertain page first and organize it later. The authors report that tab overload decreased for 13 of 28 participants and that most reported improved focus, even when tab counts did not decrease. These are initial field findings, not proof that everyone should adopt this interface. [Paper](https://doi.org/10.1145/3772318.3791979), [authors' account and results](https://hasel.dev/from-tabs-to-structures/).

Design implication, inferred: forcing a name and folder for every new thought may merely replace tab maintenance with filing. Offer a low-effort temporary holding place, retain context, and let structure emerge when the user knows what the material is for. Measure confidence in closing and ease of resuming, as well as tab count.

## The first web browser already supported creation

Tim Berners-Lee describes his 1990 WorldWideWeb browser as a graphical browser with editing and link creation. Reading and writing were together in the first implementation. [Berners-Lee's first-person account](https://www.w3.org/People/Berners-Lee/FAQ.html).

Design implication, inferred: a browser that lets people collect, connect, and write beside what they read revives an early ambition of the Web. This history does not imply a modern browser can edit arbitrary remote sites without authorization; personal annotation is a separate, feasible design choice.

## Evidence limits

The historical sources document ideas, not modern user outcomes. The empirical studies involve particular samples and short deployments. They support exploring task resumption, preserving reasoning, and deferred organization; they do not establish product demand or a winner among current browsers. Direct fetching of the two joe.cat PDFs returned HTTP 502 during this session, though primary-source excerpts were indexed. The parent research session successfully opened [an alternative author-hosted copy of When the Tab Comes Due](https://josephcc.com/static/papers/233987809/paper.pdf). The CHI 2026 publisher text was retrieved and cross-checked against the authors' laboratory page.
