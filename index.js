const http = require("http");
const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const pool = require("./database/db");
const User = require("./models/User");
const Task = require("./models/Task");


const app = express();
console.log("INDEX.JS - PostgreSQL VERSION - ROLE BASED");

// Test PostgreSQL connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error("PostgreSQL connection error:", err);
    console.error("Error details:", err.message);
    console.error("Make sure PostgreSQL is running and credentials are correct in database/db.js");
  } else {
    console.log("PostgreSQL connected successfully");
    console.log("Current time from DB:", res.rows[0].now);
    // Run cleanup after PostgreSQL is connected
    deleteOldTasks();
  }
});

// ================== AUTO-DELETE OLD TASKS (1 week old) ==================
let ioInstance = null; // Will be set after io is created

async function deleteOldTasks() {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    
    console.log(`Checking for tasks older than: ${oneWeekAgo.toISOString()}`);
    
    const result = await Task.deleteMany({
      createdAt: { $lt: oneWeekAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(` Deleted ${result.deletedCount} task(s) older than 1 week`);
      if (ioInstance) {
        ioInstance.emit("tasksCleaned", { deletedCount: result.deletedCount });
      }
    } else {
      console.log(` No tasks older than 1 week found`);
    }
  } catch (err) {
    console.error("Error deleting old tasks:", err);
  }
}

// Run cleanup every hour
setInterval(deleteOldTasks, 60 * 60 * 1000); // 1 hour in milliseconds

// ================== APP SETUP ==================
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // frontend origin if separated
  },
});

ioInstance = io; // Set the global reference


io.on("connection", (socket) => {
  console.log(" User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log(" User disconnected:", socket.id);
  });
});
// ================== AUTH MIDDLEWARE ==================
function protectRoute(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).send("Login required!");

  try {
    req.user = jwt.verify(token, "supersecret123");
    next();
  } catch {
    return res.status(401).send("Invalid token!");
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send("Forbidden");
    }
    next();
  };
}


// ================== HEALTH CHECK ==================
app.get("/health", async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: "ok", 
      database: "connected",
      timestamp: result.rows[0].now 
    });
  } catch (err) {
    res.status(500).json({ 
      status: "error", 
      database: "disconnected",
      error: err.message 
    });
  }
});

// ================== PUBLIC PAGES ==================
app.get("/", (req, res) => {
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register");
});

// Forgot password page (also support /reset as alias)
app.get("/forgot", (req, res) => {
  try {
    res.render("forgot");
  } catch (err) {
    console.error("Error rendering forgot page:", err);
    res.status(500).send("Error loading reset password page");
  }
});

app.get("/reset", (req, res) => {
  try {
    res.render("forgot");
  } catch (err) {
    console.error("Error rendering forgot page:", err);
    res.status(500).send("Error loading reset password page");
  }
});

app.get("/home", (req, res) => {
  res.render("index", { tasks: [], user: null });
});


// ================== API ROUTES ==================
app.get("/api/tasks", protectRoute, requireRole("admin", "developer"), async (req, res) => {
  try {
    // Developers should see all tasks (including ones assigned to them)
    // Admins also see everything
    const tasks = await Task.find({});
    res.json(tasks);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// Manual cleanup endpoint for testing (admin only)
app.post("/api/cleanup-tasks", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    await deleteOldTasks();
    res.json({ message: "Cleanup completed" });
  } catch (err) {
    console.error("Manual cleanup error:", err);
    res.status(500).json({ message: "Cleanup failed" });
  }
});

// ================== ATTENDANCE & DEVELOPER MANAGEMENT ==================
// Get all developers with their attendance status (admin only)
app.get("/api/developers", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const developers = await User.find({ role: "developer" });
    // Map to include only needed fields and convert snake_case to camelCase
    const mapped = developers.map(dev => ({
      name: dev.name,
      email: dev.email,
      attendance: dev.attendance,
      lastAttendanceUpdate: dev.last_attendance_update
    }));
    res.json(mapped);
  } catch (err) {
    console.error("Error fetching developers:", err);
    res.status(500).json({ message: "Failed to fetch developers" });
  }
});

// Get current user's attendance (developer only)
app.get("/api/my-attendance", protectRoute, requireRole("developer"), async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ 
      attendance: user.attendance, 
      lastAttendanceUpdate: user.last_attendance_update 
    });
  } catch (err) {
    console.error("Error fetching attendance:", err);
    res.status(500).json({ message: "Failed to fetch attendance" });
  }
});

