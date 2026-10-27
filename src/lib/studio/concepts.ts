import type { StudioState } from "@/lib/contracts";

type StudioConceptSource = Pick<StudioState, "scan" | "brand" | "draft">;

function sourceHash(value: string) {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193);
    djb = Math.imul(djb, 33) ^ code;
  }
  return `${(fnv >>> 0).toString(16).padStart(8, "0")}${(djb >>> 0).toString(16).padStart(8, "0")}`;
}

/** Stable staleness key for the announcement, scanned reference, brand, and assets. */
export function getStudioConceptsSourceFingerprint(source: StudioConceptSource) {
  return sourceHash(JSON.stringify({
    scan: source.scan,
    brand: source.brand,
    draft: {
      kind: source.draft.kind,
      goal: source.draft.goal,
      updateDetails: source.draft.updateDetails,
      audience: source.draft.audience,
      launchDate: source.draft.launchDate,
      cta: source.draft.cta,
      angle: source.draft.angle,
    },
  }));
}

export function areStudioConceptsStale(
  state: Pick<StudioState, "concepts" | "designJobId" | "conceptsSourceFingerprint">,
  currentSourceFingerprint: string,
) {
  const hasConceptWork = state.concepts.length > 0 || state.designJobId !== null;
  return hasConceptWork && state.conceptsSourceFingerprint !== currentSourceFingerprint;
}

/** Applies a newer autosave revision without letting late callbacks roll it back. */
export function updateStudioConceptRevision(
  state: StudioState,
  conceptId: string,
  designId: string,
  revision: number,
) {
  if (!Number.isSafeInteger(revision) || revision < 1) return state;

  let changed = false;
  const concepts = state.concepts.map((concept) => {
    if (
      concept.id !== conceptId
      || concept.designId !== designId
      || revision <= concept.designRevision
    ) {
      return concept;
    }
    changed = true;
    return { ...concept, designRevision: revision };
  });

  return changed ? { ...state, concepts } : state;
}
