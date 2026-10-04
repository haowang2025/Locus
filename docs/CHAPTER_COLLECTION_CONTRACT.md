# Local chapter collection contract

Status: shared partition/coverage/import functions are implemented. The portable Studio integrates chapter suggestions and one active chapter at a time, with separate HTML exports. Main-app batch database creation and a multi-chapter training HTML are not implemented.

## API

`partitionMaterial(source, budget?)` returns `ChapterCollection`.

- Full original `source` is retained once.
- `sourceFingerprint` identifies material/title consistency.
- `collectionFingerprint` additionally identifies chapter boundaries and budgets, so changing the layout cannot accidentally reuse the same progress namespace.
- Every chapter has a stable-in-this-layout `chapter-###` ID, title, exact UTF-16 `span`, candidate unit count, readiness flag and warnings.
- All chapter spans are contiguous, non-overlapping and cover the entire original, including whitespace.
- A chapter quote is a local slice, not rewritten content.

Default preview budget: 12,000 characters, 36 candidate units per chapter, 120 chapters overall, with a 200,000-character source ceiling. Actual scene capacity should replace 36 at the caller. Headings are Markdown headings or explicit Chinese/English chapter labels; numbered procedure steps are not automatically treated as chapters.

The splitter groups whole locally detected source units. A single sentence/formula exceeding the character budget is retained intact and marked not ready for manual boundary selection. It is never silently cut to fit an API budget. Very large inputs fail with the original untouched.

`parseChapterCollection(value: unknown)` is the strict import boundary. It returns a fresh allowlisted collection; unknown fields are dropped and notices are generated locally. Source/title/reference lengths, safe HTTP(S) references without credentials, budgets, safe integer UTF-16 offsets, IDs and counts are checked before the local splitter rebuilds the canonical layout. V1 accepts generated layouts only: exact spans, titles, counts, readiness and warnings must match that reconstruction. Fingerprints are consistency checks, not authentication.

`validateChapterCollection(collection)` applies the same checks. Fractional offsets cannot exploit String.slice coercion, and recomputing a public fingerprint cannot legitimize a corrupt layout.

`materializeChapter(collection, chapterId)` returns the selected chapter's `PalaceSource` plus an `origin` record containing source and collection fingerprints, chapter ID/count, original start/end and total source length. It creates no palace, makes no model call and saves nothing.

## UI/persistence contract

1. Show the complete original and chapter boundary preview before generating anything.
2. Let the user choose one chapter, review its units/cues, then save a distinct palace or independent collection chapter.
3. Preserve the collection original and chapter origins in backups. Studio keeps one full collection alongside the active draft. Each separate portable HTML contains only the selected chapter and minimal origin metadata (source title, source/layout fingerprints, chapter ID/count and original offsets). The complete collection stays in the Studio backup, avoiding disclosure of unrelated chapters.
4. Namespace progress by collection fingerprint + chapter ID + unit ID. Plain `unit-1` repeats across chapters and is not a collection-wide ID.
5. Treat each reused scene as a separate study session. Only one chapter's facts/cues/progress should be active at once, with an explicit chapter title and choice screen.
6. Changing chapters must reset the reveal state and never display another chapter's answers or cue objects.
7. Distinct chapters/scenes can reduce confusion; reusing anchors is not a claim of unlimited memory capacity.
8. Model calls remain individually authorized and budgeted. Partitioning does not authorize automatically sending every chapter or making paid requests.
9. Cross-chapter procedure warnings must stay visible. Source order/relationships may need manual review rather than blind mechanical splitting.

The main app's over-capacity message recommends separate chapter palaces. Studio offers local suggestions, chapter selection and separate exports. Switching chapters replaces the active draft only after an explicit warning; it does not silently archive every plan or attachment. Download records are user confirmations, not evidence that the browser saved a file. Only the selected chapter is practiced; the full source remains available in the Studio workspace and backup.

Portable `chapterOrigin` stays outside `PalaceSource`/`PalacePlan`, containing the source title and exact minimal origin returned by `materializeChapter`. Before export, Studio validates the full collection and requires the selected plan source (including references) to match the materialized chapter. The standalone HTML cannot independently recover or verify the omitted full original; fingerprints identify consistency, not authenticity. The selected plan uses local offsets. Original offsets are derived before export, never trusted as user-entered provenance. Main-app plans do not yet store chapterOrigin.
