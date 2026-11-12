export class AiHttpError extends Error {
  constructor(
    public provider: "groq" | "gemini",
    public status: number,
    detail: string
  ) {
    super(`${provider} HTTP ${status}: ${detail}`);
    this.name = "AiHttpError";
  }
}
