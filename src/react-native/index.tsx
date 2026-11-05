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
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, NativeModules, Platform, ScrollView, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DeepdotsPopups, type NavigationRefLike } from '../core/deepdots-popups';
import { scrollPercentFromEvent, type ScrollEventLike } from './scroll';
import { ReactNativePopupRenderer, type ReactNativeSurveyPayload } from '../platform/react-native-renderer';
import { setupReactNative } from './setup';
import { registerReactNativeDefaults } from '../platform/react-native-defaults';

// Igual que la entrada principal en RN (`index.native.ts`): el módulo nativo de background
// (iOS) y el tracker de promesas de Hermes los usa el SDK sin que el host haga nada.
registerReactNativeDefaults({ AppState, NativeModules, Platform });
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
        // El Modal se abre en cuanto hay popup, y es el HTML del WebView el que se revela solo
        // cuando el survey está pintado (apertura diferida): con el Modal transparente, hasta ese
        // momento no se ve nada, ni velo ni spinner. No se difiere el Modal con `onReady` porque
        // React Native no monta los hijos de un Modal cerrado: el WebView no llegaría a cargar y
        // el aviso no llegaría nunca. El host que quiera diferir su contenedor debe montar el
        // WebView invisible (ver el ejemplo de `ReactNativePopupRenderer`).
        <Modal visible transparent animationType="slide">
          <View style={{ flex: 1 }}>
            <WebView
              style={{ flex: 1 }}
              originWhitelist={['*']}
              javaScriptEnabled
              // El survey enfoca la pregunta de texto al pasar de página; en iOS el WebView
              // ignora ese foco (no abre el teclado) si no se desactiva esto.
              keyboardDisplayRequiresUserAction={false}
              source={{ html: survey.html, baseUrl: 'https://sdk.deepdots.com/' }}
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

/**
 * Pantallas automáticas con React Navigation: pasa el ref del `NavigationContainer` y el SDK
 * sigue cada cambio de ruta (page views, `segments.path`, `excludedPaths`, trigger `exit`) sin
 * llamar a `setScreen`. Usa el SDK del Provider, o el que se le pase.
 *
 *   const navigationRef = createNavigationContainerRef();
 *   useDeepdotsNavigation(navigationRef);
 *   <NavigationContainer ref={navigationRef}>…</NavigationContainer>
 */
export function useDeepdotsNavigation(ref: NavigationRefLike | null | undefined, sdkOverride?: DeepdotsPopups): void {
  const context = useDeepdots();
  const target = sdkOverride ?? context;
  useEffect(() => target.trackNavigation(ref), [ref, target]);
}

/**
 * `onScroll` para cualquier lista desplazable (`FlatList`, `SectionList`…) que alimenta los
 * triggers `scroll`. Encadena el `onScroll` propio, si lo hay.
 */
export function useDeepdotsScroll(
  onScroll?: (event: ScrollEventLike) => void,
  sdkOverride?: DeepdotsPopups,
): (event: ScrollEventLike) => void {
  const context = useDeepdots();
  const target = sdkOverride ?? context;
  return useCallback(
    (event: ScrollEventLike) => {
      const percentage = scrollPercentFromEvent(event);
      if (percentage !== null) target.reportAutoScroll(percentage);
      onScroll?.(event);
    },
    [onScroll, target],
  );
}

export interface DeepdotsScrollViewProps {
  /** SDK a usar; por defecto, el del Provider. */
  sdk?: DeepdotsPopups;
  onScroll?: (event: ScrollEventLike) => void;
  /** Por defecto 100 ms: suficiente para un umbral de %, sin saturar el puente. */
  scrollEventThrottle?: number;
  children?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;
}

/** `ScrollView` que alimenta los triggers `scroll` (mismas props que `ScrollView`). */
export function DeepdotsScrollView({ sdk: sdkOverride, onScroll, scrollEventThrottle = 100, ...props }: DeepdotsScrollViewProps) {
  const handleScroll = useDeepdotsScroll(onScroll, sdkOverride);
  return <ScrollView {...props} scrollEventThrottle={scrollEventThrottle} onScroll={handleScroll} />;
}

export { scrollPercentFromEvent } from './scroll';
export type { ScrollEventLike } from './scroll';
export type { NavigationRefLike } from '../core/deepdots-popups';
export { setupReactNative } from './setup';
export { ReactNativePopupRenderer } from '../platform/react-native-renderer';
