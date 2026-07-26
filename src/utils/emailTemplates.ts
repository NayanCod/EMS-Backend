export interface IEmployeeDailyRecord {
  name: string;
  status: string;
  checkIn: string;
  checkOut: string;
  completedTasks: string[];
  pendingTasks: string[];
}

export interface IEmployeeMonthlyRecord {
  name: string;
  presentDays: number;
  totalDays: number;
  attendanceRate: number;
  leaveDaysTaken: number;
  completedTasksCount: number;
  pendingTasksCount: number;
}

const emailHeaderStyle = `
  background-color: #208AEF;
  color: #ffffff;
  padding: 24px;
  text-align: center;
  border-radius: 8px 8px 0 0;
`;

const emailContainerStyle = `
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #ffffff;
  color: #333333;
`;

const emailBodyStyle = `
  padding: 24px;
  line-height: 1.6;
`;

const buttonStyle = `
  display: inline-block;
  background-color: #208AEF;
  color: #ffffff;
  padding: 12px 24px;
  text-decoration: none;
  border-radius: 25px;
  font-weight: bold;
  margin: 8px 4px;
  text-align: center;
`;

const secondaryButtonStyle = `
  display: inline-block;
  background-color: #f0f0f0;
  color: #333333;
  padding: 12px 24px;
  text-decoration: none;
  border-radius: 25px;
  font-weight: bold;
  margin: 8px 4px;
  text-align: center;
`;

const footerStyle = `
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #888888;
  border-top: 1px solid #eeeeee;
  background-color: #fafafa;
  border-radius: 0 0 8px 8px;
`;

const tableStyle = `
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
`;

const thStyle = `
  background-color: #f5f5f5;
  border: 1px solid #dddddd;
  text-align: left;
  padding: 8px;
  font-weight: 600;
`;

const tdStyle = `
  border: 1px solid #dddddd;
  text-align: left;
  padding: 8px;
`;

export function getTaskAssignedTemplate(
  employeeName: string,
  adminName: string,
  taskTitle: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 24px;">New Task Assigned</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>You have been assigned a new task by <strong>${adminName}</strong>:</p>
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0; font-size: 16px; font-weight: 600;">
          "${taskTitle}"
        </div>
        <p>Click the buttons below to open the app and start working on it:</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://tasks" style="${buttonStyle}">Open My Tasks</a>
          <a href="aline://home" style="${secondaryButtonStyle}">Go to Dashboard</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}

export function getProjectAssignedTemplate(
  employeeName: string,
  adminName: string,
  projectName: string,
  projectDesc: string | undefined,
  dueDate: string | undefined,
): string {
  const descHtml = projectDesc
    ? `<p><strong>Description:</strong> ${projectDesc}</p>`
    : "";
  const dateHtml = dueDate
    ? `<p><strong>Due Date:</strong> ${dueDate}</p>`
    : "";

  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 24px;">Added to Project</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>You have been added to a new project: <strong>${projectName}</strong> by <strong>${adminName}</strong>.</p>
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0;">
          <p style="margin-top: 0; font-weight: 600; font-size: 16px;">Project Details:</p>
          ${descHtml}
          ${dateHtml}
        </div>
        <p>Click the buttons below to view the project details in the app:</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://projects" style="${buttonStyle}">Open Projects</a>
          <a href="aline://home" style="${secondaryButtonStyle}">Go to Dashboard</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}

