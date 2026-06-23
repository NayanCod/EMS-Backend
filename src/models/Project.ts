import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectComment {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  message: string;
  parentId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IProject extends Document {
  name: string;
  description?: string;
  organizationId: mongoose.Types.ObjectId;
  dueDate?: string;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  comments: IProjectComment[];
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
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  comments: {
    type: [new Schema({
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      message: { type: String, required: true, trim: true },
      parentId: { type: Schema.Types.ObjectId, default: undefined },
    }, { timestamps: { createdAt: true, updatedAt: false } })],
    default: [],
  }
}, {
  timestamps: true,
});

export const Project = mongoose.model<IProject>('Project', ProjectSchema);

