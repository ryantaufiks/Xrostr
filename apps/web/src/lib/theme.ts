export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'xr-theme';

/**
 * Runs inline in <head> before the first paint, so a light-theme user never sees a dark
 * flash. Dark is the default; only an explicit 'light' choice changes it.
 */
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

const THEME_COLORS: Record<Theme, string> = { dark: '#000000', light: '#dcdeda' };

/** Matches the phone's status bar to the active theme. */
export function syncThemeColor(): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[currentTheme()]);
}

export function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or storage blocked: the choice simply lasts for this page.
  }
  syncThemeColor();
}
