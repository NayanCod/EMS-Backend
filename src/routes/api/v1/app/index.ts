import { FastifyPluginAsync } from "fastify";

const indexRoute: FastifyPluginAsync = async (
  fastify,
  opts
): Promise<void> => {
    fastify.get("/", async(request, reply) => {
        return { message: "Welcome to the Employee Management System API" };
    })
};

export default indexRoute;