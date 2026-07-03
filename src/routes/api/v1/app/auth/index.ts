import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Organization } from '../../../../../models/Organization';
import { Notification } from '../../../../../models/Notification';
import { sendMail } from '../../../../../services/emailService';
import {
  getAdminWelcomeTemplate,
  getEmployeeWelcomeTemplate,
  getEmployeeJoinedAdminTemplate
} from '../../../../../utils/emailTemplates';
import crypto from 'crypto';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    try {
      const { email, password, role } = request.body as any;

      if (!email || !password) {
        return reply.badRequest('400', 'Email and password are required');
      }

      const user = await User.findOne({ email, status: { $ne: 'REMOVED' } }).populate('organizationId');
      if (!user) {
        return reply.badRequest('400', 'Invalid email or password');
      }

      const isValid = await bcrypt.compare(password, user.password!);
      if (!isValid) {
        return reply.badRequest('400', 'Invalid email or password');
      }

      // Check if user role matches the selected login role
      const expectedRole = role === 'admin' ? 'ADMIN' : 'EMPLOYEE';
      if (user.role !== expectedRole) {
        return reply.badRequest(
          '400', 
          `This account is registered as ${user.role.toLowerCase()}, but you selected ${role} login.`
        );
      }

      const token = fastify.jwt.sign({
        id: user._id,
        role: user.role,
        name: user.name,
        organizationId: user.organizationId?._id
      });

      return reply.ok({
        message: 'Login successful',
        token,
        user: { id: user._id, name: user.name, role: user.role },
        organization: user.organizationId
      });
    } catch (err: any) {
      console.error('[Login] Error:', err);
      return reply.badRequest('500', err?.message || 'Server error during login');
    }
  });

  fastify.post('/signup/admin', async (request, reply) => {
    try {
      const { name, email, password, orgName, addressName, latitude, longitude, radius } = request.body as any;

      if (!name || !email || !password || !orgName || !addressName || !latitude || !longitude || !radius) {
        return reply.badRequest('400', 'All fields are required');
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return reply.badRequest('400', 'User with this email already exists');
      }

      let orgCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      let codeExists = await Organization.findOne({ orgCode });
      while (codeExists) {
        orgCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        codeExists = await Organization.findOne({ orgCode });
      }

      const organization = new Organization({
        name: orgName,
        addressName,
        location: { latitude, longitude },
        radius,
        orgCode
      });
      await organization.save();

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = new User({
        name,
        email,
        password: hashedPassword,
        role: 'ADMIN',
        organizationId: organization._id,
      });
      await user.save();

      // Welcome email & notification to admin
      const adminWelcomeHtml = getAdminWelcomeTemplate(name, orgName, orgCode);
      sendMail({
        to: email,
        subject: `Welcome to AttendancePro! Your Organization is Registered`,
        html: adminWelcomeHtml,
      }).catch(err => console.error('[SignupAdmin] Welcome email failed:', err));

      const adminNotification = new Notification({
        userId: user._id,
        title: 'Welcome to AttendancePro',
        message: `Welcome to AttendancePro! Your organization "${orgName}" has been successfully created. Code: ${orgCode}`
      });
      await adminNotification.save().catch(err => console.error('[SignupAdmin] Welcome notification failed:', err));

      const token = fastify.jwt.sign({
        id: user._id,
        role: user.role,
        name: user.name,
        organizationId: user.organizationId
      });

      return reply.ok({
        message: 'Admin signed up successfully',
        token,
        user: { id: user._id, name: user.name, role: user.role },
        organization
      });
    } catch (err: any) {
      console.error('[SignupAdmin] Error:', err);
      return reply.badRequest('500', err?.message || 'Server error during admin registration');
    }
  });

  fastify.post('/signup/employee', async (request, reply) => {
    try {
      const { name, email, password, orgCode } = request.body as any;

      if (!name || !email || !password || !orgCode) {
        return reply.badRequest('400', 'All fields are required');
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return reply.badRequest('400', 'User with this email already exists');
      }

      const organization = await Organization.findOne({ orgCode });
      if (!organization) {
        return reply.badRequest('400', 'Invalid organization code');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = new User({
        name,
        email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        organizationId: organization._id,
      });
      await user.save();

      // Welcome notification to employee
      const empNotification = new Notification({
        userId: user._id,
        title: 'Welcome to AttendancePro',
        message: `Welcome to AttendancePro! You have successfully registered and joined "${organization.name}".`
      });
      await empNotification.save().catch(err => console.error('[SignupEmployee] Employee welcome notification failed:', err));

      // Welcome email to employee
      const employeeWelcomeHtml = getEmployeeWelcomeTemplate(name, organization.name);
      sendMail({
        to: email,
        subject: `Welcome to Cluix! You've joined ${organization.name}`,
        html: employeeWelcomeHtml,
      }).catch(err => console.error('[SignupEmployee] Employee welcome email failed:', err));

      // Find and notify organization admin(s)
      const admins = await User.find({
        organizationId: organization._id,
        role: 'ADMIN',
        status: { $ne: 'REMOVED' }
      });

      for (const admin of admins) {
        // Admin email notification
        if (admin.emailNotificationsEnabled !== false && admin.email) {
          const adminJoinedHtml = getEmployeeJoinedAdminTemplate(admin.name, name, email, orgCode);
          sendMail({
            to: admin.email,
            subject: `New Employee Joined: ${name}`,
            html: adminJoinedHtml,
          }).catch(err => console.error(`[SignupEmployee] Admin email notification failed for ${admin.email}:`, err));
        }

        // Admin app notification
        if (admin.appNotificationsEnabled !== false) {
          const adminNotification = new Notification({
            userId: admin._id,
            title: 'New Employee Joined',
            message: `${name} has joined your company using organization code: ${orgCode}.`
          });
          await adminNotification.save().catch(err => console.error(`[SignupEmployee] Admin app notification failed for ${admin.name}:`, err));
        }
      }

      const token = fastify.jwt.sign({
        id: user._id,
        role: user.role,
        name: user.name,
        organizationId: user.organizationId
      });

      return reply.ok({
        message: 'Employee signed up successfully',
        token,
        user: { id: user._id, name: user.name, role: user.role },
        organization
      });
    } catch (err: any) {
      console.error('[SignupEmployee] Error:', err);
      return reply.badRequest('500', err?.message || 'Server error during employee registration');
    }
  });
}
