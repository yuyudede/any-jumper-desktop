import { createContext, useContext, type ReactNode } from "react";

interface BasePathsContextValue {
  basePaths: string[];
}

const BasePathsContext = createContext<BasePathsContextValue>({
  basePaths: [],
});

export function BasePathsProvider({
  basePaths,
  children,
}: {
  basePaths: string[];
  children: ReactNode;
}) {
  return (
    <BasePathsContext.Provider value={{ basePaths }}>
      {children}
    </BasePathsContext.Provider>
  );
}

export function useBasePaths() {
  return useContext(BasePathsContext);
}
