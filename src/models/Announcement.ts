import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  organizationId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  category: 'general' | 'policy' | 'holiday' | 'urgent';
  createdBy: mongoose.Types.ObjectId;
  recipientScope: 'all' | 'selected';
  recipientIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
}

const AnnouncementSchema: Schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['general', 'policy', 'holiday', 'urgent'], 
    required: true,
    default: 'general'
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipientScope: { 
    type: String, 
    enum: ['all', 'selected'], 
    required: true,
    default: 'all'
  },
  recipientIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
});

// Indices for querying announcements
AnnouncementSchema.index({ organizationId: 1, createdAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
