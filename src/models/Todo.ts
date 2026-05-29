import mongoose, { Schema, Document } from 'mongoose';

export interface ITodo extends Document {
  userId: mongoose.Types.ObjectId;
  task: string;
  status: 'pending' | 'completed';
  date: string;
  projectId?: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TodoSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  task: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  date: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

// Optional: index for faster fetching of user's tasks by date
TodoSchema.index({ userId: 1, date: 1 });

export const Todo = mongoose.model<ITodo>('Todo', TodoSchema);
