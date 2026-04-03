# PhysioOS - Claude Guidelines

## Issue / Ticket Creation

Every issue or ticket **must** include:

1. **Title** - Clear, concise summary of the work
2. **Description** - What needs to be done and why
3. **Details** - Technical context, affected areas, relevant links
4. **Acceptance Criteria** - Clear, testable conditions that define "done"
5. **Label** - One of: `bug`, `enhancement`, `feature` (required)

### Workflow

- The user will typically describe what they need in plain language. You are responsible for fleshing out the full ticket (title, description, details, acceptance criteria, label).
- If **technical details** are unclear, consult the **tech-lead** agent before proceeding.
- If **UI/UX** is unclear, check the UI guide first; if still unclear, consult the **design-system-architect** or **product-manager** agent.
- If **product requirements** are unclear, confirm with the **product-manager** agent.
- **Do not start work on any ticket that is missing required fields.** Ask for clarification first.

## Sprint Workflow

- Sprint tickets live in `docs/s{N}-tickets.md` (e.g., `docs/s3-tickets.md`). This is the source of truth for sprint scope.
- **GitHub Issues** are only for tracking new issues **outside** sprint scope (bugs, ad-hoc requests, etc.).
- Do not create GitHub Issues for sprint tickets — work from the `s{N}-tickets.md` file directly.
