export function getAppElements() {
  return {
    app: document.getElementById('app'),
    btnNavLogin: document.getElementById('btn-nav-login'),
  };
}

export function bindShellEvents({ elements, navigate }) {
  elements.btnNavLogin?.addEventListener('click', () => {
    navigate('login');
  });
}
