import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import userRouter from "./routes/userRoutes";
import authRouter from "./routes/authRoutes";
import commentRouter from "./routes/commentRoutes";
import searchRouter from "./routes/searchRoutes";
import likeRouter from "./routes/likeRoutes";
import postRouter from "./routes/postRoutes";
import storiesRouter from "./routes/storiesRoutes";
import relationshipsRouter from "./routes/relationshipsRoutes";
import AppError from "./utils/appError";
import { globalErrorMiddleware } from "./controllers/errorController";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import hpp from "hpp";
import path from "path";

dotenv.config({ path: "./config.env" });

const app = express();

app.use(compression());

app.disable("x-powered-by");

// app.enable("trust proxy");

app.set("trust proxy", 1);
// app.get("/ip", (request, response) => response.send(request.ip));
// app.get("/x-forwarded-for", (request, response) =>
//   response.send(request.headers["x-forwarded-for"])
// );

// GLOBAL MIDDLEWARES

// app.use(cors());
app.use(
  cors({
    origin: process.env.FRONTEND_ADDRESS, // only this site are alowed to request to api
    credentials: true, // cookies are sort of credentials
    // optionsSuccessStatus: 200,
  })
);
app.options("*", cors());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          // "http://127.0.0.1:3000",
          process.env.FRONTEND_ADDRESS || "",
        ],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        // imgSrc: ["'self'"],
        imgSrc: ["'self'", "https: data:"],
      },
    },
  })
);

// if (process.env.NODE_ENV === "development") {
app.use(morgan("dev"));
// }

// Limit requests from same API
const limiter = rateLimit({
  max: 1000,
  windowMs: 60 * 60 * 1000, // per 1 hour
  message: "Too many requests from this IP, please try again in an hour!",
});
app.use("/api", limiter);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(cookieParser());

app.use(hpp());

app.use("/api/auth", authRouter);
app.use("/api/search", searchRouter);
app.use("/api/users", userRouter);
app.use("/api/posts", postRouter);
app.use("/api/comments", commentRouter);
app.use("/api/likes", likeRouter);
app.use("/api/relationships", relationshipsRouter);
app.use("/api/stories", storiesRouter);

// Wrong routes fallback
// app.all("*", (req, _res, next) => {
//   next(new AppError(`Can't find ${req.originalUrl}`, 404));
// });
app.use(express.static(path.join(__dirname, "./dist-front")));

// Fallback to 'index.html' for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "./dist-front", "index.html"));
});

// Global error handler
app.use(globalErrorMiddleware);

export default app;
