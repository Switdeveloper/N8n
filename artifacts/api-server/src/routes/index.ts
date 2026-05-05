import { Router, type IRouter } from "express";
import healthRouter from "./health";
import opencodeRouter from "./opencode";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/opencode", opencodeRouter);

export default router;
