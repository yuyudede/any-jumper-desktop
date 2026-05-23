import { memo } from "react";
import { FileCode, FilePen } from "lucide-react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";

export const ReadWriteResult = memo(function ReadWriteResult({
  card,
}: {
  card: ToolTraceCardModel;
}) {
  const text = card.outputPreview;
  if (!text) return null;

  const isWrite = card.name === "write_file";
  const isRead = card.name === "read_file";
  const Icon = isWrite ? FilePen : FileCode;
  const label = isWrite ? "写入" : isRead ? "读取" : "文件";

  const lines = text.split("\n");
  const hasContent = lines.length > 1 || (lines.length === 1 && lines[0].length > 0);

  return (
    <div className="readwrite-result">
      <div className="readwrite-result-header">
        <Icon size={14} className="readwrite-result-icon" />
        <span className="readwrite-result-path">{card.inputSummary || card.name}</span>
        <span className="readwrite-result-meta">
          {label} · {lines.length} 行
        </span>
      </div>
      {hasContent && (
        <pre className="readwrite-result-content">
          <code>
            {lines.map((line, i) => (
              <span key={i} className="readwrite-result-line">
                <span className="readwrite-result-ln">{i + 1}</span>
                <span>{line}{i < lines.length - 1 ? "\n" : ""}</span>
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
});
