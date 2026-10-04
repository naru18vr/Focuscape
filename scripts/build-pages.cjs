// Set the Pages environment without requiring a platform-specific shell.
process.env.GITHUB_PAGES = "true";
process.argv = [process.execPath, require.resolve("next/dist/bin/next"), "build", "--webpack"];
require("next/dist/bin/next");
