import { DEFAULT_GAME_ID, DEFAULT_USER_ID } from '../content.js';
import { DEFAULT_ROUTE } from '../navigation.js';
import { STORAGE_KEY_USER } from './constants.js';

export function createAppState() {
  return {
    route: DEFAULT_ROUTE,
    userId: readStoredUser() || DEFAULT_USER_ID,
    gameId: DEFAULT_GAME_ID,
  };
}

export function readStoredUser() {
  try {
    return sessionStorage.getItem(STORAGE_KEY_USER) || '';
  } catch {
    return '';
  }
}

export function writeStoredUser(userId) {
  try {
    sessionStorage.setItem(STORAGE_KEY_USER, userId);
  } catch {
    // Ignore storage errors in demo context.
  }
}
