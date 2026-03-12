import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const db = new Database("prognolyze.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    file_name TEXT,
    summary_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Session configuration for iframe compatibility
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "prognolyze-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true, // Required for SameSite=None
        sameSite: "none", // Required for cross-origin iframe
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  app.use(express.json());

  // API Routes
  app.get("/api/config-check", (req, res) => {
    res.json({
      geminiKey: !!process.env.GEMINI_API_KEY,
      googleClientId: !!process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: !!process.env.APP_URL,
      sessionSecret: !!process.env.SESSION_SECRET,
    });
  });

  app.get("/api/config-values", (req, res) => {
    res.json({
      appUrl: process.env.APP_URL || null,
    });
  });

  app.get("/api/auth/url", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const appUrl = process.env.APP_URL;

    if (!clientId || !appUrl) {
      return res.status(500).json({ 
        error: "Missing configuration", 
        details: "Please ensure GOOGLE_CLIENT_ID and APP_URL are set in the environment variables." 
      });
    }

    const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const options = {
      redirect_uri: `${appUrl}/auth/callback`,
      client_id: clientId,
      access_type: "offline",
      response_type: "code",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
    };

    const qs = new URLSearchParams(options);
    res.json({ url: `${rootUrl}?${qs.toString()}` });
  });

  app.get("/auth/callback", async (req, res) => {
    const code = req.query.code as string;
    
    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      // Exchange code for tokens
      const tokenUrl = "https://oauth2.googleapis.com/token";
      const values = {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`,
        grant_type: "authorization_code",
      };

      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        body: new URLSearchParams(values),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { id_token, access_token } = await tokenRes.json();

      // Fetch user info
      const userRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
        {
          headers: {
            Authorization: `Bearer ${id_token}`,
          },
        }
      );

      const googleUser = await userRes.json();

      // Store user in session
      (req.session as any).user = {
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      };

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json((req.session as any).user || null);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // Report History Routes
  app.post("/api/reports", (req, res) => {
    const user = (req.session as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { fileName, summary } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO reports (user_id, file_name, summary_json) VALUES (?, ?, ?)");
      const result = stmt.run(user.id, fileName, JSON.stringify(summary));
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      console.error("Failed to save report:", err);
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  app.get("/api/reports", (req, res) => {
    const user = (req.session as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    try {
      const stmt = db.prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC");
      const reports = stmt.all(user.id);
      res.json(reports.map((r: any) => ({
        ...r,
        summary: JSON.parse(r.summary_json)
      })));
    } catch (err) {
      console.error("Failed to fetch reports:", err);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.delete("/api/reports/:id", (req, res) => {
    const user = (req.session as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    try {
      const stmt = db.prepare("DELETE FROM reports WHERE id = ? AND user_id = ?");
      stmt.run(req.params.id, user.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete report:", err);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
