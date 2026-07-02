import mongoose, { Schema, Document } from 'mongoose';

export interface ILeave extends Document {
  employeeId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  type: string; // 'Sick', 'Casual', 'Paid', 'Unpaid', etc.
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dayCount: number; // excluding weekends and holidays
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema: Schema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  type: { type: String, required: true },
  startDate: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format']
  },
  endDate: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format']
  },
  dayCount: { type: Number, required: true, min: 0.5 },
  reason: { type: String, required: true, trim: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'cancelled'], 
    default: 'pending',
    required: true 
  },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewComment: { type: String, trim: true },
}, {
  timestamps: true,
});

// Ensure indexes for querying leaves
LeaveSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });
LeaveSchema.index({ organizationId: 1, status: 1 });

export const Leave = mongoose.model<ILeave>('Leave', LeaveSchema);
