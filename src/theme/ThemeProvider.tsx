import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

type Theme = { colors: Palette; isDark: boolean };
const Ctx = createContext<Theme>({ colors: dark, isDark: true });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<Theme>(() => ({ colors: scheme === 'light' ? light : dark, isDark: scheme !== 'light' }), [scheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
