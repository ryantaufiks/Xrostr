export type Theme = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'xr-theme';

/**
 * The preference (dark, light) or 'system'. "System" follows the OS and is the default when
 * the user has never chosen, so the app matches the device out of the box.
 */
export function themePreference(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Turns a preference into the concrete theme to render, resolving 'system' from the OS. */
export function resolveTheme(preference: Theme | null): 'dark' | 'light' {
  return resolvePreference(preference, window.matchMedia('(prefers-color-scheme: light)').matches);
}

/** Pure form of resolveTheme, for tests: an explicit choice wins, else follow the system. */
export function resolvePreference(
  preference: Theme | null,
  systemPrefersLight: boolean,
): 'dark' | 'light' {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersLight ? 'light' : 'dark';
}

/** The theme actually shown right now (set by the boot script or applyTheme). */
export function effectiveTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Runs inline in <head> before the first paint, so a light-theme user never sees a dark flash.
 * Follows the stored preference, else the OS, and keeps following OS changes while the choice
 * is 'system' (or unset).
 */
export const THEME_BOOT_SCRIPT = `try{var k='${THEME_STORAGE_KEY}';function x(){var p=localStorage.getItem(k);var t=p==='light'||p==='dark'?p:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');if(t==='light')document.documentElement.dataset.theme='light';else delete document.documentElement.dataset.theme}x();try{matchMedia('(prefers-color-scheme: light)').addEventListener('change',x)}catch(e){}}catch(e){}`;

const THEME_COLORS: Record<'dark' | 'light', string> = { dark: '#000000', light: '#dcdeda' };

/** Matches the phone's status bar to the active theme. */
export function syncThemeColor(): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[effectiveTheme()]);
}

export function applyTheme(preference: Theme): void {
  if (resolveTheme(preference) === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode or storage blocked: the choice simply lasts for this page.
  }
  syncThemeColor();
}
