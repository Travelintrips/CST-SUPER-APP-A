import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import ecommerceRouter from "./ecommerce";
import tradingRouter from "./trading";
import logisticsRouter from "./logistics";
import posRouter from "./pos";
import salesRouter from "./sales";
import purchaseRouter from "./purchase";
import reportsRouter from "./reports";
import paymentsRouter from "./payments";
import accountingRouter from "./accounting";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/dashboard", dashboardRouter);
router.use("/ecommerce", ecommerceRouter);
router.use("/trading", tradingRouter);
router.use("/logistics", logisticsRouter);
router.use("/pos", posRouter);
router.use("/sales", salesRouter);
router.use("/purchase", purchaseRouter);
router.use("/reports", reportsRouter);
router.use("/payments", paymentsRouter);
router.use("/accounting", accountingRouter);
router.use(storageRouter);

export default router;
