import { homedir } from 'node:os';
import { join } from 'node:path';
import { AppCategory } from '@shared/types';

export interface KnownApp {
  name: string;
  bundleId: string;
  category: AppCategory;
}

// Windows app detection info
export interface WindowsApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  exePaths: string[]; // Possible executable paths
}

// Linux app detection info
export interface LinuxApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  commands: string[]; // Possible command names (checked via 'which')
  desktopFile?: string; // Optional .desktop file name for icon
}

// macOS known apps
export const MAC_APPS: KnownApp[] = [
  // Terminals
  { name: 'Terminal', bundleId: 'com.apple.Terminal', category: AppCategory.Terminal },
  { name: 'iTerm', bundleId: 'com.googlecode.iterm2', category: AppCategory.Terminal },
  { name: 'Warp', bundleId: 'dev.warp.Warp-Stable', category: AppCategory.Terminal },
  { name: 'Alacritty', bundleId: 'org.alacritty', category: AppCategory.Terminal },
  { name: 'Kitty', bundleId: 'net.kovidgoyal.kitty', category: AppCategory.Terminal },
  { name: 'Hyper', bundleId: 'co.zeit.hyper', category: AppCategory.Terminal },
  { name: 'Ghostty', bundleId: 'com.mitchellh.ghostty', category: AppCategory.Terminal },
  { name: 'Rio', bundleId: 'com.raphamorim.rio', category: AppCategory.Terminal },

  // Editors - Mainstream
  { name: 'Xcode', bundleId: 'com.apple.dt.Xcode', category: AppCategory.Editor },
  { name: 'VS Code', bundleId: 'com.microsoft.VSCode', category: AppCategory.Editor },
  { name: 'VSCodium', bundleId: 'com.visualstudio.code.oss', category: AppCategory.Editor },
  { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', category: AppCategory.Editor },
  { name: 'Windsurf', bundleId: 'com.exafunction.windsurf', category: AppCategory.Editor },
  { name: 'Sublime', bundleId: 'com.sublimetext.4', category: AppCategory.Editor },
  { name: 'Nova', bundleId: 'com.panic.Nova', category: AppCategory.Editor },
  { name: 'TextMate', bundleId: 'com.macromates.TextMate', category: AppCategory.Editor },
  { name: 'Zed', bundleId: 'dev.zed.Zed', category: AppCategory.Editor },

  // Editors - JetBrains
  { name: 'Android Studio', bundleId: 'com.google.android.studio', category: AppCategory.Editor },
  { name: 'IntelliJ IDEA', bundleId: 'com.jetbrains.intellij', category: AppCategory.Editor },
  { name: 'IntelliJ IDEA CE', bundleId: 'com.jetbrains.intellij.ce', category: AppCategory.Editor },
  { name: 'WebStorm', bundleId: 'com.jetbrains.WebStorm', category: AppCategory.Editor },
  { name: 'PyCharm', bundleId: 'com.jetbrains.pycharm', category: AppCategory.Editor },
  { name: 'PyCharm CE', bundleId: 'com.jetbrains.pycharm.ce', category: AppCategory.Editor },
  { name: 'CLion', bundleId: 'com.jetbrains.CLion', category: AppCategory.Editor },
  { name: 'GoLand', bundleId: 'com.jetbrains.goland', category: AppCategory.Editor },
  { name: 'PhpStorm', bundleId: 'com.jetbrains.PhpStorm', category: AppCategory.Editor },
  { name: 'Rider', bundleId: 'com.jetbrains.rider', category: AppCategory.Editor },
  { name: 'AppCode', bundleId: 'com.jetbrains.AppCode', category: AppCategory.Editor },
  { name: 'DataGrip', bundleId: 'com.jetbrains.datagrip', category: AppCategory.Editor },
  { name: 'RustRover', bundleId: 'com.jetbrains.rustrover', category: AppCategory.Editor },
  { name: 'Fleet', bundleId: 'com.jetbrains.fleet', category: AppCategory.Editor },

  // Editors - Others
  { name: 'Atom', bundleId: 'com.github.atom', category: AppCategory.Editor },
  { name: 'BBEdit', bundleId: 'com.barebones.bbedit', category: AppCategory.Editor },
  { name: 'CotEditor', bundleId: 'com.coteditor.CotEditor', category: AppCategory.Editor },
  { name: 'MacVim', bundleId: 'org.vim.MacVim', category: AppCategory.Editor },
  { name: 'Emacs', bundleId: 'org.gnu.Emacs', category: AppCategory.Editor },
  { name: 'Brackets', bundleId: 'io.brackets.appshell', category: AppCategory.Editor },
  { name: 'TextEdit', bundleId: 'com.apple.TextEdit', category: AppCategory.Editor },

  // System
  { name: 'Finder', bundleId: 'com.apple.finder', category: AppCategory.Finder },
];

// Windows known apps
export const WINDOWS_APPS: WindowsApp[] = (() => {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');

  return [
    // Terminals
    {
      name: 'Windows Terminal',
      id: 'windows.terminal',
      category: AppCategory.Terminal,
      exePaths: [
        join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe'),
        join(localAppData, 'Microsoft', 'WindowsApps', 'wtd.exe'),
        'wt.exe',
      ],
    },
    {
      name: 'PowerShell',
      id: 'windows.powershell',
      category: AppCategory.Terminal,
      exePaths: [
        join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ],
    },
    {
      name: 'Alacritty',
      id: 'org.alacritty',
      category: AppCategory.Terminal,
      exePaths: [
        join(programFiles, 'Alacritty', 'alacritty.exe'),
        join(appData, 'alacritty', 'alacritty.exe'),
        'alacritty.exe',
      ],
    },
    {
      name: 'Kitty',
      id: 'net.kovidgoyal.kitty',
      category: AppCategory.Terminal,
      exePaths: [join(programFiles, 'kitty', 'kitty.exe'), 'kitty.exe'],
    },
    {
      name: 'WezTerm',
      id: 'org.wezfurlong.wezterm',
      category: AppCategory.Terminal,
      exePaths: [
        join(programFiles, 'WezTerm', 'wezterm-gui.exe'),
        join(localAppData, 'Programs', 'WezTerm', 'wezterm-gui.exe'),
        'wezterm.exe',
      ],
    },
    {
      name: 'Hyper',
      id: 'co.zeit.hyper',
      category: AppCategory.Terminal,
      exePaths: [
        join(localAppData, 'Programs', 'hyper', 'Hyper.exe'),
        join(localAppData, 'hyper', 'Hyper.exe'),
      ],
    },
    {
      name: 'Tabby',
      id: 'org.tabby',
      category: AppCategory.Terminal,
      exePaths: [
        join(localAppData, 'Programs', 'Tabby', 'Tabby.exe'),
        join(programFiles, 'Tabby', 'Tabby.exe'),
      ],
    },
    {
      name: 'Git Bash',
      id: 'git.bash',
      category: AppCategory.Terminal,
      exePaths: [
        join(programFiles, 'Git', 'git-bash.exe'),
        join(programFilesX86, 'Git', 'git-bash.exe'),
      ],
    },
    {
      name: 'Cmder',
      id: 'cmder',
      category: AppCategory.Terminal,
      exePaths: ['cmder.exe'],
    },

    // Editors - Mainstream
    {
      name: 'VS Code',
      id: 'com.microsoft.VSCode',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        join(programFiles, 'Microsoft VS Code', 'Code.exe'),
        'code.cmd',
      ],
    },
    {
      name: 'VSCodium',
      id: 'com.vscodium.codium',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'Programs', 'VSCodium', 'VSCodium.exe'),
        join(programFiles, 'VSCodium', 'VSCodium.exe'),
        'codium.cmd',
      ],
    },
    {
      name: 'Cursor',
      id: 'com.todesktop.230313mzl4w4u92',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
        join(localAppData, 'cursor', 'Cursor.exe'),
      ],
    },
    {
      name: 'Windsurf',
      id: 'com.exafunction.windsurf',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'Programs', 'windsurf', 'Windsurf.exe'),
        join(localAppData, 'windsurf', 'Windsurf.exe'),
      ],
    },
    {
      name: 'Zed',
      id: 'dev.zed.Zed',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'Programs', 'Zed', 'Zed.exe'),
        join(localAppData, 'Zed', 'Zed.exe'),
        'zed.exe',
      ],
    },
    {
      name: 'Sublime Text',
      id: 'com.sublimetext.4',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Sublime Text', 'sublime_text.exe'),
        join(programFiles, 'Sublime Text 3', 'sublime_text.exe'),
        'subl.exe',
      ],
    },
    {
      name: 'Notepad++',
      id: 'notepad++',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Notepad++', 'notepad++.exe'),
        join(programFilesX86, 'Notepad++', 'notepad++.exe'),
      ],
    },
    {
      name: 'Vim',
      id: 'org.vim.vim',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Vim', 'vim91', 'gvim.exe'),
        join(programFiles, 'Vim', 'vim90', 'gvim.exe'),
        join(programFilesX86, 'Vim', 'vim91', 'gvim.exe'),
        'gvim.exe',
        'vim.exe',
      ],
    },
    {
      name: 'Neovim',
      id: 'io.neovim.nvim',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Neovim', 'bin', 'nvim.exe'),
        join(localAppData, 'Programs', 'Neovim', 'bin', 'nvim.exe'),
        'nvim.exe',
      ],
    },
    {
      name: 'Emacs',
      id: 'org.gnu.emacs',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Emacs', 'emacs-29.1', 'bin', 'runemacs.exe'),
        join(programFiles, 'Emacs', 'bin', 'runemacs.exe'),
        'emacs.exe',
      ],
    },
    {
      name: 'Android Studio',
      id: 'com.google.android.studio',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Android', 'Android Studio', 'bin', 'studio64.exe'),
        join(localAppData, 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
        'studio64.exe',
      ],
    },
    {
      name: 'Fleet',
      id: 'com.jetbrains.fleet',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'Fleet', 'ch-0'),
        join(localAppData, 'Programs', 'Fleet', 'Fleet.exe'),
      ],
    },

    // JetBrains IDEs
    {
      name: 'IntelliJ IDEA',
      id: 'com.jetbrains.intellij',
      category: AppCategory.Editor,
      exePaths: [
        // Toolbox install
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'IDEA-U', 'ch-0'),
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'IDEA-C', 'ch-0'),
        // Standalone install
        join(programFiles, 'JetBrains', 'IntelliJ IDEA', 'bin', 'idea64.exe'),
        join(programFiles, 'JetBrains', 'IntelliJ IDEA Community Edition', 'bin', 'idea64.exe'),
        // CLI command
        'idea64.exe',
        'idea.exe',
      ],
    },
    {
      name: 'WebStorm',
      id: 'com.jetbrains.WebStorm',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'WebStorm', 'ch-0'),
        join(programFiles, 'JetBrains', 'WebStorm', 'bin', 'webstorm64.exe'),
        'webstorm64.exe',
      ],
    },
    {
      name: 'PyCharm',
      id: 'com.jetbrains.pycharm',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'PyCharm-P', 'ch-0'),
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'PyCharm-C', 'ch-0'),
        join(programFiles, 'JetBrains', 'PyCharm', 'bin', 'pycharm64.exe'),
        join(programFiles, 'JetBrains', 'PyCharm Community Edition', 'bin', 'pycharm64.exe'),
        'pycharm64.exe',
      ],
    },
    {
      name: 'GoLand',
      id: 'com.jetbrains.goland',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'Goland', 'ch-0'),
        join(programFiles, 'JetBrains', 'GoLand', 'bin', 'goland64.exe'),
        'goland64.exe',
      ],
    },
    {
      name: 'CLion',
      id: 'com.jetbrains.CLion',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'CLion', 'ch-0'),
        join(programFiles, 'JetBrains', 'CLion', 'bin', 'clion64.exe'),
        'clion64.exe',
      ],
    },
    {
      name: 'RustRover',
      id: 'com.jetbrains.rustrover',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'RustRover', 'ch-0'),
        join(programFiles, 'JetBrains', 'RustRover', 'bin', 'rustrover64.exe'),
        'rustrover64.exe',
      ],
    },
    {
      name: 'Rider',
      id: 'com.jetbrains.rider',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'Rider', 'ch-0'),
        join(programFiles, 'JetBrains', 'Rider', 'bin', 'rider64.exe'),
        'rider64.exe',
      ],
    },
    {
      name: 'PhpStorm',
      id: 'com.jetbrains.PhpStorm',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'PhpStorm', 'ch-0'),
        join(programFiles, 'JetBrains', 'PhpStorm', 'bin', 'phpstorm64.exe'),
        'phpstorm64.exe',
      ],
    },
    {
      name: 'DataGrip',
      id: 'com.jetbrains.datagrip',
      category: AppCategory.Editor,
      exePaths: [
        join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'datagrip', 'ch-0'),
        join(programFiles, 'JetBrains', 'DataGrip', 'bin', 'datagrip64.exe'),
        'datagrip64.exe',
      ],
    },

    // System
    {
      name: 'Explorer',
      id: 'windows.explorer',
      category: AppCategory.Finder,
      exePaths: ['C:\\Windows\\explorer.exe'],
    },
  ];
})();

