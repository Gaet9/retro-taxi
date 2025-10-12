-- Create the user with password
-- CREATE USER db_user WITH PASSWORD 'your_secure_password';

-- Create the database
-- CREATE DATABASE Assignment OWNER db_user;

-- Grant full access to the new database
-- GRANT ALL PRIVILEGES ON DATABASE Assignment TO db_user;

-- Connect to the new database
-- \c Assignment db_user;

-- The functions above are made manually

-- Create Users table
CREATE TABLE Users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')) DEFAULT 'user',
    newsletter BOOLEAN DEFAULT FALSE,
    adminRequest BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Blogs table
CREATE TABLE Blogs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    sources TEXT, -- Store sources separately as JSON array
    category TEXT,
    model TEXT,
    brand TEXT,
    image_url TEXT,
    created_at DATE DEFAULT CURRENT_DATE,
    user_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
    last_updated DATE,
    summary TEXT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- Create contact table to receive information from contact form
CREATE TABLE contact (
    id serial PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    email VARCHAR(60) NOT NULL,
    subject VARCHAR(100),
    message  TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table to store newsletter articles
CREATE TABLE newsletters (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_DATE
);

-- Create table to store zone data
CREATE TABLE zones (
    id SERIAL PRIMARY KEY,
    company TEXT NOT NULL,
    city TEXT,
    country TEXT,
    operational_model TEXT DEFAULT 'Human-monitored' CHECK (operational_model IN ('Driverless (Geofenced L4)', 'Human-monitored', 'Remote-assist', 'Undefined')) DEFAULT 'Undefined',
    service_status TEXT DEFAULT 'Testing' CHECK (service_status IN ('Testing', 'Pilot', 'Limited', 'Available', 'Suspended', 'Undefined')) DEFAULT 'Undefined',
    fleet_size INT,
    coordinates TEXT, -- Store the complete GeoJSON feature
    created_at TIMESTAMPTZ DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_DATE
);


-- 


-- Modify the operational_model column to add 'undefined' to the CHECK constraint and set it as default
ALTER TABLE zones 
ALTER COLUMN operational_model DROP DEFAULT,
ALTER COLUMN operational_model SET DEFAULT 'Undefined';

ALTER TABLE zones 
DROP CONSTRAINT zones_operational_model_check;

ALTER TABLE zones 
ADD CONSTRAINT zones_operational_model_check 
    CHECK (operational_model IN ('Driverless (Geofenced L4)', 'Human-monitored', 'Remote-assist', 'Undefined'));

-- Modify the service_status column to add 'undefined' to the CHECK constraint and set it as default
ALTER TABLE zones 
ALTER COLUMN service_status DROP DEFAULT,
ALTER COLUMN service_status SET DEFAULT 'Undefined';

ALTER TABLE zones 
DROP CONSTRAINT zones_service_status_check;

ALTER TABLE zones 
ADD CONSTRAINT zones_service_status_check 
    CHECK (service_status IN ('Testing', 'Pilot', 'Limited', 'Available', 'Suspended', 'Undefined'));