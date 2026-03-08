import { Amplify } from '@aws-amplify/core';

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID || 'us-east-1_2aRyF88kn',
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || 'ais8hp3fcc9q0khgggvukh7hn',
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      loginWith: {
        email: true,
      },
      userAttributes: {
        email: {
          required: true,
        },
      },
    }
  },
  API: {
    REST: {
      awsnoozr: {
        endpoint: process.env.REACT_APP_API_GATEWAY_URL || 'https://yq5g250msc.execute-api.us-east-1.amazonaws.com/prod',
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      }
    }
  }
};

// Configure Amplify
Amplify.configure(awsConfig);

// Log configuration for debugging (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('Amplify configured with:', {
    userPoolId: awsConfig.Auth.Cognito.userPoolId,
    userPoolClientId: awsConfig.Auth.Cognito.userPoolClientId,
    region: awsConfig.Auth.Cognito.region,
  });
}

export default awsConfig;
