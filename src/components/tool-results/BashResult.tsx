import { memo } from "react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";

export const BashResult = memo(function BashResult({
  card,
}: {
  card: ToolTraceCardModel;
}) {
  const text = card.outputPreview;
  if (!text) return null;

  // Split into lines and detect error lines (lines starting with common error patterns)
  const lines = text.split("\n");

  return (
    <div className="bash-result">
      <div className="bash-result-header">
        <span className="bash-result-prompt">$</span>
        <span className="bash-result-command">{card.inputSummary || card.name}</span>
      </div>
      <pre className="bash-result-output">
        {lines.map((line, i) => {
          const isError =
            /^(error|Error|ERROR|fatal|Fatal|FATAL|panic|Panic|PANIC|thread '.*' panicked)/.test(
              line,
            ) ||
            /\berror\b/i.test(line.slice(0, 80));
          return (
            <span
              key={i}
              className={isError ? "bash-result-line-error" : "bash-result-line"}
            >
              {line}
              {i < lines.length - 1 ? "\n" : ""}
            </span>
          );
        })}
      </pre>
    </div>
  );
});
