export type TurnOutputPhase = "commentary" | "final_answer";

export interface TurnOutputSegment {
  phase: TurnOutputPhase;
  text: string;
}

export class TurnOutputClassifier {
  private pendingText = "";

  appendModelText(delta: string) {
    this.pendingText += delta;
  }

  flushBeforeToolCall(): TurnOutputSegment[] {
    return this.flush("commentary");
  }

  finish(): TurnOutputSegment[] {
    return this.flush("final_answer");
  }

  private flush(phase: TurnOutputPhase): TurnOutputSegment[] {
    const text = this.pendingText.trim();
    this.pendingText = "";
    if (!text) return [];
    return [{ phase, text }];
  }
}
