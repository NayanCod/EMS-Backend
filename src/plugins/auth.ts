import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'supersecretkey_change_me_in_production'
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.unauthorised();
    }
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const user = request.user as any;
      if (user.role !== 'ADMIN') {
        return reply.forbidden('FORBIDDEN', 'Admin access required');
      }
    } catch (err) {
      return reply.unauthorised();
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    requireAdmin: any;
  }
}
