/**
 * Ejemplo de validación de Deepdots SDK en React Native.
 * Copia este App.tsx en una app RN (ver README) y pulsa los botones: el resultado del
 * tracking se imprime en la consola de Metro (analytics en dry-run) y los eventos de
 * popup se envían a /sdk/popups.
 */
import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Text, View, Button, StyleSheet } from 'react-native';
import { DeepdotsProvider, useDeepdots } from '@magicfeedback/popup-sdk/react-native';

// ⚠️ Pon tu publicKey real y, para el survey, un surveyId/productId válidos del proyecto.
const CONFIG = {
  apiKey: 'TU_PUBLIC_KEY',
  nodeEnv: __DEV__ ? ('development' as const) : ('production' as const),
  // Descomenta para ENVIAR la analítica a POST /sdk/feedback (sin esto, dry-run en consola):
  // analytics: { publicKey: 'TU_PUBLIC_KEY', integration: 'TU_INTEGRATION' },
};

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Demo() {
  const dd = useDeepdots();
  const [info, setInfo] = useState('—');

  const refresh = () => setInfo(`user_id: ${dd.getUserId()}\nsession_id: ${dd.getSessionId()}`);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Deepdots SDK · RN demo</Text>
      <Text style={styles.mono}>{info}</Text>
      <Row><Button title="Ver identidad" onPress={refresh} /></Row>

      <Text style={styles.h2}>Navegación (#9–10)</Text>
      <Row><Button title="setScreen('Home')" onPress={() => dd.setScreen('Home')} /></Row>
      <Row><Button title="setScreen('Product/123')" onPress={() => dd.setScreen('/product/123')} /></Row>

      <Text style={styles.h2}>Atributos + eventos</Text>
      <Row><Button title="setUserAttributes" onPress={() => dd.setUserAttributes({ registration_status: 'registered', pass_type: 'premium', sector: 'retail', pass_status: 'active' })} /></Row>
      <Row><Button title="track('add_to_cart')" onPress={() => dd.track('add_to_cart', { product_id: 'p1', value: 49.9 })} /></Row>

      <Text style={styles.h2}>Mini-service (#23,#27)</Text>
      <Row><Button title="enterMiniService('checkout')" onPress={() => dd.enterMiniService('checkout', 'home')} /></Row>
      <Row><Button title="exitMiniService()" onPress={() => dd.exitMiniService()} /></Row>

      <Text style={styles.h2}>Findability (#31,#34,#35)</Text>
      <Row><Button title="trackSearch('zapatos', 0)" onPress={() => dd.trackSearch('zapatos', 0)} /></Row>
      <Row><Button title="trackFindabilityFriction" onPress={() => dd.trackFindabilityFriction('checkout_address')} /></Row>

      <Text style={styles.h2}>Funnel</Text>
      <Row><Button title="trackFunnelStep('task_started')" onPress={() => dd.trackFunnelStep('outstanding_task', 'task_started', 'task-42')} /></Row>

      <Text style={styles.h2}>Surveys / popup (#18–22)</Text>
      <Text style={styles.h2}>Analytics (dry-run)</Text>
      <Row><Button title="previewAnalytics() → consola" onPress={() => console.log('[preview]', JSON.stringify(dd.previewAnalytics(), null, 2))} /></Row>
      <Row><Button title="flushAnalytics() (dry-run)" onPress={() => dd.flushAnalytics()} /></Row>

      <Text style={styles.h2}>Privacidad</Text>
      <Row><Button title="setTrackingEnabled(false)" onPress={() => { dd.setTrackingEnabled(false); refresh(); }} /></Row>
      <Row><Button title="setTrackingEnabled(true)" onPress={() => { dd.setTrackingEnabled(true); refresh(); }} /></Row>

      <Text style={styles.note}>El payload de analytics se imprime en la consola de Metro. Mira: [DeepdotsAnalytics] (dry-run …) y [DeepdotsPopups] tracking · …</Text>
    </ScrollView>
  );
}

export default function App() {
  return (
    <DeepdotsProvider config={CONFIG}>
      <SafeAreaView style={{ flex: 1 }}>
        <Demo />
      </SafeAreaView>
    </DeepdotsProvider>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  h2: { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  row: { marginVertical: 2 },
  mono: { fontFamily: 'Courier', fontSize: 12, color: '#444' },
  note: { marginTop: 24, fontSize: 12, color: '#666' },
});
