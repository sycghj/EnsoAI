import {
  ChevronRight,
  Copy,
  FilePlus,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, MenuItem, MenuPopup, MenuSeparator } from '@/components/ui/menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FileTreeNode } from '@/hooks/useFileTree';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { getFileIcon, getFileIconColor } from './fileIcons';

interface FileTreeProps {
  tree: FileTreeNode[];
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileClick: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
  onOpenSearch?: () => void;
  isLoading?: boolean;
  rootPath?: string;
}

export function FileTree({
  tree,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onRefresh,
  onOpenSearch,
  isLoading,
  rootPath,
}: FileTreeProps) {
  const { t } = useI18n();
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedNode, setSelectedNode] = useState<{ path: string; isDirectory: boolean } | null>(
    null
  );

  // 计算新建文件/文件夹的目标路径
  const getCreateTargetPath = useCallback(() => {
    if (!selectedNode) return rootPath;
    // 如果选中的是目录，在该目录下创建
    if (selectedNode.isDirectory) return selectedNode.path;
    // 如果选中的是文件，在其父目录下创建
    return selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || rootPath;
  }, [selectedNode, rootPath]);

  const handleStartRename = useCallback((path: string, currentName: string) => {
    setEditingPath(path);
    setEditValue(currentName);
  }, []);

  const handleFinishRename = useCallback(
    (path: string) => {
      if (editValue.trim() && editValue !== path.split('/').pop()) {
        onRename(path, editValue.trim());
      }
      setEditingPath(null);
      setEditValue('');
    },
    [editValue, onRename]
  );

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">{t('No files')}</p>
        {rootPath && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreateFile(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FilePlus className="h-3 w-3" />
              {t('New File')}
            </button>
            <button
              type="button"
              onClick={() => onCreateDirectory(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FolderPlus className="h-3 w-3" />
              {t('New Folder')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 pl-2 pr-3 pb-1">
          <button
            type="button"
            onClick={() => {
              const targetPath = getCreateTargetPath();
              if (targetPath) onCreateFile(targetPath);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title={t('New File')}
          >
            <FilePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const targetPath = getCreateTargetPath();
              if (targetPath) onCreateDirectory(targetPath);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title={t('New Folder')}
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title={t('Refresh')}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title={t('Search')}
            >
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Tree nodes */}
        {tree.map((node) => (
          <FileTreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            selectedPath={selectedNode?.path ?? null}
            editingPath={editingPath}
            editValue={editValue}
            onToggleExpand={onToggleExpand}
            onFileClick={(path, isDirectory) => {
              setSelectedNode({ path, isDirectory });
              if (!isDirectory) {
                onFileClick(path);
              }
            }}
            onCreateFile={onCreateFile}
            onCreateDirectory={onCreateDirectory}
            onStartRename={handleStartRename}
            onFinishRename={handleFinishRename}
            onEditValueChange={setEditValue}
            onDelete={onDelete}
            onCopyPath={handleCopyPath}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  editingPath: string | null;
  editValue: string;
  onToggleExpand: (path: string) => void;
  onFileClick: (path: string, isDirectory: boolean) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onStartRename: (path: string, currentName: string) => void;
  onFinishRename: (path: string) => void;
  onEditValueChange: (value: string) => void;
  onDelete: (path: string) => void;
  onCopyPath: (path: string) => void;
}

// 获取压缩后的显示信息：合并只有单个子目录的路径
function getCompactedNode(
  node: FileTreeNode,
  expandedPaths: Set<string>
): { displayName: string; actualNode: FileTreeNode; compactedPaths: string[] } {
  const compactedPaths: string[] = [];
  let current = node;
  let displayName = node.name;

  // 只在目录展开且只有一个子目录时压缩
  while (
    current.isDirectory &&
    expandedPaths.has(current.path) &&
    current.children?.length === 1 &&
    current.children[0].isDirectory
  ) {
    compactedPaths.push(current.path);
    current = current.children[0];
    displayName = `${displayName}/${current.name}`;
  }

  return { displayName, actualNode: current, compactedPaths };
}

function FileTreeNodeComponent({
  node,
  depth,
  expandedPaths,
  selectedPath,
  editingPath,
  editValue,
  onToggleExpand,
  onFileClick,
  onCreateFile,
  onCreateDirectory,
  onStartRename,
  onFinishRename,
  onEditValueChange,
  onDelete,
  onCopyPath,
}: FileTreeNodeComponentProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  // 获取压缩后的节点信息
  const { displayName, actualNode } = getCompactedNode(node, expandedPaths);
  const isExpanded = expandedPaths.has(actualNode.path);
  const isSelected = selectedPath === actualNode.path;
  const isEditing = editingPath === actualNode.path;

  const Icon = getFileIcon(actualNode.name, actualNode.isDirectory, isExpanded);
  const iconColor = getFileIconColor(actualNode.name, actualNode.isDirectory);

  // 编辑时自动聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    // 总是更新选中状态
    onFileClick(actualNode.path, actualNode.isDirectory);
    if (actualNode.isDirectory) {
      // 点击压缩节点时，展开/折叠实际节点
      onToggleExpand(actualNode.path);
    }
  }, [actualNode, onToggleExpand, onFileClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onFinishRename(actualNode.path);
      } else if (e.key === 'Escape') {
        onEditValueChange('');
        onFinishRename(actualNode.path);
      }
    },
    [actualNode.path, onFinishRename, onEditValueChange]
  );

  return (
    <div>
      {/* Tree node row */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent/50',
          isSelected && 'bg-accent text-accent-foreground',
          actualNode.ignored && 'opacity-50'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        {/* Chevron for directories */}
        {actualNode.isDirectory ? (
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {actualNode.isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
        )}

        {/* Name or input */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={() => onFinishRename(actualNode.path)}
            onKeyDown={handleKeyDown}
            className="h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1 py-0 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" title={actualNode.path}>
            {displayName}
          </span>
        )}
      </div>

      {/* Context Menu */}
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          {actualNode.isDirectory && (
            <>
              <MenuItem onClick={() => onCreateFile(actualNode.path)}>
                <FilePlus className="h-4 w-4" />
                {t('New File')}
              </MenuItem>
              <MenuItem onClick={() => onCreateDirectory(actualNode.path)}>
                <FolderPlus className="h-4 w-4" />
                {t('New Folder')}
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem onClick={() => onStartRename(actualNode.path, actualNode.name)}>
            <Pencil className="h-4 w-4" />
            {t('Rename')}
          </MenuItem>
          <MenuItem onClick={() => onCopyPath(actualNode.path)}>
            <Copy className="h-4 w-4" />
            {t('Copy Path')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => onDelete(actualNode.path)}>
            <Trash2 className="h-4 w-4" />
            {t('Delete')}
          </MenuItem>
        </MenuPopup>
      </Menu>

      {/* Children - 渲染 actualNode 的子节点 */}
      {actualNode.isDirectory && isExpanded && actualNode.children && (
        <div>
          {actualNode.children.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              editingPath={editingPath}
              editValue={editValue}
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              onCreateFile={onCreateFile}
              onCreateDirectory={onCreateDirectory}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
              onEditValueChange={onEditValueChange}
              onDelete={onDelete}
              onCopyPath={onCopyPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
