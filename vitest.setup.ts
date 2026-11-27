// happy-dom reports `navigator.webdriver === true` (it is a scripted browser). Since DD-574 the
// SDK makes no API call in an automated browser, so every test would run as a bot. The tests
// model a real visitor's browser; the ones about bots set it back on themselves.
Object.defineProperty(globalThis.navigator, 'webdriver', { value: false, configurable: true });
