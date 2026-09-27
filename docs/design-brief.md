# Tern design brief

Selected by the user on 21 September 2026: option three, "Settle & Resume". The [original mockup](../design/settle-and-resume.png) remains unchanged, including its original concept label.

Help people move between ongoing activities without losing their place. Keep existing websites, HTML interfaces, addresses, links, and normal navigation accessible. Tasks provide context around those sites.

The left sidebar takes inspiration from T3 Code's task threads and settled work. Show active tasks, work put aside for later, and settled tasks. A task can contain pages from different domains. Expand it to find its pages, notes, and relevant sources.

Keep task state, page state, and AI state visibly distinct. An assistant finishing does not mean a form is saved or a task is complete. Pair state icons with clear text such as "Needs attention", "Unsaved changes", "AI ready for review", or "AI stopped".

The selected interaction is pausing a task containing an unfinished form. Offer to keep the page open and retain a short "Where I left off" note. Saving references or keeping a page open must never be presented as saving the form itself. Settled means the person considers the task finished; paused work remains available to resume.

AI assistance belongs to a task and uses a visible scope of selected sources. Recaps should link to evidence and be editable. Suggestions and background results need review before actions such as submitting a form. Ordinary browsing must remain usable without AI.

Preserve the visual direction: graphite browser chrome and sidebar, readable original website content, a light task drawer, restrained amber attention states, and teal primary actions. Use compact task rows and clear dividers. Do not redesign every website into the browser's own cards.

The first prototype should demonstrate:

1. Opening and switching between two tasks with their own page lists.
2. Editing a sample website form and seeing an explicit unsaved state.
3. Pausing that task while keeping the form open and recording a next step.
4. Returning to the task and continuing the form without losing the prototype's edits.
5. Finishing the task and moving it into Settled.

Use controlled sample sites for this interaction test. Before claiming support for arbitrary websites, investigate what state signals are available and how trustworthy they are. A leave-page warning is not a universal draft-detection or preservation API. Browser crashes, expired sessions, and site navigation may still lose unsaved state. These are engineering questions to resolve, not capabilities promised by the concept.

Keep the first experiment focused. Browser-engine selection, real AI integration, persistence across restarts, and permission design remain open. Do not inherit Quicktabs' release status or assume its narrow extension permissions support these new behaviors.

Always provide clickable file links when sharing design options with the user.

Reference: [T3 Code thread sidebar documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md). Research sources are preserved in the companion notes.
