import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaveType {
  name: string;
  annualAllotment: number;
}

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
  leaveTypes: ILeaveType[];
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
  leaveTypes: {
    type: [{
      name: { type: String, required: true },
      annualAllotment: { type: Number, required: true }
    }],
    default: [
      { name: 'Sick', annualAllotment: 12 },
      { name: 'Casual', annualAllotment: 12 },
      { name: 'Paid', annualAllotment: 15 },
      { name: 'Unpaid', annualAllotment: 365 }
    ]
  }
}, {
  timestamps: true,
});

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
