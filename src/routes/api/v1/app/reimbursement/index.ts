import { FastifyPluginAsync } from "fastify";
import Reimbursement from "../../../../../models/Reimbursement";
import { User } from "../../../../../models/User";
import { createBillUploadUrl, createDownloadUrl, uploadS3Object, deleteS3Object } from "../../../../../services/s3Service";
import { generateReimbursementPdf } from "../../../../../services/pdfService";

const reimbursementRoutes: FastifyPluginAsync = async (fastify) => {
    // List my reimbursements
    fastify.get(
        "/",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { status } = request.query as { status?: string };
            const query: any = { userId: request.user.id || request.user._id };
            if (status && status !== "all") {
                query.status = status;
            }
            const reimbursements = await Reimbursement.find(query).sort({ createdAt: -1 });
            return reply.ok({ reimbursements });
        }
    );

    // Create a new reimbursement draft
    fastify.post(
        "/",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { title, notes } = request.body;

            if (!title?.trim()) {
                return reply.badRequest("500", "Title is required");
            }

            const reimbursement = await Reimbursement.create({
                userId: request.user.id || request.user._id,
                organizationId: request.user.organizationId,
                title: title.trim(),
                notes,
                items: [],
                status: "draft",
            });

            return reply.created({ reimbursement });
        }
    );

    // Get a specific reimbursement detail with presigned S3 URLs
    fastify.get(
        "/:id",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;
             const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            // Generate signed URLs for all item images
            const items = await Promise.all(
                reimbursement.items.map(async (item: any) => {
                    let imageUrl = "";
                    if (item.imageKey) {
                        try {
                            imageUrl = await createDownloadUrl({
                                s3: fastify.s3,
                                bucket: fastify.s3Bucket,
                                key: item.imageKey,
                            });
                        } catch (err) {
                            console.error("Error signing imageKey:", item.imageKey, err);
                        }
                    }
                    return {
                        _id: item._id,
                        imageKey: item.imageKey,
                        amount: item.amount,
                        category: item.category,
                        label: item.label,
                        imageUrl,
                    };
                })
            );

            // Generate signed URLs for PDFs if present
            let billsPdfUrl = "";
            if (reimbursement.billsPdfKey) {
                try {
                    billsPdfUrl = await createDownloadUrl({
                        s3: fastify.s3,
                        bucket: fastify.s3Bucket,
                        key: reimbursement.billsPdfKey,
                    });
                } catch (err) {
                    console.error("Error signing billsPdfKey:", err);
                }
            }

            let invoicePdfUrl = "";
            if (reimbursement.invoicePdfKey) {
                try {
                    invoicePdfUrl = await createDownloadUrl({
                        s3: fastify.s3,
                        bucket: fastify.s3Bucket,
                        key: reimbursement.invoicePdfKey,
                    });
                } catch (err) {
                    console.error("Error signing invoicePdfKey:", err);
                }
            }

            const reimbursementObj = reimbursement.toObject();
            return reply.ok({
                reimbursement: {
                    ...reimbursementObj,
                    items,
                    billsPdfUrl,
                    invoicePdfUrl,
                },
            });
        }
    );

    // Get presigned upload URL for adding items
    fastify.post(
        "/:id/items/upload-url",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;
            const { fileName, contentType } = request.body;

             const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

             const result = await createBillUploadUrl({
                s3: fastify.s3,
                bucket: fastify.s3Bucket,
                userId: String(request.user.id || request.user._id),
                reimbursementId: String(reimbursement._id),
                fileName,
                contentType,
            });

            return reply.ok(result);
        }
    );

    // Add item to reimbursement
    fastify.post(
        "/:id/items",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;
            const { imageKey, amount, category, label } = request.body;

             const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            // check if editable: draft OR rejected with editCount === 0
            const isEditable = reimbursement.status === "draft" || (reimbursement.status === "rejected" && reimbursement.editCount === 0);
            if (!isEditable) {
                return reply.badRequest("400", "This reimbursement is not in an editable state");
            }

            reimbursement.items.push({
                imageKey,
                amount: Number(amount),
                category,
                label,
            });

            await reimbursement.save();

            return reply.created({ reimbursement });
        }
    );

    // Update an item in a reimbursement claim
    fastify.put(
        "/:id/items/:itemId",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id, itemId } = request.params;
            const { imageKey, amount, category, label } = request.body;

            const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            // Check if editable: draft OR rejected with editCount === 0
            const isEditable = reimbursement.status === "draft" || (reimbursement.status === "rejected" && reimbursement.editCount === 0);
            if (!isEditable) {
                return reply.badRequest("400", "This reimbursement is not in an editable state");
            }

            // Find the item
            const item = (reimbursement.items as any).id(itemId);
            if (!item) {
                return reply.notFound("Bill item not found");
            }

            // If a new imageKey is provided, delete the old image from S3 to clean up space
            if (imageKey && imageKey !== item.imageKey) {
                try {
                    await deleteS3Object({
                        s3: fastify.s3,
                        bucket: fastify.s3Bucket,
                        key: item.imageKey,
                    });
                } catch (s3Err) {
                    console.error("Failed to delete old image from S3 on item update:", s3Err);
                }
                item.imageKey = imageKey;
            }

            if (amount !== undefined) item.amount = Number(amount);
            if (category !== undefined) item.category = category;
            if (label !== undefined) item.label = label;

            await reimbursement.save();

            return reply.ok({ reimbursement });
        }
    );

    // Delete an item from a reimbursement claim
    fastify.delete(
        "/:id/items/:itemId",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id, itemId } = request.params;

            const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            // Check if editable
            const isEditable = reimbursement.status === "draft" || (reimbursement.status === "rejected" && reimbursement.editCount === 0);
            if (!isEditable) {
                return reply.badRequest("400", "This reimbursement is not in an editable state");
            }

            // Find the item
            const item = (reimbursement.items as any).id(itemId);
            if (!item) {
                return reply.notFound("Bill item not found");
            }

            // Delete the image from S3
            if (item.imageKey) {
                try {
                    await deleteS3Object({
                        s3: fastify.s3,
                        bucket: fastify.s3Bucket,
                        key: item.imageKey,
                    });
                } catch (s3Err) {
                    console.error("Failed to delete image from S3 on item deletion:", s3Err);
                }
            }

            // Remove item from subdocument array
            (reimbursement.items as any).pull(itemId);
            await reimbursement.save();

            return reply.ok({ reimbursement });
        }
    );

    // Submit reimbursement claim
    fastify.post(
        "/:id/submit",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;
             const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            if (reimbursement.items.length === 0) {
                return reply.badRequest("400", "Cannot submit reimbursement with no bill items");
            }

            const isEditable = reimbursement.status === "draft" || (reimbursement.status === "rejected" && reimbursement.editCount === 0);
            if (!isEditable) {
                return reply.badRequest("400", "This reimbursement is not in an editable state");
            }

            if (reimbursement.status === "rejected") {
                reimbursement.editCount += 1;
            }

            reimbursement.status = "submitted";
            reimbursement.submittedAt = new Date();
            const billsPdfKey = `reimbursements/${reimbursement.userId}/${reimbursement._id}/bills.pdf`;
            const invoicePdfKey = `reimbursements/${reimbursement.userId}/${reimbursement._id}/invoice.pdf`;

            reimbursement.billsPdfKey = billsPdfKey;
            reimbursement.invoicePdfKey = invoicePdfKey;

            await reimbursement.save();

            // Dynamic S3 PDF Generation & Upload
            try {
                const employee = await User.findById(reimbursement.userId).lean();
                const pdfBuffer = await generateReimbursementPdf({
                    s3: fastify.s3,
                    bucket: fastify.s3Bucket,
                    reimbursement,
                    employee,
                });

                await uploadS3Object({
                    s3: fastify.s3,
                    bucket: fastify.s3Bucket,
                    key: billsPdfKey,
                    body: pdfBuffer,
                    contentType: "application/pdf",
                });
            } catch (err) {
                console.error("Failed to generate/upload PDF on claim submission:", err);
            }

            return reply.ok({ reimbursement });
        }
    );

    // Get presigned download URL for compiled bills PDF
    fastify.get(
        "/:id/download-bills",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;
             const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }

            if (reimbursement.items.length === 0) {
                return reply.badRequest("400", "Cannot download compilation for reimbursement with no items");
            }

            const key = reimbursement.billsPdfKey || `reimbursements/${reimbursement.userId}/${reimbursement._id}/bills.pdf`;

            try {
                // Ensure PDF exists by compiling and uploading it on the fly
                const employee = await User.findById(reimbursement.userId).lean();
                const pdfBuffer = await generateReimbursementPdf({
                    s3: fastify.s3,
                    bucket: fastify.s3Bucket,
                    reimbursement,
                    employee,
                });

                await uploadS3Object({
                    s3: fastify.s3,
                    bucket: fastify.s3Bucket,
                    key,
                    body: pdfBuffer,
                    contentType: "application/pdf",
                });

                if (!reimbursement.billsPdfKey) {
                    reimbursement.billsPdfKey = key;
                    await reimbursement.save();
                }

                const downloadUrl = await createDownloadUrl({
                    s3: fastify.s3,
                    bucket: fastify.s3Bucket,
                    key,
                });
                return reply.ok({ downloadUrl });
            } catch (err) {
                console.error("Error dynamically compiling/downloading bills PDF:", err);
                return reply.badRequest("500", "Failed to generate download URL");
            }
        }
    );

    // Delete reimbursement claim and all its associated S3 files
    fastify.delete(
        "/:id",
        { preHandler: [fastify.authenticate] },
        async (request: any, reply) => {
            const { id } = request.params;

            const reimbursement = await Reimbursement.findOne({
                _id: id,
                userId: request.user.id || request.user._id,
            });

            if (!reimbursement) {
                return reply.notFound("Reimbursement not found");
            }


            // Delete all bill item images from S3
            for (const item of reimbursement.items) {
                if (item.imageKey) {
                    try {
                        await deleteS3Object({
                            s3: fastify.s3,
                            bucket: fastify.s3Bucket,
                            key: item.imageKey,
                        });
                    } catch (s3Err) {
                        console.error(`Failed to delete S3 image ${item.imageKey} on reimbursement deletion:`, s3Err);
                    }
                }
            }

            // Also delete the compiled PDF if it exists
            if (reimbursement.billsPdfKey) {
                try {
                    await deleteS3Object({
                        s3: fastify.s3,
                        bucket: fastify.s3Bucket,
                        key: reimbursement.billsPdfKey,
                    });
                } catch (s3Err) {
                    console.error("Failed to delete compiled PDF on reimbursement deletion:", s3Err);
                }
            }

            // Delete from database
            await Reimbursement.deleteOne({ _id: id });

            return reply.ok({ success: true });
        }
    );
};

export default reimbursementRoutes;