export function getDailyReportTemplate(
  date: string,
  orgName: string,
  records: IEmployeeDailyRecord[],
): string {
  let tableRowsHtml = "";

  if (records.length === 0) {
    tableRowsHtml = `<tr><td colspan="4" style="${tdStyle} text-align: center; color: #888888;">No employees in organization.</td></tr>`;
  } else {
    for (const rec of records) {
      const completedList =
        rec.completedTasks.length > 0
          ? `<ul style="margin: 0; padding-left: 16px;">${rec.completedTasks.map((t) => `<li>${t}</li>`).join("")}</ul>`
          : '<span style="color: #888888; font-size: 12px;">None</span>';

      const pendingList =
        rec.pendingTasks.length > 0
          ? `<ul style="margin: 0; padding-left: 16px;">${rec.pendingTasks.map((t) => `<li>${t}</li>`).join("")}</ul>`
          : '<span style="color: #888888; font-size: 12px;">None</span>';

      let attendanceStatus = "";
      if (rec.status.startsWith("Present")) {
        attendanceStatus = `<span style="color: #2e7d32; font-weight: bold;">${rec.status}</span><br/><span style="font-size: 11px; color: #666666;">In: ${rec.checkIn}<br/>Out: ${rec.checkOut}</span>`;
      } else if (rec.status.startsWith("On Leave")) {
        attendanceStatus = `<span style="color: #0058be; font-weight: bold;">${rec.status}</span>`;
      } else if (rec.status === "Holiday") {
        attendanceStatus = `<span style="color: #e65100; font-weight: bold;">Holiday</span>`;
      } else {
        attendanceStatus = `<span style="color: #c62828; font-weight: bold;">Absent</span>`;
      }

      tableRowsHtml += `
        <tr>
          <td style="${tdStyle}"><strong>${rec.name}</strong></td>
          <td style="${tdStyle}">${attendanceStatus}</td>
          <td style="${tdStyle}">${completedList}</td>
          <td style="${tdStyle}">${pendingList}</td>
        </tr>
      `;
    }
  }

  return `
    <div style="${emailContainerStyle}; max-width: 700px;">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 22px;">Daily Performance Report</h1>
        <p style="margin: 4px 0 0 0; font-size: 14px;">${orgName} • ${date}</p>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi Admin,</p>
        <p>Here is the daily summary report of your employees for yesterday (<strong>${date}</strong>):</p>
        
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}; width: 25%;">Employee</th>
              <th style="${thStyle}; width: 25%;">Attendance</th>
              <th style="${thStyle}; width: 25%;">Completed Tasks</th>
              <th style="${thStyle}; width: 25%;">Pending Tasks</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
      <div style="${footerStyle}">
        This report is generated automatically by your employee tracking app.
      </div>
    </div>
  `;
}

export function getMonthlyReportTemplate(
  monthName: string,
  orgName: string,
  records: IEmployeeMonthlyRecord[],
): string {
  let tableRowsHtml = "";

  if (records.length === 0) {
    tableRowsHtml = `<tr><td colspan="4" style="${tdStyle} text-align: center; color: #888888;">No employees in organization.</td></tr>`;
  } else {
    for (const rec of records) {
      tableRowsHtml += `
        <tr>
          <td style="${tdStyle}"><strong>${rec.name}</strong></td>
          <td style="${tdStyle}">
            <strong>${rec.attendanceRate}%</strong>
            <br/>
            <span style="font-size: 11px; color: #666666;">Present: ${rec.presentDays}/${rec.totalDays} days</span>
          </td>
          <td style="${tdStyle}; font-weight: bold; color: #0058be;">${rec.leaveDaysTaken} day${rec.leaveDaysTaken !== 1 ? "s" : ""}</td>
          <td style="${tdStyle}; color: #2e7d32; font-weight: bold;">${rec.completedTasksCount}</td>
          <td style="${tdStyle}; color: #e65100; font-weight: bold;">${rec.pendingTasksCount}</td>
        </tr>
      `;
    }
  }

  return `
    <div style="${emailContainerStyle}; max-width: 700px;">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 22px;">Monthly Summary Report</h1>
        <p style="margin: 4px 0 0 0; font-size: 14px;">${orgName} • ${monthName}</p>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi Admin,</p>
        <p>Here is the monthly performance summary of your employees for the month of <strong>${monthName}</strong>:</p>
        
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}; width: 25%;">Employee</th>
              <th style="${thStyle}; width: 25%;">Monthly Attendance</th>
              <th style="${thStyle}; width: 18%;">Leaves Taken</th>
              <th style="${thStyle}; width: 16%;">Tasks Completed</th>
              <th style="${thStyle}; width: 16%;">Tasks Pending</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
      <div style="${footerStyle}">
        This report is generated automatically by your employee tracking app.
      </div>
    </div>
  `;
}

