# Optional AI adapter and source-indexed proposal contract

Locus has no preconfigured AI service. The default generator is explicitly **offline rule-based**; the three curated samples are explicitly **authored demos**. Neither is described as a live model result. The actual model ID field starts empty. Preference labels such as “Opus 5.5” or “Astra” are not assumed to be real provider IDs.

## Two usable workflows

1. Already-configured endpoint: the user provides a real HTTPS endpoint and model ID. The app asks before sharing the complete material and scene description.
2. No endpoint: prepare the local prompt package, copy/download its text and JSON Schema, use it in a separately configured model tool, then paste the returned JSON back into Locus. Preparing a package makes no network/model call.

Endpoint/model configuration stays in page memory. There is no token input, provider SDK, credential creation, saved Authorization header or copied application storage. No live provider was called during the tests.

## Source indexing, reconstruction and budgets

`prepareIndexedSegments()` indexes the source locally. A segment has an ID, exact source text, protected tokens and continuation flags. The model groups segment IDs into meaningful units. It never computes UTF-16 offsets or rewrites the source.

For a necessary split inside a segment, a part may include an exact `quote`. That quote must occur exactly once in its segment. Ambiguous/repeated quotes require more context or whole-segment grouping. Unknown IDs, paraphrases, duplicate coverage, omitted substantive characters, broken Unicode surrogate pairs and reversed order are rejected. Adjacent spans are coalesced to preserve the original whitespace rather than inserting synthetic line breaks.

The proposal must echo the input `sourceFingerprint`, `sceneId` and `sceneVersion`. The fingerprint detects accidental reuse of a proposal after material/title changes; it is a non-cryptographic consistency check, not a signature or authenticity claim.

Hard request limits:

- 12,000 source UTF-16 characters
- 240 indexed segments; at most 600 characters each
- 24,000 estimated input tokens (a documented heuristic, not a provider tokenizer)
- 12,000 output-token contract passed to the adapter
- Maximum units/cues is computed from selected scene capacity
- 2 MB returned text limit and 90-second UI timeout

Oversized material is not truncated or sent. The UI suggests dividing it into separate palaces or continuing with offline review. The broader offline input limit is 200,000 characters.

## Request contract

POST JSON with `Content-Type: application/json`:

- `operation`: `locus-semantic-proposal-v1`
- `model`: the exact user-entered model ID
- `instructions`: trusted application guidance from `INDEXED_MODEL_INSTRUCTIONS`
- `data.source`: title, fingerprint, totalCharacters and indexed segments
- `data.scene`: ID/version and rich anchor landmark descriptions, affordances, topology, executable relation IDs, capacity and actual verification status
- `data.budget`: request limits and estimated size

The endpoint must already implement this contract; this is not a native provider SDK endpoint. It must route instructions as instructions and source/scene descriptions as untrusted data. It handles its own existing server-side authentication. Browser requests omit cookies and Authorization headers, reject redirects, and require HTTPS (or current-origin HTTP for local development). URLs containing credentials, query strings or fragments are rejected. Cross-origin endpoints need appropriate CORS configuration.

## Compact response

Return a JSON object, optionally wrapped under `plan`:

- format: `locus-semantic-proposal-v1`
- sourceFingerprint, sceneId, sceneVersion: exact input values
- units: `{id,title,question,parts:[{segmentId,quote?}]}`
- cues: `{unitId,anchorId,relationId,object,action,rationale,visual}`

The exact downloadable schema is `MODEL_PROPOSAL_SCHEMA` in `src/lib/palaceModelProposal.ts`. A unit ID is a nonempty safe identifier. Parts must cover every substantive source character exactly once and preserve source order. Each unit gets one cue. Anchor route order must remain non-decreasing, including ordered procedures.

Locally, the normalizer reconstructs authoritative spans and verbatim facts, resolves the anchor's cue volume and relation label, and runs the full plan validator. Model-supplied facts/full-source fields are ignored. All model/imported approvals are discarded; a new draft is unreviewed.

