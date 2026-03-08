import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { signIn } from '@aws-amplify/auth';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useDispatch } from 'react-redux';
import { setUser, setLoading } from '../store/authSlice';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoadingState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    checkBiometricAvailability();
    checkStoredCredentials();
  }, []);

  const checkBiometricAvailability = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);
  };

  const checkStoredCredentials = async () => {
    try {
      const storedEmail = await SecureStore.getItemAsync('userEmail');
      if (storedEmail && biometricAvailable) {
        // Show biometric prompt
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Login to AWSnoozr',
          fallbackLabel: 'Use password',
        });

        if (result.success) {
          setEmail(storedEmail);
          const storedPassword = await SecureStore.getItemAsync('userPassword');
          if (storedPassword) {
            handleLogin(storedEmail, storedPassword);
          }
        }
      }
    } catch (error) {
      console.error('Error checking stored credentials:', error);
    }
  };

  const handleLogin = async (emailParam?: string, passwordParam?: string) => {
    const loginEmail = emailParam || email;
    const loginPassword = passwordParam || password;

    if (!loginEmail || !loginPassword) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoadingState(true);
    dispatch(setLoading(true));

    try {
      const { isSignedIn, nextStep } = await signIn({
        username: loginEmail,
        password: loginPassword,
      });

      if (isSignedIn) {
        // Store credentials for biometric login
        await SecureStore.setItemAsync('userEmail', loginEmail);
        await SecureStore.setItemAsync('userPassword', loginPassword);

        dispatch(setUser({ email: loginEmail }));
      } else {
        Alert.alert('Login Failed', 'Please check your credentials');
      }
    } catch (error: any) {
      Alert.alert('Login Error', error.message || 'An error occurred');
    } finally {
      setLoadingState(false);
      dispatch(setLoading(false));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>AWSnoozr</Text>
        <Text style={styles.tagline}>AWS Cost Management</Text>
      </View>

      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => handleLogin()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        {biometricAvailable && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={checkStoredCredentials}
          >
            <Text style={styles.biometricText}>🔐 Use Biometric Login</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.version}>Version 1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4299e1',
  },
  tagline: {
    fontSize: 16,
    color: '#718096',
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4299e1',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricButton: {
    marginTop: 20,
    padding: 16,
    alignItems: 'center',
  },
  biometricText: {
    color: '#4299e1',
    fontSize: 16,
    fontWeight: '500',
  },
  version: {
    textAlign: 'center',
    color: '#a0aec0',
    marginTop: 30,
    fontSize: 12,
  },
});
