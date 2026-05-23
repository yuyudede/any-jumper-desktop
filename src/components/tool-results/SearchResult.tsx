import { memo } from "react";
import { FileSearch } from "lucide-react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";

interface SearchMatch {
  file: string;
  line: string;
  content: string;
}

function parseSearchOutput(text: string): SearchMatch[] {
  const lines = text.split("\n");
  const matches: SearchMatch[] = [];
  // Common format: file.ts:10: matched content
  const re = /^(.+?):(\d+):(.*)$/;

  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      matches.push({
        file: m[1],
        line: m[2],
        content: m[3],
      });
    } else if (line.trim()) {
      // Non-matching line (e.g. headers, summary)
      matches.push({
        file: "",
        line: "",
        content: line,
      });
    }
  }

  return matches;
}

export const SearchResult = memo(function SearchResult({
  card,
}: {
  card: ToolTraceCardModel;
}) {
  const text = card.outputPreview;
  if (!text) return null;

  const matches = parseSearchOutput(text);
  const isGrep = card.name === "grep" || card.name === "search";
  const isGlob = card.name === "glob";
  const label = isGrep ? "搜索结果" : isGlob ? "匹配文件" : "结果";

  if (isGlob) {
    const files = text.split("\n").filter(Boolean);
    return (
      <div className="search-result">
        <div className="search-result-header">
          <FileSearch size={14} className="search-result-icon" />
          <span className="search-result-pattern">
            {card.inputSummary || card.name}
          </span>
          <span className="search-result-count">{files.length} 个文件</span>
        </div>
        <div className="search-result-files">
          {files.map((file, i) => (
            <div key={i} className="search-result-file">
              {file}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="search-result">
      <div className="search-result-header">
        <FileSearch size={14} className="search-result-icon" />
        <span className="search-result-pattern">
          {card.inputSummary || card.name}
        </span>
        <span className="search-result-count">
          {matches.filter((m) => m.file).length} {label}
        </span>
      </div>
      <div className="search-result-list">
        {matches.map((match, i) =>
          match.file ? (
            <div key={i} className="search-result-match">
              <span className="search-result-filepath">
                {match.file}:{match.line}
              </span>
              <span className="search-result-content">{match.content}</span>
            </div>
          ) : (
            <div key={i} className="search-result-meta-line">
              {match.content}
            </div>
          ),
        )}
      </div>
    </div>
  );
});