`relationId` must be an executable relation: `ordered-row`, `orbit`, `frame` or `rise`. Landmark affordances are inspiration, not a claim that an arbitrary animation is implemented. The rationale should distinguish a visible object/motion from imagined narrative.

Shapes: box, sphere, cone, ring, book, key, scale, chain, bridge, shield, clock, water, cart, force-pair. Color is `#RRGGBB`; motion is none, pulse, spin or bounce. Remote models, HTML, code and URLs are not part of this proposal format.

## Full-plan JSON and backup compatibility

The importer still accepts the strict `schemaVersion: 1` complete-plan format. In that format `source.text` must exactly match the input, quotes must match UTF-16 slices and facts must match span quotes. This legacy format is not the preferred live-model protocol.

A plain JSON import is labeled **structured import**, with no assertion about who generated it. Only a response from the configured request receives **model-assisted** provenance. Source-linked demo plans remain **authored-demo** through backups and exports.

## Review, errors and persistence

Editing titles/questions clears the unit and cue approval; editing a cue clears its approval. Split/merge regenerates offline cues and clears all approval. Source and scene changes invalidate prepared prompt packages. Navigation/reload prompts protect unsaved work. Canceled/stale provider responses cannot replace current work.

Saving validates again and writes the source plan/cards in one IndexedDB transaction. Replacing existing cards asks first and warns that prior review progress is replaced. Backup import validates all metadata and assets before writing, remaps blob IDs and uses a single abortable transaction. Source facts and creative cues stay separate.

## Tests

Run `node --import ./node_modules/tsx/dist/loader.mjs --test tests/*.test.ts`.

The provider tests inject mock transport; they make no real network/model requests. Tests cover source reconstruction, Unicode, ambiguous subquotes, stale source/version rejection, budgets, cancellation, review gates, scene capacity/order, backup roundtrip and malicious asset references.

## App practice and existing-data safety

Semantic cards can group several units at one anchor, but practice, scoring, review counts, reveal counts and due dates are now per unit. The app and standalone viewer both reveal one source unit at a time. Source questions/cue prose are withheld until reveal; explicitly assigned cue images/models appear before reveal for the selected unit; answer references remain hidden until reveal (models use an explicit post-reveal button in the app). Legacy unassigned media defaults to reference. Legacy cards without semantic metadata continue to work.

Review sessions carry unit IDs plus a plan-content fingerprint. Malformed storage is rejected, stale source/anchor bindings rebuild the queue with a notice, and late route/unmount callbacks cannot overwrite a different page's practice state. Statistics are labeled self-rated recall, not measured mastery.

The old v1 database upgrade no longer drops cards. It reads legacy rows and blob references first, then copies to compound keys and creates indexes in one versionchange transaction. Ambiguous mappings stop the upgrade; orphaned cards are made reachable through a recovered palace. Emulator tests prove that a failure after replacing the store rolls back to version 1 with its original records. This cannot recover data already deleted by an older version before this repair.

`fake-indexeddb@6.2.5` is a development-only Apache-2.0 dependency installed from the official npm registry with scripts disabled. Its tests are pure database emulation, not browser or device durability tests. Run all source tests with `npm test`.

## Structured semantic review (current contract)

The preferred compact cue now contains `imaginedAction`, `sourceMappings:[{quote,explanation}]`, and `notEncoded`, in addition to object, rationale, anchor/relation IDs and visual enums. `action` remains a legacy alias; normalization keeps it equal to imaginedAction. A mapping quote must be exact evidence from that unit, and full clauses should be quoted so a threshold, negation or exception keeps its scope.

The app derives its own full-clause source checklist and `renderedDescription`. A model cannot replace either the original evidence or the actual-rendering description. Locally derived categories are incomplete hints, never an exhaustive semantic analysis. The renderer description accounts for orbit movement, rise's periodic bounce override, and reduced-motion behavior.

