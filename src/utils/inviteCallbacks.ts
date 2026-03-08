import type { Player } from '../types';

interface InviteCallbackSet {
  onSelectExistingPlayer?: (player: Player) => void;
  onPlaceholderCreated?: (player: Player) => void;
}

let currentCallbacks: InviteCallbackSet | null = null;

export const inviteCallbacks = {
  set(callbacks: InviteCallbackSet) {
    currentCallbacks = callbacks;
  },
  get(): InviteCallbackSet | null {
    return currentCallbacks;
  },
  clear() {
    currentCallbacks = null;
  },
};
