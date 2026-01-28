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
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

// for injectin custom domain to project
export interface GnawsStackProps extends cdk.StackProps {
    cloudFrontDomainName?: string; // e.g. games.casualalfredo.com
    cloudFrontCertArn?: string;    // ACM cert ARN in us-east-1
}

export class GnawsStack extends cdk.Stack {
    // Storage
    private serverManagerPassword: secretsmanager.Secret;
    private jwtSecret: secretsmanager.Secret;
    private userTable: dynamodb.Table;
    private serverTable: dynamodb.Table;
    private workflowTable: dynamodb.Table;
    private gameTable: dynamodb.Table;
    private backupBucket: s3.Bucket;
    // Frontend
    private websiteBucket: s3.Bucket;
    // State Machines
    private startServerFunction: sfn.StateMachine;
    private stopServerFunction: sfn.StateMachine;
    private backupServerFunction: sfn.StateMachine;
    private getServerStatusFunction: sfn.StateMachine;
    private setupServerFunction: sfn.StateMachine;
    // Controller lambda
    private apiUrl: string;
    // Network
    private vpc: ec2.Vpc;
    private subnetId: string;
    private ec2Role: iam.Role;
    private ec2Profile: iam.CfnInstanceProfile;
    private cloudFrontUrl: string;
    private cfnDistribution: cloudfront.Distribution;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        // custom domain props
        this.buildStorageResources();
        this.buildFrontend(props);
        this.buildWorkflows();
        this.buildNetworkResources();
        this.buildBackend();
        this.deployFrontendConfig();
    }


    private buildBackend(props?: GnawsStackProps) {
        // Create Lambda function for handling all requests
        const backend = new lambda.Function(this, "GnawsLambdaBackend", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset("backend/lambda"),
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                SERVER_TABLE_NAME: this.serverTable.tableName,
                WORKFLOW_TABLE_NAME: this.workflowTable.tableName,
                GAME_TABLE_NAME: this.gameTable.tableName,
                SERVER_MANAGER_PASSWORD: this.serverManagerPassword.secretArn,
                JWT_SECRET: this.jwtSecret.secretArn,
                START_SERVER_FUNCTION_ARN: this.startServerFunction.stateMachineArn,
                STOP_SERVER_FUNCTION_ARN: this.stopServerFunction.stateMachineArn,
                BACKUP_SERVER_FUNCTION_ARN: this.backupServerFunction.stateMachineArn,
                GET_SERVER_STATUS_FUNCTION_ARN: this.getServerStatusFunction.stateMachineArn,
                SETUP_SERVER_FUNCTION_ARN: this.setupServerFunction.stateMachineArn,
                BACKUP_BUCKET_NAME: this.backupBucket.bucketName,
                VPC_ID: this.vpc.vpcId,
                SUBNET_ID: this.subnetId,
                EC2_PROFILE_ARN: this.ec2Profile.attrArn,
            },
            timeout: cdk.Duration.seconds(20),
        });
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["ec2:CreateSecurityGroup", "ec2:AuthorizeSecurityGroupIngress", "ec2:RunInstances", "ec2:CreateTags", "ec2:DescribeInstanceTypes"],
                resources: ["*"],
            }),
        );
        backend.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["iam:PassRole"],
                resources: [this.ec2Role.roleArn],
            }),
        );
        this.serverManagerPassword.grantRead(backend);
        this.jwtSecret.grantRead(backend);
        this.userTable.grantFullAccess(backend);
        this.serverTable.grantFullAccess(backend);
        this.workflowTable.grantFullAccess(backend);
        this.gameTable.grantFullAccess(backend);
        this.startServerFunction.grantStartExecution(backend);
        this.stopServerFunction.grantStartExecution(backend);
        this.backupServerFunction.grantStartExecution(backend);
        this.getServerStatusFunction.grantStartExecution(backend);
        this.setupServerFunction.grantStartExecution(backend);

        const cloudFrontDomainName = props?.cloudFrontDomainName || undefined;
        // Http API Gateway for requests from frontend
        const api = new apigwv2.HttpApi(this, "GnawsApiGateway", {
            corsPreflight: {
                // TODO: change origin
                allowOrigins:[
                    "http://localhost:5174",
                    ...(this.cloudFrontUrl ? [this.cloudFrontUrl] : []),
                    this.websiteBucket.bucketWebsiteUrl
                ].filter((u)=> !!u),
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
        new cdk.CfnOutput(this, "GnawsApiUrl", { value: apiUrl });
    }

    private buildFrontend(props?: GnawsStackProps) {
        const domainName = props?.cloudFrontDomainName;
        const cloudFrontUrlOverride = domainName ? `https://${domainName}` : undefined;
        const cloudFrontCertArn = props?.cloudFrontCertArn;
        const hasDomain = !!domainName
        const hasCert = !!cloudFrontCertArn;

        // Flag to indicate cloudfront usage. Fails fast without certificate if using custom domain
        const isCustomDomain =  hasDomain && hasCert;

        if (hasDomain !== hasCert){
            throw new Error(
                "Custom Domain misconfigured. Set BOTH cloudFrontDomainName and cloudFrontCertArn props."
            )
        }

        // S3 bucket for website resources
        this.websiteBucket = new s3.Bucket(this, "GnawsWebsiteBucket", {
            publicReadAccess: isCustomDomain ? false : true,
            websiteIndexDocument: "index.html",
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        // cloudFront distribution for custom domains
        if (isCustomDomain) {

            // ACM certificate for cloudfront
            const cert = isCustomDomain && cloudFrontCertArn ?
                acm.Certificate.fromCertificateArn(this, "GnawsCloudFrontCert", cloudFrontCertArn): undefined;

            // Cloundfront distribution 
            this.cfnDistribution = new cloudfront.Distribution(this, "GnawsWebsiteDistribution", {
                defaultBehavior: {
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    compress: true,
                    origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                },
                defaultRootObject: "index.html",
                domainNames: domainName ? [domainName] : undefined,
                certificate: cert,
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

            // injecting custom domain name for cloudfront and pass this URL into backend
            this.cloudFrontUrl = cloudFrontUrlOverride ??
                (
                    this.cfnDistribution?.domainName ?
                    `https://${this.cfnDistribution.domainName}` :
                    "NoDomainAvailable"
                );
            new cdk.CfnOutput(this, "GnawsWebsiteURL", {
                value: this.cloudFrontUrl,
            });
        }  else {
            new cdk.CfnOutput(this, "GnawsWebsiteURL", {
                value: this.websiteBucket.bucketWebsiteUrl,
            });
        }
        // Deploy frontend to S3
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsite", {
            sources: [s3deploy.Source.asset("frontend")],
            destinationBucket: this.websiteBucket,
        });

        // CloudFormation outputs
        new cdk.CfnOutput(this, "GnawsWebsiteURL", {
            value: this.websiteBucket.bucketWebsiteUrl,
        });
    }

    private deployFrontendConfig() {
        const configs = {
            API_BASE: this.apiUrl,
        };
        const constants = Object.entries(configs)
            .map(([k, v]) => `const ${k} = '${v}';`)
            .join("\n");
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsiteConfig", {
            destinationBucket: this.websiteBucket,
            sources: [s3deploy.Source.asset("frontend"), s3deploy.Source.data("config.js", constants)],
        });
    }

    private buildStorageResources() {
        this.serverManagerPassword = new secretsmanager.Secret(this, "GnawsServerManagerPassword", {
            secretStringValue: cdk.SecretValue.unsafePlainText("pass121"),
        });
        this.jwtSecret = new secretsmanager.Secret(this, "GnawsJwtSigningSecret", {
            generateSecretString: {
                passwordLength: 64,
                excludePunctuation: true,
            },
        });
        this.userTable = new dynamodb.Table(this, "GnawsUsersTable", {
            partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
        });
        this.serverTable = new dynamodb.Table(this, "GnawsGameServersTable", {
            partitionKey: { name: "name", type: dynamodb.AttributeType.STRING },
        });
        this.workflowTable = new dynamodb.Table(this, "GnawsWorkflowTable", {
            partitionKey: { name: "resourceId", type: dynamodb.AttributeType.STRING },
        });
        this.gameTable = new dynamodb.Table(this, "GnawsGameTable", {
            partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
        });

        // Create initial admin user
        new cr.AwsCustomResource(this, "GnawsInitialAdminUser", {
            onCreate: {
                service: "DynamoDB",
                action: "putItem",
                parameters: {
                    TableName: this.userTable.tableName,
                    Item: {
                        username: { S: "admin" },
                        role: { S: "admin" },
                    },
                },
                physicalResourceId: cr.PhysicalResourceId.of("GnawsSeedAdminUser"),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [this.userTable.tableArn],
            }),
        });
        // Create backup S3 bucket
        this.backupBucket = new s3.Bucket(this, "GnawsBackupBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });
    }

    private buildWorkflows() {
        this.startServerFunction = new sfn.StateMachine(this, "GnawsStartGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/start-game-server.asl.json"),
            timeout: cdk.Duration.minutes(40),
        });

        this.startServerFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StartInstances", "ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand", "ssm:GetCommandInvocation"],
                resources: ["*"], // TODO: to managed EC2 only
            }),
        );
        this.workflowTable.grantWriteData(this.startServerFunction);
        this.serverTable.grantWriteData(this.startServerFunction);
        new cdk.CfnOutput(this, "GnawsStartServerFunctionArn", { value: this.startServerFunction.stateMachineArn });

        this.stopServerFunction = new sfn.StateMachine(this, "GnawsStopGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/stop-game-server.asl.json"),
            timeout: cdk.Duration.minutes(15),
        });

        this.stopServerFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StopInstances", "ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand", "ssm:GetCommandInvocation"],
                resources: ["*"], // TODO: to managed EC2 only
            }),
        );
        this.workflowTable.grantWriteData(this.stopServerFunction);
        this.serverTable.grantWriteData(this.stopServerFunction);
        new cdk.CfnOutput(this, "GnawsStopServerFunctionArn", { value: this.stopServerFunction.stateMachineArn });

        this.backupServerFunction = new sfn.StateMachine(this, "GnawsBackupGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/backup-server.asl.json"),
            timeout: cdk.Duration.minutes(15),
        });

        this.backupServerFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand", "ssm:GetCommandInvocation"],
                resources: ["*"], // TODO: to managed EC2 only
            }),
        );
        this.workflowTable.grantWriteData(this.backupServerFunction);
        this.serverTable.grantWriteData(this.backupServerFunction);
        new cdk.CfnOutput(this, "GnawsBackupServerFunctionArn", { value: this.backupServerFunction.stateMachineArn });

        this.getServerStatusFunction = new sfn.StateMachine(this, "GnawsGetServerStatus", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/get-server-status.asl.json"),
            timeout: cdk.Duration.minutes(5),
        });
        this.getServerStatusFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand", "ssm:GetCommandInvocation"],
                resources: ["*"], // TODO: to managed EC2 only
            }),
        );
        this.backupBucket.grantRead(this.getServerStatusFunction);
        this.serverTable.grantWriteData(this.getServerStatusFunction);
        new cdk.CfnOutput(this, "GnawsGetServerStatusFunctionArn", { value: this.getServerStatusFunction.stateMachineArn });

        this.setupServerFunction = new sfn.StateMachine(this, "GnawsSetupGameServer", {
            definitionBody: sfn.DefinitionBody.fromFile("backend/stepfunctions/setup-game-server.asl.json"),
            timeout: cdk.Duration.minutes(80),
        });

        this.setupServerFunction.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["ec2:StartInstances", "ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:SendCommand", "ssm:GetCommandInvocation"],
                resources: ["*"], // TODO: to managed EC2 only
            }),
        );
        this.workflowTable.grantWriteData(this.setupServerFunction);
        this.serverTable.grantWriteData(this.setupServerFunction);
        new cdk.CfnOutput(this, "GnawsSetupServerFunctionArn", { value: this.setupServerFunction.stateMachineArn });
    }

    private buildNetworkResources() {
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
        this.backupBucket.grantWrite(this.ec2Role);
    }
}
