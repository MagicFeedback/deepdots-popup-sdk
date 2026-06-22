/**
 * Entry de React Native: `@magicfeedback/popup-sdk/react-native`.
 *
 * El cliente solo envuelve su app:
 *   <DeepdotsProvider config={{ apiKey, nodeEnv }}>...</DeepdotsProvider>
 * y el SDK hace TODO (storage persistente, device info, platform, lifecycle/engagement,
 * y render de surveys en WebView). Sin pegar nada en su proyecto.
 *
 * Peer deps: react, react-native, react-native-webview. Opcionales (auto-detectados):
 * react-native-mmkv (persistencia), react-native-device-info (device info).
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DeepdotsPopups } from '../core/deepdots-popups';
import { ReactNativePopupRenderer, type ReactNativeSurveyPayload } from '../platform/react-native-renderer';
import { setupReactNative } from './setup';
import type { DeepdotsInitParams } from '../types';

const sdk = new DeepdotsPopups();
const DeepdotsContext = createContext<DeepdotsPopups>(sdk);

/** Acceso al SDK desde cualquier componente: `const dd = useDeepdots()`. */
export const useDeepdots = (): DeepdotsPopups => useContext(DeepdotsContext);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function optionalRequire(name: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name);
  } catch {
    return null;
  }
}

export interface DeepdotsProviderProps {
  config: DeepdotsInitParams;
  children?: React.ReactNode;
}

export function DeepdotsProvider({ config, children }: DeepdotsProviderProps) {
  const [survey, setSurvey] = useState<ReactNativeSurveyPayload | null>(null);
  const rendererRef = useRef<ReactNativePopupRenderer | null>(null);

  useEffect(() => {
    const renderer = new ReactNativePopupRenderer({
      onShow: (p) => setSurvey(p),
      onHide: () => setSurvey(null),
    });
    rendererRef.current = renderer;

    const MmkvMod = optionalRequire('react-native-mmkv');
    const mmkv = MmkvMod?.MMKV ? new MmkvMod.MMKV({ id: 'deepdots-sdk' }) : null;
    const deviceInfo = optionalRequire('react-native-device-info')?.default ?? null;

    const dispose = setupReactNative(sdk, config, {
      mmkv,
      deviceInfo,
      appState: AppState,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      renderer,
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DeepdotsContext.Provider value={sdk}>
      {children}
      {survey ? (
        <Modal visible transparent animationType="slide">
          <View style={{ flex: 1 }}>
            <WebView
              originWhitelist={['*']}
              javaScriptEnabled
              source={{ html: survey.html }}
              onMessage={(e: { nativeEvent: { data: string } }) =>
                rendererRef.current?.handleMessage(e.nativeEvent.data)
              }
            />
          </View>
        </Modal>
      ) : null}
    </DeepdotsContext.Provider>
  );
}

export { setupReactNative } from './setup';
export { ReactNativePopupRenderer } from '../platform/react-native-renderer';
