import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class GnawsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        const { backendLambda, apiUrl } = this.buildBackend();
        this.buildStorageResources(backendLambda);

        this.buildFrontend({
            API_BASE: apiUrl,
        });
    }

    private buildBackend() {
        // Create Lambda function for handling all requests
        const backend = new lambda.Function(this, "GnawsLambdaBackend", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset("backend/lambda"),
        });

        // Http API Gateway for requests from frontend
        const api = new apigwv2.HttpApi(this, "GnawsApiGateway", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
                allowHeaders: ["Content-Type"],
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

        return { backendLambda: backend, apiUrl };
    }

    private buildFrontend(webConfigs: { [key: string]: string }) {
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

        const constants = Object.entries(webConfigs)
            .map(([k, v]) => `const ${k} = '${v}';`)
            .join("\n");
        new s3deploy.BucketDeployment(this, "GnawsDeployWebsiteConfig", {
            destinationBucket: websiteBucket,
            sources: [s3deploy.Source.asset("frontend"), s3deploy.Source.data("config.js", constants)],
        });
    }

    private buildStorageResources(backendLambda: lambda.Function) {
        const serverManagerPassword = new secretsmanager.Secret(this, "GnawsServerManagerPassword", {
            secretName: "gnaws/server-manager-password",
            secretStringValue: cdk.SecretValue.unsafePlainText("pass121"),
        });
        serverManagerPassword.grantRead(backendLambda);

        const userTable = new dynamodb.Table(this, "GnawsUsersTable", {
            partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
        });
        userTable.grantFullAccess(backendLambda);
    }
}
