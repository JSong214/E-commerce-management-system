# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

> To switch to GitHub Issues, GitLab Issues, or another tracker later, run `/setup-matt-pocock-skills`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Record agent ownership clearly on each ticket when relevant (`Owner: Antigravity (frontend)` / `Owner: Codex (backend)` / `Owner: Shared`)
- Triage/work state is recorded as a `Status:` line near the top of each issue file (`ready-for-agent`, `in-progress`, `done`, `blocked`)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
