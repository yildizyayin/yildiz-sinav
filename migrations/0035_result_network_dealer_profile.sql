-- Result Network dealer profile details used by the Super Admin dealer cards.
ALTER TABLE result_network_dealers ADD COLUMN contact_name TEXT;
ALTER TABLE result_network_dealers ADD COLUMN contact_phone TEXT;
ALTER TABLE result_network_dealers ADD COLUMN contact_email TEXT;
ALTER TABLE result_network_dealers ADD COLUMN address TEXT;
ALTER TABLE result_network_dealers ADD COLUMN neighborhood TEXT;
ALTER TABLE result_network_dealers ADD COLUMN city TEXT;
ALTER TABLE result_network_dealers ADD COLUMN district TEXT;
