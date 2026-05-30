 CREATE TABLE IF NOT EXISTS shipments (id integer NOT NULL, order_id integer, tracking_number text NOT NULL, carrier text NOT NULL, status USER-DEFINED NOT NULL, origin text NOT NULL, destination text NOT NULL, estimated_delivery text, created_at timestamp without time zone NOT NULL);

