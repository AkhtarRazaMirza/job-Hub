import { appRouter } from "./routers/app";
import { createCallerFactory } from "./init";

export const createCaller = createCallerFactory(appRouter);
