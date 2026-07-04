import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { Leave } from '../models/Leave';
import { Todo } from '../models/Todo';
import { Project } from '../models/Project';
import Reimbursement from '../models/Reimbursement';
import mongoose from 'mongoose';

// Helper to parse date strings (YYYY-MM-DD) into Date objects
const parseDateRange = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
};

export interface AttendanceReportRow {
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  checkIn: string;
  checkOut: string;
  hoursWorked: string;
  latitude: number;
  longitude: number;
}

export interface LeaveReportRow {
  startDate: string;
  endDate: string;
  employeeId: string;
  employeeName: string;
  type: string;
  dayCount: number;
  status: string;
  reason: string;
  reviewedBy: string;
}

export interface TaskReportRow {
  date: string;
  employeeId: string;
  employeeName: string;
  taskTitle: string;
  projectName: string;
  status: string;
  assignedBy: string;
  completedAt: string;
}

export interface ReimbursementReportRow {
  submittedDate: string;
  refNumber: string;
  employeeId: string;
  employeeName: string;
  title: string;
  status: string;
  totalAmount: number;
}

export interface ProjectReportRow {
  projectName: string;
  taskTitle: string;
  assignee: string;
  status: string;
  assignedDate: string;
  completedAt: string;
}

export const getAttendanceReportData = async (
  organizationId: string,
  filters: { startDate: string; endDate: string; employeeId?: string }
): Promise<AttendanceReportRow[]> => {
  const orgIdObj = new mongoose.Types.ObjectId(organizationId);

  // Get active organization users
  const userQuery: any = { organizationId: orgIdObj, status: { $ne: 'REMOVED' } };
  if (filters.employeeId) {
    userQuery._id = new mongoose.Types.ObjectId(filters.employeeId);
  }
  const users = await User.find(userQuery).select('_id name employeeId department').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const userIds = Array.from(userMap.keys());

  if (userIds.length === 0) return [];

  // Query attendance records
  const attendances = await Attendance.find({
    userId: { $in: userIds },
    date: { $gte: filters.startDate, $lte: filters.endDate }
  }).sort({ date: 1, userId: 1 }).lean();

  return attendances.map(record => {
    const user = userMap.get(record.userId.toString());
    const empId = user?.employeeId || 'N/A';
    const empName = user?.name || 'Unknown';
    const dept = user?.department || 'N/A';

    const checkIn = record.checkInTime
      ? new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      : 'N/A';

    const checkOut = record.checkOutTime
      ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      : 'Pending';

    let hoursWorked = 'N/A';
    if (record.checkInTime && record.checkOutTime) {
      const diffMs = new Date(record.checkOutTime).getTime() - new Date(record.checkInTime).getTime();
      const hrs = diffMs / (1000 * 60 * 60);
      hoursWorked = `${hrs.toFixed(1)} hrs`;
    }

    return {
      date: record.date,
      employeeId: empId,
      employeeName: empName,
      department: dept,
      checkIn,
      checkOut,
      hoursWorked,
      latitude: record.latitude,
      longitude: record.longitude
    };
  });
};

export const getLeaveReportData = async (
  organizationId: string,
  filters: { startDate: string; endDate: string; employeeId?: string }
): Promise<LeaveReportRow[]> => {
  const orgIdObj = new mongoose.Types.ObjectId(organizationId);

  const query: any = {
    organizationId: orgIdObj,
    startDate: { $gte: filters.startDate, $lte: filters.endDate }
  };

  if (filters.employeeId) {
    query.employeeId = new mongoose.Types.ObjectId(filters.employeeId);
  }

  const leaves = await Leave.find(query)
    .populate('employeeId', 'name employeeId')
    .populate('reviewedBy', 'name')
    .sort({ startDate: 1 })
    .lean();

  return leaves.map(record => {
    const emp = record.employeeId as any;
    const reviewer = record.reviewedBy as any;

    return {
      startDate: record.startDate,
      endDate: record.endDate,
      employeeId: emp?.employeeId || 'N/A',
      employeeName: emp?.name || 'Unknown',
      type: record.type,
      dayCount: record.dayCount,
      status: record.status.toUpperCase(),
      reason: record.reason,
      reviewedBy: reviewer?.name || 'Pending'
    };
  });
};

