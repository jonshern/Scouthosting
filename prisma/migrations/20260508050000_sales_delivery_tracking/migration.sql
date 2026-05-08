-- Per-line-item delivered counts so leaders can record partial
-- fulfillment without flipping the whole SalesOrder to delivered.
ALTER TABLE "SalesOrderItem"
  ADD COLUMN "quantityDelivered" integer NOT NULL DEFAULT 0;
