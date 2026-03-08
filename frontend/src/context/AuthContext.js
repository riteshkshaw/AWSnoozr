import React, { createContext, useState, useEffect, useContext } from 'react';
import { signIn as amplifySignIn, signOut as amplifySignOut, getCurrentUser, fetchAuthSession, confirmSignIn } from 'aws-amplify/auth';

const AuthContext = createContext({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (username, password) => {
    try {
      const result = await amplifySignIn({ username, password });
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        return result;
      }
      await checkUser();
      return result;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const confirmNewPassword = async (newPassword) => {
    try {
      const result = await confirmSignIn({ challengeResponse: newPassword });
      await checkUser();
      return result;
    } catch (error) {
      console.error('Confirm new password error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const getAuthToken = async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString();
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, confirmNewPassword, signOut, getAuthToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
