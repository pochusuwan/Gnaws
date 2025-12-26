import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cr from "aws-cdk-lib/custom-resources";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as iam from "aws-cdk-lib/aws-iam";

export class GnawsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        const { serverManagerPassword, jwtSecret, userTable, gameServerTable, workflowTable } = this.buildStorageResources();
        const { websiteBucket, websiteUrl } = this.buildFrontend();
        const { startServerFunction } = this.buildWorkflows();
        const { apiUrl } = this.buildBackend(websiteUrl, serverManagerPassword, jwtSecret, startServerFunction, userTable, gameServerTable, workflowTable);

        this.deployFrontendConfig(websiteBucket, {
            API_BASE: apiUrl,
        });
    }

    private buildBackend(
        websiteUrl: string,
        serverManagerPassword: secretsmanager.Secret,
        jwtSecret: secretsmanager.Secret,
        startServerFunction: sfn.StateMachine,
        userTable: dynamodb.Table,
        gameServerTable: dynamodb.Table,
        workflowTable: dynamodb.Table
    ) {
        // Create Lambda function for handling all requests
        const backend = new lambda.Function(this, "GnawsLambdaBackend", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset("backend/lambda"),
            environment: {
                USER_TABLE_NAME: userTable.tableName,
                SERVER_MANAGER_PASSWORD: serverManagerPassword.secretArn,
                JWT_SECRET: jwtSecret.secretArn,
                START_SERVER_FUNCTION_ARN: startServerFunction.stateMachineArn,
            },
        });
        serverManagerPassword.grantRead(backend);
        jwtSecret.grantRead(backend);
        userTable.grantFullAccess(backend);
        gameServerTable.grantFullAccess(backend);
        workflowTable.grantFullAccess(backend);
        startServerFunction.grantStartExecution(backend);

        // Http API Gateway for requests from frontend
        const api = new apigwv2.HttpApi(this, "GnawsApiGateway", {
            corsPreflight: {
                // TODO: change origin
                allowOrigins: ["http://localhost:5174", websiteUrl],
                allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
                allowHeaders: ["Content-Type", "Authorization"],
                allowCredentials: true,
            },
        });
        api.addRoutes({
            path: "/call",
            methods: [apigwv2.HttpMethod.POST],
            integration: new integrations.HttpLambdaIntegration("GnawsCallLambdaIntegration", backend),
        });

        const apiUrl = api.url;
        if (apiUrl === undefined) throw "No API url";
        new cdk.CfnOutput(this, "GnawsApiUrl", { value: apiUrl });

        return { apiUrl };
    }

    private buildFrontend() {
        // S3 bucket for website resources
        const websiteBucket = new s3.Bucket(this, "GnawsWebsiteBucket", {
            publicReadAccess: true,
            websiteIndexDocument: "index.html",
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });

        // Deploy frontend to S3
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsite", {
            sources: [s3deploy.Source.asset("frontend")],
            destinationBucket: websiteBucket,
        });

        // CloudFormation outputs
        const websiteUrl = websiteBucket.bucketWebsiteUrl;
        new cdk.CfnOutput(this, "GnawsWebsiteURL", {
            value: websiteUrl,
        });
        return { websiteBucket, websiteUrl };
    }

    private deployFrontendConfig(websiteBucket: s3.Bucket, configs: { [key: string]: string }) {
        const constants = Object.entries(configs)
            .map(([k, v]) => `const ${k} = '${v}';`)
            .join("\n");
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsiteConfig", {
            destinationBucket: websiteBucket,
            sources: [s3deploy.Source.asset("frontend"), s3deploy.Source.data("config.js", constants)],
        });
    }

    private buildStorageResources() {
        const serverManagerPassword = new secretsmanager.Secret(this, "GnawsServerManagerPassword", {
            secretStringValue: cdk.SecretValue.unsafePlainText("pass121"),
        });
        const jwtSecret = new secretsmanager.Secret(this, "GnawsJwtSigningSecret", {
            generateSecretString: {
                passwordLength: 64,
                excludePunctuation: true,
            },
        });
        const userTable = new dynamodb.Table(this, "GnawsUsersTable", {
            partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
        });
        const gameServerTable = new dynamodb.Table(this, "GnawsGameServersTable", {
            partitionKey: { name: "name", type: dynamodb.AttributeType.STRING },
        });
        const workflowTable = new dynamodb.Table(this, "GnawsWorkflowTable", {
            partitionKey: { name: "resourceId", type: dynamodb.AttributeType.STRING },
        });

        // Create initial admin user
        new cr.AwsCustomResource(this, "GnawsInitialAdminUser", {
            onCreate: {
                service: "DynamoDB",
                action: "putItem",
                parameters: {
                    TableName: userTable.tableName,
                    Item: {
                        username: { S: "admin" },
                        role: { S: "admin" },
                    },
                },
                physicalResourceId: cr.PhysicalResourceId.of("GnawsSeedAdminUser"),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [userTable.tableArn],
            }),
        });

        return {
            serverManagerPassword,
            jwtSecret,
            userTable,
            gameServerTable,
            workflowTable,
        };
    }

    private buildWorkflows() {
        const startServerFunction = new sfn.StateMachine(this, "GnawsStartGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/start-game-server.asl.json"),
            timeout: cdk.Duration.minutes(10),
        });

        startServerFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StartInstances", "ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand"],
                resources: ["*"],
            })
        );
        new cdk.CfnOutput(this, "GnawsStartServerFunctionArn", { value: startServerFunction.stateMachineArn });
        return {
            startServerFunction,
        };
    }
}
