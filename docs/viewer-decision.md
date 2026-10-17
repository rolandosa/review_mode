# Viewer decision: Vault document viewer vs. an alternate viewer

**Decision:** Review Mode uses its own viewer, built on [pdf.js](https://mozilla.github.io/pdf.js/). It renders the document's
viewable rendition and reads and writes Vault annotations through Vault API. It does not embed the standard Vault document viewer.

## Can the Vault document viewer be used in a Custom Page?

Not in a supported way. These are the options I checked, against the Vault Developer Portal (26.2) and a PromoMats sandbox:

| Option | Result |
| --- | --- |
| **Viewer component in the Vault Web SDK** | None exists. `@veeva/vault` 26.2 exports only `definePage` and `vaultApiClient`, plus `sendEvent`/`pageContext` on the page parameters. It has no viewer, annotation, or document UI component. |
| **iframe the Vault UI document page** (`/ui/#doc_info/{id}`) | `/ui/` returns `X-Frame-Options: SAMEORIGIN`, so a Custom Page could technically frame it. But it would load the entire Vault app (header, navigation, doc info panels) inside your page. The page could not tell it which page or annotation to show, read the reviewer's position, or react to anything in it. Full-screen, coverage tracking, and keyboard shortcuts would stop at the iframe boundary. It is also unsupported, so any Vault release could break it. |
| **Vault External Document Viewer** (PromoMats/MedComms) | Built for anonymous public distribution. It needs the *Public Distribution* and *View-Based User* license features and per-document tokens, it shows **only the latest steady-state version** (so not the drafts that reviewers actually review), and it can't display or create annotations. |

## Does the alternate viewer give reviewers significant benefits?

Yes. Everything below works on the same data as the standard viewer: annotations created here are ordinary Vault annotations
on the same document version, and they appear in the standard viewer straight away.

| Reviewer need | Standard viewer | Review Mode |
| --- | --- | --- |
| Full screen | Browser zoom; Vault chrome stays visible | Real full-screen of the workspace (Fullscreen API), with an *immersive* fallback that covers the Vault header if the browser refuses full-screen |
| Proof of complete review | None | Per-page **coverage tracking**: a page counts as reviewed after 1.2 s at ≥50% visible (or filling ≥60% of the viewport). A coverage strip, **Next unreviewed** (`U`), and a check mark on each page show progress |
| Moving through findings | Click through the panel | `N`/`P` step through annotations in reading order, filtered by type, open/resolved, mine, or text, and the page scrolls to each mark |
| Keyboard-first review | Limited | Shortcuts for navigation, zoom, tools, panel, and search (`?` lists them) |
| Finding text across the document | Per-page find | Whole-document search with a result count, per-page snippets, and character-level highlights on the page |
| Triage | Annotation list | Filter chips with counts (notes / links / anchors / other), open / resolved / all, **mine**, and free-text filter; grouped by page |
| Long documents | Paged | Continuous scroll; only pages near the viewport keep a canvas, so memory stays flat |
| Context switching | Library → doc → viewer | Built-in picker: the reviewer's open workflow tasks, document search, and recently reviewed documents. Deep links work too: `#custom/page/review-mode?doc=123&version=0.3` |

## What stays in the standard viewer

These are left out on purpose. The toolbar's **Open in Vault** button takes the reviewer to the same document version for them:

- **Completing workflow tasks and verdicts / e-signatures.** These carry regulated, configuration-specific rules, so they stay in Vault's own UI.
- **Creating links, anchors, claims and suggested links.** Review Mode shows these and lets reviewers filter, navigate, and reply to them, but only creates *notes* (sticky, area, page-level).
- **Text-selection notes.** Custom Pages run in a shadow root, and browsers don't yet report selections inside one consistently. Use the area tool to mark text.
- **Video, audio and HTML documents.** Review Mode needs a PDF viewable rendition.
- **Document compare and version-to-version annotation carry-forward.**

## Risks and mitigations

- **pdf.js worker under Vault's CSP.** The worker script is bundled inline and started from a `blob:` URL. If the CSP blocks
  that, pdf.js falls back to parsing on the main thread (`src/pdf/pdfjs.js`). Rendering still works, but large files load more slowly.
- **Protected renditions.** The rendition endpoint returns the protected rendition by default, the same one the viewer shows.
  Overlays and signature pages follow Vault's own settings.
- **Coverage is a reviewer aid, not an audit record.** It is stored in the reviewer's browser (`localStorage`) per user and
  document version. If it has to be auditable, persist it to a custom object via a `PageController` (see README, *Extending*).
- **API usage.** All calls go through `vaultApiClient` with the client ID `review-mode-custom-page` and count against Vault API
  rate limits. Opening a document takes 3–4 calls: metadata, rendition, annotations, user names.
