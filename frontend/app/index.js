import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { getToken } from './api';
import { router } from 'expo-router';

export default function Index() {
  useEffect(() => {
    // On app open: if a JWT already exists, skip onboarding and go to dashboard
    getToken().then((token) => {
      if (token) {
        router.replace('/dashboard');
      }
      // else the splash screen handles the /onboarding redirect normally
    });
  }, []);

  return <Redirect href="/splash" />;
}