Each clause requires an explanation of how the cue helps, or an explicit admission that the clause is not visually encoded and must be rehearsed verbally. Separate confirmations cover actual rendering versus imagined narrative and unencoded details. Model/imported confirmation flags are always cleared. After the complete canonical source mapping, actual rendering and unencoded-detail summary is visible, one explicit per-unit action can acknowledge all three together. The shared acknowledgeSemanticUnit helper verifies the canonical checklist and rendering description before setting that unit and cue flags. Individual controls remain available in a disclosure. There is no all-unit approval and no automatic approval on import. A checked box records human acknowledgment; it is not empirical proof that a mnemonic is correct.

Structural validation still cannot determine whether an arbitrary creative rationale reverses a threshold or exception. The review UI says this explicitly. Merely setting `reviewed=true` is insufficient for final saving/exporting. Editing source prompts, cues, anchors or scene versions clears affected confirmations. Total semantic checklist items are capped at 240; oversized material must be split rather than truncated.

The main editor now shows one fragment at a time, with pending-category status, previous/next-unreviewed navigation and a prominent contextual preview. The preview uses the same FpsWorld scene and cue renderer as practice, with silent drag-only input; it neither persists nor approves the draft. A failed WebGL preview falls back to clearly labeled static scene imagery and renderer-derived text. Browser interaction remains a separate acceptance test.

After reviewing, the third step saves the palace and exposes the independent HTML download directly. Users do not need to discover an export control inside the 3D map. Source originals, scene references, model-free fallback status and output-file confidentiality remain visible.

## Optional visual context ZIP

`buildVisionContextBundle()` in `palaceVisionPackage.ts` accepts an authoritative version-matched `SceneVisualContextManifest` plus an injected same-origin asset loader. It checks each real image's path, byte length, SHA-256, dimensions, camera metadata and cue-volume binding before packaging.

The ZIP contains prompt.txt, proposal.schema.json, source.json, scene-context.json, a README and actual overview/anchor images. It is not a live vision-model run. Users must attach the real images to a separately configured vision-capable interface; filenames alone do not supply vision input. Image token costs are not included in the text-token estimate. Reference renders use Blender diagnostic lighting and explicitly retain browserVerified=false.

`tools/buildVisionContextExamples.ts` performs a filesystem-only packaging check for the supplied scenes. It neither launches a browser nor invokes a model.


## Attachment bindings

`CardRecord.attachmentBindings` stores `{assetId, unitId?, scope?:'anchor', role:'cue'|'reference', sourceFingerprint?}` per file and scope. Semantic cues require the current exact source fingerprint and either a stable unit ID or an explicitly chosen whole-anchor scope. A per-unit reference overrides an anchor-wide cue. An attachment with only sibling-unit bindings is absent for the selected unit, even after reveal; missing legacy bindings default to answer reference. Missing or unknown roles become safe references; unknown IDs, duplicates and stale cue provenance fail backup validation. Runtime suppresses stale scoped assignments before loading them.

The same file can be a cue for one unit and a reference for another. Role confirmation is separate from text/scene semantic approval. New or changed cue assignments require an explicit warning/confirmation because they become visible before answers. MPALACE preserves bindings and remaps their asset IDs with imported blobs. The app's attachment-only editor preserves source facts verbatim. Images selected by the resolver appear in the recall panel and as a bounded plane at the actual anchor; users can choose which visible image or model to display. Reference assets remain gated by reveal. Image planes take priority over other attachments at the same anchor, and clearing them restores models/props. Arbitrary imagery is user-authored and is not claimed to have semantic correctness proven by the app.


Plan replacement reconciles uploads within the same transaction as cards/source. Exact units with unchanged source keep file mappings; moving a unit retains its mapping but demotes cue use to reference until explicitly reconfirmed. Split/removed units, changed source and competing models are retained in `PalaceRecord.unassignedAttachments` with source fingerprint, prior units/locus and a reason. MPALACE includes every retained blob and remaps IDs on restore. The app attachment chooser can reassign these files as references. Standalone practice exports include only assigned assets and disclose the unassigned count. Transaction failure restores previous cards/archive metadata and never deletes uploaded blobs.
