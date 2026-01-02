// models/User.js - PostgreSQL User model
const pool = require('../database/db');

class User {
  static async findOne(query) {
    const client = await pool.connect();
    try {
      let result;
      if (query.email) {
        result = await client.query(
          'SELECT * FROM users WHERE email = $1',
          [query.email]
        );
      } else if (query._id || query.id) {
        const id = query._id || query.id;
        result = await client.query(
          'SELECT * FROM users WHERE id = $1',
          [id]
        );
      } else {
        client.release();
        return null;
      }
      
      if (!result.rows[0]) {
        client.release();
        return null;
      }
      
      const row = result.rows[0];
      // Map snake_case to camelCase for compatibility
      return {
        id: row.id,
        _id: row.id.toString(),
        name: row.name,
        email: row.email,
        password: row.password,
        role: row.role,
        attendance: row.attendance,
        lastAttendanceUpdate: row.last_attendance_update,
        last_attendance_update: row.last_attendance_update,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (err) {
      console.error('User.findOne error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  static async find(query = {}) {
    const client = await pool.connect();
    try {
      let sql = 'SELECT * FROM users WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (query.role) {
        sql += ` AND role = $${paramCount++}`;
        params.push(query.role);
      }

      if (query.email) {
        sql += ` AND email = $${paramCount++}`;
        params.push(query.email);
      }

      // Handle sort
      if (query.sort) {
        if (query.sort.name === 1) {
          sql += ' ORDER BY name ASC';
        } else if (query.sort.name === -1) {
          sql += ' ORDER BY name DESC';
        }
      } else {
        sql += ' ORDER BY created_at DESC';
      }

      const result = await client.query(sql, params);
      // Map snake_case to camelCase for compatibility
      return result.rows.map(row => ({
        id: row.id,
        _id: row.id.toString(),
        name: row.name,
        email: row.email,
        password: row.password,
        role: row.role,
        attendance: row.attendance,
        lastAttendanceUpdate: row.last_attendance_update,
        last_attendance_update: row.last_attendance_update,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } finally {
      client.release();
    }
  }

  static async create(data) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (name, email, password, role, attendance, last_attendance_update)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.name,
          data.email,
          data.password,
          data.role || 'developer',
          data.attendance || 'absent',
          data.lastAttendanceUpdate || null
        ]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // Instance methods (for save, etc.)
  async save() {
    const client = await pool.connect();
    try {
      if (this.id) {
        // Update existing user
        const result = await client.query(
          `UPDATE users 
           SET name = $1, email = $2, password = $3, role = $4, 
               attendance = $5, last_attendance_update = $6
           WHERE id = $7
           RETURNING *`,
          [
            this.name,
            this.email,
            this.password,
            this.role,
            this.attendance,
            this.lastAttendanceUpdate,
            this.id
          ]
        );
        return result.rows[0];
      } else {
        // Create new user
        const result = await client.query(
          `INSERT INTO users (name, email, password, role, attendance, last_attendance_update)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            this.name,
            this.email,
            this.password,
            this.role || 'developer',
            this.attendance || 'absent',
            this.lastAttendanceUpdate || null
          ]
        );
        return result.rows[0];
      }
    } finally {
      client.release();
    }
  }
}

module.exports = User;
