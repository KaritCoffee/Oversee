export const SOURCE_PHASES = Object.freeze({
  LIVE: "live",
  EMPTY: "empty",
  DELAYED: "delayed",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
  DISABLED: "disabled",
});

export function classifySource(source = {}, now = Date.now()) {
  if (source.enabled === false || source.configured === false) return SOURCE_PHASES.DISABLED;
  if (source.ok === false) {
    return source.optional || source.configured === false
      ? SOURCE_PHASES.UNAVAILABLE
      : SOURCE_PHASES.ERROR;
  }
  if (source.stale) return SOURCE_PHASES.STALE;

  const updatedAt = Date.parse(source.updatedAt || "");
  const staleAfterMs = Number(source.staleAfterMs || 0);
  if (Number.isFinite(updatedAt) && staleAfterMs > 0 && now - updatedAt > staleAfterMs) {
    return SOURCE_PHASES.STALE;
  }
  if (source.delayed) return SOURCE_PHASES.DELAYED;
  if (Number(source.count || 0) === 0) return SOURCE_PHASES.EMPTY;
  return SOURCE_PHASES.LIVE;
}

export function summarizeSourceHealth(sources = [], now = Date.now()) {
  const records = (Array.isArray(sources) ? sources : []).map((source) => ({
    ...source,
    phase: classifySource(source, now),
  }));
  const core = records.filter((source) => !source.optional);
  const optional = records.filter((source) => source.optional);
  const availablePhases = new Set([
    SOURCE_PHASES.LIVE,
    SOURCE_PHASES.EMPTY,
    SOURCE_PHASES.DELAYED,
    SOURCE_PHASES.STALE,
  ]);
  const responding = core.filter((source) => availablePhases.has(source.phase)).length;
  const problemCount = core.filter((source) => (
    source.phase === SOURCE_PHASES.ERROR || source.phase === SOURCE_PHASES.UNAVAILABLE
  )).length;
  const stale = records.filter((source) => source.phase === SOURCE_PHASES.STALE).length;
  const delayed = records.filter((source) => source.phase === SOURCE_PHASES.DELAYED).length;
  const disabled = records.filter((source) => source.phase === SOURCE_PHASES.DISABLED).length;

  let label = "Core Data Online";
  if (!core.length && !records.length) label = "No Sources Loaded";
  else if (!responding) label = "Sources Offline";
  else if (problemCount) label = "Partial Data";
  else if (stale) label = "Using Saved Data";
  else if (delayed) label = "Data Delayed";

  return {
    records,
    label,
    responding,
    total: core.length || records.length,
    optionalResponding: optional.filter((source) => availablePhases.has(source.phase)).length,
    optionalTotal: optional.length,
    stale,
    delayed,
    disabled,
    errors: records.filter((source) => source.phase === SOURCE_PHASES.ERROR).length,
    unavailable: records.filter((source) => source.phase === SOURCE_PHASES.UNAVAILABLE).length,
  };
}
