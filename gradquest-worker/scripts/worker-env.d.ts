interface Ai {
  run(model: string, input: unknown): Promise<unknown>;
}

interface Env {
  AI: Ai;
}
