import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  status: 'unread' | 'read';
  type?: string;
  data?: any;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ['unread', 'read'], default: 'unread', required: true },
  type: { type: String },
  data: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

// Fast indexing for unread counts and fetching
NotificationSchema.index({ userId: 1, status: 1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
