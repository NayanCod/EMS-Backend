import { config as configureEnv } from "dotenv";
import server from "./app";
import fastify from "fastify";

configureEnv({
  path: ".env",
});

const start = async () => {
  try {
    const _fastify = fastify();
    await _fastify.register(server);
    await _fastify.listen({
      port: 3000,
      host: '0.0.0.0',
    });

    // @ts-ignore
    console.info(`Server is listening on ${_fastify.server.address()?.port}`);
  } catch (err) {
    console.error(err);
    process.exit(1); // Exit the process on error
  }
};

start();
