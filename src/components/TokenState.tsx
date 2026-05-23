import { KeyRound } from "lucide-react";
import { StatusPill } from "./StatusPill";

interface TokenStateProps {
  hasToken: boolean;
}

export function TokenState({ hasToken }: TokenStateProps) {
  return (
    <div className="token-state">
      <KeyRound size={15} />
      <StatusPill status={hasToken ? "success" : "error"}>
        {hasToken ? "X-Token Ready" : "X-Token Missing"}
      </StatusPill>
    </div>
  );
}
