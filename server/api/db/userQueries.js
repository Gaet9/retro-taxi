const pool = require("./dbconn.js"); // import the User model
const config = require("../../config.js");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const bcrypt = require("bcrypt");

// name and conventions
// user_index, user_details, user_update, user-create_post, user_delete

// GET
const user_index = async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, email, role, newsletter, adminRequest, createdAt FROM users ORDER BY id;");
        res.status(200).json({
            success: true,
            message: "All users retreived successfully",
            data: result.rows,
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: "Failed to retreive users",
            error: err,
        });
    }
};
// GET BY ID
const user_details = (req, res) => {
    const { id } = req.params;
    const result = pool
        .query("SELECT * FROM users WHERE id = $1", [id]) // safer to use $1 as a placeholder and return the array [id], instead of ${id}
        .then((result) => {
            if (result.rows.length === 0) {
                // As we return an array we check the length, here !return wouldn't work
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }
            res.status(200).json({
                success: true,
                message: "User found successfully",
                data: result.rows[0],
            });
        })
        .catch((err) => {
            res.status(500).json({
                success: false,
                message: "Something went wrong",
                error: err,
            });
        });
};
// GET WITH TOKEN
const user_byToken = async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ success: false, message: "Access token missing" });
            // conflicting with if (!token) in auth-middleware.js, not tested
        }
        const decoded = jwt.verify(token, config.jwt.secret); // Adjust secret name if needed
        const userId = decoded.id;

        const result = await pool.query("SELECT * FROM users WHERE id = $1;", [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "User found",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error in /me route:", err.message);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
// UPDATE
const user_update = async (req, res) => {
    const { name, email, password, newsletter } = req.body; // retreive user info from the form

    // retreive already saved info from the user with the cookie token
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ success: false, message: "Token is missing" });
        // conflicting with if (!token) in auth-middleware.js, not tested
    }
    let decoded;
    try {
        decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
        return res.status(403).json({ success: false, message: "Invalid or expired token" });
        // conflicting with if try{}catch{} in auth-middleware.js, not tested
    }
    const userId = decoded.id;

    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields",
        }); // check if all fields are filled
    }

    const username = validator.escape(name); // removes tags and quotes from username
    const normalizedEmail = validator.normalizeEmail(email, {
        gmail_remove_dots: false, // keep dots
    }); // lowercase and trims email

    // Validate email
    if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email format",
        });
    }

    try {
        const findEmail = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
        if (findEmail.rows.length > 0 && findEmail.rows[0].id !== userId) {
            return res.status(400).json({
                success: false,
                message: "email already exists",
            }); // check if email entered already exist in DB
        }

        // Get current user to compare passwords
        const currentUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (currentUser.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const currentHashedPassword = currentUser.rows[0].password;

        let finalPassword = password;

        // Check if password has changed (compare plain input to stored hash)
        const isSamePassword = await bcrypt.compare(password, currentHashedPassword);

        if (!isSamePassword) {
            // New password provided, validate it
            const isStrong = validator.isStrongPassword(password, {
                minLength: 8,
                minUppercase: 1,
                minSymbols: 1,
                minNumbers: 1,
            });

            if (!isStrong) {
                return res.status(400).json({
                    success: false,
                    message: "Password too weak. Must be at least 8 characters long, include 1 uppercase, 1 number, and 1 symbol",
                });
            }

            finalPassword = await bcrypt.hash(password, 10); // Hash only if it's new
        } else {
            finalPassword = currentHashedPassword;
        }

        // create user with info (and hashed password) in DB
        await pool.query("UPDATE users SET name = $1, email = $2, password = $3, newsletter = $4 WHERE id = $5", [
            username,
            normalizedEmail,
            finalPassword,
            newsletter || false,
            userId,
        ]);

        // Success message if signed in successfully
        return res.status(200).json({
            success: true,
            message: "User updated successfully",
        });
    } catch (err) {
        // catch errors
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message,
        });
    }
};
// DELETE - only possible from profile. Only a user can delete his account.
const user_delete = async (req, res) => {
    // retreive already saved info from the user with the cookie token
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ success: false, message: "Access token missing" });
        // conflicting with if(!token) in auth-middleware.js, not tested
    }
    let decoded;
    try {
        decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
        return res.status(403).json({ success: false, message: "Invalid or expired token" });
        // conflicting with try{}catch{} in auth-middleware.js, not tested
    }
    const userId = decoded.id;
    try {
        const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *", [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "This ID does not exist",
            });
        }
        res.status(200).json({
            success: true,
            message: "User deleted successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Error deleting user",
            error: err,
        });
    }
};
// UPDATE USER ROLE (Admin only)
const user_updateRole = async (req, res) => {
    const { id } = req.params; // Get userId from URL parameters
    const { role } = req.body; // Match the frontend parameter name

    // Validate required fields
    if (!id || !role) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields: id and role",
        });
    }

    // Validate role value
    if (!["user", "admin"].includes(role)) {
        return res.status(400).json({
            success: false,
            message: "Invalid role. Role must be 'user' or 'admin'",
        });
    }

    try {
        // Check if the target user exists
        const userExists = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        if (userExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Prevent admin from removing their own admin role (at least one admin must remain)
        if (userExists.rows[0].role === "admin" && role === "user") {
            const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
            if (parseInt(adminCount.rows[0].count) <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot remove admin role from the last admin user",
                });
            }
        }

        // Update the user's role
        await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);

        res.status(200).json({
            success: true,
            message: "User role updated successfully",
            data: {
                userId: id,
                newRole: role,
            },
        });
    } catch (err) {
        console.error("Error updating user role:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update user role",
            error: err.message,
        });
    }
};
// UPDATE NEWSLETTER PREFERENCE
const user_updateNewsletter = async (req, res) => {
    const { id } = req.params;
    const { newsletter } = req.body;

    try {
        // Check if the user exists
        const userExists = await pool.query("SELECT * FROM users WHERE id = $1", [id]);

        if (userExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Update the newsletter preference
        await pool.query("UPDATE users SET newsletter = $1 WHERE id = $2", [newsletter, id]);

        res.status(200).json({
            success: true,
            message: "Newsletter preference updated successfully",
            data: {
                userId: id,
                newsletter: newsletter,
            },
        });
    } catch (err) {
        console.error("Error updating newsletter preference:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update newsletter preference",
            error: err.message,
        });
    }
};
// APPROVE ADMIN REQUEST (Admin only)
const user_approveAdmin = async (req, res) => {
    const { id } = req.params;

    try {
        // Check if the target user exists and has a pending admin request
        const userExists = await pool.query("SELECT * FROM users WHERE id = $1 AND adminRequest = true", [id]);

        if (userExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found or no pending admin request",
            });
        }

        // Update the user's role to admin and clear the admin request
        await pool.query("UPDATE users SET role = 'admin', adminRequest = false WHERE id = $1", [id]);

        res.status(200).json({
            success: true,
            message: "Admin request approved successfully",
            data: {
                userId: id,
                newRole: "admin",
                adminRequest: false,
            },
        });
    } catch (err) {
        console.error("Error approving admin request:", err);
        res.status(500).json({
            success: false,
            message: "Failed to approve admin request",
            error: err.message,
        });
    }
};
// DENY ADMIN REQUEST (Admin only)
const user_denyAdmin = async (req, res) => {
    const { id } = req.params;

    try {
        // Check if the target user exists and has a pending admin request
        const userExists = await pool.query("SELECT * FROM users WHERE id = $1 AND adminRequest = true", [id]);

        if (userExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found or no pending admin request",
            });
        }

        // Clear the admin request (user remains as 'user')
        await pool.query("UPDATE users SET adminRequest = false WHERE id = $1", [id]);

        res.status(200).json({
            success: true,
            message: "Admin request denied successfully",
            data: {
                userId: id,
                role: "user",
                adminRequest: false,
            },
        });
    } catch (err) {
        console.error("Error denying admin request:", err);
        res.status(500).json({
            success: false,
            message: "Failed to deny admin request",
            error: err.message,
        });
    }
};
// GET PENDING ADMIN REQUESTS (Admin only)
const user_getPendingAdminRequests = async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, email, createdAt FROM users WHERE adminRequest = true ORDER BY createdAt ASC");

        res.status(200).json({
            success: true,
            message: "Pending admin requests retrieved successfully",
            data: result.rows,
        });
    } catch (err) {
        console.error("Error retrieving pending admin requests:", err);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve pending admin requests",
            error: err.message,
        });
    }
};

module.exports = {
    user_index,
    user_details,
    user_byToken,
    user_update,
    user_delete,
    user_updateRole,
    user_updateNewsletter,
    user_approveAdmin,
    user_denyAdmin,
    user_getPendingAdminRequests,
};
