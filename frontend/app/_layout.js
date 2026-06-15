import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { getToken } from './api';

export default function Layout() {
  // Auth guard runs once on cold start.
  // If a token already exists the user is sent straight to dashboard
  // by the splash/index redirect — nothing extra needed here.
  // The Stack is kept headerless exactly as before.

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}