import fp from "fastify-plugin";
import { S3Client } from "@aws-sdk/client-s3";

declare module "fastify" {
    interface FastifyInstance {
        s3: S3Client;
        s3Bucket: string;
    }
}

export default fp(async (fastify) => {
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;

    if (!region || !bucket) {
        throw new Error("AWS_REGION and AWS_S3_BUCKET are required");
    }

    fastify.decorate(
        "s3",
        new S3Client({
            region,
            credentials:
                process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                    ? {
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    }
                    : undefined,
        })
    );

    fastify.decorate("s3Bucket", bucket);
});