export function getSampleCollectionOTPTemplate(
  purpose: string,
  sampleType: string,
  otp: string,
  employeeName: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 24px;">Verification Code</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Dear Customer,</p>
        <p>An employee, <strong>${employeeName}</strong>, is initiating a sample collection from you for the following purpose:</p>
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Purpose:</strong> ${purpose}</p>
          <p style="margin: 4px 0 0 0;"><strong>Sample Type:</strong> ${sampleType}</p>
        </div>
        <p>Please share the following OTP (One-Time Password) with the employee to verify and complete the sample collection:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #208AEF; padding: 8px 16px; border: 2px dashed #208AEF; border-radius: 8px; background-color: #f0f7ff;">
            ${otp}
          </span>
        </div>
        <p style="color: #666666; font-size: 14px;">If you did not request this sample collection, please ignore this email.</p>
      </div>
      <div style="${footerStyle}">
        This is an automated security verification code. Do not share this code with anyone other than the verifying agent.
      </div>
    </div>
  `;
}

export function getAdminWelcomeTemplate(
  adminName: string,
  orgName: string,
  orgCode: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 24px;">Welcome to ALine!</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${adminName}</strong>,</p>
        <p>Thank you for registering with ALine! Your organization, <strong>${orgName}</strong>, has been successfully created.</p>
        
        <p>To invite your team members and employees to join your organization, please share the following unique <strong>Organization Code</strong> with them:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #208AEF; padding: 12px 24px; border: 2px solid #208AEF; border-radius: 8px; background-color: #f0f7ff; display: inline-block;">
            ${orgCode}
          </span>
        </div>
        
        <p>Your employees will need to enter this code when signing up so they are correctly linked to your organization.</p>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://home" style="${buttonStyle}">Go to Admin Dashboard</a>
        </div>
      </div>
      <div style="${footerStyle}">
        Thank you for choosing ALine. If you have any questions, please contact our support team.
      </div>
    </div>
  `;
}

export function getEmployeeWelcomeTemplate(
  employeeName: string,
  orgName: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 24px;">Welcome to ALine!</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Welcome to the team! You have successfully registered and joined <strong>${orgName}</strong>.</p>
        
        <p>You can now log in using the mobile app to check your attendance, manage tasks assigned by your admin, log reimbursements, and more.</p>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://home" style="${buttonStyle}">Open Employee App</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated welcome email. Welcome aboard!
      </div>
    </div>
  `;
}

export function getEmployeeJoinedAdminTemplate(
  adminName: string,
  employeeName: string,
  employeeEmail: string,
  orgCode: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 20px;">New Employee Registered</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${adminName}</strong>,</p>
        <p>A new employee has successfully registered and joined your organization using your Organization Code.</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Employee Name:</strong> ${employeeName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Email Address:</strong> ${employeeEmail}</p>
          <p style="margin: 0;"><strong>Used Org Code:</strong> ${orgCode}</p>
        </div>
        
        <p>You can manage their details, assign tasks, and view their attendance history directly from the Admin Dashboard.</p>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://employees" style="${buttonStyle}">Manage Employees</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification from ALine Admin Services.
      </div>
    </div>
  `;
}

