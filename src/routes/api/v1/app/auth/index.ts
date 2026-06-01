import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Organization } from '../../../../../models/Organization';
import crypto from 'crypto';
export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as any;

    const user = await User.findOne({ email, status: { $ne: 'REMOVED' } }).populate('organizationId');
    if (!user) {
      return reply.unauthorised();
    }

    const isValid = await bcrypt.compare(password, user.password!);
    if (!isValid) {
      return reply.unauthorised();
    }

    const token = fastify.jwt.sign({
      id: user._id,
      role: user.role,
      name: user.name,
      organizationId: user.organizationId._id
    });

    return reply.ok({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, role: user.role },
      organization: user.organizationId
    });
  });
  fastify.post('/signup/admin', async (request, reply) => {
    const { name, email, password, orgName, addressName, latitude, longitude, radius } = request.body as any;

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
  });

  fastify.post('/signup/employee', async (request, reply) => {
    const { name, email, password, orgCode } = request.body as any;

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
  });
}
