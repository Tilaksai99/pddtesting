import { useEffect } from 'react';

import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { router } from 'expo-router';

export default function SplashScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/onboarding');
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={['#2563EB', '#1E3A8A']}
      style={styles.container}
    >
      <Text style={styles.logo}>
        🏥
      </Text>

      <Text style={styles.title}>
        Medical AI Platform
      </Text>

      <Text style={styles.subtitle}>
        AI Powered Medical Coding
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  logo: {
    fontSize: 90,
    marginBottom: 20,
  },

  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 18,
    color: '#DBEAFE',
  },
});