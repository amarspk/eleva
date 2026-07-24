const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "generated-client");
const dest = path.join(__dirname, "..", "dist", "generated-client");

if (!fs.existsSync(src)) {
  console.error("Source directory does not exist:", src);
  console.error("Run 'prisma generate' first to create the generated client.");
  process.exit(1);
}

fs.cpSync(src, dest, { recursive: true });
console.log("Copied generated-client -> dist/generated-client");
