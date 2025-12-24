import { GitBranch, GripVertical } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useFileChanges,
  useGitDiscard,
  useGitStage,
  useGitUnstage,
} from '@/hooks/useSourceControl';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import { ChangesList } from './ChangesList';
import { DiffViewer } from './DiffViewer';

const MIN_WIDTH = 180;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 256;

interface SourceControlPanelProps {
  rootPath: string | undefined;
  onExpandWorktree?: () => void;
  worktreeCollapsed?: boolean;
}

export function SourceControlPanel({
  rootPath,
  onExpandWorktree,
  worktreeCollapsed,
}: SourceControlPanelProps) {
  const { data: changes, isLoading } = useFileChanges(rootPath ?? null);
  const { selectedFile, setSelectedFile, setNavigationDirection } = useSourceControlStore();
  const stageMutation = useGitStage();
  const unstageMutation = useGitUnstage();
  const discardMutation = useGitDiscard();

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const staged = useMemo(() => changes?.filter((c) => c.staged) ?? [], [changes]);
  const unstaged = useMemo(() => changes?.filter((c) => !c.staged) ?? [], [changes]);

  // All files in order: staged first, then unstaged
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Attach global mouse events for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleStage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        stageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, stageMutation]
  );

  const handleUnstage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        unstageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, unstageMutation]
  );

  const handleDiscard = useCallback(
    (path: string) => {
      if (rootPath && window.confirm(`确定要放弃 "${path}" 的更改吗？此操作不可撤销。`)) {
        discardMutation.mutate({ workdir: rootPath, path });
        // Clear selection if discarding selected file
        if (selectedFile?.path === path) {
          setSelectedFile(null);
        }
      }
    },
    [rootPath, discardMutation, selectedFile, setSelectedFile]
  );

  // File navigation
  const currentFileIndex = selectedFile
    ? allFiles.findIndex((f) => f.path === selectedFile.path && f.staged === selectedFile.staged)
    : -1;

  const handlePrevFile = useCallback(() => {
    if (currentFileIndex > 0) {
      const prevFile = allFiles[currentFileIndex - 1];
      setNavigationDirection('prev');
      setSelectedFile({ path: prevFile.path, staged: prevFile.staged });
    }
  }, [currentFileIndex, allFiles, setSelectedFile, setNavigationDirection]);

  const handleNextFile = useCallback(() => {
    if (currentFileIndex < allFiles.length - 1) {
      const nextFile = allFiles[currentFileIndex + 1];
      setNavigationDirection('next');
      setSelectedFile({ path: nextFile.path, staged: nextFile.staged });
    }
  }, [currentFileIndex, allFiles, setSelectedFile, setNavigationDirection]);

  if (!rootPath) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <GitBranch className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>源代码管理</EmptyTitle>
          <EmptyDescription>选择一个 Worktree 以查看更改</EmptyDescription>
        </EmptyHeader>
        {onExpandWorktree && worktreeCollapsed && (
          <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
            <GitBranch className="mr-2 h-4 w-4" />
            选择 Worktree
          </Button>
        )}
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Left: Changes List */}
      <div className="shrink-0 border-r" style={{ width: panelWidth }}>
        <ChangesList
          staged={staged}
          unstaged={unstaged}
          selectedFile={selectedFile}
          onFileClick={setSelectedFile}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onDiscard={handleDiscard}
        />
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          'group flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-accent',
          isResizing && 'bg-accent'
        )}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>

      {/* Right: Diff Viewer */}
      <div className="flex-1 overflow-hidden">
        <DiffViewer
          rootPath={rootPath}
          file={selectedFile}
          onPrevFile={handlePrevFile}
          onNextFile={handleNextFile}
          hasPrevFile={currentFileIndex > 0}
          hasNextFile={currentFileIndex < allFiles.length - 1}
        />
      </div>
    </div>
  );
}
