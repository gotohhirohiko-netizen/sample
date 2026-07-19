/**
 * Claude APIの概算コスト計算。実際の請求額はAnthropic Consoleが正であり、
 * ここでの金額はアプリ内で目安を把握するための概算(モデル単価は手動で
 * 記録しているため、Anthropic側の価格改定に追従できていない可能性がある)。
 */
const USD_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
};

const DEFAULT_PRICE = { input: 3.0, output: 15.0 };

export function estimateCostUSD(model: string, inputTokens: number, outputTokens: number): number {
  const price = USD_PER_1M_TOKENS[model] ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
