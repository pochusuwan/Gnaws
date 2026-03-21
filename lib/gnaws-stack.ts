import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cr from "aws-cdk-lib/custom-resources";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as crypto from "crypto";
import { Aspects } from "aws-cdk-lib";

// for injectin custom domain to project
export interface GnawsStackProps extends cdk.StackProps {
    cloudFrontDomainName?: string; // e.g. games.example.com
    cloudFrontCertArn?: string; // ACM cert ARN in us-east-1
    ownerUsername?: string;
    infrastructureVersion?: string;
}

export class GnawsStack extends cdk.Stack {
    // Storage
    private userTable: dynamodb.Table;
    private serverTable: dynamodb.Table;
    private workflowTable: dynamodb.Table;
    private gameTable: dynamodb.Table;
    private secretTable: dynamodb.Table;
    private infraVersionParam: ssm.StringParameter;
    private backupBucket: s3.Bucket;
    // Frontend
    private websiteBucket: s3.Bucket;
    private cfnDistribution: cloudfront.Distribution;
    private websiteUrls: string[];
    // State Machines
    private startServerFunction: sfn.StateMachine;
    private stopServerFunction: sfn.StateMachine;
    private backupServerFunction: sfn.StateMachine;
    private getServerStatusFunction: sfn.StateMachine;
    private setupServerFunction: sfn.StateMachine;
    private updateServerFunction: sfn.StateMachine;
    private terminateServerFunction: sfn.StateMachine;
    // Controller lambda
    private apiUrl: string;
    // Network
    private vpc: ec2.Vpc;
    private subnetId: string;
    private ec2Role: iam.Role;
    private ec2Profile: iam.CfnInstanceProfile;

    constructor(scope: Construct, id: string, props?: GnawsStackProps) {
        super(scope, id, props);
        this.buildStorage(props?.ownerUsername, props?.infrastructureVersion);
        this.buildFrontend(props);
        this.buildWorkflows();
        this.buildNetwork();
        this.buildBackend();
        this.deployFrontend();
        Aspects.of(this).add({
            visit(node) {
                if (node instanceof logs.LogGroup) {
                    const cfnLogGroup = node.node.defaultChild as logs.CfnLogGroup;
                    if (cfnLogGroup) {
                        cfnLogGroup.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.DELETE;
                        cfnLogGroup.cfnOptions.updateReplacePolicy = cdk.CfnDeletionPolicy.DELETE;
                        cfnLogGroup.retentionInDays = 14;
                    }
                }
            },
        });
    }

