import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EC2Client } from "@aws-sdk/client-ec2";
import { SSMClient } from "@aws-sdk/client-ssm";
import { SFNClient } from "@aws-sdk/client-sfn";
import { Route53Client } from "@aws-sdk/client-route-53";

export const dynamoClient = new DynamoDBClient({});

export const ec2Client = new EC2Client();

export const ssmClient = new SSMClient();

export const sfnClient = new SFNClient({});

export const route53Client = new Route53Client({});
