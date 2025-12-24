import { create } from 'zustand';

interface SelectedFile {
  path: string;
  staged: boolean;
}

type NavigationDirection = 'next' | 'prev' | null;

interface SourceControlState {
  selectedFile: SelectedFile | null;
  setSelectedFile: (file: SelectedFile | null) => void;
  navigationDirection: NavigationDirection;
  setNavigationDirection: (direction: NavigationDirection) => void;
}

export const useSourceControlStore = create<SourceControlState>((set) => ({
  selectedFile: null,
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  navigationDirection: null,
  setNavigationDirection: (navigationDirection) => set({ navigationDirection }),
}));
