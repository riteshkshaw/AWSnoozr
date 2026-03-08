#!/bin/bash

echo "Testing AWSnoozr API..."
echo ""
echo "API Gateway URL: https://yq5g250msc.execute-api.us-east-1.amazonaws.com/prod"
echo ""
echo "To test the API, you need a JWT token from Cognito."
echo "You can get this by:"
echo "1. Logging into the frontend application"
echo "2. Or using AWS CLI to authenticate"
echo ""
echo "Example Lambda function test (without auth):"
aws lambda list-functions --query 'Functions[?contains(FunctionName, `awsnoozr-prod`)].FunctionName' --output table
