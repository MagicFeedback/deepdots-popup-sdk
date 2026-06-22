/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shims mínimos de los módulos de React Native, solo para compilar/typear el entry RN
 * sin instalar `react-native` en este repo. En la app del cliente, los tipos reales de
 * cada paquete (react-native, react-native-webview, …) sustituyen a estos.
 */
declare module 'react-native' {
  export const Platform: { OS: 'ios' | 'android' | 'web' | string };
  export const AppState: {
    addEventListener(type: 'change', listener: (state: string) => void): { remove: () => void };
  };
  export const Modal: any;
  export const View: any;
}

declare module 'react-native-webview' {
  export const WebView: any;
}

declare module 'react-native-mmkv' {
  export class MMKV {
    constructor(config?: { id?: string });
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
  }
}

declare module 'react-native-device-info' {
  const DeviceInfo: {
    isTablet(): boolean;
    getSystemVersion(): string;
    getDeviceId(): string;
    getVersion(): string;
  };
  export default DeviceInfo;
}
