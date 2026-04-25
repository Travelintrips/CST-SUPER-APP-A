import app from "./app";
import { logger } from "./lib/logger";
import { seedAccountingDefaults } from "./lib/accountingSeed";
import { seedProductCategoriesFromExisting } from "./lib/productCategorySeed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run idempotent accounting seed (no-op if accounts already exist)
  seedAccountingDefaults().catch((seedErr) => {
    logger.error({ err: seedErr }, "Accounting seed failed");
  });

  // Backfill existing product category strings into product_categories table (idempotent)
  seedProductCategoriesFromExisting().catch((seedErr) => {
    logger.error({ err: seedErr }, "Product category backfill failed");
  });
});
