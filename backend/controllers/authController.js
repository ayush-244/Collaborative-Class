const User = require("../models/User");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ===============================
// Register User
// ===============================
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, section, regNo } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    // Validate regNo for students
    if (role === "student" && !regNo) {
      return res.status(400).json({ message: "Registration Number is required for students" });
    }

    // Check if email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Check if regNo already exists (for students only)
    if (regNo) {
      const regNoExists = await User.findOne({ regNo: regNo.trim() });
      if (regNoExists) {
        return res.status(400).json({ message: "Registration Number already registered" });
      }
    }

    let isUniversityUser = false;

    if (email.endsWith("@srmap.edu.in")) {
      isUniversityUser = true;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      section,
      regNo: regNo ? regNo.trim() : null,
      isUniversityUser,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      section: user.section,
      isUniversityUser: user.isUniversityUser,
      regNo: user.regNo || null,
      token: generateToken(user._id),
    });

  } catch (error) {
    // Handle unique constraint errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (field === "regNo") {
        return res.status(400).json({ message: "Registration Number already registered" });
      }
      if (field === "email") {
        return res.status(400).json({ message: "Email already registered" });
      }
    }
    res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// Login User
// ===============================
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && user.password !== "google-auth" && await bcrypt.compare(password, user.password)) {
      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        section: user.section,
        isUniversityUser: user.isUniversityUser,
        regNo: user.regNo || null,
        token: generateToken(user._id),
      });
    }

    return res.status(401).json({ message: "Invalid email or password" });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// Google Authentication
// ===============================
const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      console.error("[GoogleAuth] No token provided in request");
      return res.status(400).json({ message: "No token provided" });
    }

    console.log("[GoogleAuth] Starting Google OAuth verification...");

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { name, email } = ticket.getPayload();
    console.log("[GoogleAuth] Token verified successfully for email:", email);

    let user = await User.findOne({ email });

    let isUniversityUser = false;
    let regNo = null;

    if (email.endsWith("@srmap.edu.in")) {
      isUniversityUser = true;

      // Try to extract regNo from name if format is "name | regNo"
      if (name && name.includes("|")) {
        const parts = name.split("|");
        regNo = parts[1].trim();
        
        // Validate regNo doesn't already exist
        const existingUser = await User.findOne({ regNo });
        if (existingUser && existingUser.email !== email) {
          console.warn("[GoogleAuth] RegNo already registered:", regNo);
          // Don't assign regNo if it already exists for another user
          regNo = null;
        }
      }
    }

    if (!user) {
      console.log("[GoogleAuth] User not found, creating new user:", email);
      user = await User.create({
        name: name.split("|")[0] || name, // Remove regNo from name if present
        email,
        password: "google-auth",
        role: "student",
        regNo: regNo,
        isUniversityUser,
      });
      console.log("[GoogleAuth] New user created with ID:", user._id);
    } else {
      console.log("[GoogleAuth] Existing user found with ID:", user._id);
    }

    const jwtToken = generateToken(user._id);
    console.log("[GoogleAuth] JWT token generated successfully");

    const response = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      section: user.section,
      isUniversityUser: user.isUniversityUser,
      regNo: user.regNo || null,
      token: jwtToken,
    };

    console.log("[GoogleAuth] Sending successful response for user:", user.email);
    res.json(response);

  } catch (error) {
    console.error("[GoogleAuth] Error during Google authentication:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    if (error.message && error.message.includes("Invalid token")) {
      return res.status(401).json({ message: "Invalid or expired Google token" });
    }
    
    res.status(401).json({ message: "Google authentication failed: " + error.message });
  }
};

// ===============================
// Update Section
// ===============================
const updateSection = async (req, res) => {
  try {
    const { section } = req.body;

    if (!section || !section.trim()) {
      return res.status(400).json({ message: "Section is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.section = section.trim();
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      section: user.section,
      isUniversityUser: user.isUniversityUser,
      regNo: user.regNo || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleAuth,
  updateSection,
};
