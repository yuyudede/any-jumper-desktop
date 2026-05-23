import { memo } from "react";
import { Globe } from "lucide-react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";

export const WebResult = memo(function WebResult({
  card,
}: {
  card: ToolTraceCardModel;
}) {
  const text = card.outputPreview;
  if (!text) return null;

  const truncated =
    text.length > 500 ? text.slice(0, 500) + "\n... 内容已截断" : text;

  return (
    <div className="web-result">
      <div className="web-result-header">
        <Globe size={14} className="web-result-icon" />
        <span className="web-result-label">网络请求结果</span>
      </div>
      <pre className="web-result-content">{truncated}</pre>
    </div>
  );
});
