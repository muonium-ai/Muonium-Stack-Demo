export const DEFAULT_THEME_ID = 'default';
export const THEME_STORAGE_KEY = 'muon.selectedTheme';

export const BUILT_IN_THEMES = [
  {
    id: 'default',
    label: 'Default',
    tokens: {
      'color-page-bg': '#f6f7fb',
      'color-text-primary': '#1c2230',
      'color-text-muted': '#3b4b67',
      'color-surface': '#ffffff',
      'color-surface-subtle': '#f8faff',
      'color-overlay': 'rgba(20, 28, 45, 0.45)',
      'color-border': '#d9deea',
      'color-border-strong': '#c7cfdf',
      'color-focus-bg': '#eef3ff',
      'color-focus-border': '#a9b9d6',
      'color-btn-search': '#2563eb',
      'color-btn-search-hover': '#1d4ed8',
      'color-btn-search-border': '#1f4bc3',
      'color-btn-upload': '#d97706',
      'color-btn-upload-hover': '#b45309',
      'color-btn-upload-border': '#b45309',
      'color-btn-benchmark': '#0d9488',
      'color-btn-benchmark-hover': '#0f766e',
      'color-btn-benchmark-border': '#0f766e',
      'color-btn-visual': '#7c3aed',
      'color-btn-visual-hover': '#6d28d9',
      'color-btn-visual-border': '#6d28d9',
      'color-text-on-primary': '#ffffff',
      'color-board-border': '#333333',
      'color-board-light': '#f0d9b5',
      'color-board-dark': '#b58863',
      'color-pgn-active': '#2563eb',
      'color-piece-white': '#f8fafc',
      'color-piece-black': '#111827',
      'color-piece-outline': 'rgba(15, 23, 42, 0.45)',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    tokens: {
      'color-page-bg': '#0b1220',
      'color-text-primary': '#e5edf9',
      'color-text-muted': '#9fb1cd',
      'color-surface': '#111a2e',
      'color-surface-subtle': '#1a2640',
      'color-overlay': 'rgba(2, 6, 23, 0.72)',
      'color-border': '#22324f',
      'color-border-strong': '#31486f',
      'color-focus-bg': '#1c3558',
      'color-focus-border': '#3d5f8c',
      'color-btn-search': '#1d4ed8',
      'color-btn-search-hover': '#1e40af',
      'color-btn-search-border': '#1e3a8a',
      'color-btn-upload': '#b45309',
      'color-btn-upload-hover': '#92400e',
      'color-btn-upload-border': '#78350f',
      'color-btn-benchmark': '#0f766e',
      'color-btn-benchmark-hover': '#115e59',
      'color-btn-benchmark-border': '#134e4a',
      'color-btn-visual': '#6d28d9',
      'color-btn-visual-hover': '#5b21b6',
      'color-btn-visual-border': '#4c1d95',
      'color-text-on-primary': '#ffffff',
      'color-board-border': '#0f172a',
      'color-board-light': '#8aa1c4',
      'color-board-dark': '#2f425d',
      'color-pgn-active': '#2563eb',
      'color-piece-white': '#f8fafc',
      'color-piece-black': '#0b1020',
      'color-piece-outline': 'rgba(148, 163, 184, 0.5)',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    tokens: {
      'color-page-bg': '#edf4ed',
      'color-text-primary': '#1f3a29',
      'color-text-muted': '#45644f',
      'color-surface': '#f7fbf7',
      'color-surface-subtle': '#ecf5ec',
      'color-overlay': 'rgba(21, 55, 34, 0.4)',
      'color-border': '#c7dbc9',
      'color-border-strong': '#a9c4ac',
      'color-focus-bg': '#ddecdf',
      'color-focus-border': '#91b296',
      'color-btn-search': '#2f855a',
      'color-btn-search-hover': '#276749',
      'color-btn-search-border': '#22543d',
      'color-btn-upload': '#b7791f',
      'color-btn-upload-hover': '#975a16',
      'color-btn-upload-border': '#7b4a13',
      'color-btn-benchmark': '#2f855a',
      'color-btn-benchmark-hover': '#276749',
      'color-btn-benchmark-border': '#22543d',
      'color-btn-visual': '#6b46c1',
      'color-btn-visual-hover': '#553c9a',
      'color-btn-visual-border': '#44337a',
      'color-text-on-primary': '#ffffff',
      'color-board-border': '#2f5233',
      'color-board-light': '#d9ead3',
      'color-board-dark': '#7da27f',
      'color-pgn-active': '#2f855a',
      'color-piece-white': '#fffdf7',
      'color-piece-black': '#1c2f20',
      'color-piece-outline': 'rgba(34, 84, 61, 0.45)',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    tokens: {
      'color-page-bg': '#edf6fb',
      'color-text-primary': '#13354a',
      'color-text-muted': '#3a6075',
      'color-surface': '#ffffff',
      'color-surface-subtle': '#f2f9fd',
      'color-overlay': 'rgba(12, 46, 70, 0.45)',
      'color-border': '#c8ddea',
      'color-border-strong': '#aac8da',
      'color-focus-bg': '#e0f0f8',
      'color-focus-border': '#89b2ca',
      'color-btn-search': '#0284c7',
      'color-btn-search-hover': '#0369a1',
      'color-btn-search-border': '#075985',
      'color-btn-upload': '#f59e0b',
      'color-btn-upload-hover': '#d97706',
      'color-btn-upload-border': '#b45309',
      'color-btn-benchmark': '#0d9488',
      'color-btn-benchmark-hover': '#0f766e',
      'color-btn-benchmark-border': '#115e59',
      'color-btn-visual': '#7c3aed',
      'color-btn-visual-hover': '#6d28d9',
      'color-btn-visual-border': '#5b21b6',
      'color-text-on-primary': '#ffffff',
      'color-board-border': '#1b4965',
      'color-board-light': '#cae9ff',
      'color-board-dark': '#62b6cb',
      'color-pgn-active': '#0284c7',
      'color-piece-white': '#f8fdff',
      'color-piece-black': '#0b2233',
      'color-piece-outline': 'rgba(14, 65, 97, 0.5)',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    tokens: {
      'color-page-bg': '#fff5ee',
      'color-text-primary': '#4a2a25',
      'color-text-muted': '#7a4c43',
      'color-surface': '#fffaf7',
      'color-surface-subtle': '#fff2eb',
      'color-overlay': 'rgba(74, 42, 37, 0.45)',
      'color-border': '#efd2c2',
      'color-border-strong': '#e1b8a5',
      'color-focus-bg': '#ffe8dc',
      'color-focus-border': '#d99e82',
      'color-btn-search': '#ea580c',
      'color-btn-search-hover': '#c2410c',
      'color-btn-search-border': '#9a3412',
      'color-btn-upload': '#d97706',
      'color-btn-upload-hover': '#b45309',
      'color-btn-upload-border': '#92400e',
      'color-btn-benchmark': '#0f766e',
      'color-btn-benchmark-hover': '#115e59',
      'color-btn-benchmark-border': '#134e4a',
      'color-btn-visual': '#be185d',
      'color-btn-visual-hover': '#9d174d',
      'color-btn-visual-border': '#831843',
      'color-text-on-primary': '#ffffff',
      'color-board-border': '#7c3f2a',
      'color-board-light': '#ffd6ba',
      'color-board-dark': '#d38b5d',
      'color-pgn-active': '#ea580c',
      'color-piece-white': '#fffaf2',
      'color-piece-black': '#35211a',
      'color-piece-outline': 'rgba(94, 48, 34, 0.45)',
    },
  },
];

export const THEME_TOKEN_KEYS = [
  'color-page-bg',
  'color-text-primary',
  'color-text-muted',
  'color-surface',
  'color-surface-subtle',
  'color-overlay',
  'color-border',
  'color-border-strong',
  'color-focus-bg',
  'color-focus-border',
  'color-btn-search',
  'color-btn-search-hover',
  'color-btn-search-border',
  'color-btn-upload',
  'color-btn-upload-hover',
  'color-btn-upload-border',
  'color-btn-benchmark',
  'color-btn-benchmark-hover',
  'color-btn-benchmark-border',
  'color-btn-visual',
  'color-btn-visual-hover',
  'color-btn-visual-border',
  'color-text-on-primary',
  'color-board-border',
  'color-board-light',
  'color-board-dark',
  'color-pgn-active',
  'color-piece-white',
  'color-piece-black',
  'color-piece-outline',
];

export function setActiveTheme(themeId = DEFAULT_THEME_ID, root = document.documentElement) {
  if (!root) {
    return;
  }
  root.setAttribute('data-theme', themeId || DEFAULT_THEME_ID);
}

export function getBuiltInThemeById(themeId) {
  return BUILT_IN_THEMES.find((theme) => theme.id === themeId) ?? null;
}

export function resolveInitialThemeId(storage = localStorage) {
  const storedThemeId = storage?.getItem?.(THEME_STORAGE_KEY) ?? null;
  const storedTheme = getBuiltInThemeById(storedThemeId);
  return storedTheme?.id ?? DEFAULT_THEME_ID;
}

export function persistThemeId(themeId, storage = localStorage) {
  if (!storage?.setItem) {
    return;
  }
  storage.setItem(THEME_STORAGE_KEY, themeId);
}

export function applyThemeTokens(tokens = {}, root = document.documentElement) {
  if (!root || !tokens || typeof tokens !== 'object') {
    return;
  }

  for (const key of THEME_TOKEN_KEYS) {
    const value = tokens[key];
    if (typeof value === 'string' && value.trim()) {
      root.style.setProperty(`--${key}`, value.trim());
    }
  }
}

export function clearThemeTokens(root = document.documentElement) {
  if (!root) {
    return;
  }

  for (const key of THEME_TOKEN_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

export function initializeThemeFoundation(themeId = DEFAULT_THEME_ID) {
  setActiveTheme(themeId);
}