#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { GnawsStack } from '../lib/gnaws-stack';
import * as dotenv from "dotenv";
dotenv.config();

// Set your variables in .env file
// CLOUDFRONT_DOMAIN_NAME=app.example.com
// CLOUDFRONT_CERT_ARN=arn:aws:acm:us-east-1:123456789012:certificate/xxxx

const cloudFrontDomainName = process.env.CLOUDFRONT_DOMAIN_NAME;
const cloudFrontCertArn = process.env.CLOUDFRONT_CERT_ARN;

const app = new cdk.App();
new GnawsStack(app, 'GnawsStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  ...(cloudFrontDomainName && cloudFrontCertArn
    ? { cloudFrontDomainName, cloudFrontCertArn,}
    : {}),
});
