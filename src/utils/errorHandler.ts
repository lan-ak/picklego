type ErrorType = 'auth' | 'network' | 'validation' | 'destructive' | 'generic';

interface AppError {
  type: ErrorType;
  message: string;
  originalError?: unknown;
}

const FIREBASE_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email. Did you mean to sign up?',
  'auth/wrong-password': 'Incorrect password. Please try again or reset your password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/invalid-credential': 'Incorrect email or password. If you don\'t have an account, sign up instead.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please try a different method.',
};

const FIRESTORE_ERRORS: Record<string, string> = {
  'permission-denied': 'You do not have permission to perform this action.',
  'not-found': 'The requested data was not found.',
  'unavailable': 'Service temporarily unavailable. Please try again.',
  'deadline-exceeded': 'Request timed out. Please try again.',
};

export function classifyError(error: unknown): AppError {
  if (error instanceof Error) {
    const message = error.message;
    const code = (error as any).code as string | undefined;

    // Direct code lookup (Firebase errors have a .code property)
    if (code && FIREBASE_AUTH_ERRORS[code]) {
      return { type: 'auth', message: FIREBASE_AUTH_ERRORS[code], originalError: error };
    }
    if (code && FIRESTORE_ERRORS[code]) {
      return { type: 'network', message: FIRESTORE_ERRORS[code], originalError: error };
    }

    // Fallback: check if message contains an error code string
    for (const [errCode, friendlyMessage] of Object.entries(FIREBASE_AUTH_ERRORS)) {
      if (message.includes(errCode)) {
        return { type: 'auth', message: friendlyMessage, originalError: error };
      }
    }

    // Check Firestore errors in message
    for (const [errCode, friendlyMessage] of Object.entries(FIRESTORE_ERRORS)) {
      if (message.includes(errCode)) {
        return { type: 'network', message: friendlyMessage, originalError: error };
      }
    }

    // Network errors
    if (message.includes('network') || message.includes('Network') || message.includes('fetch')) {
      return { type: 'network', message: 'Network error. Please check your connection.', originalError: error };
    }

    return { type: 'generic', message: message, originalError: error };
  }

  return { type: 'generic', message: 'An unexpected error occurred.', originalError: error };
}

export function getErrorMessage(error: unknown): string {
  return classifyError(error).message;
}
