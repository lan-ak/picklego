export const colors = {
  // Brand palette ("Neon-Organic")
  primary: '#4CAF50',      // Pickle Green — branding, success states, main buttons
  action: '#FFC107',       // Power Yellow — CTAs, highlights, "New" badges
  secondary: '#2196F3',    // Court Blue — secondary buttons, links, opponent tags
  neutral: '#333333',      // Deep Asphalt — primary text, borders
  surface: '#F5F5F5',      // Court Gray — backgrounds, card containers
  white: '#FFFFFF',        // Win White — text on buttons, card backgrounds

  // Semantic
  success: '#4CAF50',
  error: '#F44336',
  info: '#2196F3',
  warning: '#FFC107',

  // Win/Loss
  win: '#4CAF50',
  loss: '#F44336',

  // Gray scale
  gray100: '#F5F5F5',
  gray200: '#E0E0E0',
  gray300: '#CCCCCC',
  gray400: '#999999',
  gray500: '#666666',
  gray600: '#333333',

  // Component-specific
  cardBorder: '#E0E0E0',
  cardBackground: '#FFFFFF',
  inputBorder: '#DDDDDD',
  tabInactive: '#BBC3CE',
  backdrop: 'rgba(0, 0, 0, 0.5)',

  // Transparent overlays
  winOverlay: 'rgba(76, 175, 80, 0.15)',
  lossOverlay: 'rgba(244, 67, 54, 0.15)',
  primaryOverlay: 'rgba(76, 175, 80, 0.1)',
  actionOverlay: 'rgba(255, 193, 7, 0.15)',
  secondaryOverlay: 'rgba(33, 150, 243, 0.15)',
} as const;
