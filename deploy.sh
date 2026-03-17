#!/bin/bash
set -eu

#aws ssm put-parameter --region us-east-1 --name "/gnaws/regions" --value "us-east-1,us-west-1" --type String --overwrite

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

read -p "Enter number (1-$((${#REGIONS[@]}+1))): " CHOICE
if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "$((${#REGIONS[@]}+1))" ]; then
    echo "Invalid selection"
    exit 1
fi

if [ "$CHOICE" -eq "$((${#REGIONS[@]}+1))" ]; then
    read -p "Enter region name (e.g. us-east-1): " AWS_REGION
else
    SELECTED=${REGIONS[$((CHOICE-1))]}
    AWS_REGION=$(echo $SELECTED | awk '{print $1}')
fi

echo "Validating region..."
if ! aws ec2 describe-regions --region "$AWS_REGION" --query "Regions[?RegionName=='$AWS_REGION'].RegionName" --output text 2>/dev/null | grep -q "$AWS_REGION"; then
    echo "Invalid or inaccessible region: $AWS_REGION"
    exit 1
fi


echo ""
echo "Choose a username for the server owner account."
echo "This will be the admin account used to manage the server."
echo ""
read -p "Enter owner username (letters and numbers only): " OWNER_USERNAME
if ! [[ "$OWNER_USERNAME" =~ ^[a-zA-Z0-9]+$ ]]; then
    echo "Invalid username. Only letters and numbers are allowed, no spaces or special characters."
    exit 1
fi

echo "Fetching latest updates..."
git -C "$(dirname "$0")" reset --hard
git -C "$(dirname "$0")" checkout main
git -C "$(dirname "$0")" pull

LATEST_TAG=$(git -C "$(dirname "$0")" tag --sort=-creatordate | grep -E '^infra-[0-9]+\.[0-9]+\.[0-9]+_games-[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
if [ -z "$LATEST_TAG" ]; then
    echo "No release tag found."
    exit 1
fi

git -C "$(dirname "$0")" checkout "$LATEST_TAG"

echo "Version: $LATEST_TAG"
