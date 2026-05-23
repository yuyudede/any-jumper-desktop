import { memo } from "react";
import { FileDiff } from "lucide-react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";

function parseDiffPreview(text: string): {
  additions: number;
  deletions: number;
  hunks: string[];
} {
  const lines = text.split("\n");
  let additions = 0;
  let deletions = 0;
  const hunks: string[] = [];
  const MAX_HUNK_LINES = 80;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;

    if (hunks.length < MAX_HUNK_LINES) {
      if (
        line.startsWith("@@") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith("diff ") ||
        line.startsWith("---") ||
        line.startsWith("+++") ||
        hunks.length > 0
      ) {
        hunks.push(line);
      }
    }
  }

  return { additions, deletions, hunks };
}

export const EditResult = memo(function EditResult({
  card,
}: {
  card: ToolTraceCardModel;
}) {
  const text = card.outputPreview;
  if (!text) return null;

  const { additions, deletions, hunks } = parseDiffPreview(text);
  const looksLikeDiff = hunks.length > 0;

  return (
    <div className="edit-result">
      <div className="edit-result-header">
        <FileDiff size={14} className="edit-result-icon" />
        <span className="edit-result-path">{card.inputSummary || card.name}</span>
        {looksLikeDiff && (
          <span className="edit-result-stats">
            <span className="edit-result-add">+{additions}</span>
            <span className="edit-result-del">-{deletions}</span>
          </span>
        )}
      </div>
      {looksLikeDiff ? (
        <pre className="edit-result-diff">
          {hunks.map((line, i) => {
            let cls = "edit-result-diff-line";
            if (line.startsWith("+") && !line.startsWith("+++"))
              cls += " edit-result-diff-add";
            else if (line.startsWith("-") && !line.startsWith("---"))
              cls += " edit-result-diff-del";
            else if (line.startsWith("@@"))
              cls += " edit-result-diff-hunk";
            else if (line.startsWith("diff "))
              cls += " edit-result-diff-header";
            return (
              <span key={i} className={cls}>
                {line}
                {"\n"}
              </span>
            );
          })}
        </pre>
      ) : (
        <pre className="edit-result-plain">{text}</pre>
      )}
    </div>
  );
});
