import mongoose, { Schema, Document } from 'mongoose';

export interface ISampleCollection extends Document {
  userId: mongoose.Types.ObjectId;
  purpose: string;
  sampleType: string;
  clientEmail: string;
  otp: string;
  status: 'pending' | 'completed';
  startLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  endLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SampleCollectionSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, required: true, trim: true },
  sampleType: { type: String, required: true, trim: true },
  clientEmail: { type: String, required: true, trim: true },
  otp: { type: String, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  startLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String }
  },
  endLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String }
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

SampleCollectionSchema.index({ userId: 1, status: 1 });

export const SampleCollection = mongoose.model<ISampleCollection>('SampleCollection', SampleCollectionSchema);
