import { Amplify } from '@aws-amplify/core';

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    }
  }
};

// Configure Amplify
Amplify.configure(awsConfig);

export default awsConfig;
