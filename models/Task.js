// models/Task.js - PostgreSQL Task model
const pool = require('../database/db');

class Task {
  static async findOne(query) {
    const client = await pool.connect();
    try {
      if (query._id || query.id) {
        const id = query._id || query.id;
        const result = await client.query(
          'SELECT * FROM tasks WHERE id = $1',
          [id]
        );
        return result.rows[0] ? this.mapRowToTask(result.rows[0]) : null;
      }
      return null;
    } finally {
      client.release();
    }
  }

  static async find(query = {}) {
    const client = await pool.connect();
    try {
      let sql = 'SELECT * FROM tasks WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (query.assigneeEmail) {
        sql += ` AND assignee_email = $${paramCount++}`;
        params.push(query.assigneeEmail);
      }

      // Handle sort
      if (query.sort && query.sort.createdAt === -1) {
        sql += ' ORDER BY created_at DESC';
      } else {
        sql += ' ORDER BY created_at DESC';
      }

      const result = await client.query(sql, params);
      return result.rows.map(row => this.mapRowToTask(row));
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    return this.findOne({ id });
  }

  static async findByIdAndDelete(id) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM tasks WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0] ? this.mapRowToTask(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  static async deleteMany(query) {
    const client = await pool.connect();
    try {
      let sql = 'DELETE FROM tasks WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (query.createdAt && query.createdAt.$lt) {
        sql += ` AND created_at < $${paramCount++}`;
        params.push(query.createdAt.$lt);
      }

      const result = await client.query(sql, params);
      return { deletedCount: result.rowCount };
    } finally {
      client.release();
    }
  }

  static mapRowToTask(row) {
    return {
      _id: row.id.toString(),
      id: row.id,
      title: row.title,
      details: row.details,
      status: row.status,
      priority: row.priority,
      assigneeEmail: row.assignee_email,
      ownerEmail: row.owner_email,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attachments: [] // Can be populated from attachments table if needed
    };
  }

  // Instance methods
  async save() {
    const client = await pool.connect();
    try {
      if (this.id || this._id) {
        // Update existing task
        const id = this.id || this._id;
        const result = await client.query(
          `UPDATE tasks 
           SET title = $1, details = $2, status = $3, priority = $4, 
               assignee_email = $5, owner_email = $6, due_date = $7
           WHERE id = $8
           RETURNING *`,
          [
            this.title,
            this.details,
            this.status || 'todo',
            this.priority || 'medium',
            this.assigneeEmail || null,
            this.ownerEmail || null,
            this.dueDate || null,
            id
          ]
        );
        return Task.mapRowToTask(result.rows[0]);
      } else {
        // Create new task
        const result = await client.query(
          `INSERT INTO tasks (title, details, status, priority, assignee_email, owner_email, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            this.title,
            this.details,
            this.status || 'todo',
            this.priority || 'medium',
            this.assigneeEmail || null,
            this.ownerEmail || null,
            this.dueDate || null
          ]
        );
        return Task.mapRowToTask(result.rows[0]);
      }
    } finally {
      client.release();
    }
  }
}

module.exports = Task;
