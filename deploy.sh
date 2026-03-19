#!/bin/bash
set -euo pipefail

# Script to
cd "$(dirname "$0")"

# Get AWS account id
if ! AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text); then
    echo "AWS authentication failed"
    exit 1
fi

# Selecting AWS region
DEPLOYED_REGIONS=$(aws ssm get-parameter --region us-east-1 --name "/gnaws/regions" --query Parameter.Value --output text 2>/dev/null || echo "")
REGIONS=(
    "us-east-1       (N. Virginia)"
    "us-west-2       (Oregon)"
    "eu-west-1       (Ireland)"
    "ap-southeast-1  (Singapore)"
    "ap-northeast-1  (Tokyo)"
    "ap-southeast-2  (Sydney)"
    "eu-central-1    (Frankfurt)"
    "us-east-2       (Ohio)"
)
echo "Select a region:"
for i in "${!REGIONS[@]}"; do
    echo "  $((i+1))) ${REGIONS[$i]}"
done
echo "  $((${#REGIONS[@]}+1))) Enter manually"
if [ -n "$DEPLOYED_REGIONS" ]; then
    echo "  Select already deployed regions to update: $DEPLOYED_REGIONS"
fi

read -p "Enter number (1-$((${#REGIONS[@]}+1))): " CHOICE
if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "$((${#REGIONS[@]}+1))" ]; then
    echo "Invalid selection"
    exit 1
fi

if [ "$CHOICE" -eq "$((${#REGIONS[@]}+1))" ]; then
    read -p "Enter region name (e.g. us-east-1): " AWS_REGION
else
    SELECTED=${REGIONS[$((CHOICE-1))]}
    AWS_REGION="${SELECTED%% *}"
fi
if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "Invalid or inaccessible region: $AWS_REGION"
    exit 1
fi

# Enter owner username
echo ""
echo "Choose a username for the server owner account."
echo "This will be the owner account used to manage the servers."
echo ""
read -p "Enter owner username (letters and numbers only): " OWNER_USERNAME
if ! [[ "$OWNER_USERNAME" =~ ^[a-zA-Z0-9]+$ ]]; then
    echo "Invalid username. Only letters and numbers are allowed, no spaces or special characters."
    exit 1
fi

# Fetch latest changes
git pull --rebase --autostash
VERSION=$(git describe --tags --exact-match 2>/dev/null || echo "")

# Set deployed regions
if [[ ",$DEPLOYED_REGIONS," != *",$AWS_REGION,"* ]]; then
    if [ -z "$DEPLOYED_REGIONS" ]; then
        NEW_REGIONS="$AWS_REGION"
    else
        NEW_REGIONS="$DEPLOYED_REGIONS,$AWS_REGION"
    fi

    aws ssm put-parameter --region us-east-1 --name "/gnaws/regions" --value "$NEW_REGIONS" --type String --overwrite
fi

# Install, build, and deploy
npm run installAll
npm run buildAll
cdk bootstrap "aws://$AWS_ACCOUNT_ID/$AWS_REGION";
cdk deploy --require-approval never --region "$AWS_REGION" -c infrastructureVersion="$VERSION" -c ownerUsername="$OWNER_USERNAME"
