import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class GnawsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create Lambda function for handling all requests
        const backend = new lambda.Function(this, "LambdaBackend", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset("backend/lambda"),
        });

        // Http API Gateway to handle requests
        const api = new apigwv2.HttpApi(this, "ApiGateway", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowMethods: [apigwv2.CorsHttpMethod.POST],
            },
        });
        api.addRoutes({
            path: "/call",
            methods: [apigwv2.HttpMethod.POST],
            integration: new integrations.HttpLambdaIntegration("CallLambdaIntegration", backend),
        });

        // S3 bucket for website resources
        const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
            publicReadAccess: true,
            websiteIndexDocument: "index.html",
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });

        // Deploy frontend to S3
        new s3deploy.BucketDeployment(this, "DeployWebsite", {
            sources: [s3deploy.Source.asset("frontend")],
            destinationBucket: websiteBucket,
        });
        new s3deploy.BucketDeployment(this, "DeployWebsiteConfig", {
            destinationBucket: websiteBucket,
            sources: [s3deploy.Source.asset("frontend"), s3deploy.Source.data("config.js", `const API_BASE = "${api.url ?? ""}";`)],
        });

        // CloudFormation outputs
        new cdk.CfnOutput(this, "WebsiteURL", {
            value: websiteBucket.bucketWebsiteUrl,
        });
        new cdk.CfnOutput(this, "ApiUrl", {
            value: api.url ?? "",
        });
    }
}
