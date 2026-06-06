import path from "path";
import { randomUUID } from "crypto";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export async function createBillUploadUrl(params: {
    s3: S3Client;
    bucket: string;
    userId: string;
    reimbursementId: string;
    fileName: string;
    contentType: string;
}) {
    if (!allowedTypes.includes(params.contentType)) {
        throw new Error("Only JPG, PNG and WEBP are allowed");
    }

    const ext = path.extname(params.fileName) || ".jpg";

    const imageKey = `reimbursements/${params.userId}/${params.reimbursementId}/items/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: imageKey,
        ContentType: params.contentType,
    });

    const uploadUrl = await getSignedUrl(params.s3, command, {
        expiresIn: 300,
    });

    return { uploadUrl, imageKey };
}

export async function createDownloadUrl(params: {
    s3: S3Client;
    bucket: string;
    key: string;
}) {
    const filename = params.key.split('/').pop() || "bills.pdf";
    const command = new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    return getSignedUrl(params.s3, command, {
        expiresIn: 600,
    });
}

export async function downloadS3Object(params: {
    s3: S3Client;
    bucket: string;
    key: string;
}): Promise<Buffer> {
    const command = new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
    });
    const response = await params.s3.send(command);
    if (!response.Body) {
        throw new Error("Empty body from S3 download");
    }

    const stream = response.Body as any;
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err: any) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

export async function uploadS3Object(params: {
    s3: S3Client;
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
}) {
    const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
    });
    await params.s3.send(command);
}

export async function deleteS3Object(params: {
    s3: S3Client;
    bucket: string;
    key: string;
}) {
    const command = new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
    });
    await params.s3.send(command);
}

export async function createProfileUploadUrl(params: {
    s3: S3Client;
    bucket: string;
    userId: string;
    fileName: string;
    contentType: string;
}) {
    if (!allowedTypes.includes(params.contentType)) {
        throw new Error("Only JPG, PNG and WEBP are allowed");
    }

    const ext = path.extname(params.fileName) || ".jpg";

    const imageKey = `users/${params.userId}/avatar/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: imageKey,
        ContentType: params.contentType,
    });

    const uploadUrl = await getSignedUrl(params.s3, command, {
        expiresIn: 300,
    });

    return { uploadUrl, imageKey };
}

export async function createSampleUploadUrl(params: {
    s3: S3Client;
    bucket: string;
    userId: string;
    fileName: string;
    contentType: string;
}) {
    if (!allowedTypes.includes(params.contentType)) {
        throw new Error("Only JPG, PNG and WEBP are allowed");
    }

    const ext = path.extname(params.fileName) || ".jpg";

    const imageKey = `samples/${params.userId}/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: imageKey,
        ContentType: params.contentType,
    });

    const uploadUrl = await getSignedUrl(params.s3, command, {
        expiresIn: 300,
    });

    return { uploadUrl, imageKey };
}