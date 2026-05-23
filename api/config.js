export default function handler(req, res) {
  // Return the environment variable GAS_WEB_APP_URL securely set in Vercel settings to the client frontend app
  res.status(200).json({
    GAS_WEB_APP_URL: process.env.GAS_WEB_APP_URL || ""
  });
}
