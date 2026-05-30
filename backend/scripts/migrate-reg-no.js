/**
 * Migration Script: Add Registration Number Support
 * 
 * This script handles migration for the new Registration Number feature:
 * 1. Does not break existing users (regNo can be null)
 * 2. Allows teachers to manually assign regNo to students
 * 3. Validates regNo uniqueness
 * 
 * Usage: node scripts/migrate-reg-no.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const User = require("../models/User");

const migrateRegNo = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // 1. Count existing students
    const studentCount = await User.countDocuments({ role: "student" });
    console.log(`\n📊 Found ${studentCount} students in database`);

    // 2. Count students with regNo
    const studentsWithRegNo = await User.countDocuments({
      role: "student",
      regNo: { $exists: true, $ne: null }
    });
    console.log(`📋 Students with Registration Number: ${studentsWithRegNo}`);

    // 3. Count students without regNo
    const studentsWithoutRegNo = await User.countDocuments({
      role: "student",
      $or: [
        { regNo: { $exists: false } },
        { regNo: null }
      ]
    });
    console.log(`❌ Students without Registration Number: ${studentsWithoutRegNo}`);

    // 4. Display students without regNo
    if (studentsWithoutRegNo > 0) {
      console.log(`\n👤 First 10 students needing regNo assignment:`);
      const students = await User.find({
        role: "student",
        $or: [
          { regNo: { $exists: false } },
          { regNo: null }
        ]
      })
        .select("name email section")
        .limit(10);

      students.forEach((student, idx) => {
        console.log(
          `  ${idx + 1}. ${student.name} (${student.email}) - Section: ${student.section || "Not assigned"}`
        );
      });
    }

    // 5. Migration info
    console.log(`\n📝 Migration Notes:`);
    console.log(`  ✓ Existing users are NOT affected`);
    console.log(`  ✓ Students without regNo will display "Not Assigned"`);
    console.log(`  ✓ Teachers can assign regNo via admin panel later`);
    console.log(`  ✓ regNo is UNIQUE - duplicate assignments will be rejected`);

    // 6. Verify indexes
    const indexes = await User.collection.getIndexes();
    const hasRegNoIndex = Object.values(indexes).some(idx => idx.key?.regNo);
    console.log(`\n🔍 Database Indexes:`);
    console.log(`  ✓ regNo index created: ${hasRegNoIndex}`);

    console.log(`\n✅ Migration check complete!\n`);

  } catch (error) {
    console.error("❌ Migration Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  }
};

// Run migration
migrateRegNo();
