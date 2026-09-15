import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { typeScale, type TypeVariant } from '@/theme/tokens';

/**
 * Type variants.
 *
 * The `typeScale` names (hero → overline) are the current vocabulary. The
 * original names (`small`, `subtitle`, `link`, …) are kept so untouched screens
 * keep rendering exactly as before.
 */
export type ThemedTextType =
  | TypeVariant
  | 'default'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'link'
  | 'linkPrimary'
  | 'code';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

const legacy = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  default: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  subtitle: { fontSize: 32, lineHeight: 44, fontWeight: 600 },
  link: { lineHeight: 30, fontSize: 14 },
  linkPrimary: { lineHeight: 30, fontSize: 14 },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

const variants: Record<ThemedTextType, TextStyle> = {
  ...typeScale,
  default: legacy.default,
  small: legacy.small,
  smallBold: legacy.smallBold,
  subtitle: legacy.subtitle,
  link: legacy.link,
  linkPrimary: legacy.linkPrimary,
  code: legacy.code,
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = themeColor
    ? theme[themeColor]
    : type === 'linkPrimary'
      ? theme.accent
      : theme.text;

  return <Text style={[{ color }, variants[type], style]} {...rest} />;
}