// Mark attendance (developer only)
app.post("/api/attendance", protectRoute, requireRole("developer"), async (req, res) => {
  try {
    const { status } = req.body;
    
    console.log("Attendance update request:", { email: req.user.email, status });
    
    if (!status || !["present", "absent"].includes(status)) {
      return res.status(400).json({ message: "Invalid attendance status. Must be 'present' or 'absent'" });
    }
    
    const userData = await User.findOne({ email: req.user.email });
    if (!userData) {
      console.error("User not found:", req.user.email);
      return res.status(404).json({ message: "User not found" });
    }
    
    // Create user instance and update
    const user = Object.assign(Object.create(User.prototype), userData);
    user.attendance = status;
    user.lastAttendanceUpdate = new Date();
    await user.save();
    
    console.log("Attendance updated successfully:", { email: user.email, attendance: status });
    
    if (ioInstance) {
      ioInstance.emit("attendanceUpdated", { email: user.email, attendance: status });
    }
    
    res.json({ message: `Attendance marked as ${status}`, attendance: status });
  } catch (err) {
    console.error("Error updating attendance:", err);
    res.status(500).json({ message: `Failed to update attendance: ${err.message}` });
  }
});

// Assign task to developer (admin only)
app.put("/api/task/:id/assign", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const { assigneeEmail } = req.body;
    const taskData = await Task.findById(req.params.id);
    
    if (!taskData) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    // Verify assignee is a developer
    if (assigneeEmail) {
      const assignee = await User.findOne({ email: assigneeEmail, role: "developer" });
      if (!assignee) {
        return res.status(400).json({ message: "Invalid developer email" });
      }
    }
    
    const task = Object.assign(Object.create(Task.prototype), taskData);
    task.assigneeEmail = assigneeEmail || null;
    const updatedTask = await task.save();
    
    if (ioInstance) {
      ioInstance.emit("taskUpdated", updatedTask);
    }
    res.json({ message: "Task assigned successfully", task: updatedTask });
  } catch (err) {
    console.error("Error assigning task:", err);
    res.status(500).json({ message: "Failed to assign task" });
  }
});

// Update task status (developer can update their assigned tasks)
app.put("/api/task/:id/status", protectRoute, requireRole("admin", "developer"), async (req, res) => {
  try {
    const { status } = req.body;
    const taskData = await Task.findById(req.params.id);
    
    console.log("Task status update request:", { 
      taskId: req.params.id, 
      status, 
      userEmail: req.user.email, 
      userRole: req.user.role,
      taskAssignee: taskData?.assigneeEmail 
    });
    
    if (!taskData) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    // Developers can only update tasks assigned to them
    if (req.user.role === "developer") {
      if (!taskData.assigneeEmail) {
        return res.status(403).json({ message: "This task is not assigned to anyone" });
      }
      if (taskData.assigneeEmail !== req.user.email) {
        return res.status(403).json({ 
          message: `You can only update tasks assigned to you. This task is assigned to ${taskData.assigneeEmail}` 
        });
      }
    }
    
    if (!status || !["todo", "in-progress", "done"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'todo', 'in-progress', or 'done'" });
    }
    
    const task = Object.assign(Object.create(Task.prototype), taskData);
    task.status = status;
    const updatedTask = await task.save();
    
    console.log("Task status updated successfully:", { taskId: updatedTask._id, status });
    
    if (ioInstance) {
      ioInstance.emit("taskUpdated", updatedTask);
    }
    res.json({ message: "Task status updated", task: updatedTask });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ message: `Failed to update task status: ${err.message}` });
  }
});


// ✅ FIXED: GET TASK BY ID
app.get("/api/task/:id", protectRoute, requireRole("admin", "developer"), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ message: "Error fetching task" });
  }
});


// ✅ FIXED: UPDATE TASK BY ID (ADMIN)
app.put("/api/task/:id", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const { title, details, status, priority, dueDate, assigneeEmail } = req.body;
    const taskData = await Task.findById(req.params.id);

    if (!taskData) return res.status(404).json({ message: "Task not found" });

    const task = Object.assign(Object.create(Task.prototype), taskData);
    task.title = title ?? task.title;
    task.details = details ?? task.details;
    task.status = status ?? task.status;
    task.priority = priority ?? task.priority;

    // Update assignee if provided
    if (assigneeEmail !== undefined) {
      if (assigneeEmail) {
        const assignee = await User.findOne({ email: assigneeEmail, role: "developer" });
        if (!assignee) {
          return res.status(400).json({ message: "Invalid developer email" });
        }
      }
      task.assigneeEmail = assigneeEmail || null;
    }

    // Allow updating / clearing deadline
    if (dueDate !== undefined) {
      if (dueDate) {
        const deadlineDate = new Date(dueDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadlineDate.setHours(0, 0, 0, 0);
        
        console.log("Update date validation - Today:", today, "Deadline:", deadlineDate);
        
        if (deadlineDate < today) {
          return res.status(400).json({ message: "Cannot set deadline to a past date" });
        }
        task.dueDate = deadlineDate;
      } else {
        task.dueDate = null;
      }
    }

    const updatedTask = await task.save();
    if (ioInstance) {
      ioInstance.emit("taskUpdated", updatedTask);
    }
    res.json({ message: "Task updated!", task: updatedTask });
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ message: "Update failed" });
  }
});


