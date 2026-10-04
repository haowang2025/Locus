import type { CueSemanticReview } from '../lib/palaceTypes'
/** Strict portable projection, excluding any unrecognized provider/configuration fields. */
export function snapshotSemanticReview(review: CueSemanticReview | undefined): CueSemanticReview | undefined {
  if (!review) return undefined
  return {
    sourceChecks: review.sourceChecks.map(check => ({ id: check.id, quote: check.quote, spans: check.spans.map(span => ({ start: span.start, end: span.end, quote: span.quote })), kinds: [...check.kinds], explanation: check.explanation, checked: check.checked })),
    notEncoded: review.notEncoded,
    renderedConfirmed: review.renderedConfirmed,
    limitationsConfirmed: review.limitationsConfirmed,
  }
}
