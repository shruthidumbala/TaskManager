# PostgreSQL Migration Guide

This project has been migrated from MongoDB to PostgreSQL.

## Setup Instructions

### 1. Install PostgreSQL

Make sure PostgreSQL is installed on your system:
- Windows: Download from https://www.postgresql.org/download/windows/
- Mac: `brew install postgresql`
- Linux: `sudo apt-get install postgresql`

### 2. Create Database

Open PostgreSQL command line (psql) and run:

```sql
CREATE DATABASE taskmanager;
```

### 3. Run Schema

Execute the schema file to create tables:

```bash
psql -U postgres -d taskmanager -f database/schema.sql
```

Or manually in psql:
```sql
\c taskmanager
\i database/schema.sql
```

### 4. Install Dependencies

```bash
npm install
```

This will install `pg` (PostgreSQL client) instead of `mongoose`.

### 5. Configure Database Connection

Edit `database/db.js` or set environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=taskmanager
export DB_USER=postgres
export DB_PASSWORD=your_password
```

Or modify `database/db.js` directly with your credentials.

### 6. Start the Server

```bash
npm start
```

## Database Schema

The database includes:
- **users** table: Stores user accounts (admin/developer)
- **tasks** table: Stores tasks
- **attachments** table: For future file attachments

## Migration Notes

- All MongoDB/Mongoose queries have been converted to PostgreSQL
- Field names use snake_case in database but are mapped to camelCase in code
- Timestamps are automatically managed by PostgreSQL triggers
- The `_id` field is mapped from PostgreSQL `id` for compatibility

## Troubleshooting

If you get connection errors:
1. Make sure PostgreSQL is running: `pg_isready`
2. Check your credentials in `database/db.js`
3. Verify the database exists: `psql -l`
4. Check PostgreSQL logs for errors


