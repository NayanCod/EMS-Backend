import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  date: string; // YYYY-MM-DD
  recurring: boolean; // recurring yearly toggle
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema: Schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true, trim: true },
  date: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  recurring: { type: Boolean, default: false, required: true },
}, {
  timestamps: true,
});

HolidaySchema.index({ organizationId: 1, date: 1 });

export const Holiday = mongoose.model<IHoliday>('Holiday', HolidaySchema);
