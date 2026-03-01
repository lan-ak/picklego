import { TextStyle } from 'react-native';

export const fontFamily = {
  fredokaBold: 'Fredoka_700Bold',
  fredokaSemiBold: 'Fredoka_600SemiBold',
  fredokaMedium: 'Fredoka_500Medium',
  fredokaRegular: 'Fredoka_400Regular',
} as const;

export const typography = {
  // Headings (Fredoka)
  h1: {
    fontFamily: fontFamily.fredokaBold,
    fontSize: 32,
    lineHeight: 38,
  } as TextStyle,

  h2: {
    fontFamily: fontFamily.fredokaSemiBold,
    fontSize: 24,
    lineHeight: 31,
  } as TextStyle,

  h3: {
    fontFamily: fontFamily.fredokaSemiBold,
    fontSize: 20,
    lineHeight: 26,
  } as TextStyle,

  // Body
  bodyLarge: {
    fontFamily: fontFamily.fredokaMedium,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontFamily: fontFamily.fredokaRegular,
    fontSize: 14,
    lineHeight: 21,
  } as TextStyle,

  // Buttons (Fredoka)
  button: {
    fontFamily: fontFamily.fredokaSemiBold,
    fontSize: 16,
    lineHeight: 19,
  } as TextStyle,

  // Stats & Scores
  stats: {
    fontFamily: fontFamily.fredokaBold,
    fontSize: 24,
  } as TextStyle,

  scoreDisplay: {
    fontFamily: fontFamily.fredokaBold,
    fontSize: 28,
  } as TextStyle,

  // Small text
  caption: {
    fontFamily: fontFamily.fredokaRegular,
    fontSize: 12,
    lineHeight: 17,
  } as TextStyle,

  label: {
    fontFamily: fontFamily.fredokaMedium,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,
} as const;
