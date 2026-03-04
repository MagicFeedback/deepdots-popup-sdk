export function createAppHandlers({ state, casinoSdk, writeStoredUser }) {
  function handleUserChange(userId) {
    state.userId = userId;
    writeStoredUser(userId);
    casinoSdk.init(userId);
  }

  function handleCasinoLogin(userId) {
    casinoSdk.registerUserAccess(userId);
  }

  return {
    handleCasinoLogin,
    handleUserChange,
  };
}
