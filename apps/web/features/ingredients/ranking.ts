import { normalizeIngredientName } from "./normalization";

const levenshtein = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
};

export const scoreIngredientCandidate = (query: string, candidate: { displayName: string; normalizedName: string; aliases: string[] }) => {
  const q = normalizeIngredientName(query);
  if (!q) return 0;

  if (candidate.normalizedName === q) return 120;
  if (candidate.aliases.includes(q)) return 110;
  if (candidate.normalizedName.startsWith(q)) return 95;
  if (candidate.displayName.toLowerCase().includes(q)) return 80;

  const typoDistance = levenshtein(q, candidate.normalizedName);
  const fuzzyBonus = Math.max(0, 40 - typoDistance * 10);
  return fuzzyBonus;
};
