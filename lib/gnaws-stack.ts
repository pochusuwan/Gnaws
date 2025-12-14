import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class GnawsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create test bucket
    new s3.Bucket(this, 'Gnaws-test', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    new s3.Bucket(this, 'Gnaws-test3', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
