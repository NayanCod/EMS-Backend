import mongoose, { Schema, Document } from 'mongoose';

export interface ITodo extends Document {
  userId: mongoose.Types.ObjectId;
  task: string;
  status: 'pending' | 'completed';
  date: string;
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
}, {
  timestamps: true,
});

// Optional: index for faster fetching of user's tasks by date
TodoSchema.index({ userId: 1, date: 1 });

export const Todo = mongoose.model<ITodo>('Todo', TodoSchema);
