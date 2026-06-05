import mongoose, { Document, Schema } from "mongoose";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReimbursementCategory =
    | "travel"
    | "food"
    | "accommodation"
    | "misc";

export type ReimbursementStatus =
    | "draft"
    | "submitted"
    | "approved"
    | "rejected";

export interface IReimbursementItem {
    imageKey: string;     // S3 URL of the bill photo
    amount: number;          // manually entered by employee
    category: ReimbursementCategory;
    label: string;           // short description e.g. "Uber to airport"
}

export interface IReimbursement extends Document {
    userId: mongoose.Types.ObjectId;
    organizationId: mongoose.Types.ObjectId;

    title: string;           // e.g. "Client visit Noida"
    notes?: string;          // optional overall description

    items: IReimbursementItem[];
    totalAmount: number;     // sum of all item amounts — updated on every save

    status: ReimbursementStatus;

    // generated on submit — S3 URLs
    billsPdfKey?: string;    // all bill images compiled into one PDF
    invoicePdfKey?: string;  // formal quotation-style PDF

    // admin review
    reviewedBy?: mongoose.Types.ObjectId;
    adminNote?: string;      // required on reject, optional on approve

    // edit guard — employee can only edit once after submission
    editCount: number;       // starts at 0; incremented on each edit post-submit

    // reference number — auto-generated e.g. RMB-2024-0001
    referenceNumber: string;

    submittedAt?: Date;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Sub-schema: Bill Item ────────────────────────────────────────────────────

const ReimbursementItemSchema = new Schema<IReimbursementItem>(
    {
        imageKey: {
            type: String,
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        category: {
            type: String,
            enum: ["travel", "food", "accommodation", "misc"],
            required: true,
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { _id: true } // each item gets its own _id — useful for targeted edits
);

// Concrete document type for use in pre-hooks
type IReimbursementDocument = Document & IReimbursement;

// ─── Main Schema ─────────────────────────────────────────────────────────────

const ReimbursementSchema = new Schema<IReimbursement>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
        },

        items: {
            type: [ReimbursementItemSchema],
            default: [],
        },
        totalAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        status: {
            type: String,
            enum: ["draft", "submitted", "approved", "rejected"],
            default: "draft",
        },

        billsPdfKey: {
            type: String,
        },
        invoicePdfKey: {
            type: String,
        },

        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        adminNote: {
            type: String,
            trim: true,
        },

        editCount: {
            type: Number,
            default: 0,
        },

        referenceNumber: {
            type: String,
            unique: true,
        },

        submittedAt: {
            type: Date,
        },
        reviewedAt: {
            type: Date,
        },
    },
    {
        timestamps: true, // auto-manages createdAt and updatedAt
    }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// fast lookup: all reimbursements for a user
ReimbursementSchema.index({ userId: 1, createdAt: -1 });

// fast lookup: all org reimbursements for admin view
ReimbursementSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// ─── Pre-save Hook: auto-calculate totalAmount ────────────────────────────────

ReimbursementSchema.pre("save", function () {
    if (this.isModified("items")) {
        this.totalAmount = this.items.reduce(
            (sum, item) => sum + item.amount,
            0
        );
    }
});

// ─── Pre-save Hook: generate referenceNumber on first save ────────────────────

ReimbursementSchema.pre("save", async function () {
    if (this.isNew) {
        const year = new Date().getFullYear();
        const count = await mongoose.model("Reimbursement").countDocuments();
        const padded = String(count + 1).padStart(4, "0");
        this.referenceNumber = `RMB-${year}-${padded}`;
    }
});

// ─── Export ───────────────────────────────────────────────────────────────────

const Reimbursement = mongoose.model<IReimbursement>(
    "Reimbursement",
    ReimbursementSchema
);

export default Reimbursement;