export function getClaimSubmittedAdminTemplate(
  adminName: string,
  employeeName: string,
  claimTitle: string,
  amount: number,
  refNum: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 20px;">New Claim Submitted</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${adminName}</strong>,</p>
        <p>A new reimbursement claim has been submitted by <strong>${employeeName}</strong> and requires your review.</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Claim Reference:</strong> ${refNum}</p>
          <p style="margin: 0 0 8px 0;"><strong>Title:</strong> ${claimTitle}</p>
          <p style="margin: 0;"><strong>Total Amount:</strong> ₹${amount.toFixed(2)}</p>
        </div>
        
        <p>Please review and approve/reject this claim in the admin panel.</p>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://reimbursements" style="${buttonStyle}">Review Claims</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification from ALine Admin Services.
      </div>
    </div>
  `;
}

export function getClaimReviewedEmployeeTemplate(
  employeeName: string,
  status: string,
  claimTitle: string,
  amount: number,
  adminNote: string | undefined,
): string {
  const statusColor = status === "approved" ? "#2e7d32" : "#c62828";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const noteHtml = adminNote
    ? `<p style="margin: 8px 0 0 0;"><strong>Admin Note:</strong> ${adminNote}</p>`
    : "";

  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}; background-color: ${statusColor};">
        <h1 style="margin: 0; font-size: 20px;">Claim ${statusLabel}</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your reimbursement claim has been <strong>${status}</strong>.</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid ${statusColor}; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Title:</strong> ${claimTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Total Amount:</strong> ₹${amount.toFixed(2)}</p>
          <p style="margin: 0 0 8px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></p>
          ${noteHtml}
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://reimbursements" style="${buttonStyle}">View Claim Details</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}

export function getClaimCommentTemplate(
  recipientName: string,
  commenterName: string,
  claimTitle: string,
  commentText: string,
  isReply: boolean,
): string {
  const subjectText = isReply
    ? `New reply on claim discussion`
    : `New comment on claim discussion`;
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 20px;">${subjectText}</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${recipientName}</strong>,</p>
        <p><strong>${commenterName}</strong> left a comment on the claim <strong>${claimTitle}</strong>:</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0; font-style: italic;">
          "${commentText}"
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://reimbursements" style="${buttonStyle}">View Claim Discussion</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}

export function getProjectCommentTemplate(
  recipientName: string,
  commenterName: string,
  projectName: string,
  commentText: string,
  isReply: boolean,
): string {
  const subjectText = isReply
    ? `New reply on project discussion`
    : `New comment on project discussion`;
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 20px;">${subjectText}</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${recipientName}</strong>,</p>
        <p><strong>${commenterName}</strong> left a comment on the project <strong>${projectName}</strong>:</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0; font-style: italic;">
          "${commentText}"
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://projects" style="${buttonStyle}">View Project Discussion</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}

export function getLeaveSubmittedAdminTemplate(
  adminName: string,
  employeeName: string,
  leaveType: string,
  startDate: string,
  endDate: string,
  dayCount: number,
  reason: string,
): string {
  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}">
        <h1 style="margin: 0; font-size: 20px;">New Leave Request</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${adminName}</strong>,</p>
        <p>A new leave request has been submitted by <strong>${employeeName}</strong> and requires your review.</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #208AEF; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Leave Type:</strong> ${leaveType}</p>
          <p style="margin: 0 0 8px 0;"><strong>Duration:</strong> ${startDate} to ${endDate} (${dayCount} day${dayCount > 1 ? "s" : ""})</p>
          <p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>
        </div>
        
        <p>Please review and approve/reject this request in the admin panel.</p>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://leaves" style="${buttonStyle}">Review Leaves</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification from ALine Admin Services.
      </div>
    </div>
  `;
}

export function getLeaveReviewedEmployeeTemplate(
  employeeName: string,
  status: string,
  leaveType: string,
  startDate: string,
  endDate: string,
  dayCount: number,
  adminComment?: string,
): string {
  const statusColor = status === "approved" ? "#2e7d32" : "#c62828";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const commentHtml = adminComment
    ? `<p style="margin: 8px 0 0 0;"><strong>Admin Comment:</strong> ${adminComment}</p>`
    : "";

  return `
    <div style="${emailContainerStyle}">
      <div style="${emailHeaderStyle}; background-color: ${statusColor};">
        <h1 style="margin: 0; font-size: 20px;">Leave Request ${statusLabel}</h1>
      </div>
      <div style="${emailBodyStyle}">
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your leave request has been <strong>${status}</strong>.</p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid ${statusColor}; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Leave Type:</strong> ${leaveType}</p>
          <p style="margin: 0 0 8px 0;"><strong>Duration:</strong> ${startDate} to ${endDate} (${dayCount} day${dayCount > 1 ? "s" : ""})</p>
          <p style="margin: 0 0 8px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></p>
          ${commentHtml}
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="aline://leaves" style="${buttonStyle}">View Leave Details</a>
        </div>
      </div>
      <div style="${footerStyle}">
        This is an automated notification. Please do not reply directly to this email.
      </div>
    </div>
  `;
}
