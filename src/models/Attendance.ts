import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  checkInTime: Date;
  checkOutTime?: Date;
  latitude: number;
  longitude: number;
  reason?: string;
  forgotCheckout?: boolean;
  forgotCheckoutAlertShown?: boolean;
}

const AttendanceSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  checkInTime: { type: Date, required: true },
  checkOutTime: { type: Date },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  reason: { type: String },
  forgotCheckout: { type: Boolean, default: false },
  forgotCheckoutAlertShown: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Ensure a user can only have one attendance record per day
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
