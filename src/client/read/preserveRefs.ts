export default function preserveRefs(prev: any, next: any): any {
  if (prev === next) return prev;

  if (
    typeof prev !== 'object' ||
    prev === null ||
    (typeof next !== 'object' || next === null)
  ) {
    return next;
  }

  const result: any = Array.isArray(next) ? [] : {};
  let changed = false;

  for (const k of Object.keys(next)) {
    if (!Object.prototype.hasOwnProperty.call(prev, k)) changed = true;

    if (Array.isArray(prev[k]) && Array.isArray(next[k])) {
      result[k] = preserveRefs(prev[k], next[k]);
    } else {
      result[k] = next[k];
    }

    if (result[k] !== prev[k]) changed = true;
  }

  return changed ? result : prev;
}
