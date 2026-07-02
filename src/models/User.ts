import mongoose, { Schema, Document } from 'mongoose';

export interface IPushToken {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  updatedAt: Date;
}

export interface INotificationPreferences {
  tasks: boolean;
  reimbursements: boolean;
  leaves: boolean;
  projects: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  phoneNumber?: string;
  password?: string;
  role: 'EMPLOYEE' | 'ADMIN';
  designation?: string;
  organizationId: mongoose.Types.ObjectId;
  employeeId?: string;
  department?: string;
  emailNotificationsEnabled: boolean;
  appNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  pushTokens: IPushToken[];
  notificationPreferences: INotificationPreferences;
  status: 'ACTIVE' | 'INACTIVE' | 'REMOVED';
  profileImage?: string;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  phoneNumber: { type: String, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['EMPLOYEE', 'ADMIN'], default: 'EMPLOYEE' },
  designation: { type: String },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  employeeId: { type: String, trim: true },
  department: { type: String, trim: true },
  emailNotificationsEnabled: { type: Boolean, default: true },
  appNotificationsEnabled: { type: Boolean, default: true },
  pushNotificationsEnabled: { type: Boolean, default: true },
  pushTokens: [{
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceId: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
  }],
  notificationPreferences: {
    tasks: { type: Boolean, default: true },
    reimbursements: { type: Boolean, default: true },
    leaves: { type: Boolean, default: true },
    projects: { type: Boolean, default: true }
  },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'REMOVED'], default: 'ACTIVE' },
  profileImage: { type: String },
}, {
  timestamps: true,
});

export const User = mongoose.model<IUser>('User', UserSchema);
