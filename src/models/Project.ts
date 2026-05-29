import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description?: string;
  organizationId: mongoose.Types.ObjectId;
  dueDate?: string;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
}

const ProjectSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  dueDate: { 
    type: String,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, {
  timestamps: true,
});

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
