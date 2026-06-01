import mongoose, { Schema, Document } from 'mongoose';

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
}, {
  timestamps: true,
});

export const User = mongoose.model<IUser>('User', UserSchema);
