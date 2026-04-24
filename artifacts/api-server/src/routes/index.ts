import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import ecommerceRouter from "./ecommerce";
import tradingRouter from "./trading";
import logisticsRouter from "./logistics";
import posRouter from "./pos";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/dashboard", dashboardRouter);
router.use("/ecommerce", ecommerceRouter);
router.use("/trading", tradingRouter);
router.use("/logistics", logisticsRouter);
router.use("/pos", posRouter);
router.use(storageRouter);

export default router;