// Linux known apps
export const LINUX_APPS: LinuxApp[] = [
  // Terminals
  {
    name: 'GNOME Terminal',
    id: 'org.gnome.Terminal',
    category: AppCategory.Terminal,
    commands: ['gnome-terminal'],
    desktopFile: 'org.gnome.Terminal.desktop',
  },
  {
    name: 'Konsole',
    id: 'org.kde.konsole',
    category: AppCategory.Terminal,
    commands: ['konsole'],
    desktopFile: 'org.kde.konsole.desktop',
  },
  {
    name: 'Alacritty',
    id: 'org.alacritty',
    category: AppCategory.Terminal,
    commands: ['alacritty'],
    desktopFile: 'Alacritty.desktop',
  },
  {
    name: 'Kitty',
    id: 'net.kovidgoyal.kitty',
    category: AppCategory.Terminal,
    commands: ['kitty'],
    desktopFile: 'kitty.desktop',
  },
  {
    name: 'Warp',
    id: 'dev.warp.Warp',
    category: AppCategory.Terminal,
    commands: ['warp-terminal', 'warp'],
    desktopFile: 'dev.warp.Warp.desktop',
  },
  {
    name: 'Ghostty',
    id: 'com.mitchellh.ghostty',
    category: AppCategory.Terminal,
    commands: ['ghostty'],
    desktopFile: 'com.mitchellh.ghostty.desktop',
  },
  {
    name: 'Tilix',
    id: 'com.gexperts.Tilix',
    category: AppCategory.Terminal,
    commands: ['tilix'],
    desktopFile: 'com.gexperts.Tilix.desktop',
  },
  {
    name: 'Terminator',
    id: 'terminator',
    category: AppCategory.Terminal,
    commands: ['terminator'],
    desktopFile: 'terminator.desktop',
  },
  {
    name: 'xterm',
    id: 'xterm',
    category: AppCategory.Terminal,
    commands: ['xterm'],
  },

  // Editors
  {
    name: 'VS Code',
    id: 'com.microsoft.VSCode',
    category: AppCategory.Editor,
    commands: ['code'],
    desktopFile: 'code.desktop',
  },
  {
    name: 'VSCodium',
    id: 'com.vscodium.codium',
    category: AppCategory.Editor,
    commands: ['codium'],
    desktopFile: 'codium.desktop',
  },
  {
    name: 'Cursor',
    id: 'com.todesktop.230313mzl4w4u92',
    category: AppCategory.Editor,
    commands: ['cursor'],
    desktopFile: 'cursor.desktop',
  },
  {
    name: 'Zed',
    id: 'dev.zed.Zed',
    category: AppCategory.Editor,
    commands: ['zed', 'zedit'],
    desktopFile: 'dev.zed.Zed.desktop',
  },
  {
    name: 'Sublime Text',
    id: 'com.sublimetext.4',
    category: AppCategory.Editor,
    commands: ['subl', 'sublime_text'],
    desktopFile: 'sublime_text.desktop',
  },
  {
    name: 'Atom',
    id: 'io.atom.Atom',
    category: AppCategory.Editor,
    commands: ['atom'],
    desktopFile: 'atom.desktop',
  },
  {
    name: 'Gedit',
    id: 'org.gnome.gedit',
    category: AppCategory.Editor,
    commands: ['gedit'],
    desktopFile: 'org.gnome.gedit.desktop',
  },
  {
    name: 'Kate',
    id: 'org.kde.kate',
    category: AppCategory.Editor,
    commands: ['kate'],
    desktopFile: 'org.kde.kate.desktop',
  },
  {
    name: 'GVim',
    id: 'org.vim.gvim',
    category: AppCategory.Editor,
    commands: ['gvim'],
    desktopFile: 'gvim.desktop',
  },
  {
    name: 'Emacs',
    id: 'org.gnu.emacs',
    category: AppCategory.Editor,
    commands: ['emacs'],
    desktopFile: 'emacs.desktop',
  },

  // JetBrains IDEs
  {
    name: 'IntelliJ IDEA',
    id: 'com.jetbrains.intellij',
    category: AppCategory.Editor,
    commands: ['idea', 'intellij-idea-ultimate', 'intellij-idea-community'],
    desktopFile: 'jetbrains-idea.desktop',
  },
  {
    name: 'WebStorm',
    id: 'com.jetbrains.WebStorm',
    category: AppCategory.Editor,
    commands: ['webstorm'],
    desktopFile: 'jetbrains-webstorm.desktop',
  },
  {
    name: 'PyCharm',
    id: 'com.jetbrains.pycharm',
    category: AppCategory.Editor,
    commands: ['pycharm', 'pycharm-professional', 'pycharm-community'],
    desktopFile: 'jetbrains-pycharm.desktop',
  },
  {
    name: 'CLion',
    id: 'com.jetbrains.CLion',
    category: AppCategory.Editor,
    commands: ['clion'],
    desktopFile: 'jetbrains-clion.desktop',
  },
  {
    name: 'GoLand',
    id: 'com.jetbrains.goland',
    category: AppCategory.Editor,
    commands: ['goland'],
    desktopFile: 'jetbrains-goland.desktop',
  },
  {
    name: 'RustRover',
    id: 'com.jetbrains.rustrover',
    category: AppCategory.Editor,
    commands: ['rustrover'],
    desktopFile: 'jetbrains-rustrover.desktop',
  },

  // System - File Managers
  {
    name: 'Files',
    id: 'org.gnome.Nautilus',
    category: AppCategory.Finder,
    commands: ['nautilus'],
    desktopFile: 'org.gnome.Nautilus.desktop',
  },
  {
    name: 'Dolphin',
    id: 'org.kde.dolphin',
    category: AppCategory.Finder,
    commands: ['dolphin'],
    desktopFile: 'org.kde.dolphin.desktop',
  },
  {
    name: 'Thunar',
    id: 'thunar',
    category: AppCategory.Finder,
    commands: ['thunar'],
    desktopFile: 'thunar.desktop',
  },
  {
    name: 'Nemo',
    id: 'nemo',
    category: AppCategory.Finder,
    commands: ['nemo'],
    desktopFile: 'nemo.desktop',
  },
  {
    name: 'PCManFM',
    id: 'pcmanfm',
    category: AppCategory.Finder,
    commands: ['pcmanfm'],
    desktopFile: 'pcmanfm.desktop',
  },
];
