import PDFDocument from "pdfkit";
import { S3Client } from "@aws-sdk/client-s3";
import { downloadS3Object } from "./s3Service";

export async function generateReimbursementPdf(params: {
    s3: S3Client;
    bucket: string;
    reimbursement: any;
    employee: any;
}): Promise<Buffer> {
    const { reimbursement, employee } = params;

    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: "A4" });
            const chunks: Buffer[] = [];

            doc.on("data", (chunk) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err) => reject(err));

            // Title Header
            doc.fillColor("#0284C7").fontSize(20).font("Helvetica-Bold").text("Reimbursement Claim Summary", { align: "center" });
            doc.moveDown(1);

            // Draw line
            doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(1);

            // Employee Info Block
            doc.fillColor("#1E293B").fontSize(12).font("Helvetica-Bold").text("Employee Details");
            doc.font("Helvetica").fontSize(10).fillColor("#475569");
            doc.text(`Name: ${employee?.name || "N/A"}`);
            doc.text(`Employee ID: ${employee?.employeeId || "N/A"}`);
            doc.text(`Email: ${employee?.email || "N/A"}`);
            doc.text(`Department: ${employee?.department || "N/A"}`);
            doc.moveDown(1);

            // Claim Details Block
            doc.fillColor("#1E293B").fontSize(12).font("Helvetica-Bold").text("Claim Details");
            doc.font("Helvetica").fontSize(10).fillColor("#475569");
            doc.text(`Title: ${reimbursement.title}`);
            doc.text(`Status: ${reimbursement.status.toUpperCase()}`);
            doc.text(`Submitted Date: ${reimbursement.submittedAt ? new Date(reimbursement.submittedAt).toLocaleDateString() : "Not Submitted"}`);
            doc.text(`Notes: ${reimbursement.notes || "None"}`);
            doc.moveDown(1);

            // Total Block
            const totalAmount = reimbursement.items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
            doc.fillColor("#0284C7").fontSize(14).font("Helvetica-Bold").text(`Total Claimed: INR ${totalAmount.toFixed(2)}`, { align: "right" });
            doc.moveDown(1.5);

            // Draw line
            doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(1);

            // Items List
            doc.fillColor("#1E293B").fontSize(12).font("Helvetica-Bold").text("Receipt Items");
            doc.moveDown(0.5);

            // Table Headers
            let y = doc.y;
            doc.fontSize(10).font("Helvetica-Bold").fillColor("#1E293B");
            doc.text("Category", 50, y, { width: 100 });
            doc.text("Label", 150, y, { width: 250 });
            doc.text("Amount", 400, y, { width: 100, align: "right" });

            doc.strokeColor("#94A3B8").lineWidth(0.5).moveTo(50, y + 15).lineTo(545, y + 15).stroke();
            doc.moveDown(0.8);

            // Table Rows
            doc.font("Helvetica").fillColor("#475569");
            for (const item of reimbursement.items) {
                y = doc.y;
                doc.text(item.category.toUpperCase(), 50, y, { width: 100 });
                doc.text(item.label || "N/A", 150, y, { width: 250 });
                doc.text(`INR ${Number(item.amount).toFixed(2)}`, 400, y, { width: 100, align: "right" });
                doc.moveDown(0.5);
            }

            doc.moveDown(2);

            // Receipt Images Section
            let hasImages = false;
            for (const item of reimbursement.items) {
                if (item.imageKey) {
                    hasImages = true;
                    break;
                }
            }

            if (hasImages) {
                doc.addPage();
                doc.fillColor("#1E293B").fontSize(14).font("Helvetica-Bold").text("Attached Receipt Images", { align: "center" });
                doc.moveDown(1);

                for (let i = 0; i < reimbursement.items.length; i++) {
                    const item = reimbursement.items[i];
                    if (item.imageKey) {
                        try {
                            const imageBuffer = await downloadS3Object({
                                s3: params.s3,
                                bucket: params.bucket,
                                key: item.imageKey,
                            });

                            // Add item description header
                            doc.fillColor("#1E293B").fontSize(12).font("Helvetica-Bold").text(`Receipt #${i + 1}: ${item.label || item.category.toUpperCase()}`);
                            doc.fillColor("#475569").fontSize(10).font("Helvetica").text(`Amount: INR ${Number(item.amount).toFixed(2)}`);
                            doc.moveDown(0.5);

                            // Try to embed image, catching any errors
                            try {
                                doc.image(imageBuffer, {
                                    fit: [450, 300],
                                    align: "center",
                                    valign: "center",
                                });
                                doc.moveDown(2);
                            } catch (imgErr) {
                                console.error("Failed to render image in PDF:", imgErr);
                                doc.fillColor("#EF4444").text("[Could not render this image file type directly in PDF. Please view it in the app details.]");
                                doc.moveDown(1);
                            }
                        } catch (err) {
                            console.error("Error loading image from S3 for PDF:", err);
                            doc.fillColor("#EF4444").text("[Could not download receipt image from storage]");
                            doc.moveDown(1);
                        }

                        // Add page break if there are more items to avoid messy overlaps
                        if (i < reimbursement.items.length - 1) {
                            doc.addPage();
                        }
                    }
                }
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
