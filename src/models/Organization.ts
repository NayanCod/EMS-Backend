import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  addressName?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  radius?: number;
  workStartTime?: string;
  workEndTime?: string;
  orgCode: string;
}

const OrganizationSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  addressName: { type: String, trim: true },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  radius: { type: Number, default: 500 },
  workStartTime: { type: String },
  workEndTime: { type: String },
  orgCode: { type: String, required: true, unique: true },
}, {
  timestamps: true,
});

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
