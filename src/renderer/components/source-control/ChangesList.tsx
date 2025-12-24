import type { FileChange, FileChangeStatus } from '@shared/types';
import { FileEdit, FilePlus, FileWarning, FileX, Minus, Plus, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ChangesListProps {
  staged: FileChange[];
  unstaged: FileChange[];
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (path: string) => void;
}

// M=Modified, A=Added, D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
const statusIcons: Record<FileChangeStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FilePlus, // Untracked - new file not yet staged
  X: FileWarning, // Conflict
};

const statusColors: Record<FileChangeStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-green-500', // Untracked shows as green (new file)
  X: 'text-purple-500', // Conflict
};

function FileItem({
  file,
  isSelected,
  onFileClick,
  onAction,
  actionIcon: ActionIcon,
  actionTitle,
  onDiscard,
}: {
  file: FileChange;
  isSelected: boolean;
  onFileClick: () => void;
  onAction: () => void;
  actionIcon: React.ElementType;
  actionTitle: string;
  onDiscard?: () => void;
}) {
  const Icon = statusIcons[file.status];

  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      onClick={onFileClick}
      onKeyDown={(e) => e.key === 'Enter' && onFileClick()}
      role="button"
      tabIndex={0}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isSelected ? '' : statusColors[file.status])} />

      <span
        className={cn('shrink-0 font-mono text-xs', isSelected ? '' : statusColors[file.status])}
      >
        {file.status}
      </span>

      <span className="min-w-0 flex-1 truncate">{file.path}</span>

      {/* Action buttons */}
      <div className="hidden shrink-0 items-center group-hover:flex">
        {onDiscard && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            title="放弃更改"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          title={actionTitle}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChangesList({
  staged,
  unstaged,
  selectedFile,
  onFileClick,
  onStage,
  onUnstage,
  onDiscard,
}: ChangesListProps) {
  const handleStageAll = () => {
    const paths = unstaged.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  const handleUnstageAll = () => {
    const paths = staged.map((f) => f.path);
    if (paths.length > 0) onUnstage(paths);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Staged Changes */}
        {staged.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                暂存的更改 ({staged.length})
              </h3>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleUnstageAll}
              >
                全部取消暂存
              </button>
            </div>
            <div className="space-y-0.5">
              {staged.map((file) => (
                <FileItem
                  key={`staged-${file.path}`}
                  file={file}
                  isSelected={selectedFile?.path === file.path && selectedFile?.staged === true}
                  onFileClick={() => onFileClick({ path: file.path, staged: true })}
                  onAction={() => onUnstage([file.path])}
                  actionIcon={Minus}
                  actionTitle="取消暂存"
                />
              ))}
            </div>
          </div>
        )}

        {/* Unstaged Changes */}
        {unstaged.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                更改 ({unstaged.length})
              </h3>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleStageAll}
              >
                全部暂存
              </button>
            </div>
            <div className="space-y-0.5">
              {unstaged.map((file) => (
                <FileItem
                  key={`unstaged-${file.path}`}
                  file={file}
                  isSelected={selectedFile?.path === file.path && selectedFile?.staged === false}
                  onFileClick={() => onFileClick({ path: file.path, staged: false })}
                  onAction={() => onStage([file.path])}
                  actionIcon={Plus}
                  actionTitle="暂存"
                  onDiscard={() => onDiscard(file.path)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {staged.length === 0 && unstaged.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p className="text-sm">没有更改</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
