import path from "node:path";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { distDir, ensureDataDirs, port } from "./config.ts";
import { exportRouter, outputRouter } from "./routes/export.ts";
import { projectsRouter } from "./routes/projects.ts";
import { sourcesRouter } from "./routes/sources.ts";
import { youtubeRouter } from "./routes/youtube.ts";

ensureDataDirs();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/sources", sourcesRouter);
app.use("/api/export", exportRouter);
app.use("/api/output", outputRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/projects", projectsRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`soccer-highlights server listening on http://localhost:${port}`);
});
