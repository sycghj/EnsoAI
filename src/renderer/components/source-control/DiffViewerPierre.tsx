import { type FileContents, parseDiffFromFile, type SupportedLanguages } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import { ChevronDown, ChevronUp, Columns, ExternalLink, FileCode, Rows } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useFileDiff } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { getShikiThemeFallback } from '@/lib/shikiThemeAdapter';
import { cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';
import { useSourceControlStore } from '@/stores/sourceControl';

function getLanguageFromPath(filePath: string): SupportedLanguages | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, SupportedLanguages> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    java: 'java',
    kt: 'kotlin',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    txt: 'text',
  };
  return languageMap[ext];
}

interface DiffViewerPierreProps {
  rootPath: string;
  file: { path: string; staged: boolean } | null;
  onPrevFile?: () => void;
  onNextFile?: () => void;
  hasPrevFile?: boolean;
  hasNextFile?: boolean;
  diff?: { path: string; original: string; modified: string };
  skipFetch?: boolean;
  isCommitView?: boolean;
}

export function DiffViewerPierre({
  rootPath,
  file,
  onPrevFile,
  onNextFile,
  hasPrevFile = false,
  hasNextFile = false,
  diff: externalDiff,
  skipFetch = false,
  isCommitView = false,
}: DiffViewerPierreProps) {
  const { t } = useI18n();
  const { editorSettings, sourceControlKeybindings, terminalTheme } = useSettingsStore();
  const { navigationDirection, setNavigationDirection } = useSourceControlStore();
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);

  const [layout, setLayout] = useState<'split' | 'unified'>('split');
  const [currentHunkIndex, setCurrentHunkIndex] = useState(-1);
  const [boundaryHint, setBoundaryHint] = useState<'top' | 'bottom' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const shouldFetch = !skipFetch && !isCommitView;
  const { data: fetchedDiff, isLoading } = useFileDiff(
    rootPath,
    file?.path ?? null,
    file?.staged ?? false,
    shouldFetch ? undefined : { enabled: false }
  );
  const diff = externalDiff ?? fetchedDiff;

  const fileDiffMetadata = useMemo(() => {
    if (!diff || !file) return null;

    const lang = getLanguageFromPath(file.path);
    const oldFile: FileContents = {
      name: file.path,
      contents: diff.original,
      lang,
    };
    const newFile: FileContents = {
      name: file.path,
      contents: diff.modified,
      lang,
    };

    return parseDiffFromFile(oldFile, newFile);
  }, [diff, file]);

  const hunks = fileDiffMetadata?.hunks ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state when diff changes
  useEffect(() => {
    setCurrentHunkIndex(-1);
    setBoundaryHint(null);
  }, [diff]);

  const injectHighlightStyles = useCallback((shadowRoot: ShadowRoot) => {
    const styleId = 'enso-hunk-highlight';
    if (shadowRoot.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-current-hunk] {
        outline: 2px solid var(--diffs-modified-base, #3b82f6) !important;
        outline-offset: -2px;
      }
      [data-current-hunk] [data-column-number],
      [data-current-hunk] [data-column-content] {
        background-color: color-mix(in srgb, var(--diffs-modified-base, #3b82f6) 20%, var(--diffs-bg, transparent)) !important;
      }
    `;
    shadowRoot.appendChild(style);
  }, []);

  const getChangeBlocks = useCallback((shadowRoot: ShadowRoot) => {
    const changeRows = shadowRoot.querySelectorAll(
      '[data-line-type="change-addition"], [data-line-type="change-deletion"]'
    );

    const blocks: Element[][] = [];
    let currentBlock: Element[] = [];
    let lastIndex = -2;

    const allRows = Array.from(shadowRoot.querySelectorAll('[data-line]'));

    for (const row of changeRows) {
      const rowIndex = allRows.indexOf(row);
      if (rowIndex - lastIndex > 1 && currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      currentBlock.push(row);
      lastIndex = rowIndex;
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    return blocks;
  }, []);

  const [changeBlocks, setChangeBlocks] = useState<Element[][]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scan when layout changes
  useEffect(() => {
    if (!containerRef.current || !diff) return;

    const timer = setTimeout(() => {
      const diffContainer = containerRef.current?.querySelector('diffs-container');
      const shadowRoot = diffContainer?.shadowRoot;
      if (shadowRoot) {
        const blocks = getChangeBlocks(shadowRoot);
        setChangeBlocks(blocks);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [diff, layout, getChangeBlocks]);

  const scrollToChangeBlock = useCallback(
    (index: number) => {
      if (!containerRef.current || index < 0 || index >= changeBlocks.length) return;

      const diffContainer = containerRef.current.querySelector('diffs-container');
      const shadowRoot = diffContainer?.shadowRoot;
      if (!shadowRoot) return;

      injectHighlightStyles(shadowRoot);

      shadowRoot.querySelectorAll('[data-current-hunk]').forEach((el) => {
        el.removeAttribute('data-current-hunk');
      });

      const block = changeBlocks[index];
      for (const row of block) {
        row.setAttribute('data-current-hunk', 'true');
      }

      if (block[0]) {
        block[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [changeBlocks, injectHighlightStyles]
  );

  const navigateToDiff = useCallback(
    (direction: 'prev' | 'next') => {
      if (changeBlocks.length === 0) {
        if (direction === 'prev' && onPrevFile) onPrevFile();
        if (direction === 'next' && onNextFile) onNextFile();
        return;
      }

      let newIndex = currentHunkIndex;

      if (direction === 'next') {
        if (currentHunkIndex >= changeBlocks.length - 1) {
          if (boundaryHint === 'bottom') {
            setBoundaryHint(null);
            if (onNextFile) onNextFile();
            return;
          }
          setBoundaryHint('bottom');
          setTimeout(() => setBoundaryHint(null), 2000);
          return;
        }
        newIndex = currentHunkIndex + 1;
      } else {
        if (currentHunkIndex <= 0) {
          if (boundaryHint === 'top') {
            setBoundaryHint(null);
            if (onPrevFile) onPrevFile();
            return;
          }
          setBoundaryHint('top');
          setTimeout(() => setBoundaryHint(null), 2000);
          return;
        }
        newIndex = currentHunkIndex - 1;
      }

      setBoundaryHint(null);
      setCurrentHunkIndex(newIndex);
      scrollToChangeBlock(newIndex);
    },
    [changeBlocks, currentHunkIndex, boundaryHint, onPrevFile, onNextFile, scrollToChangeBlock]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!file) return;

      if (matchesKeybinding(e, sourceControlKeybindings.prevDiff)) {
        e.preventDefault();
        navigateToDiff('prev');
        return;
      }

      if (matchesKeybinding(e, sourceControlKeybindings.nextDiff)) {
        e.preventDefault();
        navigateToDiff('next');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, sourceControlKeybindings, navigateToDiff]);

  useEffect(() => {
    if (navigationDirection) {
      setNavigationDirection(null);
    }
  }, [navigationDirection, setNavigationDirection]);

  if (!file) {
    return (
      <Empty className="h-full">
        <EmptyMedia variant="icon">
          <FileCode className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('View diff')}</EmptyTitle>
          <EmptyDescription>{t('Select file to view diff')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('Loading...')}</p>
      </div>
    );
  }

  if (!diff || !fileDiffMetadata) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('Failed to load diff')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center">
          <span className="text-sm font-medium">{file.path}</span>
          {isCommitView ? (
            <span className="ml-2 text-xs text-muted-foreground">{t('(commit history)')}</span>
          ) : (
            <span className="ml-2 text-xs text-muted-foreground">
              {file.staged ? t('(staged)') : t('(unstaged)')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLayout((l) => (l === 'split' ? 'unified' : 'split'))}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            title={layout === 'split' ? t('Switch to unified view') : t('Switch to split view')}
          >
            {layout === 'split' ? (
              <>
                <Rows className="h-3.5 w-3.5" />
                {t('Unified')}
              </>
            ) : (
              <>
                <Columns className="h-3.5 w-3.5" />
                {t('Split')}
              </>
            )}
          </button>

          {changeBlocks.length > 0 && (
            <span className="mr-2 text-xs text-muted-foreground">
              {currentHunkIndex >= 0 ? currentHunkIndex + 1 : '-'}/{changeBlocks.length}
            </span>
          )}

          {boundaryHint && (
            <span className="mr-2 text-xs text-orange-500">
              {boundaryHint === 'top'
                ? hasPrevFile
                  ? t('Switch to previous file')
                  : t('Already at the first change')
                : hasNextFile
                  ? t('Switch to next file')
                  : t('Already at the last change')}
            </span>
          )}

          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToDiff('prev')}
            title={t('Previous change (F7, press again to switch file)')}
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToDiff('next')}
            title={t('Next change (F8, press again to switch file)')}
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToFile({ path: `${rootPath}/${file.path}` })}
            title={t('Open in editor')}
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-auto">
        <FileDiff
          fileDiff={fileDiffMetadata}
          options={{
            diffStyle: layout,
            disableLineNumbers: editorSettings.lineNumbers === 'off',
            overflow: editorSettings.wordWrap === 'on' ? 'wrap' : 'scroll',
            theme: getShikiThemeFallback(terminalTheme),
            themeType: isTerminalThemeDark(terminalTheme) ? 'dark' : 'light',
          }}
          style={{
            fontFamily: editorSettings.fontFamily,
            fontSize: editorSettings.fontSize,
          }}
        />
      </div>
    </div>
  );
}
