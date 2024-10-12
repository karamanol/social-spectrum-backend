import dotenv from "dotenv";
import app from "./app";
import { getErrorMessage } from "./utils/getErrorMessage";

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! shutting down");
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: "./config.env" });

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`App listening on ${port}`);
});

process.on("unhandledRejection", (err) => {
  console.log("🐞UNHANDLED REJECTION! shutting down");
  console.log(getErrorMessage(err));
  server.close(() => {
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  console.log("sigterm received. shutting down gratefuly ➡️❗⬅️");
  server.close(() => {
    // will close the server after all pending requests
    console.log("Process terminated!");
  });
});