export const getTaskReportData = async (
  organizationId: string,
  filters: { startDate: string; endDate: string; projectId?: string; employeeId?: string }
): Promise<TaskReportRow[]> => {
  const orgIdObj = new mongoose.Types.ObjectId(organizationId);

  // Find users in the organization
  const userQuery: any = { organizationId: orgIdObj, status: { $ne: 'REMOVED' } };
  if (filters.employeeId) {
    userQuery._id = new mongoose.Types.ObjectId(filters.employeeId);
  }
  const users = await User.find(userQuery).select('_id name employeeId').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const userIds = Array.from(userMap.keys());

  if (userIds.length === 0) return [];

  const todoQuery: any = {
    userId: { $in: userIds },
    date: { $gte: filters.startDate, $lte: filters.endDate }
  };

  if (filters.projectId) {
    todoQuery.projectId = new mongoose.Types.ObjectId(filters.projectId);
  }

  const todos = await Todo.find(todoQuery)
    .populate('projectId', 'name')
    .populate('assignedBy', 'name')
    .sort({ date: 1 })
    .lean();

  return todos.map(record => {
    const user = userMap.get(record.userId.toString());
    const project = record.projectId as any;
    const assigner = record.assignedBy as any;

    const completedAt = record.completedAt
      ? new Date(record.completedAt).toLocaleString('en-US', { hour12: false })
      : 'N/A';

    return {
      date: record.date,
      employeeId: user?.employeeId || 'N/A',
      employeeName: user?.name || 'Unknown',
      taskTitle: record.task,
      projectName: project?.name || 'Personal / No Project',
      status: record.status.toUpperCase(),
      assignedBy: assigner?.name || 'Self',
      completedAt
    };
  });
};

export const getReimbursementReportData = async (
  organizationId: string,
  filters: { startDate: string; endDate: string; employeeId?: string; category?: string }
): Promise<ReimbursementReportRow[]> => {
  const orgIdObj = new mongoose.Types.ObjectId(organizationId);
  const { start, end } = parseDateRange(filters.startDate, filters.endDate);

  const query: any = {
    organizationId: orgIdObj,
    createdAt: { $gte: start, $lte: end }
  };

  if (filters.employeeId) {
    query.userId = new mongoose.Types.ObjectId(filters.employeeId);
  }

  if (filters.category) {
    query['items.category'] = filters.category;
  }

  const reimbursements = await Reimbursement.find(query)
    .populate('userId', 'name employeeId')
    .sort({ createdAt: 1 })
    .lean();

  return reimbursements.map(record => {
    const user = record.userId as any;
    const submittedDate = record.createdAt
      ? new Date(record.createdAt).toISOString().split('T')[0]
      : 'N/A';

    return {
      submittedDate,
      refNumber: record.referenceNumber || 'N/A',
      employeeId: user?.employeeId || 'N/A',
      employeeName: user?.name || 'Unknown',
      title: record.title,
      status: record.status.toUpperCase(),
      totalAmount: record.totalAmount
    };
  });
};

export const getProjectReportData = async (
  organizationId: string,
  filters: { startDate: string; endDate: string; projectId?: string }
): Promise<ProjectReportRow[]> => {
  const orgIdObj = new mongoose.Types.ObjectId(organizationId);

  // Find all projects in organization
  const projQuery: any = { organizationId: orgIdObj };
  if (filters.projectId) {
    projQuery._id = new mongoose.Types.ObjectId(filters.projectId);
  }
  const projects = await Project.find(projQuery).select('_id name').lean();
  const projectMap = new Map(projects.map(p => [p._id.toString(), p]));
  const projectIds = Array.from(projectMap.keys());

  if (projectIds.length === 0) return [];

  const todoQuery: any = {
    projectId: { $in: projectIds },
    date: { $gte: filters.startDate, $lte: filters.endDate }
  };

  const todos = await Todo.find(todoQuery)
    .populate('userId', 'name')
    .sort({ date: 1 })
    .lean();

  return todos.map(record => {
    const project = projectMap.get(record.projectId!.toString());
    const user = record.userId as any;

    const completedAt = record.completedAt
      ? new Date(record.completedAt).toLocaleString('en-US', { hour12: false })
      : 'N/A';

    return {
      projectName: project?.name || 'Unknown Project',
      taskTitle: record.task,
      assignee: user?.name || 'Unknown',
      status: record.status.toUpperCase(),
      assignedDate: record.date,
      completedAt
    };
  });
};
