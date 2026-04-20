/**
 * TokenEstimator — heuristic utilities for estimating LLM token usage.
 */
export class TokenEstimator {
  /** 
   * Estimate token count from text using 4 chars ≈ 1 token heuristic. 
   * This is generally ±15% accurate for most LLMs.
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Rough cost estimate in USD based on a blended rate (e.g., ~$6.00 / 1M tokens).
   */
  public static estimateCost(tokens: number, costPerMillion: number = 6): number {
    return (tokens / 1_000_000) * costPerMillion;
  }
}
