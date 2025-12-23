import * as React from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Palette, Settings, Monitor, Sun, Moon, Terminal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettingsStore, type Theme } from '@/stores/settings';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopup,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  getThemeNames,
  getXtermTheme,
  type XtermTheme,
  defaultDarkTheme,
} from '@/lib/ghosttyTheme';

type SettingsCategory = 'appearance' | 'terminal';

const categories: Array<{ id: SettingsCategory; icon: React.ElementType; label: string }> = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'terminal', icon: Terminal, label: '终端' },
];

interface SettingsDialogProps {
  trigger?: React.ReactElement;
}

export function SettingsDialog({ trigger }: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = React.useState<SettingsCategory>('appearance');

  return (
    <Dialog>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          )
        }
      />
      <DialogPopup className="sm:max-w-2xl" showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>自定义你的应用体验</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[400px] border-t">
          {/* Left: Category List */}
          <nav className="w-48 shrink-0 space-y-1 border-r p-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  activeCategory === category.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <category.icon className="h-4 w-4" />
                {category.label}
              </button>
            ))}
          </nav>

          {/* Right: Settings Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeCategory === 'appearance' && <AppearanceSettings />}
            {activeCategory === 'terminal' && <TerminalSettings />}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useSettingsStore();

  const themeOptions: Array<{ value: Theme; icon: React.ElementType; label: string; description: string }> = [
    { value: 'light', icon: Sun, label: '浅色', description: '明亮的界面主题' },
    { value: 'dark', icon: Moon, label: '深色', description: '护眼的暗色主题' },
    { value: 'system', icon: Monitor, label: '跟随系统', description: '自动适配系统主题' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">主题</h3>
        <p className="text-sm text-muted-foreground">选择你喜欢的界面主题</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {themeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              theme === option.value
                ? 'border-primary bg-accent'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                theme === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <option.icon className="h-6 w-6" />
            </div>
            <span className="font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TerminalSettings() {
  const { terminalTheme, setTerminalTheme } = useSettingsStore();

  // Get theme names synchronously from embedded data
  const themeNames = React.useMemo(() => getThemeNames(), []);

  // Get current theme index
  const currentIndex = React.useMemo(() => {
    return themeNames.indexOf(terminalTheme);
  }, [themeNames, terminalTheme]);

  // Get preview theme synchronously
  const previewTheme = React.useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  const handleThemeChange = (value: string | null) => {
    if (value) {
      setTerminalTheme(value);
    }
  };

  const handlePrevTheme = () => {
    const newIndex = currentIndex <= 0 ? themeNames.length - 1 : currentIndex - 1;
    setTerminalTheme(themeNames[newIndex]);
  };

  const handleNextTheme = () => {
    const newIndex = currentIndex >= themeNames.length - 1 ? 0 : currentIndex + 1;
    setTerminalTheme(themeNames[newIndex]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">终端主题</h3>
        <p className="text-sm text-muted-foreground">选择终端配色方案</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevTheme}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <ThemeCombobox
              value={terminalTheme}
              onValueChange={handleThemeChange}
              themes={themeNames}
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleNextTheme}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Theme Preview */}
        <div className="space-y-2">
          <p className="text-sm font-medium">预览</p>
          <TerminalPreview theme={previewTheme} />
        </div>
      </div>
    </div>
  );
}

function TerminalPreview({ theme }: { theme: XtermTheme }) {
  const sampleLines = [
    { text: '$ ', color: theme.green },
    { text: 'ls -la', color: theme.foreground },
    { text: '\n' },
    { text: 'drwxr-xr-x  ', color: theme.blue },
    { text: '5 user staff  160 Dec 23 ', color: theme.foreground },
    { text: 'Documents', color: theme.cyan },
    { text: '\n' },
    { text: '-rw-r--r--  ', color: theme.foreground },
    { text: '1 user staff 2048 Dec 22 ', color: theme.foreground },
    { text: 'config.json', color: theme.yellow },
    { text: '\n' },
    { text: '-rwxr-xr-x  ', color: theme.foreground },
    { text: '1 user staff  512 Dec 21 ', color: theme.foreground },
    { text: 'script.sh', color: theme.green },
    { text: '\n\n' },
    { text: '$ ', color: theme.green },
    { text: 'echo "Hello, World!"', color: theme.foreground },
    { text: '\n' },
    { text: 'Hello, World!', color: theme.magenta },
  ];

  return (
    <div
      className="rounded-lg border p-4 font-mono text-sm"
      style={{ backgroundColor: theme.background }}
    >
      {sampleLines.map((segment, i) =>
        segment.text === '\n' ? (
          <br key={i} />
        ) : segment.text === '\n\n' ? (
          <React.Fragment key={i}>
            <br />
            <br />
          </React.Fragment>
        ) : (
          <span key={i} style={{ color: segment.color }}>
            {segment.text}
          </span>
        )
      )}
      <span
        className="inline-block w-2 h-4 animate-pulse"
        style={{ backgroundColor: theme.cursor }}
      />
    </div>
  );
}

function ThemeCombobox({
  value,
  onValueChange,
  themes,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
}) {
  const [search, setSearch] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);

  // Update search when value changes externally (prev/next buttons)
  React.useEffect(() => {
    if (!isOpen) {
      setSearch(value);
    }
  }, [value, isOpen]);

  const filteredThemes = React.useMemo(() => {
    if (!search || search === value) return themes;
    const query = search.toLowerCase();
    return themes.filter((name) => name.toLowerCase().includes(query));
  }, [themes, search, value]);

  const handleValueChange = (newValue: string | null) => {
    onValueChange(newValue);
    if (newValue) {
      setSearch(newValue);
    }
  };

  return (
    <Combobox<string>
      value={value}
      onValueChange={handleValueChange}
      inputValue={search}
      onInputValueChange={setSearch}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <ComboboxInput placeholder="搜索主题..." />
      <ComboboxPopup>
        <ComboboxList>
          {filteredThemes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              未找到主题
            </div>
          )}
          {filteredThemes.map((name) => (
            <ComboboxItem key={name} value={name}>
              {name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
