import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EC2Client } from "@aws-sdk/client-ec2";

export const dynamoClient = new DynamoDBClient({});

export const ec2Client = new EC2Client();
