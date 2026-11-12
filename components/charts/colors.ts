/**
 * Categorical package colors, validated with the dataviz palette checker
 * (adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 22.9 on light). Slots 3–4 are
 * under 3:1 contrast, so every chart that uses them also labels marks
 * directly and offers a table view.
 *
 * Color follows the package, never its rank: slots are assigned by sorted
 * package id, so a package keeps its color on every page and after a re-sort.
 */
export const CATEGORICAL = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#6250D6", "#E34948"];
export const DEEMPHASIS = "#AFB8C1";
export const STATUS = { good: "#1F883D", warning: "#D4A72C", neutral: "#D1D9E0" };

export function packageColors(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  const map = new Map<string, string>();
  sorted.forEach((id, i) => map.set(id, i < CATEGORICAL.length ? CATEGORICAL[i] : DEEMPHASIS));
  return (id: string) => map.get(id) ?? DEEMPHASIS;
}
