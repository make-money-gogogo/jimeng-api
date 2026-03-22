"use strict";

import "dotenv/config";

import environment from "@/lib/environment.ts";
import { isJimengBrowserGenerateEnvEnabled } from "@/lib/jimeng-browser-flags.ts";
import config from "@/lib/config.ts";
import "@/lib/initialize.ts";
import server from "@/lib/server.ts";
import routes from "@/api/routes/index.ts";
import logger from "@/lib/logger.ts";

const startupTime = performance.now();

(async () => {
  logger.header();

  logger.info("<<<< jimeng-api >>>>");
  logger.info("Version:", environment.package.version);
  logger.info("Process id:", process.pid);
  logger.info("Environment:", environment.env);
  logger.info("Service name:", config.service.name);
  if (isJimengBrowserGenerateEnvEnabled()) {
    logger.info(
      "Shark 绕过: 已启用 JIMENG_BROWSER_GENERATE（Chromium 在首次「提交生成」时启动；默认无头不弹窗，可设 JIMENG_BROWSER_HEADLESS=0）"
    );
  }

  server.attachRoutes(routes);
  await server.listen();

  config.service.bindAddress &&
    logger.success("Service bind address:", config.service.bindAddress);
})()
  .then(() =>
    logger.success(
      `Service startup completed (${Math.floor(performance.now() - startupTime)}ms)`
    )
  )
  .catch((err) => console.error(err));
