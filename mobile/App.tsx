import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Amplify } from 'aws-amplify';
import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';
import { store } from './src/store';
import { registerForPushNotifications } from './src/services/notifications';

// Configure AWS Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID || '',
      userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID || '',
      region: process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1',
    }
  },
  API: {
    REST: {
      AWSnoozrAPI: {
        endpoint: process.env.EXPO_PUBLIC_API_GATEWAY_URL || '',
        region: process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1',
      }
    }
  }
});

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications();

    // Listen for notifications
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    return () => subscription.remove();
  }, []);

  return (
    <Provider store={store}>
      <NavigationContainer>
        <StatusBar style="auto" />
        <AppNavigator />
      </NavigationContainer>
    </Provider>
  );
}
