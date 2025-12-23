import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Terminal, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useSettingsStore } from '@/stores/settings';
import '@xterm/xterm/css/xterm.css';

// Dark theme (Ayu Dark - from Ghostty config)
const darkTheme: ITheme = {
  background: '#1f2430',
  foreground: '#cbccc6',
  cursor: '#cbccc6',
  cursorAccent: '#1f2430',
  selectionBackground: '#cbccc6',
  selectionForeground: '#1f2430',
  black: '#212733',
  red: '#f08778',
  green: '#53bf97',
  yellow: '#fdcc60',
  blue: '#60b8d6',
  magenta: '#ec7171',
  cyan: '#98e6ca',
  white: '#fafafa',
  brightBlack: '#686868',
  brightRed: '#f58c7d',
  brightGreen: '#58c49c',
  brightYellow: '#ffd165',
  brightBlue: '#65bddb',
  brightMagenta: '#f17676',
  brightCyan: '#9debcf',
  brightWhite: '#ffffff',
};

// Light theme (Ayu Light inspired)
const lightTheme: ITheme = {
  background: '#fafafa',
  foreground: '#5c6166',
  cursor: '#5c6166',
  cursorAccent: '#fafafa',
  selectionBackground: '#035bd626',
  selectionForeground: '#5c6166',
  black: '#55606d',
  red: '#f07171',
  green: '#86b300',
  yellow: '#f2ae49',
  blue: '#399ee6',
  magenta: '#a37acc',
  cyan: '#4cbf99',
  white: '#c7c7c7',
  brightBlack: '#abb0b6',
  brightRed: '#f07171',
  brightGreen: '#86b300',
  brightYellow: '#f2ae49',
  brightBlue: '#399ee6',
  brightMagenta: '#a37acc',
  brightCyan: '#4cbf99',
  brightWhite: '#d8d8d8',
};

interface ClaudeTerminalProps {
  cwd?: string;
}

// Helper to check if dark mode is active
function useIsDarkMode() {
  const { theme } = useSettingsStore();
  return useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // system
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);
}

export function ClaudeTerminal({ cwd }: ClaudeTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const isDarkMode = useIsDarkMode();
  const currentTheme = isDarkMode ? darkTheme : lightTheme;
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return;

    // Create xterm instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 18,
      fontFamily: 'Maple Mono NF CN, JetBrains Mono, Menlo, Monaco, monospace',
      fontWeight: 'normal',
      fontWeightBold: '500',
      theme: currentTheme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Create pty session running claude command
    try {
      const ptyId = await window.electronAPI.terminal.create({
        cwd: cwd || window.electronAPI.env.HOME,
        shell: 'claude',
        cols: terminal.cols,
        rows: terminal.rows,
      });

      ptyIdRef.current = ptyId;

      // Handle data from pty
      const cleanup = window.electronAPI.terminal.onData((event) => {
        if (event.id === ptyId) {
          terminal.write(event.data);
        }
      });
      cleanupRef.current = cleanup;

      // Handle input from terminal
      terminal.onData((data) => {
        if (ptyIdRef.current) {
          window.electronAPI.terminal.write(ptyIdRef.current, data);
        }
      });
    } catch (error) {
      terminal.writeln('\x1b[31mFailed to start claude. Make sure claude is installed and in PATH.\x1b[0m');
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
      terminal.writeln('\x1b[90mInstall claude: npm install -g @anthropic-ai/claude-code\x1b[0m');
    }
  }, [cwd]);

  // Initialize terminal
  useEffect(() => {
    initTerminal();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      if (ptyIdRef.current) {
        window.electronAPI.terminal.destroy(ptyIdRef.current);
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [initTerminal]);

  // Update theme dynamically when settings change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = currentTheme;
    }
  }, [currentTheme]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && ptyIdRef.current) {
        fitAddonRef.current.fit();
        window.electronAPI.terminal.resize(ptyIdRef.current, {
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container resize
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full px-[10px] py-[2px]"
      style={{ backgroundColor: currentTheme.background }}
    />
  );
}
