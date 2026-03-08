#!/bin/bash

# Script to build all Lambda functions
# Run this before terraform apply

set -e

echo "Building Lambda layer..."
cd lambda/layers/common
npm install --production
zip -r layer.zip nodejs/ -x "*.git*" "*.DS_Store"
cd ../../..

echo "Building Lambda functions..."

# Function directories to build
FUNCTION_DIRS=(
  "lambda/functions/compute/list-ec2"
  "lambda/functions/compute/list-eks-clusters"
  "lambda/functions/compute/control-ec2"
  "lambda/functions/compute/control-eks-nodegroup"
  "lambda/functions/databases/list-rds"
  "lambda/functions/databases/list-redshift"
  "lambda/functions/databases/control-rds"
  "lambda/functions/databases/control-redshift"
  "lambda/functions/networking/list-nat-gateways"
  "lambda/functions/networking/list-elastic-ips"
  "lambda/functions/networking/list-load-balancers"
  "lambda/functions/storage/list-ebs-volumes"
  "lambda/functions/automation/schedule-processor"
  "lambda/functions/automation/manage-schedules"
  "lambda/functions/automation/cost-analyzer"
  "lambda/functions/automation/multi-account-aggregator"
  "lambda/functions/automation/tag-indexer"
  "lambda/functions/automation/budget-checker"
)

for dir in "${FUNCTION_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "Building $dir..."
    cd "$dir"

    # Create function.zip with just index.js (dependencies in layer)
    if [ -f "index.js" ]; then
      zip -r function.zip index.js
      echo "✓ Built $dir/function.zip"
    else
      echo "⚠ Warning: $dir/index.js not found"
    fi

    cd - > /dev/null
  else
    echo "⚠ Warning: Directory $dir not found"
  fi
done

echo ""
echo "Build complete!"
echo ""
echo "Next steps:"
echo "1. cd terraform"
echo "2. terraform init"
echo "3. terraform plan"
echo "4. terraform apply"