    private buildBackend() {
        // Create Lambda function for handling all requests
        const backend = new NodejsFunction(this, "GnawsLambdaBackend", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "handler",
            entry: "backend/lambda/src/index.ts",
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                SERVER_TABLE_NAME: this.serverTable.tableName,
                WORKFLOW_TABLE_NAME: this.workflowTable.tableName,
                GAME_TABLE_NAME: this.gameTable.tableName,
                SECRET_TABLE_NAME: this.secretTable.tableName,
                START_SERVER_FUNCTION_ARN: this.startServerFunction.stateMachineArn,
                STOP_SERVER_FUNCTION_ARN: this.stopServerFunction.stateMachineArn,
                BACKUP_SERVER_FUNCTION_ARN: this.backupServerFunction.stateMachineArn,
                GET_SERVER_STATUS_FUNCTION_ARN: this.getServerStatusFunction.stateMachineArn,
                SETUP_SERVER_FUNCTION_ARN: this.setupServerFunction.stateMachineArn,
                UPDATE_SERVER_FUNCTION_ARN: this.updateServerFunction.stateMachineArn,
                TERMINATE_SERVER_FUNCTION_ARN: this.terminateServerFunction.stateMachineArn,
                INFRASTRUCTURE_VERSION_SSM_PARAM: this.infraVersionParam.parameterName,
                BACKUP_BUCKET_NAME: this.backupBucket.bucketName,
                VPC_ID: this.vpc.vpcId,
                SUBNET_ID: this.subnetId,
                EC2_PROFILE_ARN: this.ec2Profile.attrArn,
            },
            timeout: cdk.Duration.seconds(20),
        });
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    "ec2:DescribeInstances",
                    "ec2:DescribeImages",
                    "ec2:DescribeInstanceTypes",
                    "ec2:RunInstances",
                    "ec2:CreateSecurityGroup",
                    "ec2:CreateTags",
                    "ssm:GetParameter",
                ],
                resources: ["*"],
            }),
        );
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    "ec2:AuthorizeSecurityGroupIngress",
                    "ec2:StartInstances",
                    "ec2:StopInstances",
                    "ec2:ModifyVolume",
                    "ec2:TerminateInstances",
                    "ec2:DeleteSecurityGroup",
                ],
                resources: ["*"],
                conditions: {
                    StringEquals: {
                        "ec2:ResourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["ssm:SendCommand"],
                resources: ["arn:aws:ec2:*:*:instance/*"],
                conditions: {
                    StringEquals: {
                        "ssm:resourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["ssm:SendCommand"],
                resources: ["arn:aws:ssm:*:*:document/AWS-RunShellScript"],
            }),
        );
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["iam:PassRole"],
                resources: [this.ec2Role.roleArn],
            }),
        );
        this.userTable.grantFullAccess(backend);
        this.serverTable.grantFullAccess(backend);
        this.workflowTable.grantFullAccess(backend);
        this.gameTable.grantFullAccess(backend);
        this.secretTable.grantFullAccess(backend);
        this.startServerFunction.grantStartExecution(backend);
        this.stopServerFunction.grantStartExecution(backend);
        this.backupServerFunction.grantStartExecution(backend);
        this.getServerStatusFunction.grantStartExecution(backend);
        this.setupServerFunction.grantStartExecution(backend);
        this.updateServerFunction.grantStartExecution(backend);
        this.terminateServerFunction.grantStartExecution(backend);

        // Http API Gateway for requests from frontend
        const api = new apigwv2.HttpApi(this, "GnawsApiGateway", {
            corsPreflight: {
                // TODO: change origin
                allowOrigins: ["http://localhost:5174", ...this.websiteUrls],
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
        this.apiUrl = apiUrl;
    }

    private buildFrontend(props?: GnawsStackProps) {
        const domainName = props?.cloudFrontDomainName;
        const cloudFrontCertArn = props?.cloudFrontCertArn;

        // Fails fast without certificate if using custom domain
        if (!!domainName !== !!cloudFrontCertArn) {
            throw new Error("Custom Domain misconfigured. Set BOTH cloudFrontDomainName and cloudFrontCertArn props.");
        }

        // S3 bucket for website resources
        this.websiteBucket = new s3.Bucket(this, "GnawsWebsiteBucket", {
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: "index.html",
        });

        // Cloundfront distribution
        const oac = new cloudfront.S3OriginAccessControl(this, "GnawsOAC", {
            originAccessControlName: `${this.stackName}-${this.region}`,
        });
        this.cfnDistribution = new cloudfront.Distribution(this, "GnawsWebsiteDistribution", {
            defaultBehavior: {
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                compress: true,
                origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, { originAccessControl: oac }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: "index.html",
            domainNames: domainName ? [domainName] : undefined,
            certificate: cloudFrontCertArn ? acm.Certificate.fromCertificateArn(this, "GnawsCloudFrontCert", cloudFrontCertArn) : undefined,
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 403,
                    responsePagePath: "/index.html",
                    ttl: cdk.Duration.minutes(30),
                },
            ],
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        });
        this.websiteUrls = [domainName, this.cfnDistribution.domainName]
            .filter((url) => typeof url === "string")
            .map((url) => `https://${url}`);

        // Grant Cloundfront distribution access
        this.websiteBucket.addToResourcePolicy(
            new iam.PolicyStatement({
                actions: ["s3:GetObject"],
                resources: [`${this.websiteBucket.bucketArn}/*`],
                principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
                conditions: {
                    StringEquals: {
                        "AWS:SourceArn": this.cfnDistribution.distributionArn,
                    },
                },
            }),
        );

        // Cloundfront distribution url
        new cdk.CfnOutput(this, "GnawsWebsiteURL", {
            value: `https://${this.cfnDistribution.domainName}`,
        });
    }

    private deployFrontend() {
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsiteHashedAsset", {
            sources: [s3deploy.Source.asset("frontend/dist")],
            destinationBucket: this.websiteBucket,
            cacheControl: [
                s3deploy.CacheControl.fromString("max-age=86400,public,immutable"),
            ],
            exclude: ["index.html"],
        });
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsite", {
            sources: [
                s3deploy.Source.asset("frontend/dist"),
                s3deploy.Source.data(
                    "config.json",
                    JSON.stringify({
                        apiUrl: this.apiUrl,
                    }),
                ),
            ],
            cacheControl: [
                s3deploy.CacheControl.fromString('no-cache'),
            ],
            destinationBucket: this.websiteBucket,
            include: ['index.html', 'config.json'],
        });
    }

    private buildStorage(ownerUsername?: string, infrastructureVersion?: string) {
        this.userTable = new dynamodb.Table(this, "GnawsUsersTable", {
            partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
        });
        this.serverTable = new dynamodb.Table(this, "GnawsGameServersTable", {
            partitionKey: { name: "name", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
        });
        this.workflowTable = new dynamodb.Table(this, "GnawsWorkflowTable", {
            partitionKey: { name: "resourceId", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
        });
        this.gameTable = new dynamodb.Table(this, "GnawsGameTable", {
            partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
        });
        this.secretTable = new dynamodb.Table(this, "GnawsSecretTable", {
            partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
        });

        // Create owner
        if (ownerUsername !== undefined) {
            new cr.AwsCustomResource(this, "GnawsOwner", {
                onCreate: {
                    service: "DynamoDB",
                    action: "putItem",
                    parameters: {
                        TableName: this.userTable.tableName,
                        Item: {
                            username: { S: ownerUsername },
                            role: { S: "owner" },
                        },
                        ConditionExpression: "attribute_not_exists(username)",
                    },
                    ignoreErrorCodesMatching: "ConditionalCheckFailedException",
                    physicalResourceId: cr.PhysicalResourceId.of("GnawsOwner"),
                },
                policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                    resources: [this.userTable.tableArn],
                }),
            });
        }
        // Create 4-digit invite code
        const inviteCode = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        new cr.AwsCustomResource(this, "GnawsInviteCode", {
            onCreate: {
                service: "DynamoDB",
                action: "putItem",
                parameters: {
                    TableName: this.secretTable.tableName,
                    Item: {
                        id: { S: "INVITE_CODE" },
                        value: { S: inviteCode },
                    },
                    ConditionExpression: "attribute_not_exists(id)",
                },
                ignoreErrorCodesMatching: "ConditionalCheckFailedException",
                physicalResourceId: cr.PhysicalResourceId.of("GnawsInviteCode"),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [this.secretTable.tableArn],
            }),
        });
        new cr.AwsCustomResource(this, "GnawsJwtSecret", {
            onCreate: {
                service: "DynamoDB",
                action: "putItem",
                parameters: {
                    TableName: this.secretTable.tableName,
                    Item: {
                        id: { S: "JWT_SECRET" },
                        value: { S: crypto.randomBytes(32).toString("hex") },
                    },
                    ConditionExpression: "attribute_not_exists(id)",
                },
                ignoreErrorCodesMatching: "ConditionalCheckFailedException",
                physicalResourceId: cr.PhysicalResourceId.of("GnawsJwtSecret"),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [this.secretTable.tableArn],
            }),
        });
        // Create backup S3 bucket
        this.backupBucket = new s3.Bucket(this, "GnawsBackupBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });
        // Store current infrastructure version
        this.infraVersionParam = new ssm.StringParameter(this, "GnawsInfraVersion", {
            parameterName: `/${this.stackName}/infrastructure/version`,
            stringValue: infrastructureVersion ?? "0.0.0",
        });
    }

    private buildWorkflows() {
        this.startServerFunction = new sfn.StateMachine(this, "GnawsStartGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/start-game-server.asl.json"),
            timeout: cdk.Duration.minutes(40),
        });
        this.addEC2DescribePermissions(this.startServerFunction);
        this.addEC2StartPermissions(this.startServerFunction);
        this.addSsmCommandPermission(this.startServerFunction);
        this.workflowTable.grantWriteData(this.startServerFunction);
        this.serverTable.grantWriteData(this.startServerFunction);

        this.stopServerFunction = new sfn.StateMachine(this, "GnawsStopGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/stop-game-server.asl.json"),
            timeout: cdk.Duration.minutes(15),
        });
        this.addEC2DescribePermissions(this.stopServerFunction);
        this.addEC2StopPermissions(this.stopServerFunction);
        this.addSsmCommandPermission(this.stopServerFunction);
        this.workflowTable.grantWriteData(this.stopServerFunction);
        this.serverTable.grantWriteData(this.stopServerFunction);

        this.backupServerFunction = new sfn.StateMachine(this, "GnawsBackupGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/backup-server.asl.json"),
            timeout: cdk.Duration.minutes(15),
        });
        this.addEC2DescribePermissions(this.backupServerFunction);
        this.addSsmCommandPermission(this.backupServerFunction);
        this.workflowTable.grantWriteData(this.backupServerFunction);
        this.serverTable.grantWriteData(this.backupServerFunction);

        this.getServerStatusFunction = new sfn.StateMachine(this, "GnawsGetServerStatus", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/get-server-status.asl.json"),
            timeout: cdk.Duration.minutes(5),
        });
        this.addEC2DescribePermissions(this.getServerStatusFunction);
        this.addSsmCommandPermission(this.getServerStatusFunction);
        this.backupBucket.grantRead(this.getServerStatusFunction);
        this.serverTable.grantWriteData(this.getServerStatusFunction);

        this.setupServerFunction = new sfn.StateMachine(this, "GnawsSetupGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/setup-game-server.asl.json"),
            timeout: cdk.Duration.minutes(80),
        });
        this.addEC2DescribePermissions(this.setupServerFunction);
        this.addEC2StartPermissions(this.setupServerFunction);
        this.addSsmCommandPermission(this.setupServerFunction);
        this.workflowTable.grantWriteData(this.setupServerFunction);
        this.serverTable.grantWriteData(this.setupServerFunction);

        this.updateServerFunction = new sfn.StateMachine(this, "GnawsUpdateGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/update-game-server.asl.json"),
            timeout: cdk.Duration.minutes(40),
        });
        this.addSsmCommandPermission(this.updateServerFunction);
        this.workflowTable.grantWriteData(this.updateServerFunction);
        this.serverTable.grantWriteData(this.updateServerFunction);

        this.terminateServerFunction = new sfn.StateMachine(this, "GnawsTerminateServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/terminate-server.asl.json"),
            timeout: cdk.Duration.minutes(30),
        });
        this.addEC2DescribePermissions(this.terminateServerFunction);
        this.addTerminatePermissions(this.terminateServerFunction);
        this.workflowTable.grantWriteData(this.terminateServerFunction);
        this.serverTable.grantWriteData(this.terminateServerFunction);
    }

    private buildNetwork() {
        this.vpc = new ec2.Vpc(this, "GnawsGameServerVPC", {
            maxAzs: 1,
            subnetConfiguration: [
                {
                    name: `gnaws-public-game-server-subnet`,
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                },
            ],
            natGateways: 0,
        });
        this.subnetId = this.vpc.publicSubnets[0].subnetId;

        this.ec2Role = new iam.Role(this, "GnawsEC2Role", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            description: "Shared EC2 role to allow SSM access",
        });
        this.ec2Profile = new iam.CfnInstanceProfile(this, "GnawsEC2Profile", {
            roles: [this.ec2Role.roleName],
        });
        this.ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
        this.backupBucket.grantReadWrite(this.ec2Role);
    }

    private addEC2DescribePermissions(stateMachine: sfn.StateMachine) {
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:DescribeInstances"],
                resources: ["*"],
            }),
        );
    }

    private addEC2StartPermissions(stateMachine: sfn.StateMachine) {
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StartInstances"],
                resources: ["arn:aws:ec2:*:*:instance/*"],
                conditions: {
                    StringEquals: {
                        "ec2:ResourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
    }

    private addEC2StopPermissions(stateMachine: sfn.StateMachine) {
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StopInstances"],
                resources: ["arn:aws:ec2:*:*:instance/*"],
                conditions: {
                    StringEquals: {
                        "ec2:ResourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
    }

    private addTerminatePermissions(stateMachine: sfn.StateMachine) {
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:TerminateInstances", "ec2:DeleteSecurityGroup"],
                resources: ["*"],
                conditions: {
                    StringEquals: {
                        "ec2:ResourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
    }

    private addSsmCommandPermission(stateMachine: sfn.StateMachine) {
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ssm:SendCommand"],
                resources: ["arn:aws:ec2:*:*:instance/*"],
                conditions: {
                    StringEquals: {
                        "ssm:resourceTag/OwnedBy": "GnawsStack",
                    },
                },
            }),
        );
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ssm:SendCommand"],
                resources: ["arn:aws:ssm:*:*:document/AWS-RunShellScript"],
            }),
        );
        stateMachine.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ssm:DescribeInstanceInformation", "ssm:GetCommandInvocation"],
                resources: ["*"],
            }),
        );
    }
}
