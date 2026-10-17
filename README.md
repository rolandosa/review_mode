# Review Mode — a Vault Custom Page for document review

Review Mode is a full-screen, keyboard-driven workspace for reviewing Vault documents, for example in PromoMats MLR review.
It renders the document's viewable rendition with pdf.js and works directly on Vault annotations. Reviewers can read, filter,
reply to, resolve, and create notes, and the page tracks which pages they have actually reviewed.

**Why not the standard document viewer?** It can't be embedded in a Custom Page in a supported way, and the alternate viewer
brings real benefits for reviewers. See [docs/viewer-decision.md](docs/viewer-decision.md).

## Features

- **Full screen** (`F`): the Fullscreen API on the workspace, with an immersive fallback that covers the Vault header.
- **Review coverage:** each page is marked reviewed after a short dwell. A coverage strip and **Next unreviewed** (`U`) help reviewers make sure nothing was skipped.
- **Annotation navigator:** filter by type, state, author, or text. `N`/`P` step through findings in reading order, and each one is highlighted on the page.
- **Threads:** read replies, reply, and resolve or reopen notes inline.
- **Create notes:** sticky (`S`, click), area (`A`, drag), or page-level (`G`). Notes are saved to Vault as standard `note__sys` annotations.
- **Whole-document search** (`/`) with per-page snippets and highlights.
- **Continuous scroll** with fit-width, fit-page, and zoom (`0`, `9`, `+`, `-`). Pages render lazily.
- **Time on task:** while the document is on one of the reviewer's open workflow tasks, Review Mode measures active review time and saves it to Vault. See *Review time tracking* below.
- **Document picker:** every document task assigned or available to the reviewer (labelled *Assigned* / *Available*, with due date), VQL search, and recent documents. Deep link with `?doc=<id>&version=<major.minor>`.

## Review time tracking

When a reviewer opens a document that is on one of their open workflow tasks (assigned to them, or available for them
to accept, as returned by `/objects/objectworkflows/tasks?assignee__v=me()&status__v=available__v,assigned__v`),
Review Mode measures how long they actually work on it:

- **Active time** counts one second at a time, but only while the page is visible, the browser window has focus, and the reviewer
  has interacted with the workspace in the last 60 seconds: mouse movement, scrolling, keys, touch, typing, or creating, replying
  to, or resolving annotations. Activity elsewhere in Vault doesn't count.
- **Open time** counts every second the page is visible, so you can compare it with active time.
- Each review session creates one **Review Time Log** (`review_time_log__c`) record on the first active second, then updates it every
  30 seconds and when the reviewer hides or leaves the page. The record carries the document, version, task, workflow, active and
  open seconds, annotations created, replies added, pages viewed, session start and last activity. `created_by__v` is the reviewer.
- The reviewer sees a **Time on task** indicator in the bottom bar. It pulses while active, shows *paused* when idle, and flags
  failed saves. Nothing is tracked on documents without an assigned task.

Total active review time per task, across sessions:

```sql
SELECT task_id__c, task_label__c, document_number__c, created_by__v, active_seconds__c, open_seconds__c
FROM review_time_log__c WHERE workflow_id__c = '1234'
```

Sum `active_seconds__c` by `task_id__c` (or build a Vault report on the object grouped by task and created-by).

Reviewers need **Create** and **Edit** on *Review Time Log* in their permission set. Without it, the indicator shows *not saved* and
review itself is unaffected. The idle window is `IDLE_AFTER_MS` in `client/src/hooks/useEngagementTime.js`.

## Project layout

```
client/                      Custom Page client code (React + pdf.js, bundled with esbuild)
  src/index.jsx              definePage entry point
  src/App.jsx                URL parsing, picker vs. workspace
  src/api/vault.js           Vault API calls (documents, renditions, annotations, VQL)
  src/pdf/pdfjs.js           pdf.js loader (inlined worker, main-thread fallback)
  src/pdf/geometry.js        Vault placemark <-> screen coordinate conversion
  src/components/            Workspace, page renderer, panels, coverage bar
  src/hooks/                 Full screen, keyboard shortcuts, review progress
  dev/                       Local harness that mimics the Custom Page runtime
  distribution-manifest.json
components/                  MDL for the Page, Tab and Review Time Log object
docs/viewer-decision.md      Viewer evaluation and trade-offs
```

There is no server code. The page needs no `PageController` because everything goes through `vaultApiClient`, which runs as the
signed-in user with their own permissions.

## Build and deploy

Requirements: Node.js 20+, a sandbox Vault, and an Admin session with permission to deploy code.

```sh
cd client
VAULT_HOST=myvault.veevavault.com VAULT_SESSION=<session id> ./deploy.sh
```

`deploy.sh` runs `npm ci && npm run build`, uploads `distribution.zip` to `/api/v26.2/uicode/distributions`, and runs the MDL in
`components/` to create the `review_time_log__c` object and the `review_mode__c` Page and Tab. Then:

1. **Admin → Users & Groups → Permission Sets:** give reviewer permission sets *View* on the *Review Mode* page and tab, and *Create*/*Edit* on the *Review Time Log* object.
2. Open the **Review Mode** tab, or deep link: `https://<vault>/ui/#custom/page/review-mode?doc=1234`.
3. Optional: add `disable_chrome(true)` to the Page MDL to hide the Vault header permanently. Full-screen mode hides it on demand either way.

To link to Review Mode from documents, add a document *web action* (Admin → Configuration → Web Actions) with the URL
`https://${Vault.domain}/ui/#custom/page/review-mode?doc=${Document.id}&version=${Document.major_version_number__v}.${Document.minor_version_number__v}`.

## Local development

The harness serves the bundle inside a shadow root, stubs the Web SDK runtime, and proxies `/api/*` to a real Vault:

```sh
cd client
npm install
VAULT_HOST=myvault.veevavault.com VAULT_SESSION=<session id> npm run dev
# open http://localhost:5173/?doc=<document id>
```

## Extending

- **Auditable coverage:** add a `PageController` and an `onEvent('pageViewed')` handler that writes to a custom object. Then replace the `localStorage` calls in `src/hooks/useReviewProgress.js` with `sendEvent`.
- **Task completion:** call the workflow task actions API (`/objects/objectworkflows/tasks/{id}/actions/...`) from the picker or the toolbar. Check the verdict and e-signature configuration for your workflows first.
- **Text-selection notes:** `src/pdf/geometry.js` already converts screen rectangles to quad points. Adding `text__sys` placemarks needs the selection ranges from the text layer, plus `text_start_index__sys`/`text_end_index__sys`.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `J` / `K`, `PgDn` / `PgUp`, `Home` / `End` | Next / previous / first / last page |
| `N` / `P` | Next / previous annotation |
| `U` | Next unreviewed page |
| `/` | Search document text |
| `F` | Full screen |
| `+` / `-`, `0`, `9` | Zoom, fit width, fit page |
| `V`, `S`, `A`, `G` | Select, sticky note, area note, page note |
| `[` | Toggle side panel |
| `?` | Shortcut help |
| `Esc` | Cancel / clear / exit immersive mode |
