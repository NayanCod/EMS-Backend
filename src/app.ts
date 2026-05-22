import path = require("path");

import fastify, { FastifyPluginAsync } from "fastify";
import autoload, { AutoloadPluginOptions } from "@fastify/autoload";
import fastifyMongo from "@fastify/mongodb";

export type AppOptions = {
  // Place your custom options for app below here.
} & Partial<AutoloadPluginOptions>;

const server: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  fastify.register(autoload, {
    dir: path.join(__dirname, "plugins"),
  });

  // api endpoints / routes are also plugin
  fastify.register(autoload, {
    dir: path.join(__dirname, "routes"),
  });

  fastify.register(fastifyMongo, {
    forceClose: true,
    url: process.env.DATABASE_URL,
  });
};

export default server;
