#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { GnawsStack } from '../lib/gnaws-stack';

const app = new cdk.App();
new GnawsStack(app, 'GnawsStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Optional: Configure a custom domain for the CloudFront front end
   *
   * - If you set `cloudFrontDomainName`, you must also set `cloudFrontCertArn`.
   * - NOTE: CloudFront only supports ACM certs in us-east-1
  // cloudFrontDomainName: "example.com",
  // cloudFrontCertArn:"arn:aws:acm:us-east-1:<AMAZON ARN FOR YOUR CERTIFICATE>",

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
