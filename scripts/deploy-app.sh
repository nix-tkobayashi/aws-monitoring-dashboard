#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="${ECR_REPOSITORY:-aws-monitoring}"
ECS_CLUSTER="${ECS_CLUSTER:-aws-monitoring-cluster}"
ECS_SERVICE="${ECS_SERVICE:-aws-monitoring-svc}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

# ECR login
echo "==> Logging in to ECR..."
ECR_REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${AWS_REGION}.amazonaws.com
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Build
echo "==> Building Docker image (tag: ${IMAGE_TAG})..."
docker build \
  -t "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}" \
  -t "${ECR_REGISTRY}/${ECR_REPOSITORY}:latest" \
  src/app/

# Push
echo "==> Pushing to ECR..."
docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"

# Deploy
echo "==> Forcing new ECS deployment..."
aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  --no-cli-pager

echo "==> Waiting for service stability..."
aws ecs wait services-stable \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}" \
  --region "${AWS_REGION}"

echo "==> Done! Deployed ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
