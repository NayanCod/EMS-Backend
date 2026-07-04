import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorRole: 'ADMIN' | 'EMPLOYEE';
  action: string;
  targetType: string;
  targetId: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema: Schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorRole: { type: String, enum: ['ADMIN', 'EMPLOYEE'], required: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true, index: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
