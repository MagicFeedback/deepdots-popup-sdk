/**
 * Entrada del paquete en React Native: Metro la elige por la condición `react-native` de
 * `exports` (y el campo `react-native`), así que el host sigue haciendo
 * `import { DeepdotsPopups } from '@magicfeedback/popup-sdk'`. Igual que la web, más lo que el
 * SDK detecta solo en móvil: el ciclo de vida (AppState), las promesas rechazadas sin `catch` (Hermes) y, en iOS, el tiempo de background para
 * el cierre de la sesión (módulo nativo `DeepdotsBackgroundTask`, si el autolinking lo enlazó).
 */
import { AppState, NativeModules, Platform } from 'react-native';
import { registerReactNativeDefaults } from './platform/react-native-defaults';

registerReactNativeDefaults({ AppState, NativeModules, Platform });

export * from './index';