// ================== VIEW PAGE ==================
app.get(
  "/file/:id",
  protectRoute,
  requireRole("admin", "developer"),
  async (req, res) => {
    try {
      const doc = await Task.findById(req.params.id);
      if (!doc) return res.status(404).send("Task not found");

      res.render("show", {
        task: doc,
        user: req.user,
      });
    } catch {
      res.status(500).send("Error reading DB");
    }
  }
);


// ================== LOGIN ==================
app.post("/", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email/password required" });

  try {
    console.log("Login attempt for email:", email);
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log("User not found:", email);
      return res.status(400).json({ message: "Wrong credentials!" });
    }
    
    if (user.password !== password) {
      console.log("Password mismatch for:", email);
      return res.status(400).json({ message: "Wrong credentials!" });
    }

    console.log("Login successful for:", email, "Role:", user.role);
    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      "supersecret123",
      { expiresIn: "1h" }
    );

    res.json({ message: "Login success!", token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed: " + err.message });
  }
});


// ================== REGISTER ==================
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email exists" });

    await User.create({ name, email, password, role: "developer" });
    res.json({ message: "Registered! Please login." });
  } catch {
    res.status(500).json({ message: "Registration failed" });
  }
});

// ================== FORGOT PASSWORD ==================
app.post("/forgot", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "No user found with that email" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully. Please login with your new password." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Password reset failed" });
  }
});


// ================== CREATE TASK ==================
app.post(
  "/create",
  protectRoute,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { title, details, status, priority, assigneeEmail, dueDate } = req.body;

      // Validate required fields
      if (!title || !details) {
        return res.status(400).json({ message: "Title and details are required" });
      }

      // Validate assigneeEmail if provided
      let finalAssigneeEmail = null;
      if (assigneeEmail && assigneeEmail.trim() !== "") {
        const assignee = await User.findOne({ email: assigneeEmail.trim(), role: "developer" });
        if (!assignee) {
          return res.status(400).json({ message: "Invalid developer email" });
        }
        finalAssigneeEmail = assigneeEmail.trim();
      }

      // Validate deadline is not in the past
      let finalDueDate = null;
      if (dueDate && dueDate.trim() !== "") {
        try {
          const deadlineDate = new Date(dueDate + 'T00:00:00'); // Add time to avoid timezone issues
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          deadlineDate.setHours(0, 0, 0, 0);
          
          if (isNaN(deadlineDate.getTime())) {
            return res.status(400).json({ message: "Invalid date format" });
          }
          
          if (deadlineDate < today) {
            return res.status(400).json({ message: "Cannot create task with a deadline in the past" });
          }
          finalDueDate = deadlineDate;
        } catch (dateErr) {
          return res.status(400).json({ message: "Invalid date format" });
        }
      }

      console.log("Create task body:", req.body);
      const taskData = {
        title: title.trim(),
        details: details.trim(),
        status: status || "todo",
        priority: priority || "medium",
        assigneeEmail: finalAssigneeEmail,
        dueDate: finalDueDate,
        ownerEmail: req.user.email,
      };

      const task = Object.assign(Object.create(Task.prototype), taskData);
      const savedTask = await task.save();

      // 🔥 ADD THIS LINE (Socket.IO emit)
      if (ioInstance) {
        ioInstance.emit("taskCreated", savedTask);
      }

      console.log("Task saved:", {
        id: savedTask._id,
        title: savedTask.title,
        dueDate: savedTask.dueDate,
      });
      res.json({ message: "Task created!", task: savedTask });
    } catch (err) {
      console.error("Error creating task:", err);
      res.status(500).json({ message: err.message || "Failed to create task" });
    }
  }
);

// DELETE TASK BY ID (ADMIN ONLY)
app.delete(
  "/api/task/:id",
  protectRoute,
  requireRole("admin"),
  async (req, res) => {
    try {
      const task = await Task.findByIdAndDelete(req.params.id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      // 🔥 ADD THIS LINE (Socket.IO notify)
      if (ioInstance) {
        ioInstance.emit("taskDeleted", task._id || task.id);
      }

      res.json({ message: "Task deleted!" });
    } catch (err) {
      console.error("Delete task error:", err);
      res.status(500).json({ message: "Delete failed" });
    }
  }
);


// ================== START SERVER ==================
server.listen(5000, () => {
  console.log("Server + Socket.IO running on http://localhost:5000");
});

