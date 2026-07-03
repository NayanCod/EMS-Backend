export type NotificationCategory = 'tasks' | 'reimbursements' | 'leaves' | 'projects' | 'announcements';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'PROJECT_INVITED'
  | 'REIMBURSEMENT_SUBMITTED'
  | 'REIMBURSEMENT_COMMENT_REPLY'
  | 'REIMBURSEMENT_COMMENT_NEW_ADMIN'
  | 'REIMBURSEMENT_COMMENT_NEW_EMPLOYEE'
  | 'REIMBURSEMENT_REVIEWED'
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_REVIEWED'
  | 'ANNOUNCEMENT';

export interface NotificationRegistryEntry {
  category: NotificationCategory;
  title: string | ((data: any) => string);
  message: (data: any) => string;
  link: (data: any) => string;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationRegistryEntry> = {
  TASK_ASSIGNED: {
    category: 'tasks',
    title: 'New Task Assigned',
    message: (data) => `You have been assigned a new task: "${data.title}" by ${data.assignedBy}`,
    link: (data) => `/tasks`,
  },
  PROJECT_INVITED: {
    category: 'projects',
    title: 'Project Invitation',
    message: (data) => `You have been invited to project "${data.projectName}" by ${data.adminName}`,
    link: (data) => `/project/${data.projectId}`,
  },
  REIMBURSEMENT_SUBMITTED: {
    category: 'reimbursements',
    title: 'New Claim Submitted',
    message: (data) => `${data.employeeName} submitted a new claim "${data.title}" for ₹${Number(data.amount).toFixed(2)}`,
    link: (data) => `/reimbursements/${data.reimbursementId}`,
  },
  REIMBURSEMENT_COMMENT_REPLY: {
    category: 'reimbursements',
    title: 'New reply on claim discussion',
    message: (data) => `${data.commenterName} replied: "${data.message}"`,
    link: (data) => `/reimbursements/${data.reimbursementId}`,
  },
  REIMBURSEMENT_COMMENT_NEW_ADMIN: {
    category: 'reimbursements',
    title: 'New claim discussion comment',
    message: (data) => `${data.commenterName} commented: "${data.message}"`,
    link: (data) => `/reimbursements/${data.reimbursementId}`,
  },
  REIMBURSEMENT_COMMENT_NEW_EMPLOYEE: {
    category: 'reimbursements',
    title: 'New claim discussion comment',
    message: (data) => `Admin ${data.commenterName} commented: "${data.message}"`,
    link: (data) => `/reimbursements/${data.reimbursementId}`,
  },
  REIMBURSEMENT_REVIEWED: {
    category: 'reimbursements',
    title: (data) => `Claim ${data.action === 'approve' ? 'Approved' : 'Rejected'}`,
    message: (data) => `Your claim "${data.title}" has been ${data.action === 'approve' ? 'approved' : 'rejected'} by Admin.`,
    link: (data) => `/reimbursements/${data.reimbursementId}`,
  },
  LEAVE_SUBMITTED: {
    category: 'leaves',
    title: 'New Leave Request',
    message: (data) => `${data.employeeName} requested ${data.dayCount} day(s) of ${data.type} leave starting from ${data.startDate}.`,
    link: (data) => `/leaves/${data.leaveId}`,
  },
  LEAVE_REVIEWED: {
    category: 'leaves',
    title: (data) => `Leave Request ${data.status === 'approved' ? 'Approved' : 'Rejected'}`,
    message: (data) => `Your leave request from ${data.startDate} to ${data.endDate} has been ${data.status}.`,
    link: (data) => `/leaves/${data.leaveId}`,
  },
  ANNOUNCEMENT: {
    category: 'announcements',
    title: (data) => data.title || 'New Announcement',
    message: (data) => data.message || data.body || '',
    link: (data) => `/announcements/${data.announcementId}`,
  },
};

export function getNotificationConfig(type: NotificationType, data: any) {
  const entry = NOTIFICATION_REGISTRY[type];
  if (!entry) {
    throw new Error(`Notification type ${type} is not registered.`);
  }
  const title = typeof entry.title === 'function' ? entry.title(data) : entry.title;
  const message = entry.message(data);
  const link = entry.link(data);
  return {
    category: entry.category,
    title,
    message,
    link,
  };
}
