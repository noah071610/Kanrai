import { create } from "zustand";

import { loadPromptLanguage, savePromptLanguage, type PromptLanguage } from "./prompts";

export type InspectorTab = "info" | "prompt";

interface ViewerState {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  promptLanguage: PromptLanguage;
  setPromptLanguage: (language: PromptLanguage) => void;
  selectedNodeIds: string[];
  /** `toggle` (⌘-click) adds or removes; otherwise the selection becomes just `id`. */
  select: (id: string | null, toggle?: boolean) => void;
  selectAll: (ids: string[]) => void;
  deselect: (id: string) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  tab: "info",
  setTab: (tab) => set({ tab }),
  promptLanguage: loadPromptLanguage(),
  setPromptLanguage: (promptLanguage) => {
    savePromptLanguage(promptLanguage);
    set({ promptLanguage });
  },
  selectedNodeIds: [],
  select: (id, toggle) =>
    set(({ selectedNodeIds }) => {
      if (!id) return { selectedNodeIds: [] };
      if (!toggle) return { selectedNodeIds: [id] };
      return {
        selectedNodeIds: selectedNodeIds.includes(id)
          ? selectedNodeIds.filter((selected) => selected !== id)
          : [...selectedNodeIds, id],
      };
    }),
  selectAll: (selectedNodeIds) => set({ selectedNodeIds }),
  deselect: (id) => set(({ selectedNodeIds }) => ({ selectedNodeIds: selectedNodeIds.filter((s) => s !== id) })),
}));
