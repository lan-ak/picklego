/** Formats "John Smith" → "John S." — returns as-is if single name */
export const formatPlayerNameWithInitial = (fullName: string): string => {
  const parts = fullName.trim().split(' ');
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};
